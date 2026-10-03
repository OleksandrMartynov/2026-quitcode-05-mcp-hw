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

// Loopback only: the endpoint has no authentication. Exported so a test pins it.
export const HOST = "127.0.0.1";
export const PORT = 3333;

// Messages only: they never carry lead data.
const logError = (error) => console.error(`leaddesk http: ${error.message}`);

// Not listening yet: the entry below listens on 127.0.0.1:3333, the tests on a free port.
export function createLeadDeskHttpServer() {
  // createMcpHandler reports failures inside the MCP handler, toNodeHandler those of the adapter.
  const mcp = toNodeHandler(createMcpHandler(createLeadDeskServer, { onerror: logError }), { onerror: logError });
  const checkHost = localhostHostValidation();
  const checkOrigin = localhostOriginValidation();

  return createServer(async (req, res) => {
    try {
      if (!checkHost(req, res)) return; // the guard has already answered 403
      if (!checkOrigin(req, res)) return;
      // URL.parse returns null for a request-target it cannot parse (e.g. "//"): 404, not a crash.
      if (URL.parse(req.url, `http://${HOST}`)?.pathname !== "/mcp") {
        res.writeHead(404).end();
        return;
      }
      await mcp(req, res);
    } catch (error) {
      logError(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createLeadDeskHttpServer().listen(PORT, HOST, () => console.error(`leaddesk MCP over HTTP: http://${HOST}:${PORT}/mcp`));
}
