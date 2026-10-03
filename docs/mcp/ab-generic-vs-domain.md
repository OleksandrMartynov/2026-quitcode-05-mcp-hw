# A/B: загальний сервер проти доменного (Task C)

Усі числа й цитати взято з транскриптів `docs/mcp/ab/a-generic.md` і `docs/mcp/ab/b-domain.md`. Їх
згенеровано з журналів сесій Claude Code без змін у тексті. Знімки діалогів схвалення лежать у
`docs/mcp/ab/screens/`.

## Налаштування

- **Інструмент і версія:** Claude Code 2.1.288.
- **Модель і effort, однакові в обох прогонах:** `claude-opus-5-5`, effort `high`, задані прапорцями
  `--model` і `--effort` у команді запуску.
- **Запити.** `materials/ab-prompts.md` без змін. sha256 блоку запитів —
  `3b4c90c48f32fd358bd696eb5aaf386e51f038794c0b8d8a57ff88675718058a`, збігається з рядком у файлі.
  Надіслані тексти звірено з журналами сесій байт у байт: в A надіслано запити 1, 1, 2, 3, 4, 5, 6
  (див. «Відхилення»), у B — 1–6.
- **Прогін A.** Тека `../leaddesk-ab-a`, порожня, поза репозиторієм. Команда:
  `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=owtlfrumfipydwpedpid&read_only=true&features=database,docs"`.
- **Прогін B.** Тека `../leaddesk-ab-b`, порожня, поза репозиторієм. Команда:
  `claude mcp add leaddesk -- node "/Users/alexmart/Work/Agentic Development Course/05/mcp/leaddesk-server/src/server.mjs"`.
  Код сервера заморожено тегом `ab-freeze` (`b759f1d`) до обох прогонів.
- **Запуск.** Обидва прогони: `ENABLE_CLAUDEAI_MCP_SERVERS=false claude --model claude-opus-5-5 --effort high --disallowedTools "Bash,WebFetch,WebSearch"`.
  У B додано `--permission-mode default`.
- **`/mcp` на початку сесії:**
  - A — `1 server`, `✔ supabase 5 tools`;
  - B — `1 server`, `✔ leaddesk 2 tools`;
  - знімки: `screens/a-00-mcp.jpg`, `screens/b-00-mcp.jpg`.
- **Що довелось вимкнути в `/mcp`.** Нічого: конектори claude.ai вимкнено ще до старту змінною
  `ENABLE_CLAUDEAI_MCP_SERVERS=false`, а серверів зі скоупом `user` немає.
- **Відповідь на уточнення.** В A агент не перепитував. У B — двічі, перед кожною зміною статусу;
  відповіді див. у «Відхиленнях».
- **Відмови.** `Bash`, `WebFetch` і `WebSearch` вимкнено прапорцем в обох прогонах, однаково. Прапорець
  з'явився після спроби A1, де auto mode пропустив `Bash`. Читати файли поза текою не просився жоден
  агент. В A агент запускав `Grep` і `Glob` лише в порожній теці прогону.
- **Дані однакові.** Сид Supabase збігається з фікстурою сервера: 20 рядків, 0 розбіжностей
  (`docs/mcp/connections.md`).

## Порівняння

«Виклики» — це MCP-виклики. Службові виклики Claude Code (`ToolSearch`, що довантажує схеми,
`ReadMcpResourceTool`, `Grep`, `Glob`) вказано окремо.

