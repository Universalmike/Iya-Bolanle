import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from 'pg';
import { parseIntent, parseConfirmation, detectLanguage, removeAccents } from "./nlu.js";
import { t, naira } from "./messages.js";
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

    console.log('All tables created successfully');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
};

createTables();

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
  if (!GEMINI_API_KEY) {
    const responses = {
      english: "I'd love to give you financial advice, but my AI brain needs to be activated first. Ask your admin to add a Gemini API key!",
      pidgin: "I wan give you advice, but my AI brain never activate yet. Tell your admin make e add Gemini API key!",
      yoruba: "Mo fẹ́ fún ọ ní ìmọ̀ràn, ṣùgbọ́n kò tí ì múlẹ̀. Sọ fún admin láti fi API key sí!",
      igbo: "Achọrọ m inye gị ndụmọdụ, mana AI m amalitebeghị. Gwa admin ka o tinye Gemini API key!",
      hausa: "Ina so in ba ku shawara, amma AI na bai fara aiki ba. Gaya wa admin ya sanya Gemini API key!"
    };
    return responses[language] || responses.english;
  }

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

    return "I'm having trouble thinking right now. Please try asking again!";
  } catch (error) {
    console.error("Gemini error:", error);
    const responses = {
      english: "Sorry, I'm having trouble connecting to my AI brain. Try again in a moment!",
      pidgin: "Sorry o! My AI brain no dey work well now. Try again small!",
      yoruba: "Má bínú! AI mi kò ṣiṣẹ́ dáadáa báyìí. Gbìyànjú padà!",
      igbo: "Ndo! AI m anaghị arụ ọrụ ugbu a. Gbalịa ọzọ!",
      hausa: "Yi hakuri! AI na baya aiki sosai yanzu. Sake gwadawa!"
    };
    return responses[language] || responses.english;
  }
}

// --------- Auth ----------
// 10 failed logins per IP+username per 15 minutes, and 5 signups per IP per hour.
const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const signupLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
// Compared against when the username doesn't exist, so response time
// doesn't reveal which usernames are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const welcomeMessage = (username) =>
  `Hi ${username}! I'm SARA. I speak English, Pidgin, Yoruba, Igbo, and Hausa. I can help with payments, savings, and financial advice!`;

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const invalid = validateSignup(username, password);
  if (invalid) return res.status(400).json({ message: invalid });

  const wait = signupLimiter.check(req.ip);
  if (wait) return res.status(429).json({ message: `Too many signups. Try again in ${Math.ceil(wait / 60)} minutes.` });

  try {
    // Usernames are unique regardless of case, so "Ada" and "ada" can't both exist
    // (the chat looks recipients up case-insensitively).
    const taken = await pool.query("SELECT 1 FROM users WHERE LOWER(username)=LOWER($1)", [username]);
    if (taken.rows.length) return res.status(400).json({ message: "Username already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users(username, password) VALUES($1, $2)", [username, hashed]);
    signupLimiter.fail(req.ip); // counts successful signups
    res.json({ message: "Account created successfully! You can now login." });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ message: "Username already exists" });
    console.error("Signup error:", err);
    res.status(500).json({ message: "Signup failed. Please try again." });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  const limitKey = `${req.ip}:${username.toLowerCase()}`;
  const wait = loginLimiter.check(limitKey);
  if (wait) return res.status(429).json({ message: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minutes.` });

  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

    if (!user || !valid) {
      loginLimiter.fail(limitKey);
      return res.status(400).json({ message: "Invalid username or password" });
    }

    loginLimiter.reset(limitKey);
    res.json({
      token: signToken(user),
      username: user.username,
      balance: user.balance,
      message: "Login successful",
      welcomeMessage: welcomeMessage(user.username),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// Used by the frontend to restore a saved session after a page refresh.
app.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT username, balance FROM users WHERE username=$1", [req.username]);
    if (!rows.length) return res.status(401).json({ message: "Account not found. Please log in again." });
    res.json({ username: rows[0].username, balance: rows[0].balance });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ message: "Could not load your account" });
  }
});

// --------- Main Action Endpoint ----------
// Flow: (1) if the message is a yes/no, resolve the pending action;
// (2) otherwise parse intent (Gemini, regex fallback); (3) money-moving intents
// are never executed directly — they create a pending action and ask to confirm.
app.post("/action", requireAuth, async (req, res) => {
  const username = req.username;
  const { text } = req.body;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ message: "Missing parameters" });
  }

  try {
    const user = (await pool.query("SELECT * FROM users WHERE username=$1", [username])).rows[0];
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const reply = (language, message, extra = {}) =>
      res.json({ message, speak: toSpeech(message), language, balance: user.balance, ...extra });

    // 1. Yes / no to a pending confirmation
    const answer = parseConfirmation(text);
    if (answer) {
      const pending = await takePendingAction(username);
      if (!pending) {
        const lang = detectLanguage(text);
        return reply(lang, t("nothingToConfirm", lang));
      }
      const lang = pending.language;
      if (!pending.valid) return reply(lang, t("expired", lang));
      if (answer === "no") return reply(lang, t("cancelled", lang));

      const result = await executors[pending.action.type](username, pending.action, lang);
      return reply(lang, result.message, result.ok ? { balance: result.balance } : {});
    }

    // Any other message drops an earlier unconfirmed request.
    await clearPendingAction(username);

    // 2. Understand the message
    const parsed = await parseIntent(text, geminiOpts);
    const lang = parsed.language;
    console.log(`Intent (${parsed.source}):`, JSON.stringify(parsed));

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
        const message = formatHistory(rows, lang);
        return res.json({ message, speak: toSpeech(t(rows.length ? "historyHeader" : "historyEmpty", lang)), language: lang, balance: user.balance });
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
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// --------- Transaction History ----------
// "/history/:username" is kept for old clients but only works for your own username.
app.get(["/history", "/history/:username"], requireAuth, requireSameUser, async (req, res) => {
  const username = req.username;

  try {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE username=$1 ORDER BY date DESC LIMIT 20",
      [username]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Could not fetch history" });
  }
});

// --------- Bill Scanner ----------
app.post("/scan-bill", requireAuth, (req, res) => {
  const username = req.username;
  const { imageData, billType } = req.body;

  if (!imageData) {
    return res.status(400).json({ message: "Missing required fields" });
  }

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

  const type = billType || "electricity";
  const billData = mockBills[type] || mockBills.electricity;

  res.json({
    success: true,
    billData: billData,
    message: `I've scanned your ${type} bill! Amount: ₦${billData.amount.toLocaleString()}`,
    speak: `I've scanned your ${type} bill! The amount is ${billData.amount} Naira.`
  });
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

