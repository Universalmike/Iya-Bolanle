import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageData, billAmount, validateBill, geminiReadBill } from "../bills.js";
import { t } from "../messages.js";

const png = (bytes = 2000) => `data:image/png;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;

test("parseImageData accepts real image data URLs only", () => {
  const img = parseImageData(png());
  assert.equal(img.mimeType, "image/png");
  assert.equal(img.bytes, 2000);
  assert.equal(parseImageData("data:application/pdf;base64,AAAA"), null);
  assert.equal(parseImageData("not a data url"), null);
  assert.equal(parseImageData(png(10)), null); // too small to be a photo
  assert.equal(parseImageData(png(5 * 1024 * 1024)), null); // over 4MB
  assert.equal(parseImageData(42), null);
});

test("billAmount rounds kobo up and rejects nonsense", () => {
  assert.equal(billAmount(12450.5), 12451);
  assert.equal(billAmount(12450), 12450);
  assert.equal(billAmount("₦12,450.00"), 12450);
  assert.equal(billAmount(0.1 + 0.2), 1);
  for (const bad of [0, -500, null, undefined, NaN, "abc", 2_000_000]) assert.equal(billAmount(bad), null);
});

const raw = (over) => ({
  isBill: true, readable: true, billType: "electricity", provider: "EKEDC",
  accountNumber: " 0123-4567 89 ", meterNumber: null, customerName: "Ada Obi",
  amountDue: 8450.75, dueDate: "2026-11-30", billPeriod: "October 2026", package: null, ...over,
});

test("validateBill cleans Gemini output", () => {
  const { bill } = validateBill(raw());
  assert.equal(bill.provider, "EKEDC");
  assert.equal(bill.accountNumber, "0123-456789");
  assert.equal(bill.amount, 8451);
  assert.equal(bill.dueDate, "2026-11-30");
  assert.equal(validateBill(raw({ dueDate: "2026-02-30" })).bill.dueDate, null); // not a real date
  assert.equal(validateBill(raw({ billType: "gas" })).bill.billType, "other");
  assert.equal(validateBill(raw({ amountDue: null })).bill.amount, null); // prepaid: user enters amount
  assert.equal(validateBill(raw({ accountNumber: null, meterNumber: "45678901234" })).bill.meterNumber, "45678901234");
});

test("validateBill refuses non-bills and unreadable photos", () => {
  assert.equal(validateBill(raw({ isBill: false })).error, "notABill");
  assert.equal(validateBill(raw({ readable: false })).error, "billUnreadable");
  assert.equal(validateBill(raw({ provider: null })).error, "billUnreadable");
  assert.equal(validateBill(raw({ accountNumber: "12", meterNumber: null })).error, "billUnreadable");
  assert.equal(validateBill(null).error, "billUnreadable");
});

test("geminiReadBill sends the image inline and parses the JSON reply", async () => {
  let sent;
  const fetchImpl = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), key: opts.headers["x-goog-api-key"] };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(raw()) }] } }] }) };
  };
  const out = await geminiReadBill(parseImageData(png()), { apiKey: "k", model: "m", fetchImpl });
  assert.equal(out.provider, "EKEDC");
  assert.match(sent.url, /models\/m:generateContent/);
  assert.equal(sent.key, "k");
  assert.equal(sent.body.contents[0].parts[0].inlineData.mimeType, "image/png");
  assert.equal(sent.body.generationConfig.responseMimeType, "application/json");

  const failing = async () => ({ ok: false, status: 500 });
  await assert.rejects(geminiReadBill(parseImageData(png()), { apiKey: "k", model: "m", fetchImpl: failing }));
});

test("bill messages exist in every language", () => {
  for (const lang of ["english", "pidgin", "yoruba", "igbo", "hausa"]) {
    assert.match(t("billScanned", lang, "EKEDC", "light", 8451), /₦8,451/);
    assert.match(t("billMaybePaid", lang, 500, "1 Nov 2026"), /₦500/);
    assert.match(t("tooManyScans", lang, 12), /12/);
  }
});
