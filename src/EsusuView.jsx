import React, { useEffect, useState } from "react";
import { api } from "./api";

const naira = (n) => `₦${Number(n || 0).toLocaleString()}`;
const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "";

const STATUS = {
  forming: { label: "Waiting for members", color: "#f59e0b" },
  active: { label: "Active", color: "#10b981" },
  completed: { label: "Completed", color: "#94a3b8" },
};

// Esusu / Ajo screen. `onAction(path, body)` posts to /esusu/<path>, shows SARA's
// reply in the chat, refreshes `groups`, and resolves to { ok, message }.
export default function EsusuView({ groups, onAction, styles }) {
  const [view, setView] = useState("list"); // list | create | join | detail
  const [detailId, setDetailId] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, message } from the last action
  const [busy, setBusy] = useState(false);

  const act = async (path, body) => {
    setBusy(true);
    const result = await onAction(path, body);
    setNotice(result);
    setBusy(false);
    return result;
  };

  const openDetail = (id) => {
    setDetailId(id);
    setView("detail");
  };

  const banner = notice && (
    <div style={{ ...local.notice, borderColor: notice.ok ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)" }}>
      <span style={{ flex: 1 }}>{notice.message}</span>
      <button onClick={() => setNotice(null)} style={local.linkButton} aria-label="Dismiss">✕</button>
    </div>
  );

  if (view === "create") {
    return (
      <CreateGroup
        styles={styles}
        busy={busy}
        banner={banner}
        onBack={() => setView("list")}
        onCreate={async (body) => {
          const r = await act("create", body);
          if (r.ok) setView("list");
        }}
      />
    );
  }

  if (view === "join") {
    return (
      <JoinGroup
        styles={styles}
        busy={busy}
        banner={banner}
        onBack={() => setView("list")}
        onJoin={async (inviteCode) => {
          const r = await act("join", { inviteCode });
          if (r.ok) setView("list");
        }}
      />
    );
  }

  if (view === "detail" && detailId) {
    return (
      <GroupDetail
        groupId={detailId}
        groups={groups}
        styles={styles}
        busy={busy}
        banner={banner}
        act={act}
        onBack={() => setView("list")}
      />
    );
  }

  return (
    <div style={styles.esusuContainer}>
      <h3 style={styles.esusuTitle}>My Esusu Groups 🤝</h3>
      <p style={styles.esusuSubtitle}>Save together, collect in turns</p>
      {banner}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setView("create")} style={styles.buttonPrimary}>+ Create Group</button>
        <button onClick={() => setView("join")} style={styles.buttonSecondary}>Join with Code</button>
      </div>

      {groups.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={{ fontSize: 48, margin: "20px 0" }}>🤝</p>
          <h4 style={{ margin: "10px 0", color: "#94a3b8" }}>No groups yet</h4>
          <p style={{ margin: "10px 0", color: "#64748b", fontSize: 14 }}>
            Create a group and share its invite code, or join one with a code from a friend.
          </p>
        </div>
      ) : (
        <div style={styles.groupsList}>
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} styles={styles} busy={busy} act={act} onOpen={() => openDetail(g.id)} />
          ))}
        </div>
      )}

      <div style={styles.infoBox}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>How Esusu/Ajo Works 💡</h4>
        <p style={{ margin: "4px 0", fontSize: 13, lineHeight: 1.6, color: "#94a3b8" }}>
          1. Create a group and share the invite code. It starts when it's full (or when you start it).<br />
          2. Every round, each member pays the same amount into the group pot.<br />
          3. When everyone has paid, the whole pot goes to the member whose turn it is (#1 in round 1, #2 in round 2…).<br />
          4. After every member has collected once, the group is complete. 🎯
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.forming;
  return <span style={{ ...local.badge, color: s.color, borderColor: s.color }}>{s.label}</span>;
}

function InviteCode({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is still visible to read out.
    }
  };
  return (
    <span style={local.code}>
      Invite code: <strong style={{ letterSpacing: 2 }}>{code}</strong>
      <button onClick={(e) => { e.stopPropagation(); copy(); }} style={local.linkButton}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </span>
  );
}

// One-line summary of where the user stands in an active group.
function yourTurnText(g) {
  if (g.has_collected) return { text: `✓ You collected ${naira(g.collected_amount)}`, color: "#10b981" };
  if (g.position === g.current_cycle) return { text: "🎉 Your turn to collect this round!", color: "#a78bfa" };
  return { text: `You collect in round ${g.position}`, color: "#94a3b8" };
}

