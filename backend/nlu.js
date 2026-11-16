// Natural-language understanding for SARA: language detection, amount/phone
// extraction, intent parsing (Gemini first, regex fallback) and yes/no replies.
// No external dependencies so it can be unit-tested with `node --test`.

export const LANGUAGES = ["english", "pidgin", "yoruba", "igbo", "hausa"];
export const INTENTS = ["balance", "airtime", "transfer", "history", "advice", "greeting", "help", "other"];

// --------- Text normalisation ----------
const HOOKED_LETTERS = { "ɓ": "b", "Ɓ": "B", "ɗ": "d", "Ɗ": "D", "ƙ": "k", "Ƙ": "K", "ƴ": "y", "Ƴ": "Y" };

// Strips tone marks and under-dots (ẹ ọ ṣ ẹ́ ṅ …) by decomposing to base letter +
// combining marks, then dropping the marks. Hausa hooked letters don't decompose,
// so they are mapped explicitly.
export const removeAccents = (text) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ɓƁɗƊƙƘƴƳ]/g, (c) => HOOKED_LETTERS[c])
    .normalize("NFC");

export const normalize = (text) => removeAccents(String(text)).toLowerCase().trim();

// --------- Language detection (fallback when Gemini is unavailable) ----------
// Only words that are distinctive for each language; common English words
// ("go", "come", "see") were removed so English isn't misread as Pidgin.
const languageWords = {
  pidgin: ["wetin", "dey", "abeg", "una", "abi", "wahala", "how far", "wan", "make we", "na so", "oga", "sabi", "chop", "wey", "dem", "e don", "no be", "comot", "oya", "ehen", "sha"],
  yoruba: ["bawo", "e ku", "eku", "pele", "odabo", "daadaa", "e se", "ese", "owo mi", "fun mi", "ninu", "apo", "miiran", "ranse", "elo ni", "jowo", "beeni", "rara", "kaadi", "fi owo"],
  igbo: ["kedu", "ndewo", "biko", "unu", "nwanne", "nnoo", "bia", "gaa", "daalu", "meela", "lelee", "ego", "ugbu a", "nwere", "ihe", "ozo", "choro", "foduru", "zuta", "zigara", "ziga", "nye", "mba"],
  hausa: ["sannu", "yaya", "lafiya", "na gode", "nagode", "barka", "kuma", "wallahi", "duba", "kudin", "kudi", "kake", "shine", "kana", "bukatar", "sayi", "tura", "aika", "nawa", "toh"],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const languagePatterns = Object.fromEntries(
  Object.entries(languageWords).map(([lang, words]) => [
    lang,
    new RegExp(`\\b(?:${[...new Set(words)].map(escapeRe).join("|")})\\b`, "g"),
  ])
);

export const detectLanguage = (text) => {
  const clean = normalize(text);
  let best = "english";
  let bestScore = 0;
  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    const score = (clean.match(pattern) || []).length;
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return best;
};

// --------- Phone numbers ----------
// Nigerian mobile numbers: 0803…, 234803…, +234 803 …
const PHONE_RE = /(?:\+?234[\s-]?|\b0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}\b/;

export const extractPhone = (text) => {
  const m = String(text).match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.startsWith("234") ? "0" + digits.slice(3) : digits;
};

// --------- Amounts ----------
// Handles "1000", "1,000", "₦1,500", "N2000", "5k", "2.5k", "1m", "1.5 million",
// "500 naira". Phone numbers are removed first so they are never read as amounts.
// Returns a positive integer number of naira, or null.
export const parseAmount = (text) => {
  const cleaned = normalize(text)
    .replace(new RegExp(PHONE_RE.source, "g"), " ")
    .replace(/(₦|\bngn|\bn)(?=\d)/g, " "); // currency prefixes: ₦500, N500, NGN500
  // The lookbehind stops digits inside words (e.g. username "user2") being read as amounts.
  const re = /(?<![a-z0-9_.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|m|thousand|million)?\b/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const whole = m[1].replace(/,/g, "");
    let value = parseFloat(m[2] ? `${whole}.${m[2]}` : whole);
    const suffix = m[3];
    if (suffix === "k" || suffix === "thousand") value *= 1_000;
    if (suffix === "m" || suffix === "million") value *= 1_000_000;
    value = Math.round(value);
    if (value > 0) return value;
  }
  return null;
};

// --------- Recipient (regex fallback) ----------
// Matches "to john", "give john", Yoruba "si john", Igbo "nye john", Hausa "ga john" / "wa john".
// Runs on the original text so the username's capitalisation is kept.
const RECIPIENT_RE = /\b(?:to|give|si|nye|ga|wa)\s+@?([A-Za-z0-9_.]+)/i;
const NOT_A_NAME = new Set(["me", "my", "the", "send", "pay", "buy", "him", "her", "them", "am", "mi", "m"]);

export const extractRecipient = (text) => {
  const re = new RegExp(RECIPIENT_RE.source, "gi");
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const name = m[1];
    if (!NOT_A_NAME.has(name.toLowerCase()) && !/^\d+$/.test(name)) return name;
  }
  return null;
};

