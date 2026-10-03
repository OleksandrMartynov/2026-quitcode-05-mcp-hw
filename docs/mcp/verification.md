# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code 2.1.278 · основна сесія — десктоп-застосунок Claude,
  Opus 5.5; смоук-сесії Task A — `claude -p --model claude-sonnet-5 --effort low`
- **ОС і термінал, Node:** macOS 26.5.1 · zsh · Node 24.20.0 · npm 11.19.0

## Task A — сервер в Inspector

**Підсумок.**
- Сервер має два інструменти й ресурс.
- Чотири JSON у `docs/mcp/` — вивід Inspector CLI 2.8.0, отриманий командами walkthrough (крок 4)
  без змін, з кореня репозиторію.
- `npm test` проходить, і кожна навмисна вада ловиться тестами.
- У Claude Code сервер підключається, ресурс читається.

| Файл | Код виходу | Що в ньому |
|---|---|---|
| `tools-list.json` | 0 | `leaddesk_find_leads` — `readOnlyHint: true`, `leaddesk_set_lead_status` — `readOnlyHint: false`; в обох `openWorldHint: false`; `description` у кожного параметра |
| `set-status.json` | 0 | `lead_0002`: `new` → `contacted`; аудит `{"action":"lead.status_changed","leadId":"lead_0002","at":"2026-10-03T11:22:32.127Z","from":"new","to":"contacted","reason":"перевірка в Inspector"}` |
| `bad-input.json` | **5** | `leadId=nope`, `reason=ok` → `"isError": true` з текстом `Input validation error: … leadId: Invalid string: must match pattern /^lead_\d{4}$/, reason: Too small: expected string to have >=3 characters`; у stderr — `{"error":{"code":"tool_is_error",…}}` |
| `resource-read.json` | 0 | `leaddesk://reference/statuses`, `mimeType: text/markdown`: п'ять статусів — що означає, коли настає, хто переводить |

<details><summary>Самоперевірка з walkthrough — сирий вивід</summary>

```
$ node -e "const t=require('./docs/mcp/tools-list.json').tools; for (const x of t) console.log(x.name, JSON.stringify(x.annotations))"
leaddesk_find_leads {"readOnlyHint":true,"openWorldHint":false}
leaddesk_set_lead_status {"readOnlyHint":false,"openWorldHint":false}
$ grep -c '"isError": true' docs/mcp/bad-input.json
1
$ grep -o '"action"\|"leadId"\|"at"' docs/mcp/set-status.json | sort -u
"action"
"at"
"leadId"
$ grep -rc 'console\.log' mcp/leaddesk-server/src
mcp/leaddesk-server/src/leaddesk.mjs:0
mcp/leaddesk-server/src/server.mjs:0
mcp/leaddesk-server/src/store.mjs:0
$ cmp materials/leads.json mcp/leaddesk-server/fixtures/leads.json && echo "fixture = materials/leads.json"
fixture = materials/leads.json
```

</details>

**Помилки домену.** Ті самі виклики Inspector'а; в обов'язкові артефакти вони не входять.

| Виклик `leaddesk_set_lead_status` | Код виходу | Текст із `isError: true` |
|---|---|---|
| `leadId=lead_0099` | 5 | «Ліда lead_0099 у LeadDesk немає. Ідентифікатор візьміть із відповіді leaddesk_find_leads (status: "any").» |
| `lead_0017` → `won` (він уже `won`) | 5 | «Лід lead_0017 уже має статус won: нічого не змінено, запису в аудиті немає. Поточний статус показує leaddesk_find_leads.» |

**Що модель бачить в описах параметрів** (з `tools-list.json`):

- `status` у `find_leads`: «Який статус шукати: new, contacted, qualified, won, lost; any — усі
  статуси. Що означає кожен — ресурс leaddesk://reference/statuses»
- `limit`: «Скільки лідів повернути, від 1 до 50 (за замовчуванням 10). Скільки їх усього, каже total
  у відповіді»
- `leadId`: «Ідентифікатор ліда: lead_ і чотири цифри, напр. lead_0017. Беріть із відповіді
  leaddesk_find_leads»
- `status` у `set_lead_status`: «Новий статус: new, contacted, qualified, won, lost. Має
  відрізнятися від поточного»
- `reason`: «Чому змінюємо статус, 3–500 символів. Потрапляє в запис аудиту»

