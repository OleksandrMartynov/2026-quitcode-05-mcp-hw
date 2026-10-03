// LeadDesk as an MCP server: two business verbs and one reference resource over the lead store.
// The stdio entry (server.mjs) and the HTTP entry share this factory, so they serve the same
// tools, and every server instance the SDK creates works on the one store of this process.
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LEAD_ID, LEAD_STATUSES, LeadDeskError, createStore, loadLeads } from "./store.mjs";

export const STATUSES_URI = "leaddesk://reference/statuses";

const INSTRUCTIONS =
  "LeadDesk — ліди агенції: компанія, статус, джерело, бюджет, дата заявки. " +
  "leaddesk_find_leads лише читає. leaddesk_set_lead_status змінює статус і пише запис в аудит — викликайте його лише після підтвердження людини. " +
  `Що означає кожен статус для команди — ресурс ${STATUSES_URI}.`;

// What each status means for the team. Keyed by LEAD_STATUSES: a status without a guide fails at
// startup, so the resource cannot silently miss one.
const STATUS_GUIDE = {
  new: {
    meaning: "Заявка прийшла з форми чи кампанії, ніхто з команди ще не відповідав.",
    when: "Автоматично, коли заявку створено.",
    who: "Система. Менеджер з продажу відповідає протягом робочого дня.",
  },
  contacted: {
    meaning: "Менеджер зв'язався з клієнтом (дзвінок, лист чи месенджер) і отримав відповідь.",
    when: "Після першої розмови чи відповіді клієнта.",
    who: "Менеджер, який веде лід.",
  },
  qualified: {
    meaning: "Підтверджено, що це наш клієнт: відомі задача, бюджет або його діапазон, хто ухвалює рішення, строки; задача в профілі студії.",
    when: "Після кваліфікаційної розмови. Далі — кошторис.",
    who: "Менеджер, який веде лід.",
  },
  won: {
    meaning: "Угоду укладено: клієнт підписав договір або вніс передоплату. Лід переходить у виробництво.",
    when: "Коли є підпис чи оплата, а не усна згода.",
    who: "Акаунт-менеджер або керівник продажів.",
  },
  lost: {
    meaning: "Угоди не буде: клієнт відмовився, бюджет чи задача не підходять, або клієнт не відповідає 14 днів після трьох спроб зв'язку.",
    when: "Щойно це стало відомо; причина обов'язкова.",
    who: "Менеджер, який веде лід.",
  },
};

for (const status of LEAD_STATUSES) {
  if (!STATUS_GUIDE[status]) throw new Error(`No team guide for lead status "${status}"`);
}

export const STATUSES_MARKDOWN = [
  "# Статуси лідів LeadDesk",
  "",
  `Статусів п'ять, інших не буває: ${LEAD_STATUSES.map((s) => `\`${s}\``).join(", ")}.`,
  "",
  ...LEAD_STATUSES.flatMap((status) => {
    const guide = STATUS_GUIDE[status];
    return [`## \`${status}\``, "", guide.meaning, "", `- **Коли:** ${guide.when}`, `- **Хто переводить:** ${guide.who}`, ""];
  }),
  "## Правила зміни статусу",
  "",
  "- Статус змінює лише `leaddesk_set_lead_status`, з причиною; кожна зміна лишає запис в аудиті.",
  "- Перед зміною агент каже людині, який лід і на який статус, і чекає підтвердження.",
  "- Повернення з `won` чи `lost` — лише з поясненням у причині.",
  "",
].join("\n");