// --------- Intent (regex fallback) ----------
// Order matters: money-moving intents are checked before balance so that
// e.g. Hausa "tura kudin 500 ga musa" (send money) is not read as a balance check.
const INTENT_RULES = [
  ["airtime", /\b(airtime|recharge|top ?up|kaadi|kati)\b/],
  ["transfer", /\b(send|transfer|pay|give|fi .*ranse|ranse|ziga|zigara|tura|aika)\b/],
  ["history", /\b(history|transactions?|statement|wetin i don spend|spent)\b/],
  ["balance", /\b(balance|how much (do )?i (have|get)|elo ni owo|owo mi|ego m|ego ole|kudin|nawa ne)\b/],
  ["greeting", /^(hi|hello|hey|good (morning|afternoon|evening)|how far|bawo|e kaaro|kedu|ndewo|sannu|barka)\b/],
  ["help", /^(help|what can you do|menu|options)\b/],
];

export const regexParseIntent = (text) => {
  const clean = normalize(text);
  const intent = INTENT_RULES.find(([, re]) => re.test(clean))?.[0] ?? "other";
  return {
    intent,
    amount: parseAmount(text),
    recipient: intent === "transfer" ? extractRecipient(text) : null,
    phone: intent === "airtime" ? extractPhone(text) : null,
    language: detectLanguage(text),
    source: "regex",
  };
};

// --------- Yes / No replies to a confirmation prompt ----------
// Only short replies count, so "i want to send 500 instead" is never read as a yes.
// "Yes" is checked first because Pidgin "no wahala" means "no problem" (i.e. yes).
const YES_RE = /^(yes|yeah|yep|yup|ok|okay|okey|sure|confirm|confirmed|go ahead|proceed|do it|send it|no wahala|no problem|ehen|oya|do am|abeg do am|beeni|bee ni|ee|o dara|odi mma|o di mma|toh|na amince|naam)\b/;
const NO_RE = /^(no|nope|nah|cancel|stop|don'?t|do not|abeg no|leave am|rara|mba|a'?a|babu|ba haka ba|kada)\b/;
const MAX_CONFIRM_WORDS = 5;
// Words that only count when they are the whole reply ("eh" is Hausa/Igbo yes,
// but "eh, I no sure" is hesitation).
const EXACT_YES = new Set(["eh", "y"]);
const EXACT_NO = new Set(["n"]);

export const parseConfirmation = (text) => {
  const clean = normalize(text).replace(/[!.?,]+/g, " ").replace(/\s+/g, " ").trim();
  if (EXACT_YES.has(clean)) return "yes";
  if (EXACT_NO.has(clean)) return "no";
  if (!clean || clean.split(" ").length > MAX_CONFIRM_WORDS) return null;
  if (YES_RE.test(clean)) return "yes";
  if (NO_RE.test(clean)) return "no";
  return null;
};