function GroupCard({ group: g, styles, busy, act, onOpen }) {
  const turn = g.status === "active" ? yourTurnText(g) : null;
  return (
    <div style={{ ...styles.groupCard, cursor: "pointer", flexWrap: "wrap" }} onClick={onOpen}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>{g.group_name}</h4>
          <StatusBadge status={g.status} />
        </div>
        <p style={local.line}>{naira(g.amount_per_person)} • {g.frequency} • you're #{g.position}</p>

        {g.status === "forming" && (
          <>
            <p style={local.line}>Members: {g.member_count} of {g.total_members}</p>
            <InviteCode code={g.invite_code} />
          </>
        )}

        {g.status === "active" && (
          <>
            <p style={local.line}>
              Round {g.current_cycle} of {g.member_count} • {g.paid_count}/{g.member_count} paid • pot {naira(g.pot_balance)}
            </p>
            <p style={{ ...local.line, color: turn.color }}>{turn.text}</p>
            <p style={{ ...local.line, color: g.paid_this_round ? "#10b981" : g.is_late ? "#f87171" : "#f59e0b" }}>
              {g.paid_this_round
                ? "✓ You've paid this round"
                : g.is_late
                  ? `⚠️ Late: was due ${formatDate(g.cycle_due_at)}`
                  : `⏳ Due by ${formatDate(g.cycle_due_at)}`}
            </p>
          </>
        )}

        {g.status === "completed" && <p style={local.line}>✓ Every member has collected</p>}
      </div>

      {g.status === "active" && !g.paid_this_round && (
        <button
          onClick={(e) => { e.stopPropagation(); act("contribute", { groupId: g.id }); }}
          style={styles.contributeButton}
          disabled={busy}
        >
          Pay {naira(g.amount_per_person)}
        </button>
      )}
      {g.status === "forming" && g.is_creator && g.member_count >= 2 && (
        <button
          onClick={(e) => { e.stopPropagation(); act("start", { groupId: g.id }); }}
          style={styles.contributeButton}
          disabled={busy}
        >
          Start now
        </button>
      )}
    </div>
  );
}

