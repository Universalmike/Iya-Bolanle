// Esusu / Ajo / Adashe / Isusu: rotating savings groups.
//
// Lifecycle:  forming  ──(full, or creator starts with ≥2)──▶  active  ──(last round paid out)──▶  completed
//
// • Members join a forming group with its invite code. Positions 1..N decide who collects in which round.
// • Each round, every member contributes amount_per_person once. Money is held in the group's pot.
// • When the last member pays, the whole pot (amount × N) goes to the member whose position = round,
//   and the group moves to the next round (due one period later) or completes after round N.
// • Members who haven't paid by the due date are shown as late. The payout waits for everyone.
import crypto from "node:crypto";
import express from "express";

export const FREQUENCIES = ["daily", "weekly", "monthly"];
export const MEMBER_LIMITS = { min: 2, max: 50 };
export const MAX_CONTRIBUTION = 1_000_000;

// ---------- Pure helpers (unit-tested) ----------

// Due date of the current round, computed in Postgres (the tables use timestamps
// without a time zone, so doing date maths in the database avoids offset bugs).
// Round k is due k periods after the start, so monthly dates don't drift:
// started 31 Jan → due 28 Feb, 31 Mar, 30 Apr…
const DUE_DATE_SQL = `started_at + CASE frequency
    WHEN 'daily' THEN make_interval(days => current_cycle)
    WHEN 'weekly' THEN make_interval(weeks => current_cycle)
    ELSE make_interval(months => current_cycle) END`;

// No 0/O or 1/I so codes are easy to read out over the phone.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generateInviteCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");

export const normalizeInviteCode = (code) =>
  typeof code === "string" ? code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";

// Fisher–Yates with a crypto RNG, so no one can predict or game the order.
export const shuffled = (items) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "";

// ---------- Schema & one-time migration ----------
export const migrateEsusu = async (pool, withTransaction) => {
  const q = (sql) => pool.query(sql);
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS invite_code TEXT`);
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS current_cycle INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS pot_balance INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`);
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS cycle_due_at TIMESTAMP`);
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
  // NULL = created by the old code; set to 2 once migrated (or on create).
  await q(`ALTER TABLE esusu_groups ADD COLUMN IF NOT EXISTS schema_version INTEGER`);
  // Group names no longer need to be unique: groups are joined by invite code.
  await q(`ALTER TABLE esusu_groups DROP CONSTRAINT IF EXISTS esusu_groups_group_name_key`);
  await q(`ALTER TABLE esusu_members ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP`);
  await q(`ALTER TABLE esusu_members ADD COLUMN IF NOT EXISTS collected_amount INTEGER`);
  await q(`ALTER TABLE esusu_contributions ADD COLUMN IF NOT EXISTS refunded BOOLEAN NOT NULL DEFAULT false`);

  // Old groups: contributions were deducted but never paid out to anyone.
  // Refund them, reset the group to "forming" and give it an invite code. Runs once per group.
  const migrated = await withTransaction(async (db) => {
    const legacy = await db.query("SELECT id, group_name FROM esusu_groups WHERE schema_version IS NULL FOR UPDATE");
    for (const group of legacy.rows) {
      const refunds = await db.query(
        "UPDATE esusu_contributions SET refunded = true WHERE group_id=$1 AND NOT refunded RETURNING username, amount",
        [group.id]
      );
      for (const { username, amount } of refunds.rows) {
        if (amount <= 0) continue; // never "refund" a negative (exploited) contribution
        await db.query("UPDATE users SET balance = balance + $1 WHERE username=$2", [amount, username]);
        await db.query(
          "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, 'Esusu Refund', $2, $3)",
          [username, amount, group.group_name]
        );
      }
      await db.query(
        `UPDATE esusu_groups SET status='forming', current_cycle=0, pot_balance=0, started_at=NULL,
           cycle_due_at=NULL, invite_code=$2, schema_version=2 WHERE id=$1`,
        [group.id, generateInviteCode()]
      );
      await db.query("UPDATE esusu_members SET has_collected=0 WHERE group_id=$1", [group.id]);
    }
    return { ok: true, count: legacy.rows.length };
  });
  if (migrated.count) console.log(`Esusu: migrated ${migrated.count} old group(s) and refunded their contributions`);

  // Created after the refunds so old duplicate rows can't block them.
  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS esusu_groups_invite_code_key ON esusu_groups(invite_code)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS esusu_members_group_user_key ON esusu_members(group_id, username)`,
    // Database-level guarantee: one contribution per member per round.
    `CREATE UNIQUE INDEX IF NOT EXISTS esusu_one_payment_per_round
       ON esusu_contributions(group_id, username, cycle_number) WHERE NOT refunded`,
  ];
  for (const sql of indexes) {
    try {
      await q(sql);
    } catch (err) {
      console.error("Esusu index not created (check for duplicate rows):", err.message);
    }
  }
};