// --------- "Speak Yoruba" style language commands ----------
// Returns a language, "auto", or null. Needs a trigger word before the language
// name and a short message, so "how do you say thanks in hausa" doesn't switch.
// Includes Yoruba "so", Igbo "kwuo"/"asusu", Hausa "yi magana"/"harshe".
const LANGUAGE_COMMAND_RE =
  /\b(?:speak|talk|reply|respond|answer|switch|change|use|set|language|lang|so|soro|kwuo|asusu|yi magana|harshe)\b.*?\b(english|pidgin|yoruba|igbo|hausa|auto|automatic)\b/;
const MAX_LANGUAGE_COMMAND_WORDS = 8;

export const parseLanguageCommand = (text) => {
  const clean = normalize(text);
  if (clean.split(/\s+/).length > MAX_LANGUAGE_COMMAND_WORDS) return null;
  const m = clean.match(LANGUAGE_COMMAND_RE);
  if (!m) return null;
  return m[1] === "automatic" ? "auto" : m[1];
};

// --------- Intent (Gemini) ----------
const INTENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: INTENTS },
    amount: { type: "NUMBER", nullable: true },
    recipient: { type: "STRING", nullable: true },
    phone: { type: "STRING", nullable: true },
    language: { type: "STRING", enum: LANGUAGES },
  },
  required: ["intent", "language"],
};

const INTENT_PROMPT = `You classify messages sent to SARA, a Nigerian money assistant. Users write in English, Nigerian Pidgin, Yoruba, Igbo or Hausa, often mixed, and often via speech-to-text.

Return JSON with:
- intent: one of
  balance  – asks how much money they have
  airtime  – wants to buy/recharge phone airtime
  transfer – wants to send/pay money to another SARA user
  history  – wants past transactions / spending
  advice   – asks for financial advice, savings, investment, budgeting tips, or a question about their money
  greeting – just says hello
  help     – asks what SARA can do
  other    – anything else
- amount: the amount in whole naira as a number ("5k" = 5000, "1,500" = 1500, "two thousand" = 2000, "ẹgbẹ̀rún kan" = 1000), or null if not stated. Never guess an amount.
- recipient: for transfer only, the recipient's username exactly as written in the message, or null. Never invent a name.
- phone: for airtime only, the phone number if one is given, else null.
- language: the main language of the message (english, pidgin, yoruba, igbo, hausa).`;

const validIntent = (raw, text) => {
  if (!raw || !INTENTS.includes(raw.intent)) return null;

  let amount = Number.isFinite(raw.amount) && raw.amount > 0 ? Math.round(raw.amount) : null;

  // Guard against a hallucinated recipient: it must appear in what the user said.
  let recipient = typeof raw.recipient === "string" ? raw.recipient.trim().replace(/^@/, "") : null;
  if (recipient && !normalize(text).includes(normalize(recipient))) recipient = null;
  if (recipient && !/^[A-Za-z0-9_.]+$/.test(recipient)) recipient = null;

  const phone = raw.phone ? extractPhone(raw.phone) : null;

  return {
    intent: raw.intent,
    amount,
    recipient: raw.intent === "transfer" ? recipient : null,
    phone: raw.intent === "airtime" ? phone : null,
    language: LANGUAGES.includes(raw.language) ? raw.language : detectLanguage(text),
    source: "gemini",
  };
};

// Returns a parsed intent, or null if Gemini is unavailable or returned junk
// (the caller then falls back to regexParseIntent).
export const geminiParseIntent = async (text, { apiKey, model, timeoutMs = 8000, fetchImpl = fetch } = {}) => {
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INTENT_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: String(text).slice(0, 500) }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema: INTENT_SCHEMA,
          },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini intent HTTP ${res.status}`);
    const data = await res.json();
    const json = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
    return validIntent(JSON.parse(json), text);
  } catch (err) {
    console.error("Gemini intent parse failed, using regex fallback:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const parseIntent = async (text, geminiOpts) =>
  (await geminiParseIntent(text, geminiOpts)) ?? regexParseIntent(text);