// NOTE: billData still comes from the client (the scanner is a mock). The amount is
// validated here, but the proper fix is for the server to store scanned bills.
app.post("/pay-bill", requireAuth, async (req, res) => {
  const username = req.username;
  const { billData } = req.body;

  const amount = validAmount(billData?.amount, 1_000_000);
  if (!billData || !amount) {
    return res.status(400).json({ message: "Invalid bill details" });
  }

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
      const balance = await currentBalance(username);
      return res.status(400).json({
        message: `You need ${naira(amount)} but only have ${naira(balance)}.`
      });
    }
    const { balance } = result;

    res.json({
      message: `Perfect! Your ${billData.provider} bill of ${naira(amount)} has been paid. New balance: ${naira(balance)}.`,
      balance,
      receiptNumber: "RCP" + Date.now()
    });
  } catch (err) {
    console.error("Pay bill error:", err);
    res.status(500).json({ message: "Payment failed" });
  }
});

// --------- Esusu Endpoints ----------
const ESUSU_FREQUENCIES = ["daily", "weekly", "monthly"];

app.post("/esusu/create", requireAuth, async (req, res) => {
  const username = req.username;
  const { frequency } = req.body;
  const groupName = typeof req.body.groupName === "string" ? req.body.groupName.trim() : "";
  const amountPerPerson = validAmount(req.body.amountPerPerson, 1_000_000);
  const totalMembers = Number.isInteger(req.body.totalMembers) ? req.body.totalMembers : null;

  if (!groupName || groupName.length > 50) {
    return res.status(400).json({ message: "Group name must be 1-50 characters" });
  }
  if (!amountPerPerson) {
    return res.status(400).json({ message: "Amount per person must be between ₦1 and ₦1,000,000" });
  }
  if (!ESUSU_FREQUENCIES.includes(frequency)) {
    return res.status(400).json({ message: "Frequency must be daily, weekly or monthly" });
  }
  if (!totalMembers || totalMembers < 2 || totalMembers > 50) {
    return res.status(400).json({ message: "A group needs between 2 and 50 members" });
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

    res.json({ 
      message: `Great! Your esusu group "${groupName}" has been created!`,
      groupId: groupId
    });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ message: "Group name already exists" });
    console.error("Esusu create error:", err);
    res.status(500).json({ message: "Could not create group" });
  }
});

app.post("/esusu/join", requireAuth, async (req, res) => {
  const username = req.username;
  const { groupName } = req.body;

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ message: `Group "${groupName}" not found.` });
    }

    const group = groupResult.rows[0];

    const existingResult = await pool.query(
      "SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", 
      [group.id, username]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ message: "You're already in this group!" });
    }

    const membersResult = await pool.query("SELECT * FROM esusu_members WHERE group_id=$1", [group.id]);
    
    if (membersResult.rows.length >= group.total_members) {
      return res.status(400).json({ message: "Sorry, this group is full!" });
    }

    const position = membersResult.rows.length + 1;
    
    await pool.query(
      "INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)",
      [group.id, username, position]
    );

    res.json({ 
      message: `Welcome to "${groupName}"! You're member #${position}.`
    });
  } catch (err) {
    res.status(500).json({ message: "Could not join group" });
  }
});

app.post("/esusu/contribute", requireAuth, async (req, res) => {
  const username = req.username;
  const { groupName } = req.body;

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);

    if (groupResult.rows.length === 0) {
      return res.status(400).json({ message: "Group not found" });
    }

    const group = groupResult.rows[0];
    const amount = group.amount_per_person;

    const memberResult = await pool.query(
      "SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", 
      [group.id, username]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(400).json({ message: "You're not a member of this group!" });
    }

    // Groups created before amount validation existed could hold a bad amount.
    if (!validAmount(amount, 1_000_000)) {
      return res.status(400).json({ message: "This group has an invalid contribution amount." });
    }

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
      const balance = await currentBalance(username);
      return res.status(400).json({ message: `You need ${naira(amount)} but only have ${naira(balance)}.` });
    }

    res.json({
      message: `Perfect! You've contributed ${naira(amount)} to "${groupName}".`,
      balance: result.balance
    });
  } catch (err) {
    console.error("Esusu contribute error:", err);
    res.status(500).json({ message: "Contribution failed" });
  }
});

app.get(["/esusu/my-groups", "/esusu/my-groups/:username"], requireAuth, requireSameUser, async (req, res) => {
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
    res.status(500).json({ message: "Could not fetch groups" });
  }
});

// --------- Start Server ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SARA backend running on port ${PORT}`);
});
