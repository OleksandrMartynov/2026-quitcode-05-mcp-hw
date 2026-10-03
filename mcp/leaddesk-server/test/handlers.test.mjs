// The MCP layer without a transport: input schemas as the SDK validates them, tool results and the
// resource. End-to-end calls through the protocol are the Inspector artifacts in docs/mcp/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { STATUSES_MARKDOWN, STATUSES_URI, createHandlers, findLeadsInput, setLeadStatusInput } from "../src/leaddesk.mjs";
import { DEFAULT_FIXTURE, LEAD_STATUSES, createStore } from "../src/store.mjs";

const raw = JSON.parse(await readFile(DEFAULT_FIXTURE, "utf8"));
const findSchema = z.object(findLeadsInput);
const setSchema = z.object(setLeadStatusInput);

test("every input field carries a description for the model", () => {
  for (const shape of [findLeadsInput, setLeadStatusInput]) {
    for (const [name, field] of Object.entries(shape)) assert.ok(field.description?.length > 10, `${name} has no description`);
  }
});

test("find_leads input: the five statuses plus any, limit 1–50 defaulting to 10", () => {
  assert.deepEqual(findSchema.parse({ status: "any" }), { status: "any", limit: 10 });
  for (const status of [...LEAD_STATUSES, "any"]) assert.ok(findSchema.safeParse({ status }).success, status);
  for (const bad of [{}, { status: "hot" }, { status: "new", limit: 0 }, { status: "new", limit: 51 }, { status: "new", limit: 2.5 }]) {
    assert.equal(findSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test("set_lead_status input: id format, the five statuses without any, reason of 3–500 characters", () => {
  const valid = { leadId: "lead_0017", status: "won", reason: "договір підписано" };
  assert.ok(setSchema.safeParse(valid).success);
  for (const bad of [
    { ...valid, leadId: "nope" },
    { ...valid, status: "any" },
    { ...valid, reason: "ok" },
    { ...valid, reason: "     " },
    { ...valid, reason: "x".repeat(501) },
  ]) {
    assert.equal(setSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
  }
});

test("find_leads result: text and structuredContent carry no personal data", async () => {
  const result = await createHandlers(createStore(raw)).findLeads({ status: "any", limit: 50 });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.total, raw.length);
  const everything = JSON.stringify(result);
  for (const lead of raw) {
    for (const field of ["fullName", "email", "message"]) assert.ok(!everything.includes(lead[field]), `${field} of ${lead.id} leaked`);
  }
});

test("set_lead_status: success carries the audit entry, errors are isError with a hint and no data", async () => {
  const handlers = createHandlers(createStore(raw));
  const lead = raw.find((l) => l.status !== "won");
  const ok = await handlers.setLeadStatus({ leadId: lead.id, status: "won", reason: "договір підписано" });
  assert.equal(ok.isError, undefined);
  assert.equal(ok.structuredContent.lead.status, "won");
  for (const key of ["action", "leadId", "at"]) assert.ok(ok.structuredContent.audit[key], key);

  const same = await handlers.setLeadStatus({ leadId: lead.id, status: "won", reason: "ще раз" });
  const unknown = await handlers.setLeadStatus({ leadId: "lead_9999", status: "won", reason: "такого немає" });
  for (const error of [same, unknown]) {
    assert.equal(error.isError, true);
    assert.equal(error.structuredContent, undefined);
    assert.match(error.content[0].text, /leaddesk_find_leads/);
  }
});

test("statuses resource: markdown with every status, when it applies and who moves it", async () => {
  const { contents } = await createHandlers(createStore(raw)).readStatuses(new URL(STATUSES_URI));
  assert.deepEqual(
    contents.map(({ uri, mimeType }) => ({ uri, mimeType })),
    [{ uri: STATUSES_URI, mimeType: "text/markdown" }],
  );
  for (const status of LEAD_STATUSES) assert.ok(STATUSES_MARKDOWN.includes(`## \`${status}\``), status);
  assert.equal(STATUSES_MARKDOWN.match(/\*\*Хто переводить:\*\*/g)?.length, LEAD_STATUSES.length);
});
