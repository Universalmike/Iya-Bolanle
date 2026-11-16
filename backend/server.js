import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from 'pg';
import { parseIntent, parseConfirmation, parseLanguageCommand, removeAccents, LANGUAGES } from "./nlu.js";
import { t, naira, billTypeName, LANGUAGE_NAMES } from "./messages.js";
import { signToken, requireAuth, requireSameUser, validateSignup, createRateLimiter } from "./auth.js";
const { Pool } = pkg;

const app = express();
// Render (and most hosts) sit behind a proxy; needed so req.ip is the real client IP.
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "5mb" })); // bill photos are sent as base64

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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

    console.log('All tables created successfully');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
};

createTables();

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

const executeTransfer = (username, { amount, recipient }, lang) =>
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
      "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, 'Transfer', $2, $3), ($3, 'Received', $2, $1)",
      [username, amount, recipient]
    );

    const balance = debit.rows[0].balance;
    return { ok: true, balance, message: t("transferSuccess", lang, amount, recipient, balance) };
  });

// NOTE: airtime is still simulated; no telco/payment provider is called yet.
const executeAirtime = (username, { amount, phone }, lang) =>
  withTransaction(async (db) => {
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
      [username, amount, phone || "Self"]
    );

    const balance = debit.rows[0].balance;
    return { ok: true, balance, message: t("airtimeSuccess", lang, amount, balance) };
  });

const executors = { transfer: executeTransfer, airtime: executeAirtime };

const HISTORY_ICONS = { Airtime: "📱", Transfer: "💸", Received: "💰", "Bill Payment": "🧾", "Esusu Contribution": "🤝" };

