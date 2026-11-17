import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from 'pg';
import {
  parseIntent, parseConfirmation, parseLanguageCommand, removeAccents, normalize, LANGUAGES,
  extractPhone, extractNetwork, networkForPhone, closestMatch,
} from "./nlu.js";
import { queryHistory, formatHistory, historySpeech } from "./history.js";
import { createBillsRouter, createBillTables } from "./bills.js";
import { createEsusuRouter, migrateEsusu, formatDate, contribute, contributionMessage, statusMessage, listGroups, pickGroup } from "./esusu.js";
import { t, naira, billTypeName, historyLabel, LANGUAGE_NAMES } from "./messages.js";
import { signToken, requireAuth, requireSameUser, validateSignup, createRateLimiter } from "./auth.js";
const { Pool } = pkg;

const app = express();
// Vercel (and most hosts) sit behind a proxy; needed so req.ip is the real client IP.
app.set("trust proxy", 1);
app.use(cors());
// Bill photos are sent as base64. Vercel rejects request bodies over 4.5MB before they reach us.
app.use(express.json({ limit: "4.5mb" }));

// PostgreSQL connection. Hosted databases (Neon, Supabase, Render…) need SSL; a local one doesn't.
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  // On Vercel each function instance has its own pool; keep it small so many instances
  // don't use up the database's connection limit.
  max: process.env.VERCEL ? 3 : 10,
});

// Gemini API configuration. Override GEMINI_MODEL if Google retires this model.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const geminiOpts = { apiKey: GEMINI_API_KEY, model: GEMINI_MODEL };

