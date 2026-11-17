// Natural-language understanding for SARA: language detection, amount/phone
// extraction, intent parsing (Gemini first, regex fallback) and yes/no replies.
// No external dependencies so it can be unit-tested with `node --test`.

export const LANGUAGES = ["english", "pidgin", "yoruba", "igbo", "hausa"];
export const INTENTS = [
  "balance", "airtime", "transfer", "history", "esusu_pay", "esusu_status", "advice", "greeting", "help", "other",
];

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

// --------- Mobile networks ----------
// Prefix → network. Numbers can be ported between networks, so this is only a
// best guess: a network named in the message wins, and the user confirms either way.
export const NETWORKS = ["MTN", "Glo", "Airtel", "9mobile"];
const NETWORK_PREFIXES = {
  MTN: ["07025", "07026", "0703", "0704", "0706", "0803", "0806", "0810", "0813", "0814", "0816", "0903", "0906", "0913", "0916"],
  Glo: ["0705", "0805", "0807", "0811", "0815", "0905", "0915"],
  Airtel: ["0701", "0708", "0802", "0808", "0812", "0901", "0902", "0904", "0907", "0911", "0912"],
  "9mobile": ["0809", "0817", "0818", "0908", "0909"],
};
const PREFIX_LIST = Object.entries(NETWORK_PREFIXES)
  .flatMap(([network, prefixes]) => prefixes.map((p) => [p, network]))
  .sort((a, b) => b[0].length - a[0].length); // longest prefix first (07025 before 0702x)

export const networkForPhone = (phone) =>
  (phone && PREFIX_LIST.find(([p]) => phone.startsWith(p))?.[1]) || null;

const NETWORK_WORDS = [
  [/\bmtn\b/, "MTN"],
  [/\b(?:glo|globacom)\b/, "Glo"],
  [/\bairtel\b/, "Airtel"],
  [/\b(?:9 ?mobile|etisalat|t2)\b/, "9mobile"],
];
export const extractNetwork = (text) => NETWORK_WORDS.find(([re]) => re.test(normalize(text)))?.[1] ?? null;

// --------- Transfer note ("send 500 to bola for lunch") ----------
const NOTE_RE = /\b(?:for|note:?|ref:?|reason:?)\s+(.+?)\s*[.!?]*$/i;
const NOT_A_NOTE = new Set(["me", "him", "her", "them", "us", "am", "you"]);

export const extractNote = (text) => {
  const m = String(text).match(NOTE_RE);
  if (!m) return null;
  const note = m[1].trim().slice(0, 60);
  // "for 500" is an amount, "for me" is not a reason.
  if (NOT_A_NOTE.has(note.toLowerCase()) || /^(?:₦|n|ngn)?\s*[\d,.]+\s*(?:k|m|naira)?$/i.test(note)) return null;
  return note.length >= 2 ? note : null;
};

// --------- History filters ("my airtime this month", "what did bola send me") ----------
export const HISTORY_TYPES = ["all", "sent", "received", "airtime", "bills", "esusu", "money_out"];
export const HISTORY_PERIODS = ["all", "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_days"];

const HISTORY_TYPE_RULES = [
  ["airtime", /\b(?:airtime|recharge|top ?up|kaadi|kati)\b/],
  ["bills", /\b(?:bills?|light|nepa|electricity|dstv|gotv|startimes|water|internet)\b/],
  ["esusu", /\b(?:esusu|ajo|isusu|adashe|contributions?)\b/],
  ["received", /\b(?:received|receive|incoming|money in|came in|sent me|send me|paid me|gave me)\b/],
  ["sent", /\b(?:sent|transfers?|outgoing|i send|i sent)\b/],
  ["money_out", /\b(?:spen[dt]|spending|expenses?|money out|wetin i don spend)\b/],
];

const PERIOD_RULES = [
  ["today", /\b(?:today|this morning|tonight|lonii|loni|taa|yau)\b/],
  ["yesterday", /\b(?:yesterday|lana|unyaahu|jiya)\b/],
  ["last_week", /\blast week\b/],
  ["this_week", /\bthis week\b/],
  ["last_month", /\blast month\b/],
  ["this_month", /\bthis month\b/],
];
const NOT_A_COUNTERPARTY = new Set([
  "me", "my", "last", "this", "today", "yesterday", "the", "a", "an", "airtime", "bills", "bill", "esusu", "ajo", "all", "you",
]);