**Тести.** `cd mcp/leaddesk-server && npm test` (`node --test`, без додаткових залежностей) →
`ℹ tests 21 · ℹ pass 21 · ℹ fail 0`. З них 16 — Task A (`store`, `vocabulary`, `handlers`), ще 5 —
HTTP-варіант (див. Task E). Тести Task A покривають:
- збіг статусів з `LEAD_STATUSES` у `lib/types.ts` і формату id з `leadId()` у `lib/db.ts`;
- лише шість полів у видачі — ні імені, ні email, ні тексту заявки ні в `structuredContent`, ні в
  тексті;
- сортування, `limit` і `total`;
- запис аудиту;
- помилки, які нічого не змінюють;
- файл фікстури байт у байт той самий після змін;
- відмову завантажити фікстуру з вигаданим id, вигаданим статусом чи дублем, зокрема через
  `LEADDESK_FIXTURE`.

**Мутаційна перевірка.** Кожну ваду вносили в код окремо, запускали `node --test` і відновлювали
оригінал. Жодна вада не пройшла непоміченою:

| Вада | Тестів упало |
|---|---|
| email у відповіді `find_leads` | 3 |
| без сортування | 1 |
| той самий статус проходить | 2 |
| вигаданий статус `hot` | 4 |
| аудит не пишеться | 1 |
| `limit` за замовчуванням 20 | 1 |

**Смоук у Claude Code.** Запит не з A/B, у порожній теці поза репозиторієм. Конфіг
`leaddesk-only.json` — лише `{"leaddesk": {"type": "stdio", "command": "node", "args":
["<репозиторій>/mcp/leaddesk-server/src/server.mjs"]}}`. Команда:

```bash
ENABLE_CLAUDEAI_MCP_SERVERS=false claude -p --model claude-sonnet-5 --effort low --strict-mcp-config \
  --mcp-config leaddesk-only.json --allowedTools "mcp__leaddesk__leaddesk_find_leads,ListMcpResourcesTool,ReadMcpResourceTool" \
  --output-format stream-json --verbose "Покажи два найновіші ліди у статусі contacted і поясни, що означає статус won для нашої команди."
```

- **Подія `init`:** `mcp_servers: [{"name":"leaddesk","status":"connected"}]`.
- **Ланцюжок:** `ToolSearch` (схеми MCP-інструментів Claude Code довантажує окремо) →
  `leaddesk_find_leads {"status":"contacted","limit":2}` →
  `ReadMcpResourceTool {"server":"leaddesk","uri":"leaddesk://reference/statuses"}`. Відмов у дозволі
  не було.
- **Що потрапляє до моделі.** У журналі сесії результат інструмента — JSON `structuredContent`, а
  не текст відповіді, тож рядка «найновіші першими» модель не бачить.
- **Порядок лідів.** Сервер віддав `lead_0008` (10.09) перед `lead_0014` (27.07). У першому прогоні
  агент назвав обидва правильно, але переставив їх: «1. **Nova Dental** … заявка від 27.07.2026;
  2. **Brick & Beam** … від 10.09.2026». Тому порядок записано ще й полем `order: "newest_first"`.
  Другий прогін — у правильному порядку: `lead_0008 | Brick & Beam … 2026-09-10`, потім
  `lead_0014 | Nova Dental … 2026-07-27`. Це по одному прогону до і після, тобто спостереження, а не
  доказ.

**Що було найважче в описах.**
- Сказати в описі `leaddesk_set_lead_status`, що він змінює дані й потребує підтвердження людини, і
  при цьому не вписати в описи даних з A/B: приклад id — `lead_0017`, а не `lead_0002`.
- Модель читає `structuredContent`, а не текст. Отже, усе, що має дійти до моделі, мусить бути в
  структурі відповіді або в описах.

## Task E (бонус)

- **Варіант:** E1 — HTTP-варіант сервера із захистом Host/Origin.
- **Код:** `mcp/leaddesk-server/src/http.mjs`.
  - Та сама фабрика `createLeadDeskServer`, що в `server.mjs`.
  - `createMcpHandler` з `@modelcontextprotocol/server` + `toNodeHandler` з `@modelcontextprotocol/node`
    `2.1.0` (точна версія в `package.json`).
  - Гварди `localhostHostValidation()` і `localhostOriginValidation()` викликано в обробнику запиту до
    `mcp(req, res)`.
  - Сервер слухає лише `127.0.0.1:3333`; шлях, інший ніж `/mcp`, отримує 404.
  - Запуск — `npm run start:http`.