// inputSchema is an object of Zod fields, as mcp/README.md (rule 7) requires. SDK 2.1.0 marks this
// form @deprecated and wraps it in z.object() itself.
export const findLeadsInput = {
  status: z
    .enum([...LEAD_STATUSES, "any"])
    .describe(`Який статус шукати: ${LEAD_STATUSES.join(", ")}; any — усі статуси. Що означає кожен — ресурс ${STATUSES_URI}`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Скільки лідів повернути, від 1 до 50 (за замовчуванням 10). Скільки їх усього, каже total у відповіді"),
};

export const setLeadStatusInput = {
  leadId: z
    .string()
    .regex(LEAD_ID)
    .describe("Ідентифікатор ліда: lead_ і чотири цифри, напр. lead_0017. Беріть із відповіді leaddesk_find_leads"),
  status: z.enum(LEAD_STATUSES).describe(`Новий статус: ${LEAD_STATUSES.join(", ")}. Має відрізнятися від поточного`),
  reason: z.string().trim().min(3).max(500).describe("Чому змінюємо статус, 3–500 символів. Потрапляє в запис аудиту"),
};

const budgetText = (budget) => (budget === null ? "без бюджету" : `бюджет ${budget}`);
const leadLine = (lead) => `- ${lead.id} · ${lead.company} · ${lead.status} · ${lead.source} · ${budgetText(lead.budget)} · ${lead.createdAt}`;

function findLeadsText({ status, total, returned, leads }) {
  const scope = status === "any" ? "усіх статусів" : `зі статусом ${status}`;
  if (total === 0) return `Лідів ${scope} немає.`;
  return [`Лідів ${scope}: ${total} (показано ${returned}, найновіші першими).`, ...leads.map(leadLine)].join("\n");
}

function setLeadStatusText({ lead, audit }) {
  return `${lead.id} (${lead.company}): ${audit.from} → ${audit.to}. Запис аудиту: ${audit.action}, ${audit.at}, причина: «${audit.reason}».`;
}

const fail = (error) => ({ isError: true, content: [{ type: "text", text: error.message }] });

// Tool and resource handlers over a given store; exported so the tests can run them on a fresh store.
export function createHandlers(store) {
  return {
    async findLeads({ status, limit }) {
      const result = store.findLeads({ status, limit });
      return { content: [{ type: "text", text: findLeadsText(result) }], structuredContent: result };
    },

    async setLeadStatus({ leadId, status, reason }) {
      try {
        const result = store.setLeadStatus({ leadId, status, reason });
        return { content: [{ type: "text", text: setLeadStatusText(result) }], structuredContent: result };
      } catch (error) {
        if (error instanceof LeadDeskError) return fail(error);
        throw error;
      }
    },

    async readStatuses(uri) {
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: STATUSES_MARKDOWN }] };
    },
  };
}

// Read once per process. The SDK may call the factory more than once (per connection or request),
// and all those instances share this store.
const store = createStore(await loadLeads());

export function createLeadDeskServer() {
  const server = new McpServer({ name: "leaddesk", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const handlers = createHandlers(store);

  server.registerTool(
    "leaddesk_find_leads",
    {
      title: "Знайти ліди LeadDesk",
      description:
        "Показує ліди LeadDesk із заданим статусом, найновіші першими: id, компанія, статус, джерело, бюджет і дата заявки. Імен, email і тексту заявки не повертає. Лише читає дані.",
      inputSchema: findLeadsInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handlers.findLeads,
  );

  server.registerTool(
    "leaddesk_set_lead_status",
    {
      title: "Змінити статус ліда LeadDesk",
      description:
        "Змінює статус одного ліда LeadDesk і пише запис в аудит: старий і новий статус, причина, час. ЗМІНЮЄ ДАНІ: перед викликом скажіть людині, який лід і на який статус переводите, і дочекайтеся її підтвердження. Інших полів не змінює; невідомий лід або той самий статус — помилка без змін.",
      inputSchema: setLeadStatusInput,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    handlers.setLeadStatus,
  );

  server.registerResource(
    "lead-statuses",
    STATUSES_URI,
    {
      title: "Статуси лідів LeadDesk",
      description: "П'ять статусів ліда і що кожен означає для команди: коли настає і хто переводить",
      mimeType: "text/markdown",
    },
    handlers.readStatuses,
  );

  return server;
}