export const parseHistoryFilter = (text) => {
  const clean = normalize(text);
  let type = HISTORY_TYPE_RULES.find(([, re]) => re.test(clean))?.[0] ?? "all";
  let period = PERIOD_RULES.find(([, re]) => re.test(clean))?.[0] ?? "all";
  let days = null;
  const lastDays = clean.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/);
  if (lastDays) {
    period = "last_days";
    days = Math.min(Math.max(Number(lastDays[1]), 1), 366);
  } else if (/\bpast week\b/.test(clean)) {
    period = "last_days";
    days = 7;
  }
  // "from bola", "to bola", "with bola" — on the original text to keep capitalisation.
  let counterparty = null;
  const re = /\b(?:from|to|with)\s+@?([A-Za-z0-9_.]+)/gi;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    if (!NOT_A_COUNTERPARTY.has(m[1].toLowerCase()) && !/^\d+$/.test(m[1])) {
      counterparty = m[1];
      break;
    }
  }
  // "what did bola send me"
  const askedAbout = String(text).match(/\bwhat did @?([A-Za-z0-9_.]+) (?:send|give|pay) me\b/i);
  if (!counterparty && askedAbout && !NOT_A_COUNTERPARTY.has(askedAbout[1].toLowerCase())) {
    counterparty = askedAbout[1];
    type = "received";
  }
  if (counterparty && type === "all") type = /\bfrom\b/i.test(text) ? "received" : "all";
  return { type, period, days, counterparty };
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

// --------- "Did you mean …?" for mistyped or misheard usernames ----------
export const editDistance = (a, b) => {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

// The single closest candidate within 1 edit (2 for names of 6+ letters), or null if
// none or if two candidates are equally close (then we'd be guessing).
export const closestMatch = (name, candidates) => {
  const target = String(name).toLowerCase();
  const limit = target.length >= 6 ? 2 : 1;
  let best = null;
  let bestDistance = Infinity;
  let tie = false;
  for (const c of candidates) {
    const d = editDistance(target, c.toLowerCase());
    if (d === 0 || d > limit) continue;
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
      tie = false;
    } else if (d === bestDistance) tie = true;
  }
  return tie ? null : best;
};

// --------- Intent (regex fallback) ----------
// Order matters: money-moving intents are checked before balance so that
// e.g. Hausa "tura kudin 500 ga musa" (send money) is not read as a balance check.
// Savings-group words: esusu/ajo (Yoruba), isusu (Igbo), adashe (Hausa).
const ESUSU = String.raw`(?:esusu|ajo|isusu|adashe|contribution)`;
const PAY = String.raw`(?:pay|contribute|send|put|remit|san|biya|tura|kwuo|tinye)`;

const INTENT_RULES = [
  // Before "transfer", so "pay my ajo" isn't read as paying a person called "ajo".
  ["esusu_pay", new RegExp(String.raw`\b${PAY}\b.*\b${ESUSU}\b|\b${ESUSU}\b.*\b${PAY}\b|^contribute\b`)],
  ["esusu_status", new RegExp(String.raw`\b${ESUSU}\b|\bmy turn\b|\bwhen (do|will|can) i collect\b|\bwho (has|hasn'?t|never) pa(id|y)\b`)],
  // Before airtime/transfer, so "how much did I spend on airtime" and "transfer history" are history.
  ["history", /\b(history|transactions?|transfers|payments|statement|spen[dt]|spending|wetin i don spend)\b|\bhow much (did|have) i (send|sent|receive|received|get|got)\b|\bmoney (in|out)\b|\bwhat did \S+ send me\b/],
  ["airtime", /\b(airtime|recharge|top ?up|kaadi|kati)\b|\bbuy\b.*\b(mtn|glo|airtel|9 ?mobile)\b/],
  ["transfer", /\b(send|transfer|pay|give|fi .*ranse|ranse|ziga|zigara|tura|aika)\b/],
  ["balance", /\b(balance|how much (do )?i (have|get)|elo ni owo|owo mi|ego m|ego ole|kudin|nawa ne)\b/],
  ["greeting", /^(hi|hello|hey|good (morning|afternoon|evening)|how far|bawo|e kaaro|kedu|ndewo|sannu|barka)\b/],
  ["help", /^(help|what can you do|menu|options)\b/],
];

