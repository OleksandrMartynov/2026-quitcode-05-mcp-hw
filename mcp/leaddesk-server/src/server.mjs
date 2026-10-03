// LeadDesk MCP server over stdio — the entry point Claude Code and the Inspector start.
//
//   node src/server.mjs                                        fixture: ../fixtures/leads.json
//   LEADDESK_FIXTURE=/path/to/leads.json node src/server.mjs   another fixture, same format
//
// stdout is the protocol channel: nothing in this server writes to it; diagnostics go to stderr only.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createLeadDeskServer } from "./leaddesk.mjs";

await serveStdio(createLeadDeskServer);
