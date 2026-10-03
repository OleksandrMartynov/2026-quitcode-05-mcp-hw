# Перевірка форми в браузері (Task B, Playwright)

**Запит** (дослівно з walkthrough):

> Відкрий http://localhost:3000, заповни форму заявки тестовими даними, відправ, перевір консоль і
> мережу. Інших адрес не відкривай.

**Сесія.** Claude Code 2.1.288, `claude-opus-5-5`, effort `high`; `npm run dev` запущено.
- Нова сесія лише з `playwright`: Supabase вимкнено, конекторів claude.ai немає.
- Запуск: `ENABLE_CLAUDEAI_MCP_SERVERS=false claude -p --model claude-opus-5-5 --effort high
  --strict-mcp-config --mcp-config <лише запис playwright з .mcp.json> --output-format stream-json --verbose "<запит>"`.
- Подія `init`: `mcp_servers: [playwright: connected]`, 21 інструмент Playwright. Чотири під deny до
  моделі не потрапили.

## Ланцюжок інструментів

| # | Інструмент | Аргументи | Результат |
|---|---|---|---|
| 1 | `ToolSearch` | (довантаження схем інструментів playwright) | ok |
| 2 | `Bash` | {"command":"curl -s -o /dev/null -w \"%{http_code}\\n\" --max-time 5 http://localhost:3000/","description":"Check whether the dev server responds on localhost"} | **відмовлено:** This command requires approval |
| 3 | `browser_navigate` | {"url":"http://localhost:3000"} | ok |
| 4 | `browser_snapshot` | {} | ok |
| 5 | `browser_console_messages` | {"level":"debug"} | ok |
| 6 | `browser_fill_form` | {fields: Ім'я="Тест", Прізвище="Тестенко", Email="test.lead@example.com", Телефон="+380000000000", Компанія="Test Company (synthetic)", Сайт="https://example.com", Бюджет="$500–1500 / міс.", Що потрібно зробити?="Тестова заявка від агента: перевірка форми. Не  | ok |
| 7 | `browser_click` | {"target":"e40","element":"Кнопка «Надіслати заявку»"} | ok |
| 8 | `browser_snapshot` | {} | ok |
| 9 | `browser_console_messages` | {"level":"debug"} | ok |
| 10 | `browser_network_requests` | {"static":false} | ok |
| 11 | `browser_network_requests` | {"static":true} | ok |
| 12 | `browser_network_request` | {"index":22} | **відмовлено:** Claude requested permissions to use mcp__playwright__browser_network_request, but you have |

## Чи відправилась форма

Так.
- `browser_fill_form` заповнив поля синтетичними даними: домен `example.com`, телефон із нулів, у
  тексті заявки — «Не обробляти».
- `browser_click` натиснув «Надіслати заявку».
- Знімок після відправки: форма зникла, на сторінці «Дякуємо! Заявку отримано. Ми зв'яжемося з вами
  протягом робочого дня.»

## Консоль

До і після відправки — `Total messages: 2 (Errors: 0, Warnings: 0)`: порада встановити React DevTools
і `[HMR] connected`.

## Мережа

22 запити, усі на `http://localhost:3000`:
- 21 — завантаження сторінки (документ, шрифти, CSS, JS-чанки, favicon), усі `200`;
- №22 — `[POST] http://localhost:3000/ => [200] OK`, відправка форми через Server Action.

На сторонні адреси запитів не було. Відкрито лише `http://localhost:3000` (один `browser_navigate`).

Журнал `npm run dev` з того самого боку підтверджує збереження:
- `POST / 200 in 145ms` → `submitLead(...) app/actions.ts` → `db:insertLead: 1` → `db:insertAuditEntry: 1`;
- `n8n -> lead-created network error … (try 1/3 … 3/3)`. Вебхук n8n локальний і зараз не запущений —
  це очікувано, контракт WS4 у цій домашці не чіпаємо (README, «Без n8n»).

## Що агент зробив сам і що його зупинило

- **Перед браузером** спробував `Bash` → `curl http://localhost:3000/`. Відмова: «This command requires
  approval». `Bash` не в `allow`, а в `claude -p` запит на дозвіл автоматично відхиляється.
- **Хотів переглянути заголовки й тіло POST** через `browser_network_request`. Відмова: інструмент
  у `ask`, а підтвердити його нікому. Через це вміст відповіді Server Action агент не бачив і прямо
  про це написав.
- **Логінів не було** (`--isolated`). Знімки й журнали дій — у `.playwright-mcp/`, яку ігнорує git.