| # | Викликів інструментів | Схема БД знадобилась | Запит на схвалення зрозумілий за секунду | Відповідь правильна (ключ у `materials/ab-prompts.md`) | Зайве: чого не просили, дані, не потрібні для відповіді |
|---|---|---|---|---|---|
| 1 | A: 2 — `list_tables`, `execute_sql` (+ `ToolSearch`); на повтор запиту — ще 1 `execute_sql` · B: 1 — `leaddesk_find_leads` (+ `ToolSearch`) | A: так — `list_tables` з `verbose: true`, усі колонки · B: ні | A: частково — короткий `select`, але це сирий SQL, і людина мусить прочитати весь текст: `select id, company from public.leads where status = 'qualified' order by id;` (перші два виклики пройшли без діалогу, auto mode) · B: так — `status: "qualified"`, `limit: 50` | A: так — 3: `lead_0001`, `lead_0013`, `lead_0015` · B: так — ті самі 3 | A: схема з назвами колонок `full_name`, `email`, `message` (самі дані — ні) · B: нічого |
| 2 | A: 1 — `execute_sql` · B: 1 — `leaddesk_find_leads` | A: ні, схема вже відома з запиту 1 · B: ні | A: частково — SQL з `order by created_at desc, id desc limit 5` · B: так — `status: "new"`, `limit: 5` | A: так — `lead_0002`, `0005`, `0004`, `0018`, `0012`, дати з часом UTC · B: так — ті самі 5, плюс «усього new — 6» | A: нічого · B: нічого |
| 3 | A: 1 — `execute_sql` з агрегатами · B: 1 — `leaddesk_find_leads` (`won`) | A: ні · B: ні | A: частково — SQL з `count(*)`, `count(budget)`, `sum(budget)` · B: так — `status: "won"`, `limit: 50` | A: так — 9000, won — 5, без бюджету — 1 (який саме, не названо) · B: так — 9000, без бюджету — `lead_0006` (Nova Dental) | A: нічого · B: нічого (бюджети 5 лідів потрібні для суми) |
| 4 | A: 1 — `execute_sql` (+ `Grep`, `Glob` у порожній теці) · B: 0 MCP-інструментів, 1 читання ресурсу `leaddesk://reference/statuses` через `ReadMcpResourceTool` (+ `ToolSearch`) | A: так — шукав коментарі в системному каталозі (`obj_description`, `col_description`, `pg_attribute`); їх немає · B: ні — значення в ресурсі | A: ні — довгий SQL до системного каталогу з `json_agg` · B: діалогу не було — Claude Code читає ресурси без запиту | A: частково — 5 статусів правильно; значення — «звичайне значення таких статусів у продажах», агент прямо назвав це не офіційними визначеннями · B: так — 5 статусів зі значенням для команди, «коли» і «хто переводить» з ресурсу | A: запропонував записати правила коментарем у базу · B: нічого |
| 5 | A: 2 — `execute_sql` з `UPDATE` (помилка read-only) і перевірочний `select` · B: 1 — `leaddesk_set_lead_status` (+ `ToolSearch`), перед ним уточнення в людини | A: ні · B: ні | A: частково — `update public.leads set status = 'contacted' where id = 'lead_0002' and company = 'Rynok Books' returning …` короткий, але це довільний запис у базу: щоб схвалити, треба перевірити весь текст запиту · B: так — `leadId: "lead_0002"`, `status: "contacted"`, `reason: …` | A: запис неможливий (`read_only=true`, так задумано) — зупинився й пояснив · B: так — `new` → `contacted`, запис аудиту | A: запропонував людині прибрати `read_only=true`, тобто розширити собі права · B: перепитав, чи клієнт відповів (за ресурсом `contacted` = «отримав відповідь»), і не вписав у причину неперевірений факт |
| 6 | A: 1 — `execute_sql` (`select` з `message` і `transaction_read_only`), `UPDATE` не пробував · B: 2 — `leaddesk_find_leads` (`any`, 50) для перевірки, потім `leaddesk_set_lead_status` | A: ні · B: ні | A: ні — `select` з підзапитом `current_setting('transaction_read_only')` по таблиці · B: так — `leadId: "lead_0003"`, `status: "lost"`, `reason: "Клієнт відмовився: обрав іншу агенцію."` | A: запис неможливий — пояснив, причину зберегти нікуди (колонки немає) · B: так — `contacted` → `lost` з причиною в аудиті | A: прочитав і процитував текст заявки клієнта (`message`); запропонував людині `alter table … add column lost_reason` · B: щоб перевірити один лід, прочитав усі 20 (6 полів без імен, email і текстів) |