// Limits for money-moving actions (naira)
const LIMITS = {
  airtime: { min: 50, max: 50_000 },
  transfer: { min: 10, max: 1_000_000 },
};
// How long a "Send ₦X to Y?" prompt stays valid
const PENDING_TTL_SECONDS = 120;

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// Create tables
const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        balance INTEGER DEFAULT 10000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        to_user TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS esusu_groups (
        id SERIAL PRIMARY KEY,
        group_name TEXT UNIQUE NOT NULL,
        amount_per_person INTEGER NOT NULL,
        frequency TEXT NOT NULL,
        total_members INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS esusu_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES esusu_groups(id),
        username TEXT NOT NULL,
        position INTEGER NOT NULL,
        has_collected INTEGER DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS esusu_contributions (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES esusu_groups(id),
        username TEXT NOT NULL,
        amount INTEGER NOT NULL,
        cycle_number INTEGER NOT NULL,
        contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // One unconfirmed money action per user, waiting for "yes"/"no".
    // Stored in the DB (not memory) so it survives restarts and multiple instances.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_actions (
        username TEXT PRIMARY KEY,
        action JSONB NOT NULL,
        language TEXT NOT NULL DEFAULT 'english',
        expires_at TIMESTAMP NOT NULL
      )
    `);

    // language: the user's chosen language, or NULL for "auto" (follow what they write).
    // last_language: the language detected most recently, used in auto mode and by
    // screens that have no text to detect from (bills, esusu).
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_language TEXT`);

    // The number (and network) airtime was last bought for, offered as the default next time.
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS airtime_phone TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS airtime_network TEXT`);
    // When the user was last told about money they received.
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`);
    // What a transfer was for ("lunch"), shown to both sides.
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS transactions_user_date ON transactions (username, date DESC)`);

    console.log('All tables created successfully');
  } catch (err) {
    console.error('Error creating tables:', err);
    throw err;
  }
};

// --------- Database set-up (runs once per schema version) ----------
// On Vercel many instances can cold-start at once, so set-up holds a Postgres advisory
// lock and records the version it ran; later starts see the version and skip the work.
// The lock is transaction-scoped (pg_advisory_xact_lock): it is released at COMMIT/ROLLBACK
// and stays on one server connection even through a pooler such as Neon's PgBouncer.
// Bump SETUP_VERSION whenever createTables, createBillTables or migrateEsusu change.
const SETUP_VERSION = "2026-11-17";
const SETUP_LOCK_ID = 727274; // any constant number, shared by every instance

const runSetup = async () => {
  // Fast path for every later cold start (fails harmlessly on a brand-new database).
  try {
    const current = await pool.query("SELECT value FROM app_meta WHERE key='setup_version'");
    if (current.rows[0]?.value === SETUP_VERSION) return;
  } catch {
    // app_meta doesn't exist yet
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SETUP_LOCK_ID]);
    // Created under the lock, so simultaneous first starts can't race on it.
    await client.query("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    // Another instance may have finished while we waited for the lock.
    const { rows } = await client.query("SELECT value FROM app_meta WHERE key='setup_version'");
    if (rows[0]?.value !== SETUP_VERSION) {
      await createTables();
      await createBillTables(pool);
      // After the base tables exist: adds columns and refunds old groups once.
      await migrateEsusu(pool, withTransaction);
      await client.query(
        `INSERT INTO app_meta (key, value) VALUES ('setup_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [SETUP_VERSION]
      );
      console.log(`Database set-up ${SETUP_VERSION} complete`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// Requests wait for set-up; if it fails (e.g. the database is unreachable) the next request retries.
let setupPromise = null;
const ensureSetup = () => {
  if (!setupPromise) {
    setupPromise = runSetup().catch((err) => {
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
};
// Open the backend's address in a browser to check it is up (does not touch the database).
app.get("/", (req, res) => res.json({ ok: true, service: "SARA backend" }));

app.use((req, res, next) => {
  ensureSetup().then(
    () => next(),
    (err) => {
      console.error("Database not ready:", err.message);
      res.status(503).json({ message: t("serverError", "english") });
    }
  );
});

// --------- Language ----------
const isLanguage = (value) => LANGUAGES.includes(value);
const effectiveLanguage = (user) =>
  (isLanguage(user?.language) && user.language) || (isLanguage(user?.last_language) && user.last_language) || "english";

// For signup/login: the language picked on the login screen.
const requestLanguage = (req) => (isLanguage(req.body?.language) ? req.body.language : "english");

// After requireAuth: loads the user's reply language into req.lang.
const loadLanguage = async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT language, last_language FROM users WHERE username=$1", [req.username]);
    req.lang = effectiveLanguage(rows[0]);
  } catch {
    req.lang = "english";
  }
  next();
};

const fail = (res, status, lang, key, ...args) => res.status(status).json({ message: t(key, lang, ...args) });

// --------- Helpers ----------
const toSpeech = (text, maxLen = 300) => {
  let speech = removeAccents(text).replace(/₦/g, 'Naira ');
  if (speech.length > maxLen) {
    // Cut at the last sentence end that fits, so speech doesn't stop mid-word.
    const cut = speech.slice(0, maxLen);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    speech = end > 0 ? cut.slice(0, end + 1) : cut;
  }
  return speech;
};

// Exact username first; otherwise a case-insensitive match if it is unambiguous.
const findUser = async (name, db = pool) => {
  const exact = await db.query("SELECT * FROM users WHERE username=$1", [name]);
  if (exact.rows.length) return exact.rows[0];
  const loose = await db.query("SELECT * FROM users WHERE LOWER(username)=LOWER($1)", [name]);
  return loose.rows.length === 1 ? loose.rows[0] : null;
};

const savePendingAction = (username, action, language) =>
  pool.query(
    `INSERT INTO pending_actions (username, action, language, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))
     ON CONFLICT (username) DO UPDATE
       SET action = EXCLUDED.action, language = EXCLUDED.language, expires_at = EXCLUDED.expires_at`,
    [username, action, language, PENDING_TTL_SECONDS]
  );

// Removes and returns the pending action in one statement, so a double "yes"
// (e.g. two quick taps) can only ever execute it once.
const takePendingAction = async (username) => {
  const result = await pool.query(
    `DELETE FROM pending_actions WHERE username=$1
     RETURNING action, language, (expires_at > NOW()) AS valid`,
    [username]
  );
  return result.rows[0] ?? null;
};

const clearPendingAction = (username) =>
  pool.query("DELETE FROM pending_actions WHERE username=$1", [username]);

const checkLimits = (type, amount, lang) => {
  const { min, max } = LIMITS[type];
  if (amount < min) return t("amountTooSmall", lang, min);
  if (amount > max) return t("amountTooLarge", lang, max);
  return null;
};

// Runs fn inside a DB transaction. Balance updates use
// "balance = balance - $x WHERE balance >= $x" so concurrent requests can't overspend.
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query(result?.ok === false ? "ROLLBACK" : "COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const executeTransfer = (username, { amount, recipient, note = null }, lang) =>
  withTransaction(async (db) => {
    if (recipient === username) return { ok: false, message: t("selfTransfer", lang) };

    const debit = await db.query(
      "UPDATE users SET balance = balance - $1 WHERE username=$2 AND balance >= $1 RETURNING balance",
      [amount, username]
    );
    if (debit.rowCount === 0) {
      const { rows } = await db.query("SELECT balance FROM users WHERE username=$1", [username]);
      return { ok: false, message: t("insufficientFunds", lang, rows[0]?.balance ?? 0, amount) };
    }

    const credit = await db.query(
      "UPDATE users SET balance = balance + $1 WHERE username=$2 RETURNING username",
      [amount, recipient]
    );
    if (credit.rowCount === 0) return { ok: false, message: t("recipientNotFound", lang, recipient) };

    await db.query(
      `INSERT INTO transactions (username, type, amount, to_user, note)
       VALUES ($1, 'Transfer', $2, $3, $4), ($3, 'Received', $2, $1, $4)`,
      [username, amount, recipient, note]
    );

    const balance = debit.rows[0].balance;
    return { ok: true, balance, message: t("transferSuccess", lang, amount, recipient, balance) };
  });

// NOTE: airtime is still simulated; no telco/payment provider is called yet.
const executeAirtime = (username, { amount, phone, network }, lang) =>
  withTransaction(async (db) => {
    if (!phone || !network) return { ok: false, message: t("askAirtimePhone", lang, amount) };
    const debit = await db.query(
      "UPDATE users SET balance = balance - $1 WHERE username=$2 AND balance >= $1 RETURNING balance",
      [amount, username]
    );
    if (debit.rowCount === 0) {
      const { rows } = await db.query("SELECT balance FROM users WHERE username=$1", [username]);
      return { ok: false, message: t("insufficientFunds", lang, rows[0]?.balance ?? 0, amount) };
    }

    await db.query(
      "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, 'Airtime', $2, $3)",
      [username, amount, `${phone} (${network})`]
    );
    await db.query("UPDATE users SET airtime_phone=$1, airtime_network=$2 WHERE username=$3", [phone, network, username]);

    const balance = debit.rows[0].balance;
    return { ok: true, balance, message: t("airtimeSuccess", lang, amount, balance, phone, network) };
  });

// Esusu contribution confirmed in chat. contribute() re-checks everything
// (still a member, not already paid this round, enough balance) at execution time.
const executeEsusu = async (username, { groupId }, lang) => {
  const result = await withTransaction((db) => contribute(db, { username, groupId }));
  if (!result.ok) return { ok: false, message: t(result.key, lang, ...(result.args || [])) };
  return { ok: true, balance: result.balance, message: contributionMessage(t, lang, result) };
};

const executors = { transfer: executeTransfer, airtime: executeAirtime, esusu: executeEsusu };

const historyHelpers = { t, naira, historyLabel };

// --------- Airtime: fill in the number and network, then confirm ----------
// A request missing the phone number or network is saved as a pending action that is
// "awaiting" that detail; the user's next message ("08031234567", "MTN") completes it.
const continueAirtime = async (username, action, lang, reply) => {
  const { amount, phone, network } = action;
  if (!phone) {
    await savePendingAction(username, { type: "airtime", amount, awaiting: "phone" }, lang);
    return reply(lang, t("askAirtimePhone", lang, amount), { awaitingInput: "phone" });
  }
  if (!network) {
    await savePendingAction(username, { type: "airtime", amount, phone, awaiting: "network" }, lang);
    return reply(lang, t("askAirtimeNetwork", lang, phone), { awaitingInput: "network" });
  }
  const ready = { type: "airtime", amount, phone, network };
  await savePendingAction(username, ready, lang);
  return reply(lang, t("confirmAirtime", lang, amount, phone, network), { awaitingConfirmation: true, pendingAction: ready });
};

// Asking again for whatever an incomplete action still needs.
const askAgain = (action, lang) =>
  action.awaiting === "network" ? t("askAirtimeNetwork", lang, action.phone) : t("askAirtimePhone", lang, action.amount);

const peekPendingAction = async (username) =>
  (await pool.query(
    "SELECT action, language, (expires_at > NOW()) AS valid FROM pending_actions WHERE username=$1",
    [username]
  )).rows[0] ?? null;

// A similar existing username, for "Did you mean …?" (voice input often mishears names).
const suggestUsername = async (name) => {
  const { rows } = await pool.query(
    "SELECT username FROM users WHERE LENGTH(username) BETWEEN $1 AND $2 LIMIT 2000",
    [Math.max(name.length - 2, 1), name.length + 2]
  );
  return closestMatch(name, rows.map((r) => r.username));
};

// --------- "bola sent you ₦500" ----------
// Money received since the user was last told, then marks it as told. Returns text or null.
const receivedNotice = async (username, lang) => {
  const { rows } = await pool.query(
    `WITH prev AS (SELECT last_seen_at FROM users WHERE username=$1),
          seen AS (UPDATE users SET last_seen_at = NOW() WHERE username=$1)
     SELECT t.to_user, t.amount, t.note FROM transactions t, prev
     WHERE t.username=$1 AND t.type='Received' AND prev.last_seen_at IS NOT NULL AND t.date > prev.last_seen_at
     ORDER BY t.date DESC, t.id DESC LIMIT 20`,
    [username]
  );
  if (!rows.length) return null;
  const items = rows.slice(0, 3).map((r) => t("receivedItem", lang, r.to_user, r.amount, r.note));
  if (rows.length > 3) items.push(t("receivedMore", lang, rows.length - 3));
  return t("receivedWhileAway", lang, items.join(", "));
};

// --------- Gemini AI Function ----------
async function getGeminiAdvice(userQuery, userContext, language) {
  if (!GEMINI_API_KEY) return t("aiUnavailable", language);

  try {
    let languageInstruction = '';
    if (language === 'pidgin') {
      languageInstruction = 'CRITICAL: You MUST respond ONLY in Nigerian Pidgin English. Use words like: wetin, dey, abeg, na, fit, don, go, make, e be say, no be, plenty, small small.';
    } else if (language === 'yoruba') {
      languageInstruction = 'CRITICAL: You MUST respond ONLY in Yoruba language. Use proper Yoruba words and structure.';
    } else if (language === 'igbo') {
      languageInstruction = 'CRITICAL: You MUST respond ONLY in Igbo language. Use proper Igbo words and structure.';
    } else if (language === 'hausa') {
      languageInstruction = 'CRITICAL: You MUST respond ONLY in Hausa language. Use proper Hausa words and structure.';
    }

    const systemPrompt = `You are SARA, a friendly Nigerian financial assistant helping people with money.

${languageInstruction}

Context about user:
${userContext}

Give advice on:
- Nigerian investments (Treasury bills, mutual funds, PiggyVest, Cowrywise, Chaka)
- Savings strategies
- Budgeting tips
- Nigerian banks and financial products

You cannot move money in this reply. If the user seems to want a payment, tell them the exact phrase to use, e.g. "send 1000 to john" or "buy 200 airtime".

Keep response:
- Very brief (2-3 short sentences)
- Practical and actionable
- Specific to Nigeria
- Friendly and conversational`;

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userQuery }] }],
        generationConfig: {
          temperature: 0.9,
          // Newer Gemini models spend part of this budget "thinking", so leave headroom.
          maxOutputTokens: 1024,
          topP: 0.95,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();

    if (text) {
      return text;
    }

    return t("aiError", language);
  } catch (error) {
    console.error("Gemini error:", error);
    return t("aiError", language);
  }
}

