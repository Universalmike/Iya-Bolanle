import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateInviteCode, normalizeInviteCode, shuffled, pickGroup, statusMessage, contributionMessage,
} from "../esusu.js";
import { regexParseIntent, normalize } from "../nlu.js";
import { t } from "../messages.js";

test("invite codes are 6 unambiguous characters and normalise user input", () => {
  for (let i = 0; i < 200; i++) assert.match(generateInviteCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(normalizeInviteCode(" ab3-k9q "), "AB3K9Q");
  assert.equal(normalizeInviteCode("ajo-7kq2xx-extra"), "AJO7KQ");
  assert.equal(normalizeInviteCode(42), "");
});

test("shuffled returns a permutation and leaves the input alone", () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffled(input);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

const group = (over) => ({
  id: 1, group_name: "Family", status: "active", amount_per_person: 2000, current_cycle: 2,
  member_count: 4, total_members: 4, position: 3, has_collected: false, paid_this_round: false,
  paid_count: 1, cycle_due_at: "2026-12-01T00:00:00Z", is_late: false, invite_code: "ABC234", ...over,
});

test("pickGroup: by name, the only active group, or ask", () => {
  const fam = group({ id: 1, group_name: "Family" });
  const work = group({ id: 2, group_name: "Office Ajo" });
  const forming = group({ id: 3, group_name: "New", status: "forming" });

  assert.equal(pickGroup([fam, work], normalize("pay my office ajo"), normalize).group.id, 2);
  assert.equal(pickGroup([fam, forming], normalize("pay my ajo"), normalize).group.id, 1); // only active one
  const ambiguous = pickGroup([fam, work], normalize("pay my ajo"), normalize);
  assert.equal(ambiguous.group, null);
  assert.equal(ambiguous.active.length, 2);
  assert.equal(pickGroup([forming], normalize("pay ajo"), normalize).active.length, 0);
});

test("statusMessage describes each kind of group", () => {
  assert.match(statusMessage(t, "english", []), /not in any esusu group/);
  assert.match(statusMessage(t, "english", [group({ status: "forming", member_count: 2 })]), /waiting for members \(2 of 4\).*ABC234/);
  assert.match(statusMessage(t, "english", [group({ status: "completed" })]), /completed/);

  const active = statusMessage(t, "english", [group({ due: "x" })]);
  assert.match(active, /round 2 of 4/);
  assert.match(active, /You collect in round 3/);
  assert.match(active, /due by/);

  assert.match(statusMessage(t, "english", [group({ position: 2 })]), /your turn to collect/);
  assert.match(statusMessage(t, "english", [group({ is_late: true })]), /late/);
  assert.match(statusMessage(t, "english", [group({ paid_this_round: true })]), /paid this round/);
  assert.match(statusMessage(t, "hausa", [group()]), /zagaye na 2 cikin 4/);
});

test("contributionMessage reports progress, payout and completion", () => {
  const base = { amount: 2000, groupName: "Family", balance: 8000, round: 2, paid: 3, members: 4 };
  assert.match(contributionMessage(t, "english", { ...base, payout: null }), /3 of 4 members have paid/);
  const paidOut = contributionMessage(t, "english", { ...base, paid: 4, payout: { collector: "bola", amount: 8000 } });
  assert.match(paidOut, /bola has received ₦8,000/);
  assert.doesNotMatch(paidOut, /complete/);
  assert.match(
    contributionMessage(t, "english", { ...base, payout: { collector: "bola", amount: 8000 }, completed: true }),
    /is complete/
  );
});

test("chat intents for esusu in several languages", () => {
  assert.equal(regexParseIntent("pay my ajo").intent, "esusu_pay");
  assert.equal(regexParseIntent("contribute to Family esusu").intent, "esusu_pay");
  assert.equal(regexParseIntent("biya adashe").intent, "esusu_pay");          // Hausa
  assert.equal(regexParseIntent("san owo ajo mi").intent, "esusu_pay");       // Yoruba
  assert.equal(regexParseIntent("when is my turn?").intent, "esusu_status");
  assert.equal(regexParseIntent("how is my isusu doing").intent, "esusu_status"); // Igbo
  assert.equal(regexParseIntent("who hasn't paid").intent, "esusu_status");
  // Unchanged: ordinary transfers still work
  assert.equal(regexParseIntent("send 500 to bola").intent, "transfer");
  assert.equal(regexParseIntent("pay 500 to bola").intent, "transfer");
});
