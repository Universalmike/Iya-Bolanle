import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount, extractPhone, extractRecipient, regexParseIntent,
  parseConfirmation, detectLanguage, removeAccents, geminiParseIntent,
} from "../nlu.js";
import { t } from "../messages.js";

test("parseAmount handles commas, suffixes and currency prefixes", () => {
  assert.equal(parseAmount("send 1,000 to john"), 1000);
  assert.equal(parseAmount("send 1,500,000 to john"), 1_500_000);
  assert.equal(parseAmount("send 5k to john"), 5000);
  assert.equal(parseAmount("send 2.5k to ada"), 2500);
  assert.equal(parseAmount("pay ₦2,000 to bola"), 2000);
  assert.equal(parseAmount("send N500 to bola"), 500);
  assert.equal(parseAmount("send 3 thousand naira to bola"), 3000);
  assert.equal(parseAmount("send 1m to bola"), 1_000_000);
});

test("parseAmount ignores digits in usernames and phone numbers", () => {
  assert.equal(parseAmount("send to user2 500"), 500);
  assert.equal(parseAmount("send 500 to mike"), 500); // "m" of mike is not "million"
  assert.equal(parseAmount("buy airtime for 08031234567 worth 200"), 200);
  assert.equal(parseAmount("buy airtime for +2348031234567"), null);
  assert.equal(parseAmount("send money to john"), null);
});

test("extractPhone normalises Nigerian numbers", () => {
  assert.equal(extractPhone("for 08031234567"), "08031234567");
  assert.equal(extractPhone("for +234 803 123 4567"), "08031234567");
  assert.equal(extractPhone("for 0803-123-4567"), "08031234567");
  assert.equal(extractPhone("no number here 12345"), null);
});

test("extractRecipient keeps capitalisation and skips pronouns", () => {
  assert.equal(extractRecipient("send 500 to John"), "John");
  assert.equal(extractRecipient("fi 500 ranse si Tunde"), "Tunde");
  assert.equal(extractRecipient("ziga 500 nye Emeka"), "Emeka");
  assert.equal(extractRecipient("tura 500 ga Musa"), "Musa");
  assert.equal(extractRecipient("send 500 to me"), null);
});

test("regex intents: previously misrouted messages now route correctly", () => {
  // Hausa transfer used to be caught by the balance regex (/kudin/)
  const hausa = regexParseIntent("tura kudin 500 ga musa");
  assert.equal(hausa.intent, "transfer");
  assert.equal(hausa.amount, 500);
  assert.equal(hausa.recipient, "musa");

  // Yoruba transfer used to match /owo.*mi/ via "mike"
  const yoruba = regexParseIntent("fi 500 owo ranse si mike");
  assert.equal(yoruba.intent, "transfer");
  assert.equal(yoruba.recipient, "mike");

  assert.equal(regexParseIntent("send 1,000 to john").amount, 1000);
  assert.equal(regexParseIntent("show my history").intent, "history");
  assert.equal(regexParseIntent("check balance").intent, "balance");
  assert.equal(regexParseIntent("buy 100 airtime").intent, "airtime");
  assert.equal(regexParseIntent("what about mutual funds?").intent, "other"); // goes to AI
});

test("parseConfirmation: short yes/no only, multilingual", () => {
  for (const yes of ["yes", "Yes!", "ok", "yes please", "no wahala", "Ehen", "oya", "bẹ́ẹ̀ni", "ee", "toh", "Eh!"]) {
    assert.equal(parseConfirmation(yes), "yes", yes);
  }
  for (const no of ["no", "No.", "cancel", "rara", "mba", "a'a", "abeg no", "don't send it"]) {
    assert.equal(parseConfirmation(no), "no", no);
  }
  for (const other of ["i want to send 500 instead", "to be honest send 300", "send 500 to john", "what is my balance", "eh I no sure"]) {
    assert.equal(parseConfirmation(other), null, other);
  }
});