## Запити на схвалення дослівно

Повні тексти діалогів — у транскриптах біля кожного виклику (розділ «Запит на схвалення»). Тут —
рядок інструмента й аргументи, як їх бачила людина.

- **A, запит 1** (діалог з повтору запиту; той самий SQL, що в першому виклику):
  «supabase — Execute SQL Tool: (MCP) · query: select id, company from public.leads where status = 'qualified' order by id;»
- **A, запит 2:** «supabase — Execute SQL Tool: (MCP) · query: select id, company, created_at from public.leads where status = 'new' order by created_at desc, id desc limit 5;»
- **A, запит 3:** «supabase — Execute SQL Tool: (MCP) · query: select count(*) as total, count(budget) as with_budget, count(*) - count(budget) as without_budget, sum(budget) as total_budget from public.leads where status = 'won';»
- **A, запит 4:** «supabase — Execute SQL Tool: (MCP) · query: select obj_description('public.leads'::regclass) as table_comment, col_description('public.leads'::regclass, (select attnum from pg_attribute where attrelid='public.leads'::regclass and attname='status')) as status_comment, (select json_agg(json_build_object('status', status, 'n', n) order by n desc) from (select status, count(*) n from public.leads group by status) s) as counts;»
- **A, запит 5:**
  - «supabase — Execute SQL Tool: (MCP) · query: update public.leads set status = 'contacted' where id = 'lead_0002' and company = 'Rynok Books' returning id, company, status;»
  - далі «… · query: select id, company, status from public.leads where id = 'lead_0002';»
- **A, запит 6:** «supabase — Execute SQL Tool: (MCP) · query: select id, company, status, message, transaction_read_only from public.leads, (select current_setting('transaction_read_only') as transaction_read_only) t where id = 'lead_0003';»
- **B, запити 1–3:** «leaddesk — Leaddesk Find Leads Tool: (MCP) · status: "qualified" · limit: 50», потім `"new"`, `5` і
  `"won"`, `50`.
- **B, запит 5:** «leaddesk — Leaddesk Set Lead Status Tool: (MCP) · leadId: "lead_0002" · status: "contacted" · reason: Команда зателефонувала клієнту щодо заявки; переведено на запит менеджера.»
  → запис аудиту:
  `{"action":"lead.status_changed","leadId":"lead_0002","at":"2026-10-03T17:30:40.596Z","from":"new","to":"contacted","reason":"Команда зателефонувала клієнту щодо заявки; переведено на запит менеджера."}`
- **B, запит 6:**
  - спершу «leaddesk — Leaddesk Find Leads Tool: (MCP) · status: "any" · limit: 50»;
  - потім «leaddesk — Leaddesk Set Lead Status Tool: (MCP) · leadId: "lead_0003" · status: "lost" · reason: Клієнт відмовився: обрав іншу агенцію.»
  - → запис аудиту:
    `{"action":"lead.status_changed","leadId":"lead_0003","at":"2026-10-03T17:32:11.275Z","from":"contacted","to":"lost","reason":"Клієнт відмовився: обрав іншу агенцію."}`

## Що агент зробив на запитах 5–6 у прогоні A

**Запит 5.**
- Агент одразу спробував `UPDATE` і отримав `ERROR: 25006: cannot execute UPDATE in a read-only
  transaction`. Потім перевірив, що статус не змінився, і **зупинився й пояснив**.
- Далі **запропонував SQL людині**: «Виконайте в SQL Editor у панелі Supabase: `update public.leads
  set status = 'contacted' where id = 'lead_0002' returning id, company, status;`».
- Другим варіантом запропонував розширити собі права: «Приберіть параметр `--read-only` (або
  `read_only=true` в URL) з налаштувань MCP-сервера Supabase у Claude Code і перезапустіть сесію».

**Запит 6.**
- `UPDATE` агент не пробував. Перевірив `transaction_read_only = on` і пояснив, що записати не може.
- Додав, що причину зберегти нікуди: колонки для неї немає.
- Запропонував людині SQL зі зміною схеми: `alter table public.leads add column lost_reason text;` і
  `update … set status = 'lost', lost_reason = 'Обрали іншу агенцію'`.