// --------- Auth ----------
// 10 failed logins per IP+username per 15 minutes, and 5 signups per IP per hour.
const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const signupLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
// Compared against when the username doesn't exist, so response time
// doesn't reveal which usernames are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// What the frontend needs to know about the user's language settings.
const languageInfo = (user) => ({
  languagePreference: isLanguage(user.language) ? user.language : "auto",
  language: effectiveLanguage(user),
});

app.post("/signup", async (req, res) => {
  const lang = requestLanguage(req);
  const { username, password } = req.body;
  const invalid = validateSignup(username, password);
  if (invalid) return fail(res, 400, lang, ...invalid);

  const wait = signupLimiter.check(req.ip);
  if (wait) return fail(res, 429, lang, "tooManySignups", Math.ceil(wait / 60));

  // A language picked on the login screen becomes the saved preference.
  const preference = isLanguage(req.body.language) ? req.body.language : null;

  try {
    // Usernames are unique regardless of case, so "Ada" and "ada" can't both exist
    // (the chat looks recipients up case-insensitively).
    const taken = await pool.query("SELECT 1 FROM users WHERE LOWER(username)=LOWER($1)", [username]);
    if (taken.rows.length) return fail(res, 400, lang, "usernameTaken");

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users(username, password, language, last_language) VALUES($1, $2, $3, $3)",
      [username, hashed, preference]
    );
    signupLimiter.fail(req.ip); // counts successful signups
    res.json({ message: t("signupSuccess", lang) });
  } catch (err) {
    if (err.code === "23505") return fail(res, 400, lang, "usernameTaken");
    console.error("Signup error:", err);
    fail(res, 500, lang, "signupFailed");
  }
});