test("detectLanguage no longer flags plain English as Pidgin", () => {
  assert.equal(detectLanguage("I want to go and save money"), "english");
  assert.equal(detectLanguage("abeg wetin dey my account"), "pidgin");
  assert.equal(detectLanguage("ẹ kú àárọ̀, ẹlo ni owó mi"), "yoruba");
  assert.equal(detectLanguage("kedu ego m"), "igbo");
  assert.equal(detectLanguage("sannu, nawa ne kudin"), "hausa");
});

test("removeAccents strips Yoruba/Igbo marks and Hausa hooked letters", () => {
  assert.equal(removeAccents("ẹ́ ọ̀ ṣ ṅ ị ụ"), "e o s n i u");
  assert.equal(removeAccents("ɓɗƙƴ"), "bdky");
});

// --- Gemini parsing, with a fake fetch ---
const fakeGemini = (payload, ok = true) => async () => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
});

test("geminiParseIntent validates the model output", async () => {
  const parsed = await geminiParseIntent("abeg send 2k give Tunde", {
    apiKey: "k", model: "m",
    fetchImpl: fakeGemini({ intent: "transfer", amount: 2000, recipient: "Tunde", phone: null, language: "pidgin" }),
  });
  assert.deepEqual(parsed, { intent: "transfer", amount: 2000, recipient: "Tunde", phone: null, language: "pidgin", source: "gemini" });
});

test("geminiParseIntent drops a recipient that isn't in the message", async () => {
  const parsed = await geminiParseIntent("send 500 to my brother", {
    apiKey: "k", model: "m",
    fetchImpl: fakeGemini({ intent: "transfer", amount: 500, recipient: "john", language: "english" }),
  });
  assert.equal(parsed.recipient, null);
});

test("geminiParseIntent returns null (regex fallback) on errors or junk", async () => {
  assert.equal(await geminiParseIntent("hi", { apiKey: "k", model: "m", fetchImpl: fakeGemini({}, false) }), null);
  assert.equal(await geminiParseIntent("hi", { apiKey: "k", model: "m", fetchImpl: fakeGemini({ intent: "hack" }) }), null);
  assert.equal(await geminiParseIntent("hi", { apiKey: undefined, model: "m" }), null);
});

test("every message exists in every language", () => {
  for (const lang of ["english", "pidgin", "yoruba", "igbo", "hausa"]) {
    assert.match(t("confirmTransfer", lang, 1000, "john"), /1,000/);
    assert.match(t("confirmAirtime", lang, 200, null), /200/);
    assert.ok(t("cancelled", lang));
  }
});

test("parseLanguageCommand recognises short switch requests", async () => {
  const { parseLanguageCommand } = await import("../nlu.js");
  assert.equal(parseLanguageCommand("speak yoruba"), "yoruba");
  assert.equal(parseLanguageCommand("Talk to me in Pidgin abeg"), "pidgin");
  assert.equal(parseLanguageCommand("switch to Hausa"), "hausa");
  assert.equal(parseLanguageCommand("change language to english"), "english");
  assert.equal(parseLanguageCommand("use pidgin english"), "pidgin");   // first name wins
  assert.equal(parseLanguageCommand("sọ Yorùbá"), "yoruba");           // Yoruba "speak"
  assert.equal(parseLanguageCommand("kwuo igbo"), "igbo");             // Igbo "speak"
  assert.equal(parseLanguageCommand("language auto"), "auto");
  assert.equal(parseLanguageCommand("yoruba"), null);                 // no trigger word
  assert.equal(parseLanguageCommand("send 500 to bola"), null);
  assert.equal(parseLanguageCommand("please can you tell me how people use money in the yoruba culture"), null); // too long
});

test("every message key is translated into all five languages", async () => {
  const { messages } = await import("../messages.js");
  for (const [key, entry] of Object.entries(messages)) {
    for (const lang of ["english", "pidgin", "yoruba", "igbo", "hausa"]) {
      assert.equal(typeof entry[lang], "function", `${key}.${lang} missing`);
    }
  }
});