function GroupDetail({ groupId, groups, styles, busy, banner, act, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Re-fetch whenever the groups list changes (i.e. after any action).
  const summary = groups.find((g) => g.id === groupId);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/esusu/groups/${groupId}`)
      .then((res) => !cancelled && (setData(res.data), setError(null)))
      .catch((err) => !cancelled && setError(err.response?.data?.message || "Could not load the group."));
    return () => { cancelled = true; };
  }, [groupId, summary]);

  // The group disappears from the list once you leave it or cancel it.
  useEffect(() => {
    if (data && !summary) onBack();
  }, [data, summary, onBack]);

  if (error) {
    return (
      <div style={styles.esusuContainer}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <p style={{ color: "#f87171" }}>{error}</p>
      </div>
    );
  }
  if (!data) return <div style={styles.esusuContainer}><p style={styles.esusuSubtitle}>Loading…</p></div>;

  const { group: g, members } = data;
  const forming = g.status === "forming";

  return (
    <div style={styles.esusuContainer}>
      <button onClick={onBack} style={styles.backButton}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ ...styles.esusuTitle, margin: 0 }}>{g.group_name}</h3>
        <StatusBadge status={g.status} />
      </div>
      <p style={styles.esusuSubtitle}>
        {naira(g.amount_per_person)} {g.frequency} • each member collects {naira(g.amount_per_person * members.length)}
        {g.status === "active" && ` • round ${g.current_cycle} of ${members.length}, due ${formatDate(g.cycle_due_at)}`}
      </p>
      {banner}
      {forming && <p style={{ margin: "0 0 16px" }}><InviteCode code={g.invite_code} /></p>}

      <div style={styles.groupsList}>
        {members.map((m) => {
          const collecting = g.status === "active" && m.position === g.current_cycle;
          let state = "";
          if (m.has_collected) state = `✓ collected ${naira(m.collected_amount)}`;
          if (g.status === "active") {
            const pay = m.paid_this_round ? "✓ paid" : m.is_late ? "⚠️ late" : "⏳ not paid yet";
            state = state ? `${state} • ${pay}` : pay;
          }
          return (
            <div key={m.username} style={{ ...styles.groupCard, padding: 12 }}>
              <span style={local.position}>#{m.position}</span>
              <div style={{ flex: 1 }}>
                <strong>{m.username}</strong>
                {m.username === g.created_by && <span style={local.muted}> (creator)</span>}
                {collecting && <span style={{ color: "#a78bfa" }}> 🎉 collects this round</span>}
                {state && <div style={{ ...local.muted, color: m.is_late ? "#f87171" : "#94a3b8" }}>{state}</div>}
              </div>
              {forming && g.is_creator && m.username !== g.created_by && (
                <button
                  onClick={() => act("remove", { groupId: g.id, member: m.username })}
                  style={styles.logoutButton}
                  disabled={busy}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {g.status === "active" && !g.paid_this_round && (
          <button onClick={() => act("contribute", { groupId: g.id })} style={styles.payButton} disabled={busy}>
            Pay {naira(g.amount_per_person)} for round {g.current_cycle}
          </button>
        )}
        {forming && g.is_creator && (
          <>
            <button onClick={() => act("shuffle", { groupId: g.id })} style={styles.buttonSecondary} disabled={busy}>
              🔀 Shuffle order
            </button>
            <button
              onClick={() => act("start", { groupId: g.id })}
              style={styles.buttonPrimary}
              disabled={busy || members.length < 2}
            >
              ▶ Start with {members.length} members
            </button>
          </>
        )}
        {forming && (
          <button
            onClick={() => {
              const question = g.is_creator
                ? "Cancel this group for everyone?"
                : "Leave this group?";
              if (window.confirm(question)) act("leave", { groupId: g.id });
            }}
            style={styles.logoutButton}
            disabled={busy}
          >
            {g.is_creator ? "Cancel group" : "Leave group"}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateGroup({ styles, busy, banner, onBack, onCreate }) {
  const [form, setForm] = useState({ groupName: "", amount: "", frequency: "monthly", members: "5" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const members = parseInt(form.members, 10) || 0;
  const amount = parseInt(form.amount, 10) || 0;

  return (
    <div style={styles.esusuContainer}>
      <button onClick={onBack} style={styles.backButton}>← Back</button>
      <h3 style={styles.esusuTitle}>Create Esusu Group 🤝</h3>
      <p style={styles.esusuSubtitle}>You'll get an invite code to share with the members.</p>
      {banner}

      <input placeholder="Group name (e.g., Family Circle)" value={form.groupName} onChange={set("groupName")} style={styles.input} />
      <input placeholder="Amount per person (e.g., 5000)" type="number" min="1" value={form.amount} onChange={set("amount")} style={styles.input} />
      <select value={form.frequency} onChange={set("frequency")} style={styles.input}>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <select value={form.members} onChange={set("members")} style={styles.input}>
        {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
          <option key={n} value={n}>{n} members</option>
        ))}
      </select>

      <div style={styles.infoBox}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          💡 {members} members each pay {naira(amount)} {form.frequency}. Every round one member collects{" "}
          {naira(members * amount)}. The group runs for {members} rounds, so everyone collects once.
        </p>
      </div>

      <button
        onClick={() => onCreate({ groupName: form.groupName, amountPerPerson: amount, frequency: form.frequency, totalMembers: members })}
        style={styles.buttonPrimary}
        disabled={busy}
      >
        Create Group
      </button>
    </div>
  );
}

function JoinGroup({ styles, busy, banner, onBack, onJoin }) {
  const [code, setCode] = useState("");
  return (
    <div style={styles.esusuContainer}>
      <button onClick={onBack} style={styles.backButton}>← Back</button>
      <h3 style={styles.esusuTitle}>Join Esusu Group 🚪</h3>
      <p style={styles.esusuSubtitle}>Enter the 6-character invite code from the group's creator.</p>
      {banner}
      <input
        placeholder="Invite code (e.g. 7KQ2XM)"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && onJoin(code)}
        style={{ ...styles.input, letterSpacing: 3, textTransform: "uppercase" }}
        maxLength={8}
      />
      <button onClick={() => onJoin(code)} style={styles.buttonPrimary} disabled={busy || !code.trim()}>
        Join Group
      </button>
    </div>
  );
}

const local = {
  badge: { fontSize: 11, padding: "2px 8px", borderRadius: 10, border: "1px solid" },
  line: { margin: "4px 0", fontSize: 13, color: "#94a3b8" },
  muted: { fontSize: 12, color: "#94a3b8" },
  code: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e2e8f0", marginTop: 4 },
  linkButton: { background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontSize: 13, padding: 0 },
  position: { fontWeight: 700, color: "#a78bfa", minWidth: 32 },
  notice: {
    display: "flex", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 10, border: "1px solid",
    background: "rgba(255,255,255,0.03)", fontSize: 14, lineHeight: 1.5, marginBottom: 16,
  },
};