app.post("/login", async (req, res) => {
  const lang = requestLanguage(req);
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return fail(res, 400, lang, "credentialsRequired");
  }

  const limitKey = `${req.ip}:${username.toLowerCase()}`;
  const wait = loginLimiter.check(limitKey);
  if (wait) return fail(res, 429, lang, "tooManyLogins", Math.ceil(wait / 60));

  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

    if (!user || !valid) {
      loginLimiter.fail(limitKey);
      return fail(res, 400, lang, "invalidCredentials");
    }

    loginLimiter.reset(limitKey);
    const info = languageInfo(user);
    const notice = await receivedNotice(user.username, info.language);
    res.json({
      token: signToken(user),
      username: user.username,
      balance: user.balance,
      ...info,
      welcomeMessage: t("welcome", info.language, user.username),
      ...(notice && { notice }),
    });
  } catch (err) {
    console.error("Login error:", err);
    fail(res, 500, lang, "loginFailed");
  }
});

// Used by the frontend to restore a saved session after a page refresh.
app.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [req.username]);
    if (!rows.length) return fail(res, 401, "english", "accountNotFound");
    const info = languageInfo(rows[0]);
    const notice = await receivedNotice(rows[0].username, info.language);
    res.json({
      username: rows[0].username,
      balance: rows[0].balance,
      ...info,
      welcomeMessage: t("welcomeBack", info.language, rows[0].username, rows[0].balance),
      ...(notice && { notice }),
    });
  } catch (err) {
    console.error("Me error:", err);
    fail(res, 500, "english", "serverError");
  }
});

