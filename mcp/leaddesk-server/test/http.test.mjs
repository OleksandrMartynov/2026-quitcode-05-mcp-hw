// Bonus E1: the HTTP entry on a free loopback port, the same four checks as the curl commands in
// docs/walkthrough.md plus unknown and unparsable paths.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { createLeadDeskHttpServer } from "../src/http.mjs";

const BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} } },
});
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2026-07-28",
  "Mcp-Method": "tools/list",
};

let server;
let port;
before(async () => {
  server = createLeadDeskHttpServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

function post(headers, path = "/mcp") {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { Host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end(BODY);
  });
}

test("tools/list over HTTP answers 200 with the two tools", async () => {
  const { status, body } = await post(HEADERS);
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(body).result.tools.map((tool) => tool.name), ["leaddesk_find_leads", "leaddesk_set_lead_status"]);
});

test("a forged Host is refused with 403", async () => {
  const { status, body } = await post({ ...HEADERS, Host: "evil.example" });
  assert.equal(status, 403);
  assert.match(body, /Invalid Host/);
});

test("a forged Origin is refused with 403", async () => {
  const { status, body } = await post({ ...HEADERS, Origin: "https://evil.example" });
  assert.equal(status, 403);
  assert.match(body, /Invalid Origin/);
});

test("a request without MCP-Protocol-Version is 400 with -32020", async () => {
  const headers = { ...HEADERS };
  delete headers["MCP-Protocol-Version"];
  const { status, body } = await post(headers);
  assert.equal(status, 400);
  assert.equal(JSON.parse(body).error.code, -32020);
});

test("any path other than /mcp is 404", async () => {
  assert.equal((await post(HEADERS, "/admin")).status, 404);
});

// A request-target that URL cannot parse once killed the process: 404, and the server keeps serving.
test("an unparsable request-target is 404 and the server keeps serving", async () => {
  assert.equal((await post(HEADERS, "//")).status, 404);
  const raw = await new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => socket.write(`GET http://[/ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
    let reply = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("end", () => resolve(reply));
    socket.on("error", reject);
  });
  assert.match(raw, /^HTTP\/1\.1 404/);
  assert.equal((await post(HEADERS)).status, 200);
});