// ---------- Shared queries ----------

// One row per group the user belongs to, with round progress.
const GROUP_SUMMARY_SQL = `
  SELECT g.id, g.group_name, g.amount_per_person, g.frequency, g.total_members, g.created_by,
         g.status, g.invite_code, g.current_cycle, g.pot_balance, g.cycle_due_at, g.started_at, g.completed_at,
         m.position, (m.has_collected = 1) AS has_collected, m.collected_amount,
         (SELECT COUNT(*)::int FROM esusu_members WHERE group_id = g.id) AS member_count,
         (SELECT COUNT(*)::int FROM esusu_contributions c
            WHERE c.group_id = g.id AND c.cycle_number = g.current_cycle AND NOT c.refunded) AS paid_count,
         EXISTS (SELECT 1 FROM esusu_contributions c
            WHERE c.group_id = g.id AND c.cycle_number = g.current_cycle AND c.username = m.username
              AND NOT c.refunded) AS paid_this_round,
         (SELECT username FROM esusu_members WHERE group_id = g.id AND position = g.current_cycle) AS current_collector,
         (g.status = 'active' AND g.cycle_due_at < NOW()) AS round_overdue
  FROM esusu_groups g
  JOIN esusu_members m ON m.group_id = g.id
  WHERE m.username = $1`;

const decorate = (row, username) => ({
  ...row,
  is_creator: row.created_by === username,
  is_late: Boolean(row.round_overdue && !row.paid_this_round),
});

export const listGroups = async (db, username) => {
  const { rows } = await db.query(`${GROUP_SUMMARY_SQL} ORDER BY g.created_at DESC`, [username]);
  return rows.map((r) => decorate(r, username));
};

const getGroupForMember = async (db, groupId, username) => {
  const { rows } = await db.query(`${GROUP_SUMMARY_SQL} AND g.id = $2`, [username, groupId]);
  return rows[0] ? decorate(rows[0], username) : null;
};

// Positions must stay 1..N with no gaps after someone leaves.
const renumberPositions = (db, groupId) =>
  db.query(
    `UPDATE esusu_members m SET position = r.new_pos
     FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position, joined_at) AS new_pos
           FROM esusu_members WHERE group_id = $1) r
     WHERE m.id = r.id`,
    [groupId]
  );

const startGroup = async (db, groupId) => {
  const { rows } = await db.query(
    `UPDATE esusu_groups g SET status='active', current_cycle=1, started_at=NOW(),
       total_members = (SELECT COUNT(*) FROM esusu_members WHERE group_id = g.id)
     WHERE id=$1 RETURNING *`,
    [groupId]
  );
  const due = await db.query(`UPDATE esusu_groups SET cycle_due_at = ${DUE_DATE_SQL} WHERE id=$1 RETURNING cycle_due_at`, [groupId]);
  const first = await db.query("SELECT username FROM esusu_members WHERE group_id=$1 AND position=1", [groupId]);
  return { ...rows[0], cycle_due_at: due.rows[0].cycle_due_at, first_collector: first.rows[0]?.username };
};