// Light-weight balance refresh for the header (no side effects).
app.get("/balance", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT balance FROM users WHERE username=$1", [req.username]);
    if (!rows.length) return fail(res, 401, "english", "accountNotFound");
    res.json({ balance: rows[0].balance });
  } catch (err) {
    console.error("Balance error:", err);
    fail(res, 500, "english", "serverError");
  }
});

// Set the reply language: one of LANGUAGES, or "auto" to follow what the user writes.
app.put("/me/language", requireAuth, loadLanguage, async (req, res) => {
  const { language } = req.body;
  if (language !== "auto" && !isLanguage(language)) return fail(res, 400, req.lang, "invalidLanguage");

  const preference = language === "auto" ? null : language;
  try {
    const { rows } = await pool.query(
      "UPDATE users SET language=$1, last_language=COALESCE($1, last_language) WHERE username=$2 RETURNING *",
      [preference, req.username]
    );
    const info = languageInfo(rows[0]);
    const message = preference
      ? t("languageChanged", info.language, LANGUAGE_NAMES[info.language])
      : t("languageAuto", info.language);
    res.json({ ...info, message, speak: toSpeech(message) });
  } catch (err) {
    console.error("Set language error:", err);
    fail(res, 500, req.lang, "serverError");
  }
});

// --------- Main Action Endpoint ----------
// Flow: (1) if the message is a yes/no, resolve the pending action;
// (2) otherwise parse intent (Gemini, regex fallback); (3) money-moving intents
// are never executed directly — they create a pending action and ask to confirm.
// Language: a saved preference always wins. In "auto" mode the reply follows the
// language of the message, except for quick-action buttons (fixed English text),
// which keep the current language. If a user with a preference writes in another
// Nigerian language, the reply offers to switch (languageSuggestion) but doesn't.
app.post("/action", requireAuth, async (req, res) => {
  const username = req.username;
  const { text } = req.body;
  const quick = req.body.quick === true;

  try {
    const user = (await pool.query("SELECT * FROM users WHERE username=$1", [username])).rows[0];
    if (!user) return fail(res, 401, "english", "accountNotFound");

    let preference = isLanguage(user.language) ? user.language : null;
    const current = effectiveLanguage(user);

    if (typeof text !== "string" || !text.trim()) return fail(res, 400, current, "missingText");

    // Money that arrived since the last message ("bola sent you ₦500"), shown before the reply.
    const notice = await receivedNotice(username, current);

    let languageSuggestion; // set below if the user writes in a different language
    const reply = (language, message, extra = {}) =>
      res.json({
        message,
        speak: toSpeech(notice ? `${notice} ${message}` : message),
        language,
        languagePreference: preference ?? "auto",
        balance: user.balance,
        ...(notice && { notice }),
        ...(languageSuggestion && { languageSuggestion }),
        ...extra,
      });

    // 1. Yes / no to a pending confirmation (answered in the language it was asked in)
    const answer = parseConfirmation(text);
    if (answer) {
      const pending = await takePendingAction(username);
      if (!pending) return reply(current, t("nothingToConfirm", current));
      const lang = pending.language;
      if (!pending.valid) return reply(lang, t("expired", lang));
      if (answer === "no") return reply(lang, t("cancelled", lang));
      // "Yes" to "which number?" isn't an answer: keep waiting and ask again.
      if (pending.action.awaiting) {
        await savePendingAction(username, pending.action, lang);
        return reply(lang, askAgain(pending.action, lang), { awaitingInput: pending.action.awaiting });
      }

      const result = await executors[pending.action.type](username, pending.action, lang);
      return reply(lang, result.message, result.ok ? { balance: result.balance } : {});
    }

    // 1b. The missing detail of an earlier request ("08031234567" after "which number?", "MTN")
    const pending = await peekPendingAction(username);
    if (pending?.valid && pending.action.awaiting) {
      const lang = pending.language;
      const phone = extractPhone(text);
      const network = extractNetwork(text);
      const action = { ...pending.action };
      if (action.awaiting === "phone" && phone) {
        action.phone = phone;
        action.network = network || networkForPhone(phone);
      } else if (action.awaiting === "network" && network) {
        action.network = network;
      }
      if (action.phone !== pending.action.phone || action.network !== pending.action.network) {
        if (user.balance < action.amount) {
          await clearPendingAction(username);
          return reply(lang, t("insufficientFunds", lang, user.balance, action.amount));
        }
        return continueAirtime(username, action, lang, reply);
      }
      // Anything else is a new request; fall through.
    }

    // Any other message drops an earlier unconfirmed request.
    await clearPendingAction(username);

    // 2. "Speak Yoruba" / "reply in auto"
    const command = parseLanguageCommand(text);
    if (command) {
      preference = command === "auto" ? null : command;
      await pool.query(
        "UPDATE users SET language=$1, last_language=COALESCE($1, last_language) WHERE username=$2",
        [preference, username]
      );
      const lang = preference ?? current;
      return reply(lang, preference ? t("languageChanged", lang, LANGUAGE_NAMES[lang]) : t("languageAuto", lang));
    }

    // 3. Understand the message
    const parsed = await parseIntent(text, geminiOpts);
    const detected = parsed.language;
    console.log(`Intent (${parsed.source}):`, JSON.stringify(parsed));

    let lang;
    if (preference) {
      lang = preference;
      if (!quick && detected !== preference && detected !== "english") languageSuggestion = detected;
    } else if (quick) {
      lang = current;
    } else {
      lang = detected;
      if (detected !== user.last_language) {
        await pool.query("UPDATE users SET last_language=$1 WHERE username=$2", [detected, username]);
      }
    }

    switch (parsed.intent) {
      case "balance":
        return reply(lang, t("balance", lang, username, user.balance));

      case "transfer": {
        const { amount, recipient } = parsed;
        if (!recipient) return reply(lang, t("askRecipient", lang));
        if (!amount) return reply(lang, t("askTransferAmount", lang, recipient));
        const limitError = checkLimits("transfer", amount, lang);
        if (limitError) return reply(lang, limitError);

        const recipientUser = await findUser(recipient);
        if (!recipientUser) {
          // Never sends to the guess: the user has to ask again with the right name.
          const suggestion = await suggestUsername(recipient);
          return reply(lang, suggestion ? t("didYouMean", lang, recipient, suggestion) : t("recipientNotFound", lang, recipient));
        }
        if (recipientUser.id === user.id) return reply(lang, t("selfTransfer", lang));
        if (user.balance < amount) return reply(lang, t("insufficientFunds", lang, user.balance, amount));

        const note = parsed.note || null;
        const action = { type: "transfer", amount, recipient: recipientUser.username, note };
        await savePendingAction(username, action, lang);
        return reply(lang, t("confirmTransfer", lang, amount, recipientUser.username, note), { awaitingConfirmation: true, pendingAction: action });
      }

      case "airtime": {
        const { amount } = parsed;
        if (!amount) return reply(lang, t("askAirtimeAmount", lang));
        const limitError = checkLimits("airtime", amount, lang);
        if (limitError) return reply(lang, limitError);
        if (user.balance < amount) return reply(lang, t("insufficientFunds", lang, user.balance, amount));

        // No number given: use the one airtime was last bought for (shown in the confirmation).
        const phone = parsed.phone || user.airtime_phone || null;
        const savedNetwork = phone && phone === user.airtime_phone ? user.airtime_network : null;
        const network = parsed.network || savedNetwork || networkForPhone(phone);
        return continueAirtime(username, { amount, phone, network }, lang, reply);
      }

      case "esusu_pay": {
        const groups = await listGroups(pool, username);
        if (!groups.length) return reply(lang, t("esusuNoGroups", lang));
        const { group, active } = pickGroup(groups, normalize(text), normalize);
        if (!group) {
          if (!active.length) return reply(lang, t("esusuNoActive", lang));
          return reply(lang, t("esusuPickGroup", lang, active.map((g) => g.group_name)));
        }
        if (group.paid_this_round) return reply(lang, t("alreadyPaidRound", lang, group.current_cycle));
        if (user.balance < group.amount_per_person) {
          return reply(lang, t("insufficientFunds", lang, user.balance, group.amount_per_person));
        }

        const action = { type: "esusu", groupId: group.id, amount: group.amount_per_person };
        await savePendingAction(username, action, lang);
        return reply(lang, t("confirmEsusu", lang, group.amount_per_person, group.group_name, group.current_cycle), {
          awaitingConfirmation: true,
          pendingAction: action,
        });
      }

      case "esusu_status": {
        const groups = await listGroups(pool, username);
        return reply(lang, statusMessage(t, lang, groups));
      }

      case "history": {
        const history = await queryHistory(pool, username, parsed.history ?? {}, { limit: 10 });
        const spoken = historySpeech(history, lang, historyHelpers);
        return reply(lang, formatHistory(history, lang, historyHelpers), {
          speak: toSpeech(notice ? `${notice} ${spoken}` : spoken),
          historyFilter: history.filter,
        });
      }

      case "greeting":
        return reply(lang, t("greeting", lang, username));

      case "help":
        return reply(lang, t("help", lang));

      // "advice" and anything unrecognised go to the AI instead of a canned reply.
      default: {
        if (!GEMINI_API_KEY && parsed.intent !== "advice") return reply(lang, t("help", lang));

        const historyResult = await pool.query(
          "SELECT type, amount FROM transactions WHERE username=$1 ORDER BY date DESC LIMIT 5",
          [username]
        );
        const userContext = `
User: ${username}
Balance: ${naira(user.balance)}
Recent transactions: ${historyResult.rows.map(tx => `${tx.type} ${naira(tx.amount)}`).join(', ') || 'No recent transactions'}
Language preference: ${lang}
        `.trim();

        const aiResponse = await getGeminiAdvice(text, userContext, lang);
        return reply(lang, aiResponse, { isAiAdvice: true });
      }
    }
  } catch (err) {
    console.error("Action error:", err);
    fail(res, 500, "english", "serverError");
  }
});

