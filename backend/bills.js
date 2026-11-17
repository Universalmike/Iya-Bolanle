// Bill scanner: reads a photo of a bill with Gemini vision, stores what it found on
// the server, and pays only bills the server has stored (never amounts or account
// numbers sent by the browser).
import crypto from "node:crypto";
import { Router } from "express";
import { createRateLimiter } from "./auth.js";

export const BILL_TYPES = ["electricity", "water", "internet", "cable", "other"];
export const MAX_BILL_AMOUNT = 1_000_000;
// 3MB of image is ~4MB as base64, under the 4.5MB request limit on Vercel.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const SCAN_TTL_MINUTES = 30; // a scanned bill must be paid within this time
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// "data:image/jpeg;base64,AAAA" → { mimeType, data, bytes } or null.
export const parseImageData = (dataUrl) => {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  if (!IMAGE_TYPES.includes(mimeType)) return null;
  const data = m[2].replace(/\s/g, "");
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes < 100 || bytes > MAX_IMAGE_BYTES) return null;
  return { mimeType, data, bytes };
};

const BILL_PROMPT = `You read photos of Nigerian bills for SARA, a voice banking assistant.
Look at the image and return JSON describing the bill. Only report what is printed on it — never guess.
- isBill: false if the image is not a bill, invoice or payment slip (e.g. a selfie, a random object, blank page).
- billType: electricity (e.g. EKEDC, IKEDC, AEDC, PHED, IBEDC, EEDC, KEDCO, JED, BEDC, KAEDCO, YEDC),
  water (state water corporations), internet (Spectranet, Smile, ipNX, FiberOne, MTN/Airtel broadband…),
  cable (DStv, GOtv, StarTimes, Showmax), or other.
- provider: the company name as printed.
- accountNumber: the account / customer / smartcard / IUC number. meterNumber: the meter number if printed.
- customerName: as printed.
- amountDue: the total amount to pay now in naira (include arrears if the bill says "total due"), as a number.
  null if there is no amount to pay (e.g. a prepaid meter card). Ignore kobo separators: "₦12,450.50" → 12450.5.
- dueDate: YYYY-MM-DD, or null. billPeriod: e.g. "October 2026", or null. package: cable/internet plan, or null.
- readable: false if the photo is too blurry, dark or cut off to read the amount and account number reliably.
Use null for anything not printed or not legible.`;

const nullable = (type) => ({ type, nullable: true });
const BILL_SCHEMA = {
  type: "OBJECT",
  properties: {
    isBill: { type: "BOOLEAN" },
    readable: { type: "BOOLEAN" },
    billType: { type: "STRING", enum: BILL_TYPES },
    provider: nullable("STRING"),
    accountNumber: nullable("STRING"),
    meterNumber: nullable("STRING"),
    customerName: nullable("STRING"),
    amountDue: nullable("NUMBER"),
    dueDate: nullable("STRING"),
    billPeriod: nullable("STRING"),
    package: nullable("STRING"),
  },
  required: ["isBill", "readable", "billType"],
};