const formatHistory = (rows, lang) => {
  if (!rows.length) return t("historyEmpty", lang);
  const lines = rows.map((tx) => {
    const date = new Date(tx.date).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const icon = HISTORY_ICONS[tx.type] || "💳";
    let party = "";
    if (tx.type === "Received") party = ` ← ${tx.to_user}`;
    else if (tx.to_user && tx.to_user !== "Self") party = ` → ${tx.to_user}`;
    return `${icon} ${date} — ${tx.type} ${naira(tx.amount)}${party}`;
  });
  return `${t("historyHeader", lang)}\n\n${lines.join("\n")}`;
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
    res.json({
      token: signToken(user),
      username: user.username,
      balance: user.balance,
      ...info,
      welcomeMessage: t("welcome", info.language, user.username),
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
    res.json({
      username: rows[0].username,
      balance: rows[0].balance,
      ...info,
      welcomeMessage: t("welcomeBack", info.language, rows[0].username, rows[0].balance),
    });
  } catch (err) {
    console.error("Me error:", err);
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

    let languageSuggestion; // set below if the user writes in a different language
    const reply = (language, message, extra = {}) =>
      res.json({
        message,
        speak: toSpeech(message),
        language,
        languagePreference: preference ?? "auto",
        balance: user.balance,
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

      const result = await executors[pending.action.type](username, pending.action, lang);
      return reply(lang, result.message, result.ok ? { balance: result.balance } : {});
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
        if (!recipientUser) return reply(lang, t("recipientNotFound", lang, recipient));
        if (recipientUser.id === user.id) return reply(lang, t("selfTransfer", lang));
        if (user.balance < amount) return reply(lang, t("insufficientFunds", lang, user.balance, amount));

        const action = { type: "transfer", amount, recipient: recipientUser.username };
        await savePendingAction(username, action, lang);
        return reply(lang, t("confirmTransfer", lang, amount, recipientUser.username), { awaitingConfirmation: true, pendingAction: action });
      }

      case "airtime": {
        const { amount, phone } = parsed;
        if (!amount) return reply(lang, t("askAirtimeAmount", lang));
        const limitError = checkLimits("airtime", amount, lang);
        if (limitError) return reply(lang, limitError);
        if (user.balance < amount) return reply(lang, t("insufficientFunds", lang, user.balance, amount));

        const action = { type: "airtime", amount, phone };
        await savePendingAction(username, action, lang);
        return reply(lang, t("confirmAirtime", lang, amount, phone), { awaitingConfirmation: true, pendingAction: action });
      }

      case "history": {
        const { rows } = await pool.query(
          "SELECT * FROM transactions WHERE username=$1 ORDER BY date DESC LIMIT 10",
          [username]
        );
        return reply(lang, formatHistory(rows, lang), {
          speak: toSpeech(t(rows.length ? "historyHeader" : "historyEmpty", lang)),
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
  const username = req.username;

  try {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE username=$1 ORDER BY date DESC LIMIT 20",
      [username]
    );
    res.json({
      transactions: result.rows,
      message: formatHistory(result.rows, req.lang),
      speak: toSpeech(t(result.rows.length ? "historyHeader" : "historyEmpty", req.lang)),
      language: req.lang,
    });
  } catch (err) {
    console.error("History error:", err);
    fail(res, 500, req.lang, "historyFailed");
  }
});

// --------- Bill Scanner ----------
app.post("/scan-bill", requireAuth, loadLanguage, (req, res) => {
  const username = req.username;
  const { imageData, billType } = req.body;

  if (!imageData) return fail(res, 400, req.lang, "billImageMissing");

  const mockBills = {
    electricity: {
      provider: "EKEDC",
      accountNumber: "1234567890",
      customerName: username,
      amount: Math.floor(Math.random() * 5000) + 2000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      billPeriod: "December 2024",
      meterNumber: "45678901234"
    },
    water: {
      provider: "Lagos Water Corp",
      accountNumber: "WTR" + Math.floor(Math.random() * 1000000),
      customerName: username,
      amount: Math.floor(Math.random() * 3000) + 1000,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      billPeriod: "December 2024"
    }
  };

  const type = mockBills[billType] ? billType : "electricity";
  const billData = mockBills[type];
  const message = t("billScanned", req.lang, billTypeName(type, req.lang), billData.amount);

  res.json({ success: true, billData, message, speak: toSpeech(message), language: req.lang });
});

// A positive whole-naira amount within limits, or null.
const validAmount = (value, max) =>
  Number.isInteger(value) && value > 0 && value <= max ? value : null;

// Deducts amount only if the balance covers it (atomic, safe under concurrency).
// Returns the new balance, or null if funds are insufficient.
const debit = async (db, username, amount) => {
  const { rows } = await db.query(
    "UPDATE users SET balance = balance - $1 WHERE username=$2 AND balance >= $1 RETURNING balance",
    [amount, username]
  );
  return rows.length ? rows[0].balance : null;
};

const currentBalance = async (username) =>
  (await pool.query("SELECT balance FROM users WHERE username=$1", [username])).rows[0]?.balance ?? 0;

const MAX_PAYMENT = 1_000_000;

// NOTE: billData still comes from the client (the scanner is a mock). The amount is
// validated here, but the proper fix is for the server to store scanned bills.
app.post("/pay-bill", requireAuth, loadLanguage, async (req, res) => {
  const username = req.username;
  const lang = req.lang;
  const { billData } = req.body;

  const amount = validAmount(billData?.amount, MAX_PAYMENT);
  if (!billData || !amount) return fail(res, 400, lang, "billInvalid");

  try {
    const result = await withTransaction(async (db) => {
      const balance = await debit(db, username, amount);
      if (balance === null) return { ok: false };
      await db.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [username, "Bill Payment", amount, `${billData.provider} - ${billData.accountNumber}`]
      );
      return { ok: true, balance };
    });

    if (!result.ok) {
      return fail(res, 400, lang, "insufficientFunds", await currentBalance(username), amount);
    }

    const message = t("billPaid", lang, billData.provider, amount, result.balance);
    res.json({
      message,
      speak: toSpeech(message),
      language: lang,
      balance: result.balance,
      receiptNumber: "RCP" + Date.now()
    });
  } catch (err) {
    console.error("Pay bill error:", err);
    fail(res, 500, lang, "paymentFailed");
  }
});

// --------- Esusu Endpoints ----------
const ESUSU_FREQUENCIES = ["daily", "weekly", "monthly"];
const ESUSU_MEMBERS = { min: 2, max: 50 };

app.post("/esusu/create", requireAuth, loadLanguage, async (req, res) => {
  const username = req.username;
  const lang = req.lang;
  const { frequency } = req.body;
  const groupName = typeof req.body.groupName === "string" ? req.body.groupName.trim() : "";
  const amountPerPerson = validAmount(req.body.amountPerPerson, MAX_PAYMENT);
  const totalMembers = Number.isInteger(req.body.totalMembers) ? req.body.totalMembers : null;

  if (!groupName || groupName.length > 50) return fail(res, 400, lang, "groupNameInvalid");
  if (!amountPerPerson) return fail(res, 400, lang, "esusuAmountInvalid", MAX_PAYMENT);
  if (!ESUSU_FREQUENCIES.includes(frequency)) return fail(res, 400, lang, "esusuFrequencyInvalid");
  if (!totalMembers || totalMembers < ESUSU_MEMBERS.min || totalMembers > ESUSU_MEMBERS.max) {
    return fail(res, 400, lang, "esusuMembersInvalid", ESUSU_MEMBERS.min, ESUSU_MEMBERS.max);
  }

  try {
    const result = await pool.query(
      "INSERT INTO esusu_groups (group_name, amount_per_person, frequency, total_members, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [groupName, amountPerPerson, frequency, totalMembers, username]
    );

    const groupId = result.rows[0].id;

    await pool.query(
      "INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)",
      [groupId, username, 1]
    );

    const message = t("groupCreated", lang, groupName);
    res.json({ message, speak: toSpeech(message), language: lang, groupId });
  } catch (err) {
    if (err.code === "23505") return fail(res, 400, lang, "groupNameTaken");
    console.error("Esusu create error:", err);
    fail(res, 500, lang, "groupCreateFailed");
  }
});

app.post("/esusu/join", requireAuth, loadLanguage, async (req, res) => {
  const username = req.username;
  const lang = req.lang;
  const { groupName } = req.body;

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    if (groupResult.rows.length === 0) return fail(res, 400, lang, "groupNotFound", groupName);

    const group = groupResult.rows[0];

    const existingResult = await pool.query(
      "SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2",
      [group.id, username]
    );
    if (existingResult.rows.length > 0) return fail(res, 400, lang, "alreadyMember");

    const membersResult = await pool.query("SELECT * FROM esusu_members WHERE group_id=$1", [group.id]);
    if (membersResult.rows.length >= group.total_members) return fail(res, 400, lang, "groupFull");

    const position = membersResult.rows.length + 1;

    await pool.query(
      "INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)",
      [group.id, username, position]
    );

    const message = t("joinedGroup", lang, groupName, position);
    res.json({ message, speak: toSpeech(message), language: lang });
  } catch (err) {
    console.error("Esusu join error:", err);
    fail(res, 500, lang, "joinFailed");
  }
});

app.post("/esusu/contribute", requireAuth, loadLanguage, async (req, res) => {
  const username = req.username;
  const lang = req.lang;
  const { groupName } = req.body;

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    if (groupResult.rows.length === 0) return fail(res, 400, lang, "groupNotFound", groupName);

    const group = groupResult.rows[0];
    const amount = group.amount_per_person;

    const memberResult = await pool.query(
      "SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2",
      [group.id, username]
    );
    if (memberResult.rows.length === 0) return fail(res, 400, lang, "notMember");

    // Groups created before amount validation existed could hold a bad amount.
    if (!validAmount(amount, MAX_PAYMENT)) return fail(res, 400, lang, "groupBadAmount");

    const result = await withTransaction(async (db) => {
      const balance = await debit(db, username, amount);
      if (balance === null) return { ok: false };

      // Cycle tracking is still a placeholder (always 1) until the Esusu cycle logic is built.
      await db.query(
        "INSERT INTO esusu_contributions (group_id, username, amount, cycle_number) VALUES ($1, $2, $3, $4)",
        [group.id, username, amount, 1]
      );
      await db.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [username, "Esusu Contribution", amount, groupName]
      );
      return { ok: true, balance };
    });

    if (!result.ok) {
      return fail(res, 400, lang, "insufficientFunds", await currentBalance(username), amount);
    }

    const message = t("contributed", lang, amount, groupName, result.balance);
    res.json({ message, speak: toSpeech(message), language: lang, balance: result.balance });
  } catch (err) {
    console.error("Esusu contribute error:", err);
    fail(res, 500, lang, "contributeFailed");
  }
});

app.get(["/esusu/my-groups", "/esusu/my-groups/:username"], requireAuth, requireSameUser, loadLanguage, async (req, res) => {
  const username = req.username;

  try {
    const result = await pool.query(
      `SELECT g.*, m.position, m.has_collected
       FROM esusu_groups g
       JOIN esusu_members m ON g.id = m.group_id
       WHERE m.username=$1`,
      [username]
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error("Esusu groups error:", err);
    fail(res, 500, req.lang, "groupsFetchFailed");
  }
});

// --------- Start Server ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SARA backend running on port ${PORT}`);
});