// ---------- Contribution + payout (runs inside a DB transaction) ----------
// Returns { ok: true, ... } or { ok: false, key, args } where key is a messages.js key.
export const contribute = async (db, { username, groupId }) => {
  // Lock the group row: concurrent contributions are processed one at a time,
  // so the "last payer triggers the payout" check can't run twice.
  const g = (await db.query("SELECT * FROM esusu_groups WHERE id=$1 FOR UPDATE", [groupId])).rows[0];
  if (!g) return { ok: false, key: "groupNotFound", args: [""] };

  const member = await db.query("SELECT 1 FROM esusu_members WHERE group_id=$1 AND username=$2", [g.id, username]);
  if (!member.rows.length) return { ok: false, key: "notMember" };
  if (g.status === "forming") return { ok: false, key: "groupNotStarted" };
  if (g.status === "completed") return { ok: false, key: "groupIsCompleted" };

  const amount = g.amount_per_person;
  if (!(Number.isInteger(amount) && amount > 0 && amount <= MAX_CONTRIBUTION)) return { ok: false, key: "groupBadAmount" };

  const round = g.current_cycle;
  const already = await db.query(
    "SELECT 1 FROM esusu_contributions WHERE group_id=$1 AND username=$2 AND cycle_number=$3 AND NOT refunded",
    [g.id, username, round]
  );
  if (already.rows.length) return { ok: false, key: "alreadyPaidRound", args: [round] };

  const debit = await db.query(
    "UPDATE users SET balance = balance - $1 WHERE username=$2 AND balance >= $1 RETURNING balance",
    [amount, username]
  );
  if (!debit.rows.length) {
    const { rows } = await db.query("SELECT balance FROM users WHERE username=$1", [username]);
    return { ok: false, key: "insufficientFunds", args: [rows[0]?.balance ?? 0, amount] };
  }

  await db.query(
    "INSERT INTO esusu_contributions (group_id, username, amount, cycle_number) VALUES ($1, $2, $3, $4)",
    [g.id, username, amount, round]
  );
  await db.query(
    "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, 'Esusu Contribution', $2, $3)",
    [username, amount, g.group_name]
  );
  const pot = g.pot_balance + amount;

  const counts = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM esusu_members WHERE group_id=$1) AS members,
            (SELECT COUNT(*)::int FROM esusu_contributions WHERE group_id=$1 AND cycle_number=$2 AND NOT refunded) AS paid`,
    [g.id, round]
  );
  const { members, paid } = counts.rows[0];
  const result = { ok: true, amount, groupName: g.group_name, round, paid, members, payout: null, completed: false };

  if (paid < members) {
    await db.query("UPDATE esusu_groups SET pot_balance=$2 WHERE id=$1", [g.id, pot]);
  } else {
    // Everyone has paid: the pot goes to this round's collector.
    const collector = (
      await db.query("SELECT username FROM esusu_members WHERE group_id=$1 AND position=$2", [g.id, round])
    ).rows[0].username;
    await db.query("UPDATE users SET balance = balance + $1 WHERE username=$2", [pot, collector]);
    await db.query(
      "UPDATE esusu_members SET has_collected=1, collected_at=NOW(), collected_amount=$3 WHERE group_id=$1 AND username=$2",
      [g.id, collector, pot]
    );
    await db.query(
      "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, 'Esusu Payout', $2, $3)",
      [collector, pot, g.group_name]
    );

    if (round >= members) {
      await db.query(
        "UPDATE esusu_groups SET status='completed', pot_balance=0, cycle_due_at=NULL, completed_at=NOW() WHERE id=$1",
        [g.id]
      );
      result.completed = true;
    } else {
      // The schedule stays fixed (round k due k periods after the start), even if this round ran late.
      await db.query("UPDATE esusu_groups SET current_cycle=$2, pot_balance=0 WHERE id=$1", [g.id, round + 1]);
      await db.query(`UPDATE esusu_groups SET cycle_due_at = ${DUE_DATE_SQL} WHERE id=$1`, [g.id]);
    }
    result.payout = { collector, amount: pot };
  }

  // Re-read: if the contributor was also this round's collector, the payout changed their balance.
  result.balance = (await db.query("SELECT balance FROM users WHERE username=$1", [username])).rows[0].balance;
  return result;
};

// Turns a contribute() result into a reply, in the user's language.
export const contributionMessage = (t, lang, r) => {
  const parts = [t("contributed", lang, r.amount, r.groupName, r.balance)];
  if (r.payout) {
    parts.push(t("payoutMade", lang, r.payout.collector, r.payout.amount, r.round));
    if (r.completed) parts.push(t("groupFinished", lang, r.groupName));
  } else {
    parts.push(t("roundProgress", lang, r.paid, r.members));
  }
  return parts.join(" ");
};

// One status line per group, for the chat ("when is my turn?").
export const statusMessage = (t, lang, groups) => {
  if (!groups.length) return t("esusuNoGroups", lang);
  return groups
    .map((g) => {
      if (g.status === "forming") return t("esusuStatusForming", lang, g.group_name, g.member_count, g.total_members, g.invite_code);
      if (g.status === "completed") return t("esusuStatusCompleted", lang, g.group_name);
      return t("esusuStatusActive", lang, {
        name: g.group_name,
        round: g.current_cycle,
        total: g.member_count,
        position: g.position,
        collected: g.has_collected,
        paid: g.paid_this_round,
        paidCount: g.paid_count,
        due: formatDate(g.cycle_due_at),
        late: g.is_late,
      });
    })
    .join("\n\n");
};

// For chat: pick the group the message refers to among the user's active groups.
export const pickGroup = (groups, normalizedText, normalize) => {
  const active = groups.filter((g) => g.status === "active");
  const named = active.filter((g) => normalizedText.includes(normalize(g.group_name)));
  if (named.length === 1) return { group: named[0] };
  if (active.length === 1) return { group: active[0] };
  return { group: null, active };
};

// ---------- HTTP routes ----------
export const createEsusuRouter = ({ pool, withTransaction, requireAuth, loadLanguage, fail, t, toSpeech }) => {
  const router = express.Router();
  router.use(requireAuth, loadLanguage);

  const ok = (res, lang, message, extra = {}) =>
    res.json({ message, speak: toSpeech(message), language: lang, ...extra });

  // Runs fn in a transaction; a { ok:false, key, args } result becomes a translated 400.
  const run = async (req, res, fn, onSuccess) => {
    try {
      const result = await withTransaction((db) => fn(db));
      if (!result.ok) return fail(res, result.status || 400, req.lang, result.key, ...(result.args || []));
      return onSuccess(result);
    } catch (err) {
      console.error(`Esusu ${req.path} error:`, err);
      return fail(res, 500, req.lang, "serverError");
    }
  };

  // Locks the group and checks the caller is a member (and optionally the creator).
  const loadGroup = async (db, groupId, username, { creatorOnly = false } = {}) => {
    const id = Number(groupId);
    if (!Number.isInteger(id)) return { error: { ok: false, key: "groupNotFound", args: [""] } };
    const group = (await db.query("SELECT * FROM esusu_groups WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!group) return { error: { ok: false, key: "groupNotFound", args: [""] } };
    const member = await db.query("SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", [id, username]);
    if (!member.rows.length) return { error: { ok: false, key: "notMember", status: 403 } };
    if (creatorOnly && group.created_by !== username) return { error: { ok: false, key: "notCreator", status: 403 } };
    return { group, member: member.rows[0] };
  };

  router.get("/my-groups", async (req, res) => {
    try {
      res.json({ groups: await listGroups(pool, req.username) });
    } catch (err) {
      console.error("Esusu groups error:", err);
      fail(res, 500, req.lang, "groupsFetchFailed");
    }
  });

  // Members list with who has paid this round — members only.
  router.get("/groups/:id", async (req, res) => {
    try {
      const group = await getGroupForMember(pool, Number(req.params.id) || 0, req.username);
      if (!group) return fail(res, 404, req.lang, "notMember");
      const { rows } = await pool.query(
        `SELECT m.username, m.position, (m.has_collected = 1) AS has_collected, m.collected_amount,
                EXISTS (SELECT 1 FROM esusu_contributions c WHERE c.group_id = m.group_id
                          AND c.username = m.username AND c.cycle_number = $2 AND NOT c.refunded) AS paid_this_round
         FROM esusu_members m WHERE m.group_id = $1 ORDER BY m.position`,
        [group.id, group.current_cycle]
      );
      const members = rows.map((m) => ({ ...m, is_late: Boolean(group.round_overdue && !m.paid_this_round) }));
      res.json({ group, members });
    } catch (err) {
      console.error("Esusu group details error:", err);
      fail(res, 500, req.lang, "groupsFetchFailed");
    }
  });

  router.post("/create", async (req, res) => {
    const lang = req.lang;
    const { frequency } = req.body;
    const groupName = typeof req.body.groupName === "string" ? req.body.groupName.trim() : "";
    const amount = req.body.amountPerPerson;
    const totalMembers = req.body.totalMembers;

    if (!groupName || groupName.length > 50) return fail(res, 400, lang, "groupNameInvalid");
    if (!(Number.isInteger(amount) && amount > 0 && amount <= MAX_CONTRIBUTION)) {
      return fail(res, 400, lang, "esusuAmountInvalid", MAX_CONTRIBUTION);
    }
    if (!FREQUENCIES.includes(frequency)) return fail(res, 400, lang, "esusuFrequencyInvalid");
    if (!Number.isInteger(totalMembers) || totalMembers < MEMBER_LIMITS.min || totalMembers > MEMBER_LIMITS.max) {
      return fail(res, 400, lang, "esusuMembersInvalid", MEMBER_LIMITS.min, MEMBER_LIMITS.max);
    }

    await run(req, res, async (db) => {
      // Retry in the (very unlikely) event of an invite-code collision.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInviteCode();
        const clash = await db.query("SELECT 1 FROM esusu_groups WHERE invite_code=$1", [code]);
        if (clash.rows.length) continue;
        const { rows } = await db.query(
          `INSERT INTO esusu_groups (group_name, amount_per_person, frequency, total_members, created_by,
                                     status, invite_code, schema_version)
           VALUES ($1, $2, $3, $4, $5, 'forming', $6, 2) RETURNING id`,
          [groupName, amount, frequency, totalMembers, req.username, code]
        );
        await db.query("INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, 1)", [rows[0].id, req.username]);
        return { ok: true, groupId: rows[0].id, inviteCode: code };
      }
      throw new Error("Could not generate a unique invite code");
    }, (r) => ok(res, lang, t("groupCreated", lang, groupName, r.inviteCode), { groupId: r.groupId, inviteCode: r.inviteCode }));
  });

  router.post("/join", async (req, res) => {
    const lang = req.lang;
    const code = normalizeInviteCode(req.body.inviteCode);
    if (code.length !== 6) return fail(res, 400, lang, "inviteCodeInvalid");

    await run(req, res, async (db) => {
      const group = (await db.query("SELECT * FROM esusu_groups WHERE invite_code=$1 FOR UPDATE", [code])).rows[0];
      if (!group) return { ok: false, key: "inviteCodeInvalid" };
      const existing = await db.query("SELECT 1 FROM esusu_members WHERE group_id=$1 AND username=$2", [group.id, req.username]);
      if (existing.rows.length) return { ok: false, key: "alreadyMember" };
      if (group.status !== "forming") return { ok: false, key: "groupAlreadyStarted" };

      const count = (await db.query("SELECT COUNT(*)::int AS n FROM esusu_members WHERE group_id=$1", [group.id])).rows[0].n;
      if (count >= group.total_members) return { ok: false, key: "groupFull" };

      const position = count + 1;
      await db.query("INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)", [group.id, req.username, position]);

      // The last seat filled: the group starts automatically.
      const started = position === group.total_members ? await startGroup(db, group.id) : null;
      return { ok: true, group, position, started };
    }, (r) => {
      const parts = [t("joinedGroup", lang, r.group.group_name, r.position)];
      if (r.started) parts.push(t("groupStarted", lang, r.group.group_name, r.started.first_collector, formatDate(r.started.cycle_due_at)));
      return ok(res, lang, parts.join(" "), { groupId: r.group.id });
    });
  });

  router.post("/start", async (req, res) => {
    const lang = req.lang;
    await run(req, res, async (db) => {
      const { group, error } = await loadGroup(db, req.body.groupId, req.username, { creatorOnly: true });
      if (error) return error;
      if (group.status !== "forming") return { ok: false, key: "groupAlreadyStarted" };
      const count = (await db.query("SELECT COUNT(*)::int AS n FROM esusu_members WHERE group_id=$1", [group.id])).rows[0].n;
      if (count < MEMBER_LIMITS.min) return { ok: false, key: "needTwoMembers" };
      return { ok: true, group, started: await startGroup(db, group.id) };
    }, (r) => ok(res, lang, t("groupStarted", lang, r.group.group_name, r.started.first_collector, formatDate(r.started.cycle_due_at))));
  });

  router.post("/shuffle", async (req, res) => {
    const lang = req.lang;
    await run(req, res, async (db) => {
      const { group, error } = await loadGroup(db, req.body.groupId, req.username, { creatorOnly: true });
      if (error) return error;
      if (group.status !== "forming") return { ok: false, key: "groupAlreadyStarted" };
      const { rows } = await db.query("SELECT id FROM esusu_members WHERE group_id=$1", [group.id]);
      const order = shuffled(rows.map((r) => r.id));
      for (let i = 0; i < order.length; i++) {
        await db.query("UPDATE esusu_members SET position=$2 WHERE id=$1", [order[i], i + 1]);
      }
      return { ok: true, group };
    }, (r) => ok(res, lang, t("positionsShuffled", lang, r.group.group_name)));
  });

  // A member leaves a forming group. If the creator leaves, the group is cancelled.
  router.post("/leave", async (req, res) => {
    const lang = req.lang;
    await run(req, res, async (db) => {
      const { group, error } = await loadGroup(db, req.body.groupId, req.username);
      if (error) return error;
      if (group.status !== "forming") return { ok: false, key: "cannotLeaveStarted" };

      if (group.created_by === req.username) {
        await db.query("DELETE FROM esusu_contributions WHERE group_id=$1", [group.id]);
        await db.query("DELETE FROM esusu_members WHERE group_id=$1", [group.id]);
        await db.query("DELETE FROM esusu_groups WHERE id=$1", [group.id]);
        return { ok: true, group, cancelled: true };
      }
      await db.query("DELETE FROM esusu_members WHERE group_id=$1 AND username=$2", [group.id, req.username]);
      await renumberPositions(db, group.id);
      return { ok: true, group, cancelled: false };
    }, (r) => ok(res, lang, r.cancelled ? t("groupCancelled", lang, r.group.group_name) : t("leftGroup", lang, r.group.group_name)));
  });

  // The creator removes someone from a forming group.
  router.post("/remove", async (req, res) => {
    const lang = req.lang;
    const target = typeof req.body.member === "string" ? req.body.member : "";
    await run(req, res, async (db) => {
      const { group, error } = await loadGroup(db, req.body.groupId, req.username, { creatorOnly: true });
      if (error) return error;
      if (group.status !== "forming") return { ok: false, key: "cannotLeaveStarted" };
      if (target === req.username) return { ok: false, key: "cannotRemoveSelf" };
      const removed = await db.query("DELETE FROM esusu_members WHERE group_id=$1 AND username=$2 RETURNING 1", [group.id, target]);
      if (!removed.rows.length) return { ok: false, key: "memberNotFound", args: [target] };
      await renumberPositions(db, group.id);
      return { ok: true };
    }, () => ok(res, lang, t("memberRemoved", lang, target)));
  });

  router.post("/contribute", async (req, res) => {
    const lang = req.lang;
    const groupId = Number(req.body.groupId);
    if (!Number.isInteger(groupId)) return fail(res, 400, lang, "groupNotFound", "");
    await run(req, res, (db) => contribute(db, { username: req.username, groupId }),
      (r) => ok(res, lang, contributionMessage(t, lang, r), { balance: r.balance }));
  });

  return router;
};