export const regexParseIntent = (text) => {
  const clean = normalize(text);
  let intent = INTENT_RULES.find(([, re]) => re.test(clean))?.[0] ?? "other";
  // "send 500 to bola for spending money" is a transfer, not a history question.
  if (intent === "history" && parseAmount(text) && extractRecipient(text)) {
    intent = INTENT_RULES.find(([name, re]) => name !== "history" && re.test(clean))?.[0] ?? "other";
  }
  return {
    intent,
    amount: parseAmount(text),
    recipient: intent === "transfer" ? extractRecipient(text) : null,
    phone: intent === "airtime" ? extractPhone(text) : null,
    ...intentExtras(intent, text),
    language: detectLanguage(text),
    source: "regex",
  };
};

// Fields that only matter for one intent. Also used to fill gaps in Gemini's answer.
function intentExtras(intent, text) {
  return {
    network: intent === "airtime" ? extractNetwork(text) : null,
    note: intent === "transfer" ? extractNote(text) : null,
    history: intent === "history" ? parseHistoryFilter(text) : null,
  };
}

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
    network: { type: "STRING", enum: NETWORKS, nullable: true },
    note: { type: "STRING", nullable: true },
    historyType: { type: "STRING", enum: HISTORY_TYPES, nullable: true },
    historyPeriod: { type: "STRING", enum: HISTORY_PERIODS, nullable: true },
    historyDays: { type: "NUMBER", nullable: true },
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
  esusu_pay    – wants to pay their contribution to a savings group (esusu, ajo, isusu, adashe)
  esusu_status – asks about their savings group: whose turn, when they collect, who has paid, when payment is due
  advice   – asks for financial advice, savings, investment, budgeting tips, or a question about their money
  greeting – just says hello
  help     – asks what SARA can do
  other    – anything else
- amount: the amount in whole naira as a number ("5k" = 5000, "1,500" = 1500, "two thousand" = 2000, "ẹgbẹ̀rún kan" = 1000), or null if not stated. Never guess an amount.
- recipient: for transfer only, the recipient's username exactly as written in the message, or null. Never invent a name.
- phone: for airtime only, the phone number if one is given, else null.
- network: for airtime only, the mobile network if the user names it (MTN, Glo, Airtel, 9mobile), else null.
- note: for transfer only, what the money is for if the user says ("for lunch" → "lunch"), else null.
- historyType: for history only: sent (transfers I made), received (money sent to me), airtime, bills, esusu,
  money_out (spending in general), or all.
- historyPeriod: for history only: today, yesterday, this_week, last_week, this_month, last_month,
  last_days (with historyDays, e.g. "last 10 days" → 10), or all.
- language: the main language of the message (english, pidgin, yoruba, igbo, hausa).`;

const validIntent = (raw, text) => {
  if (!raw || !INTENTS.includes(raw.intent)) return null;

  let amount = Number.isFinite(raw.amount) && raw.amount > 0 ? Math.round(raw.amount) : null;

  // Guard against a hallucinated recipient: it must appear in what the user said.
  let recipient = typeof raw.recipient === "string" ? raw.recipient.trim().replace(/^@/, "") : null;
  if (recipient && !normalize(text).includes(normalize(recipient))) recipient = null;
  if (recipient && !/^[A-Za-z0-9_.]+$/.test(recipient)) recipient = null;

  const phone = raw.phone ? extractPhone(raw.phone) : null;

  // Regex extras fill anything Gemini left out; Gemini's own values win when valid.
  const extras = intentExtras(raw.intent, text);
  if (raw.intent === "airtime" && NETWORKS.includes(raw.network)) extras.network = raw.network;
  if (raw.intent === "transfer" && typeof raw.note === "string" && raw.note.trim()) {
    extras.note = raw.note.trim().slice(0, 60);
  }
  if (extras.history) {
    if (HISTORY_TYPES.includes(raw.historyType)) extras.history.type = raw.historyType;
    if (HISTORY_PERIODS.includes(raw.historyPeriod)) {
      extras.history.period = raw.historyPeriod;
      const days = Math.round(Number(raw.historyDays));
      extras.history.days = raw.historyPeriod === "last_days" && days >= 1 ? Math.min(days, 366) : null;
      if (raw.historyPeriod === "last_days" && !extras.history.days) extras.history.period = "all";
    }
  }

  return {
    intent: raw.intent,
    amount,
    recipient: raw.intent === "transfer" ? recipient : null,
    phone: raw.intent === "airtime" ? phone : null,
    ...extras,
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
