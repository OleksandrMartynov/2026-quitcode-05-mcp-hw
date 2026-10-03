# LeadDesk MCP-сервер (Task A)

Агенту — два бізнес-дієслова над лідами LeadDesk замість SQL на всю базу: знайти ліди за статусом і
змінити статус одного ліда з записом в аудит. Плюс ресурс про те, що кожен статус означає для команди.
Сервер працює офлайн на фікстурі `fixtures/leads.json` — незмінній копії `materials/leads.json`
(20 лідів `lead_0001`–`lead_0020`).

| Що | Тип | Що робить |
|---|---|---|
| `leaddesk_find_leads` | інструмент, `readOnlyHint: true` | ліди за статусом (`any` — усі), найновіші першими; лише `id`, `company`, `status`, `source`, `budget`, `createdAt` — без імені, email і тексту заявки |
| `leaddesk_set_lead_status` | інструмент, `readOnlyHint: false` | змінює статус у пам'яті й повертає новий стан ліда та запис аудиту `{ action, leadId, at, from, to, reason }`; невідомий лід чи той самий статус — `isError: true` з підказкою |
| `leaddesk://reference/statuses` | ресурс, `text/markdown` | п'ять статусів: що означає для команди, коли настає, хто переводить |

## Запуск і тести

Node.js ≥ 22.19. З кореня репозиторію:

```bash
cd mcp/leaddesk-server
npm ci                 # рівно те, що в package-lock.json
npm test               # node --test, без додаткових залежностей; усі тести мають пройти
node src/server.mjs    # stdio: чекає клієнта на stdin, зупинка — Ctrl+C
```

| Змінна | Що робить |
|---|---|
| `LEADDESK_FIXTURE` | інший файл лідів того самого формату; без неї — `fixtures/leads.json` поруч із сервером |

Фікстуру сервер читає один раз при старті й ніколи не переписує: зміни статусів і записи аудиту
живуть у пам'яті процесу до перезапуску.

## Перевірка Inspector'ом

З кореня репозиторію (на Windows — Git Bash). Кожен виклик запускає сервер заново, тож стан щоразу
чистий:

```bash
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/list > docs/mcp/tools-list.json

npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_set_lead_status \
  --tool-arg leadId=lead_0002 --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector" > docs/mcp/set-status.json

npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_set_lead_status \
  --tool-arg leadId=nope --tool-arg status=won --tool-arg reason=ok > docs/mcp/bad-input.json; echo "exit=$?"   # exit=5

npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method resources/read --uri leaddesk://reference/statuses > docs/mcp/resource-read.json
```

Код виходу 5 для `bad-input.json` — так Inspector позначає `isError: true`, а не збій команди.

## Підключення до Claude Code

Скоуп `local` (за замовчуванням): запис лягає в `~/.claude.json`, у git нічого. Шлях — абсолютний:

```bash
claude mcp add leaddesk -- node "/абсолютний/шлях/до/репозиторію/mcp/leaddesk-server/src/server.mjs"
```

У новій сесії `/mcp` показує `leaddesk` із двома інструментами. Прибрати — `claude mcp remove leaddesk`.

## Як влаштовано

- `src/store.mjs` — фікстура → пам'ять, пошук, зміна статусу, аудит.
- `src/leaddesk.mjs` — фабрика `createLeadDeskServer()`: два інструменти, ресурс, `instructions`
  сервера. Сховище одне на процес, хоч скільки екземплярів сервера створить SDK.
- `src/server.mjs` — `serveStdio(createLeadDeskServer)`. stdout — канал протоколу, сервер не пише в
  нього нічого іншого.
- Словник — із застосунку: статуси — `LEAD_STATUSES` з `lib/types.ts`, id — формат `leadId()` з
  `lib/db.ts`. Якщо вони розійдуться, впаде `test/vocabulary.test.mjs`.
- `inputSchema` — об'єкт Zod-полів, як вимагає `mcp/README.md` (правило 7). SDK 2.1.0 позначає цю
  форму `@deprecated` і сам обгортає її в `z.object()`.
- Claude Code передає моделі `structuredContent`, а не текст відповіді, тому порядок видачі записано
  ще й полем `order: "newest_first"`.