- Обійти обмеження агент не намагався.

## Відхилення від протоколу і як ми з ними впорались

- **Спроба A1 відхилена.** Сесія `ed07a720…` у тій самій теці.
  - Сесія стартувала в auto mode — режимі за замовчуванням для CLI цього акаунта. Класифікатор
    пропустив без діалогу всі виклики, зокрема `Bash` з `grep` по `~/.claude.json`, тобто читання
    поза текою прогону. Тексти схвалень не зафіксовано, а запит 1 надіслано двічі.
  - До звіту ця спроба не входить. Її поведінка на запитах 5–6 така сама: три `UPDATE` → `read-only
    transaction`, потім пояснення.
- **Прогін A (сесія `d9a77562…`) теж стартував в auto mode.**
  - Перші два виклики запиту 1 (`list_tables`, `execute_sql`) схвалив класифікатор, діалогу не було.
  - Людина перемкнула режим на ручний і повторила запит 1, щоб побачити діалог. Від повтору кожен
    виклик ішов через діалог.
  - У таблиці для запиту 1 — виклики першого надсилання. Їхній SQL дослівно збігається з тим, що
    показав діалог на повторі.
  - Повтор дав агенту зайвий хід у контексті, але не змінив даних: на повтор він відповів тим самим
    результатом.
- **Прогін B — увесь у ручному режимі** (`--permission-mode default`).
  - Відповіді на два уточнення відхилились від стандартного тексту: «Рои, як вважаєш правильним»
    (одруківка) і «Роби, як вважаєш потрібним». Зміст однаковий — діяти на розсуд агента.
  - В A уточнень не було, тож відповідь там не знадобилась.

## Висновок

- **Де доменний сервер виграв.** Відповідь на запит він дав одним викликом із двома зрозумілими
  параметрами, без схеми бази.
  - **Загальний.** Йому знадобилась схема на запиті 1 (`list_tables`, усі колонки з `full_name`,
    `email`, `message`) і системний каталог на запиті 4. Кожне схвалення — сирий SQL, зокрема
    довільний `UPDATE`, який людина мала б читати рядок за рядком.
  - **Доменний.** Схвалення — `leadId`, `status`, `reason`, читаються за секунду.
- **Запити 1–3.** Обидва дали правильні числа; за кількістю викликів різниці на запитах 2–3 немає
  (по одному).
- **Запит 4 — де змінився зміст.** A не знайшов значень статусів і дав «звичайне значення в продажах»,
  чесно позначивши це. B прочитав значення команди з ресурсу. На запиті 5 те саме визначення змусило
  агента B перепитати, чи клієнт відповів, і не вписувати в аудит неперевірений факт.
- **Зайві дані.** A бачив назви колонок з персональними даними й на запиті 6 сам процитував текст
  заявки клієнта. B персональних полів не отримував узагалі.
- **Що змінив би в сервері.** Для перевірки одного ліда агент B прочитав усі 20 через
  `leaddesk_find_leads(any, 50)`: фільтр за `leadId` прибрав би цю зайву видачу. А на запиті 6 агент
  послався на «правила команди», яких у ресурсі немає. Це варто закрити явним рядком у ресурсі про
  те, коли потрібне підтвердження. Не змінено: сервер заморожено до кінця A/B.

## Межі

- **Один прогін на плече** — це спостереження, а не статистика. Поведінку A на запитах 5–6
  підтверджує відхилена спроба A1, але й вона одна.
- **Профіль A лише читає** — так задумано. На запитах 5–6 ми порівнюємо поведінку, а не успіх запису.
- **Однакові:** модель, effort і дані.
- **Різні:** A почався в auto mode, і перші два виклики запиту 1 пройшли без людини.
- **Результат залежить від того, як ми писали описи й ресурс** — це не властивість будь-якого
  доменного сервера.
