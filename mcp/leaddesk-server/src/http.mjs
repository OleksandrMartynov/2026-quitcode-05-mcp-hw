// LeadDesk MCP server over Streamable HTTP (bonus E1): the same factory as the stdio entry.
//
//   node src/http.mjs   → http://127.0.0.1:3333/mcp, loopback only
//
// The DNS-rebinding guards are called in the request handler, before the MCP handler. Passed as an
// option to toNodeHandler they would be silently ignored, and a forged Host would get 200.
import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createLeadDeskServer } from "./leaddesk.mjs";

const HOST = "127.0.0.1";
const PORT = 3333;

// Not listening yet: the entry below listens on 127.0.0.1:3333, the tests on a free port.
export function createLeadDeskHttpServer() {
  const mcp = toNodeHandler(createMcpHandler(createLeadDeskServer), {
    onerror: (error) => console.error(`leaddesk http: ${error.message}`),
  });
  const checkHost = localhostHostValidation();
  const checkOrigin = localhostOriginValidation();

  return createServer(async (req, res) => {
    if (!checkHost(req, res)) return; // the guard has already answered 403
    if (!checkOrigin(req, res)) return;
    if (new URL(req.url, `http://${HOST}`).pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    await mcp(req, res);
  });
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createLeadDeskHttpServer().listen(PORT, HOST, () => console.error(`leaddesk MCP over HTTP: http://${HOST}:${PORT}/mcp`));
}
