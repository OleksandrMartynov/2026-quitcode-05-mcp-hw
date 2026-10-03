import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_FIXTURE, LEAD_STATUSES, LeadDeskError, createStore, loadLeads } from "../src/store.mjs";

const raw = JSON.parse(await readFile(DEFAULT_FIXTURE, "utf8"));
const PUBLIC_FIELDS = ["id", "company", "status", "source", "budget", "createdAt"];

test("the fixture loads all 20 leads, lead_0001 to lead_0020", async () => {
  const ids = (await loadLeads(DEFAULT_FIXTURE)).map((lead) => lead.id).sort();
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, i) => `lead_${String(i + 1).padStart(4, "0")}`));
});

test("findLeads returns only the six public fields: no name, e-mail or request text", () => {
  const { leads } = createStore(raw).findLeads({ status: "any", limit: 50 });
  assert.equal(leads.length, raw.length);
  for (const lead of leads) assert.deepEqual(Object.keys(lead), PUBLIC_FIELDS);
  const returned = JSON.stringify(leads);
  for (const lead of raw) {
    for (const field of ["fullName", "email", "message"]) assert.ok(!returned.includes(lead[field]), `${field} of ${lead.id} leaked`);
  }
});

test("findLeads filters by every status exactly as the fixture has them", () => {
  const store = createStore(raw);
  for (const status of LEAD_STATUSES) {
    const expected = raw.filter((lead) => lead.status === status).map((lead) => lead.id).sort();
    const result = store.findLeads({ status, limit: 50 });
    assert.equal(result.total, expected.length, status);
    assert.deepEqual(result.leads.map((lead) => lead.id).sort(), expected, status);
  }
});

test("findLeads lists the newest first and limits the page without changing total", () => {
  const store = createStore(raw);
  const all = store.findLeads({ status: "any", limit: 50 }).leads;
  for (let i = 1; i < all.length; i++) assert.ok(Date.parse(all[i - 1].createdAt) >= Date.parse(all[i].createdAt), all[i].id);
  const page = store.findLeads({ status: "any", limit: 5 });
  assert.equal(page.order, "newest_first");
  assert.equal(page.total, raw.length);
  assert.equal(page.returned, 5);
  assert.deepEqual(page.leads, all.slice(0, 5));
});

test("setLeadStatus changes the status in memory and returns the audit entry", () => {
  const store = createStore(raw);
  const lead = raw.find((l) => l.status === "new");
  const now = new Date("2026-10-01T09:00:00.000Z");
  const result = store.setLeadStatus({ leadId: lead.id, status: "contacted", reason: "перша розмова відбулась" }, now);
  assert.deepEqual(result.audit, {
    action: "lead.status_changed",
    leadId: lead.id,
    at: now.toISOString(),
    from: "new",
    to: "contacted",
    reason: "перша розмова відбулась",
  });
  assert.deepEqual(Object.keys(result.lead), PUBLIC_FIELDS);
  assert.equal(result.lead.status, "contacted");
  assert.ok(store.findLeads({ status: "contacted", limit: 50 }).leads.some((l) => l.id === lead.id));
  assert.deepEqual(store.auditLog(), [result.audit]);
});

test("an unknown lead and the same status are errors that change nothing", () => {
  const store = createStore(raw);
  const before = store.findLeads({ status: "any", limit: 50 });
  assert.throws(
    () => store.setLeadStatus({ leadId: "lead_9999", status: "won", reason: "такого немає" }),
    (error) => error instanceof LeadDeskError && error.code === "not_found" && error.message.includes("leaddesk_find_leads"),
  );
  assert.throws(
    () => store.setLeadStatus({ leadId: raw[0].id, status: raw[0].status, reason: "той самий статус" }),
    (error) => error instanceof LeadDeskError && error.code === "same_status",
  );
  assert.deepEqual(store.findLeads({ status: "any", limit: 50 }), before);
  assert.deepEqual(store.auditLog(), []);
});

test("status changes never touch the fixture file or a second store", async () => {
  const bytesBefore = await readFile(DEFAULT_FIXTURE);
  const store = createStore(await loadLeads(DEFAULT_FIXTURE));
  for (const lead of raw) store.setLeadStatus({ leadId: lead.id, status: lead.status === "lost" ? "new" : "lost", reason: "перевірка" });
  assert.deepEqual(await readFile(DEFAULT_FIXTURE), bytesBefore);
  assert.deepEqual(await loadLeads(DEFAULT_FIXTURE), raw);
});

test("loadLeads (also via LEADDESK_FIXTURE) rejects an invented id, status or a duplicate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "leaddesk-"));
  try {
    const cases = {
      inventedId: [{ ...raw[0], id: "ld_1001" }],
      inventedStatus: [{ ...raw[0], status: "hot" }],
      duplicate: [raw[0], raw[0]],
    };
    for (const [name, leads] of Object.entries(cases)) {
      const path = join(dir, `${name}.json`);
      await writeFile(path, JSON.stringify(leads));
      await assert.rejects(loadLeads(path), /^Error: Fixture /, name);
    }
    process.env.LEADDESK_FIXTURE = join(dir, "inventedStatus.json");
    await assert.rejects(loadLeads(), /unknown status/);
  } finally {
    delete process.env.LEADDESK_FIXTURE;
    await rm(dir, { recursive: true, force: true });
  }
});
