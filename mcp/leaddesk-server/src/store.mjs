// In-memory lead store of the LeadDesk MCP server.
//
// The fixture is read once at startup and never written back: status changes and audit entries
// live in process memory until the server restarts, and fixtures/leads.json stays a copy of
// materials/leads.json.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The app's vocabulary, not an invented one: LEAD_STATUSES from lib/types.ts and the id format of
// leadId() in lib/db.ts. test/vocabulary.test.mjs fails if the app and the server drift apart.
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];
export const LEAD_ID = /^lead_\d{4}$/;

export const DEFAULT_FIXTURE = fileURLToPath(new URL("../fixtures/leads.json", import.meta.url));

// Expected failures the agent can act on: the tool turns them into isError results with this text.
export class LeadDeskError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LeadDeskError";
    this.code = code;
  }
}

// The only fields the two verbs need. Name, e-mail and the request text never leave the store.
const publicView = (lead) => ({
  id: lead.id,
  company: lead.company,
  status: lead.status,
  source: lead.source,
  budget: lead.budget,
  createdAt: lead.createdAt,
});

function assertValidFixture(leads, path) {
  if (!Array.isArray(leads)) throw new Error(`Fixture ${path}: expected an array of leads`);
  const seen = new Set();
  for (const [i, lead] of leads.entries()) {
    const where = `Fixture ${path}, item ${i}`;
    if (typeof lead?.id !== "string" || !LEAD_ID.test(lead.id)) throw new Error(`${where}: id must match ${LEAD_ID}`);
    if (seen.has(lead.id)) throw new Error(`${where}: duplicate id ${lead.id}`);
    seen.add(lead.id);
    if (!LEAD_STATUSES.includes(lead.status)) throw new Error(`${where}: unknown status of ${lead.id}`);
    if (typeof lead.company !== "string" || typeof lead.source !== "string") throw new Error(`${where}: company and source must be strings`);
    if (lead.budget !== null && typeof lead.budget !== "number") throw new Error(`${where}: budget must be a number or null`);
    if (Number.isNaN(Date.parse(lead.createdAt))) throw new Error(`${where}: createdAt must be a date`);
  }
}

export async function loadLeads(path = process.env.LEADDESK_FIXTURE ?? DEFAULT_FIXTURE) {
  const leads = JSON.parse(await readFile(path, "utf8"));
  assertValidFixture(leads, path);
  return leads;
}

export function createStore(leads) {
  const byId = new Map(leads.map((lead) => [lead.id, { ...lead }]));
  const audit = [];

  return {
    // Newest first; `total` is how many leads match, `returned` how many fit into `limit`. Claude Code
    // hands the model structuredContent rather than the text, so the order is spelled out as a field.
    findLeads({ status, limit }) {
      const matching = [...byId.values()]
        .filter((lead) => status === "any" || lead.status === status)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
      const leadsPage = matching.slice(0, limit).map(publicView);
      return { status, order: "newest_first", total: matching.length, returned: leadsPage.length, leads: leadsPage };
    },

    setLeadStatus({ leadId, status, reason }, now = new Date()) {
      const lead = byId.get(leadId);
      if (!lead) {
        throw new LeadDeskError(
          "not_found",
          `Ліда ${leadId} у LeadDesk немає. Ідентифікатор візьміть із відповіді leaddesk_find_leads (status: "any").`,
        );
      }
      if (lead.status === status) {
        throw new LeadDeskError(
          "same_status",
          `Лід ${leadId} уже має статус ${status}: нічого не змінено, запису в аудиті немає. Поточний статус показує leaddesk_find_leads.`,
        );
      }
      const entry = { action: "lead.status_changed", leadId, at: now.toISOString(), from: lead.status, to: status, reason };
      lead.status = status;
      audit.push(entry);
      return { lead: publicView(lead), audit: { ...entry } };
    },

    auditLog() {
      return audit.map((entry) => ({ ...entry }));
    },
  };
}