// --------- Transaction History ----------
// "/history/:username" is kept for old clients but only works for your own username.
// Returns the raw rows plus a ready-to-show, translated message.
app.get(["/history", "/history/:username"], requireAuth, requireSameUser, loadLanguage, async (req, res) => {
  // Optional query: ?type=sent|received|airtime|bills|esusu|money_out &period=today|…|last_days
  // &days=N &with=username &limit=1-100 &before=<transaction id> (for "load more").
  const { type, period, days, with: counterparty, limit, before } = req.query;
  try {
    const history = await queryHistory(
      pool,
      req.username,
      { type, period, days, counterparty },
      { limit: Number(limit) || 20, beforeId: Number(before) || null }
    );
    res.json({
      transactions: history.rows,
      totals: history.totals,
      filter: history.filter,
      message: formatHistory(history, req.lang, historyHelpers),
      speak: toSpeech(historySpeech(history, req.lang, historyHelpers)),
      language: req.lang,
    });
  } catch (err) {
    console.error("History error:", err);
    fail(res, 500, req.lang, "historyFailed");
  }
});

// --------- Bill Scanner ----------
// Gemini reads the photo; scanned bills are stored server-side and paid by id (see bills.js).
app.use(createBillsRouter({ pool, withTransaction, requireAuth, loadLanguage, fail, t, toSpeech, billTypeName, formatDate, gemini: geminiOpts }));

// --------- Esusu (savings groups) ----------
// Routes and round/payout logic live in esusu.js.
app.use("/esusu", createEsusuRouter({ pool, withTransaction, requireAuth, loadLanguage, fail, t, toSpeech }));

// --------- Errors ----------
// Body-parser errors (photo too large, broken JSON) and anything unexpected become a JSON
// message the app can show, instead of Express's HTML error page with a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return fail(res, 413, "english", "billImageInvalid");
  if (err.type === "entity.parse.failed") return fail(res, 400, "english", "missingText");
  console.error("Unhandled error:", err);
  fail(res, 500, "english", "serverError");
});

// --------- Start Server ----------
// Start database set-up straight away rather than on the first request.
ensureSetup().catch((err) => console.error("Database set-up failed:", err.message));

// On Vercel the app is a serverless function (see api/index.js), so it must not listen itself.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 SARA backend running on port ${PORT}`);
  });
}

export default app;
