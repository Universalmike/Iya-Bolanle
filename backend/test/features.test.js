import { test } from "node:test";
import assert from "node:assert/strict";
import {
  regexParseIntent, networkForPhone, extractNetwork, extractNote, parseHistoryFilter, closestMatch, geminiParseIntent,
} from "../nlu.js";
import { buildWhere, normalizeFilter, formatHistory } from "../history.js";
import { t, naira, historyLabel } from "../messages.js";

test("network from phone prefix, longest prefix first", () => {
  assert.equal(networkForPhone("08031234567"), "MTN");
  assert.equal(networkForPhone("08051234567"), "Glo");
  assert.equal(networkForPhone("08021234567"), "Airtel");
  assert.equal(networkForPhone("09091234567"), "9mobile");
  assert.equal(networkForPhone("07025123456"), "MTN");
  assert.equal(networkForPhone("07021234567"), null); // not a mobile network we know
  assert.equal(networkForPhone(null), null);
});

test("airtime requests pick up a named network", () => {
  const p = regexParseIntent("buy 500 glo airtime for 08031234567");
  assert.equal(p.intent, "airtime");
  assert.equal(p.phone, "08031234567");
  assert.equal(p.network, "Glo"); // ported number: the named network wins
  assert.equal(regexParseIntent("buy 200 mtn").intent, "airtime");
  assert.equal(extractNetwork("recharge my airtel line"), "Airtel");
});

test("transfer notes", () => {
  assert.equal(extractNote("send 500 to bola for lunch"), "lunch");
  assert.equal(extractNote("send 500 to bola for transport money."), "transport money");
  assert.equal(extractNote("send 500 to bola for me"), null);
  assert.equal(extractNote("send to bola for 500"), null);
  const p = regexParseIntent("send 2k to Bola for school fees");
  assert.equal(p.intent, "transfer");
  assert.equal(p.recipient, "Bola");
  assert.equal(p.note, "school fees");
  assert.equal(p.amount, 2000);
  // A note that mentions spending doesn't turn it into a history question.
  assert.equal(regexParseIntent("send 500 to bola for spending money").intent, "transfer");
});

test("history questions and their filters", () => {
  const spend = regexParseIntent("how much did I spend on airtime this month");
  assert.equal(spend.intent, "history");
  assert.deepEqual(spend.history, { type: "airtime", period: "this_month", days: null, counterparty: null });

  assert.equal(regexParseIntent("transfer history").intent, "history");
  assert.deepEqual(parseHistoryFilter("money I received last week"), { type: "received", period: "last_week", days: null, counterparty: null });
  assert.deepEqual(parseHistoryFilter("transactions in the last 10 days"), { type: "all", period: "last_days", days: 10, counterparty: null });
  assert.deepEqual(parseHistoryFilter("what did Bola send me"), { type: "received", period: "all", days: null, counterparty: "Bola" });
  assert.equal(parseHistoryFilter("transfers to tunde yesterday").counterparty, "tunde");
  assert.equal(parseHistoryFilter("history from last month").counterparty, null);
  assert.equal(parseHistoryFilter("my history").type, "all");
});

test("Gemini history fields are validated and merged", async () => {
  const fake = (out) => async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) });
  const p = await geminiParseIntent("elo ni mo na lori airtime losu yii", {
    apiKey: "k", model: "m",
    fetchImpl: fake({ intent: "history", historyType: "airtime", historyPeriod: "this_month", language: "yoruba" }),
  });
  assert.equal(p.history.type, "airtime");
  assert.equal(p.history.period, "this_month");
  const bad = await geminiParseIntent("history", {
    apiKey: "k", model: "m", fetchImpl: fake({ intent: "history", historyType: "nonsense", historyPeriod: "last_days", language: "english" }),
  });
  assert.equal(bad.history.type, "all");
  assert.equal(bad.history.period, "all"); // last_days without a number is dropped
});

test("closestMatch suggests one near username, never guesses between two", () => {
  assert.equal(closestMatch("bolla", ["bola", "chidi"]), "bola");
  assert.equal(closestMatch("tundee", ["Tunde", "ada"]), "Tunde");
  assert.equal(closestMatch("bola", ["bola"]), null); // exact match isn't a suggestion
  assert.equal(closestMatch("ada", ["adam", "ade"]), null); // tie
  assert.equal(closestMatch("xyz", ["bola"]), null);
});

test("history SQL uses parameters and Lagos time", () => {
  const { where, params } = buildWhere("ada", { type: "money_out", period: "last_days", days: 7, counterparty: "bola" });
  assert.match(where, /Africa\/Lagos/);
  assert.match(where, /NOT \(type = ANY\(\$2\)\)/);
  assert.deepEqual(params.slice(2), [6, "bola"]);
  assert.equal(normalizeFilter({ counterparty: "x'; DROP TABLE users;--" }).counterparty, null);
  assert.equal(normalizeFilter({ period: "last_days", days: 5000 }).days, 366);
});

test("history text: filtered header, notes, totals, translated", () => {
  const rows = [{ type: "Transfer", amount: 500, to_user: "bola", note: "lunch", date: "2026-11-10T12:00:00Z" }];
  const filter = { type: "sent", period: "this_month" };
  const text = formatHistory({ rows, totals: { count: 3, moneyIn: 0, moneyOut: 1500 }, filter }, "english", { t, naira, historyLabel });
  assert.match(text, /money you sent · this month/);
  assert.match(text, /→ bola · "lunch"/);
  assert.match(text, /latest 1 of 3/);
  assert.match(text, /Money out: ₦1,500/);
  assert.match(formatHistory({ rows: [], totals: { count: 0 }, filter }, "hausa", { t, naira, historyLabel }), /Ban sami/);
  assert.equal(historyLabel(normalizeFilter({ type: "airtime", period: "last_days", days: 3 }), "yoruba"), "airtime · ojo 3 to koja");
});

test("plural 'transfers' is a history question, singular is a transfer", () => {
  assert.equal(regexParseIntent("show my transfers to bola").intent, "history");
  assert.equal(regexParseIntent("transfer 500 to bola").intent, "transfer");
});