// Calls Gemini. Returns the raw JSON object, or throws.
export const geminiReadBill = async (image, { apiKey, model, timeoutMs = 25_000, fetchImpl = fetch }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: BILL_PROMPT }] },
        contents: [{
          role: "user",
          parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: "Read this bill." }],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: BILL_SCHEMA,
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini bill HTTP ${res.status}`);
    const data = await res.json();
    const json = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
    return JSON.parse(json);
  } finally {
    clearTimeout(timer);
  }
};

const text = (value, max = 80) => {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v && v.toLowerCase() !== "null" ? v.slice(0, max) : null;
};
// Account/meter numbers: keep digits, letters and dashes only.
const reference = (value) => {
  const v = text(value, 40)?.replace(/[^A-Za-z0-9-]/g, "");
  return v && v.length >= 4 ? v.toUpperCase() : null;
};
// Bills can have kobo; balances are whole naira, so round up (never underpay a bill).
export const billAmount = (value) => {
  const n = typeof value === "string" ? Number(value.replace(/[₦,\s]/g, "")) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  const naira = Math.ceil(Math.round(n * 100) / 100);
  return naira <= MAX_BILL_AMOUNT ? naira : null;
};
const isoDate = (value) => {
  const v = text(value, 10);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

// Turns Gemini's output into a clean bill, or { error: messageKey }.
export const validateBill = (raw) => {
  if (!raw || typeof raw !== "object") return { error: "billUnreadable" };
  if (raw.isBill === false) return { error: "notABill" };
  const bill = {
    billType: BILL_TYPES.includes(raw.billType) ? raw.billType : "other",
    provider: text(raw.provider, 60),
    accountNumber: reference(raw.accountNumber),
    meterNumber: reference(raw.meterNumber),
    customerName: text(raw.customerName),
    amount: billAmount(raw.amountDue),
    dueDate: isoDate(raw.dueDate),
    billPeriod: text(raw.billPeriod, 40),
    package: text(raw.package, 60),
  };
  // Without a provider and something to pay into, the payment can't be routed.
  if (raw.readable === false || !bill.provider || !(bill.accountNumber || bill.meterNumber)) {
    return { error: "billUnreadable" };
  }
  return { bill };
};

const rowToBill = (r) => ({
  id: r.id,
  billType: r.bill_type,
  provider: r.provider,
  accountNumber: r.account_number,
  meterNumber: r.meter_number,
  customerName: r.customer_name,
  amount: r.amount,
  dueDate: r.due_date_text ?? null,
  billPeriod: r.bill_period,
  package: r.package,
  overdue: r.overdue ?? false,
});

export const createBillTables = (pool) =>
  pool.query(`
    CREATE TABLE IF NOT EXISTS scanned_bills (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      bill_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      account_number TEXT,
      meter_number TEXT,
      customer_name TEXT,
      amount INTEGER,
      due_date DATE,
      bill_period TEXT,
      package TEXT,
      image_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scanned',
      amount_paid INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      paid_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS scanned_bills_user ON scanned_bills (username, status);
  `);

const SELECT_BILL = `*, due_date::text AS due_date_text, (due_date IS NOT NULL AND due_date < CURRENT_DATE) AS overdue`;

// An earlier paid bill that looks like the same one (same photo, or same account + period + amount).
const findPaidDuplicate = async (db, username, bill, imageHash) => {
  const { rows } = await db.query(
    `SELECT paid_at, amount_paid FROM scanned_bills
     WHERE username=$1 AND status='paid' AND (
       image_hash=$2 OR (
         LOWER(provider)=LOWER($3) AND COALESCE(account_number, meter_number)=$4
         AND bill_period IS NOT DISTINCT FROM $5 AND amount IS NOT DISTINCT FROM $6 AND $5 IS NOT NULL
       ))
     ORDER BY paid_at DESC LIMIT 1`,
    [username, imageHash, bill.provider, bill.accountNumber || bill.meterNumber, bill.billPeriod, bill.amount]
  );
  return rows[0] ?? null;
};

export const createBillsRouter = ({
  pool, withTransaction, requireAuth, loadLanguage, fail, t, toSpeech, billTypeName, formatDate, gemini, readBill = geminiReadBill,
}) => {
  const router = Router();
  // Each scan is a paid Gemini call, so limit them per user.
  const scanLimiter = createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });

  const reply = (res, lang, message, extra = {}) =>
    res.json({ message, speak: toSpeech(message), language: lang, ...extra });

  router.post("/scan-bill", requireAuth, loadLanguage, async (req, res) => {
    const { username, lang } = req;
    if (!req.body?.imageData) return fail(res, 400, lang, "billImageMissing");
    const image = parseImageData(req.body.imageData);
    if (!image) return fail(res, 400, lang, "billImageInvalid");
    if (!gemini.apiKey) return fail(res, 503, lang, "billScannerUnavailable");
    const wait = scanLimiter.check(username);
    if (wait) return fail(res, 429, lang, "tooManyScans", Math.ceil(wait / 60));
    scanLimiter.fail(username);

    let result;
    try {
      result = validateBill(await readBill(image, gemini));
    } catch (err) {
      console.error("Bill scan failed:", err.message);
      return fail(res, 502, lang, "billScanFailed");
    }
    if (result.error) return fail(res, 422, lang, result.error);

    const { bill } = result;
    const imageHash = crypto.createHash("sha256").update(image.data).digest("hex");
    try {
      const duplicate = await findPaidDuplicate(pool, username, bill, imageHash);
      const { rows } = await pool.query(
        `INSERT INTO scanned_bills (username, bill_type, provider, account_number, meter_number, customer_name,
           amount, due_date, bill_period, package, image_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW() + make_interval(mins => $12))
         RETURNING ${SELECT_BILL}`,
        [username, bill.billType, bill.provider, bill.accountNumber, bill.meterNumber, bill.customerName,
          bill.amount, bill.dueDate, bill.billPeriod, bill.package, imageHash, SCAN_TTL_MINUTES]
      );
      const saved = rowToBill(rows[0]);
      const type = billTypeName(saved.billType, lang);
      let message = saved.amount
        ? t("billScanned", lang, saved.provider, type, saved.amount)
        : t("billScannedNoAmount", lang, saved.provider, type);
      if (saved.overdue) message += " " + t("billOverdue", lang, formatDate(saved.dueDate, lang));
      if (duplicate) message += " " + t("billMaybePaid", lang, duplicate.amount_paid, formatDate(duplicate.paid_at, lang));
      message = message.replace(/ {2,}/g, " ");
      reply(res, lang, message, { success: true, billData: saved, possibleDuplicate: Boolean(duplicate) });
    } catch (err) {
      console.error("Saving scanned bill failed:", err);
      fail(res, 500, lang, "billScanFailed");
    }
  });

  // Body: { billId, amount? }. The amount may be changed by the user (a misread, a partial
  // payment, or a prepaid meter with no amount printed); everything else comes from the stored bill.
  router.post("/pay-bill", requireAuth, loadLanguage, async (req, res) => {
    const { username, lang } = req;
    const billId = Number(req.body?.billId);
    if (!Number.isInteger(billId) || billId <= 0) return fail(res, 400, lang, "billInvalid");
    const requested = req.body?.amount;
    if (requested !== undefined && requested !== null && !billAmount(requested)) {
      return fail(res, 400, lang, "billAmountInvalid", MAX_BILL_AMOUNT);
    }

    try {
      const result = await withTransaction(async (db) => {
        // Locks the bill row: two quick taps on "Pay" can only pay it once.
        const { rows } = await db.query(
          `SELECT ${SELECT_BILL}, (expires_at > NOW()) AS fresh FROM scanned_bills
           WHERE id=$1 AND username=$2 FOR UPDATE`,
          [billId, username]
        );
        const row = rows[0];
        if (!row) return { ok: false, key: "billInvalid", status: 404 };
        if (row.status === "paid") return { ok: false, key: "billAlreadyPaid", status: 409 };
        if (!row.fresh) return { ok: false, key: "billExpired", status: 410 };

        const amount = billAmount(requested ?? row.amount);
        if (!amount) return { ok: false, key: "billAmountNeeded", status: 400 };

        const { rows: debited } = await db.query(
          "UPDATE users SET balance = balance - $1 WHERE username=$2 AND balance >= $1 RETURNING balance",
          [amount, username]
        );
        if (!debited.length) return { ok: false, key: "insufficientFunds", status: 400, amount };

        await db.query(
          "UPDATE scanned_bills SET status='paid', amount_paid=$1, paid_at=NOW() WHERE id=$2",
          [amount, billId]
        );
        await db.query(
          "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, 'Bill Payment', $2, $3)",
          [username, amount, `${row.provider} - ${row.account_number || row.meter_number}`]
        );
        return { ok: true, amount, provider: row.provider, balance: debited[0].balance, billId };
      });

      if (!result.ok) {
        if (result.key === "insufficientFunds") {
          const { rows } = await pool.query("SELECT balance FROM users WHERE username=$1", [username]);
          return fail(res, 400, lang, "insufficientFunds", rows[0]?.balance ?? 0, result.amount);
        }
        return fail(res, result.status, lang, result.key, MAX_BILL_AMOUNT);
      }

      const message = t("billPaid", lang, result.provider, result.amount, result.balance);
      reply(res, lang, message, { balance: result.balance, receiptNumber: `SARA-BILL-${result.billId}` });
    } catch (err) {
      console.error("Pay bill error:", err);
      fail(res, 500, lang, "paymentFailed");
    }
  });

  return router;
};