- **Чотири `curl`** — команди з walkthrough дослівно (bash-скрипт; `body.json` лежить у локальній теці
  поза git):

| Запит | HTTP | Відповідь |
|---|---|---|
| звичайний | **200** | `{"result":{"tools":[{"name":"leaddesk_find_leads",…},{"name":"leaddesk_set_lead_status",…}]}}` |
| `Host: evil.example` | **403** | `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}` |
| `Origin: https://evil.example` | **403** | `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: evil.example"},"id":null}` |
| без `MCP-Protocol-Version` | **400** | `{"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree: …"},…}` |

<details><summary>Сирий вивід чотирьох <code>curl</code></summary>

```
$ curl … http://127.0.0.1:3333/mcp                                   # expected 200
{"result":{"tools":[{"name":"leaddesk_find_leads","title":"Знайти ліди LeadDesk","description":"Показує ліди LeadDesk із заданим статусом, найновіші першими: id, компанія, статус, джерело, бюджет і дата заявки. Імен, email і тексту заявки не повертає. Лише читає дані.","inputSchema":{"type":"object","$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"status":{"type":"string","enum":["new","contacted","qualified","won","lost","any"],"description":"Який статус шукати: new, contacted, qualified, won, lost; any — усі статуси. Що означає кожен — ресурс leaddesk://reference/statuses"},"limit":{"default":10,"description":"Скільки лідів повернути, від 1 до 50 (за замовчуванням 10). Скільки їх усього, каже total у відповіді","type":"integer","minimum":1,"maximum":50}},"required":["status"]},"annotations":{"readOnlyHint":true,"openWorldHint":false}},{"name":"leaddesk_set_lead_status","title":"Змінити статус ліда LeadDesk","description":"Змінює статус одного ліда LeadDesk і пише запис в аудит: старий і новий статус, причина, час. ЗМІНЮЄ ДАНІ: перед викликом скажіть людині, який лід і на який статус переводите, і дочекайтеся її підтвердження. Інших полів не змінює; невідомий лід або той самий статус — помилка без змін.","inputSchema":{"type":"object","$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"leadId":{"type":"string","pattern":"^lead_\\d{4}$","description":"Ідентифікатор ліда: lead_ і чотири цифри, напр. lead_0017. Беріть із відповіді leaddesk_find_leads"},"status":{"type":"string","enum":["new","contacted","qualified","won","lost"],"description":"Новий статус: new, contacted, qualified, won, lost. Має відрізнятися від поточного"},"reason":{"type":"string","minLength":3,"maxLength":500,"description":"Чому змінюємо статус, 3–500 символів. Потрапляє в запис аудиту"}},"required":["leadId","status","reason"]},"annotations":{"readOnlyHint":false,"openWorldHint":false}}],"resultType":"complete","ttlMs":0,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"leaddesk","version":"0.1.0"}}},"jsonrpc":"2.0","id":1}
HTTP 200
$ curl … -H "Host: evil.example" …                                   # expected 403
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}
HTTP 403
$ curl … -H "Origin: https://evil.example" …                         # expected 403
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: evil.example"},"id":null}
HTTP 403
$ curl … without MCP-Protocol-Version …                              # expected 400, -32020
{"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree: the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent","data":{"mismatch":{"header":"(missing)","body":"the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent"}}},"id":1}
HTTP 400
```

</details>

- **Пастку перевірено атакою.** Контрольний варіант передавав гварди опцією:
  `toNodeHandler(handler, { hostValidation: localhostHostValidation(), originValidation: localhostOriginValidation() })`.
  Таких опцій у `toNodeHandler` немає. Запит із `Host: evil.example` отримав **HTTP 200**: опцію мовчки
  проігноровано, як і попереджає walkthrough. У нашому `http.mjs` той самий запит дає 403. Контрольний
  файл був тимчасовим і видалений одразу після перевірки.
- **Автотести.** `test/http.test.mjs` повторює ці чотири перевірки й додає 404 на інший шлях; сервер
  піднімається на вільному порту `127.0.0.1`. Мутації ловляться: без виклику `checkHost` падає 1
  тест, без виклику `checkOrigin` — 1.
- **Межі.** Автентифікації немає: це локальний режим розробника, а не віддалений сервер. Гварди
  закривають DNS rebinding (чужий сайт у браузері звертається до `127.0.0.1`). Від інших процесів на
  цій машині вони не захищають: будь-який локальний процес може викликати
  `leaddesk_set_lead_status` через порт 3333.
