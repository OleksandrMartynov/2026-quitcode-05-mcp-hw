// Task A through the protocol: the stdio server process as Claude Code and the Inspector start it,
// spoken to with newline-delimited JSON-RPC. Guards what the graders read in tools/list and
// resources/list: annotations, descriptions, the resource and its mimeType.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LEAD_STATUSES } from "../src/store.mjs";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const STATUSES_URI = "leaddesk://reference/statuses";

let child;
let nextId = 1;
const pending = new Map();

function send(message) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

// Rejects instead of hanging when the server dies or stays silent.
function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method}: no answer within 5 s`));
    }, 5000);
    pending.set(id, {
      resolve: (message) => (clearTimeout(timer), resolve(message)),
      reject: (error) => (clearTimeout(timer), reject(error)),
    });
    send({ id, method, params });
  });
}

let initialize;
before(async () => {
  child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "ignore"] });
  child.on("exit", (code) => {
    for (const { reject } of pending.values()) reject(new Error(`server exited with code ${code}`));
    pending.clear();
  });
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      const message = JSON.parse(line); // anything else on stdout would break the protocol, and this test
      pending.get(message.id)?.resolve(message);
      pending.delete(message.id);
    }
  });
  initialize = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "leaddesk-test", version: "0" } });
  send({ method: "notifications/initialized" });
});
after(() => child.kill());

test("initialize: server leaddesk with instructions that point to the statuses resource", () => {
  assert.equal(initialize.result.serverInfo.name, "leaddesk");
  assert.match(initialize.result.instructions, /leaddesk:\/\/reference\/statuses/);
});

test("tools/list: exactly two tools, read-only vs data-changing, a description on every parameter", async () => {
  const { result } = await rpc("tools/list");
  const tools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(Object.keys(tools).sort(), ["leaddesk_find_leads", "leaddesk_set_lead_status"]);

  const find = tools.leaddesk_find_leads;
  const set = tools.leaddesk_set_lead_status;
  assert.equal(find.annotations.readOnlyHint, true);
  assert.equal(set.annotations.readOnlyHint, false);
  assert.match(find.description, /Лише читає/);
  assert.match(set.description, /ЗМІНЮЄ ДАНІ/);
  assert.match(set.description, /підтвердження/);

  assert.deepEqual(find.inputSchema.properties.status.enum, [...LEAD_STATUSES, "any"]);
  assert.deepEqual(set.inputSchema.properties.status.enum, LEAD_STATUSES);
  assert.equal(set.inputSchema.properties.leadId.pattern, "^lead_\\d{4}$");
  for (const tool of result.tools) {
    for (const [name, property] of Object.entries(tool.inputSchema.properties)) assert.ok(property.description, `${tool.name}.${name}`);
  }
});

test("resources: exactly one, the statuses reference as text/markdown", async () => {
  const { result: list } = await rpc("resources/list");
  assert.deepEqual(
    list.resources.map(({ uri, mimeType }) => ({ uri, mimeType })),
    [{ uri: STATUSES_URI, mimeType: "text/markdown" }],
  );
  const { result: read } = await rpc("resources/read", { uri: STATUSES_URI });
  assert.equal(read.contents[0].mimeType, "text/markdown");
  for (const status of LEAD_STATUSES) assert.ok(read.contents[0].text.includes(`## \`${status}\``), status);
});

test("tools/call: invalid input is isError with the validation text, valid calls return structuredContent", async () => {
  const { result: bad } = await rpc("tools/call", { name: "leaddesk_set_lead_status", arguments: { leadId: "nope", status: "won", reason: "ok" } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /Input validation error/);

  const { result: found } = await rpc("tools/call", { name: "leaddesk_find_leads", arguments: { status: "any", limit: 1 } });
  assert.equal(found.isError, undefined);
  assert.equal(found.structuredContent.returned, 1);
});
