# Підключення MCP-серверів LeadDesk (Task B)

Перевірено 03–04.10.2026 у Claude Code 2.1.278–2.1.289. Числа інструментів узято з події `init` сесії,
а поведінку — з журналів сесій. Подробиці — у `docs/mcp/verification.md`, розділ Task B; витяги з
журналів — у `docs/mcp/evidence/session-excerpts.md`.

- **Акаунти.** Лише особисті, без клієнтських організацій і команд (це декларація: знімків екранів
  згоди ми не робили):
  - Supabase — особистий акаунт і одноразовий проєкт в особистій організації; на екрані згоди
    вибрано лише її.
  - Vercel — особистий Hobby-акаунт з особистою командою за замовчуванням.
  - Figma — не використовували.
- **Третій сервер — Playwright.**
  - Чому: йому не потрібен акаунт і квота Figma (20 викликів на місяць на Starter).
  - Урок про права тут гостріший: ядро сервера завжди вмикає `browser_run_code_unsafe`, і закрити
    його можна лише deny на клієнті. Саме це ми й перевірили.
- **Vercel CLI на цій машині не встановлено** (`command -v vercel` → not found).
  - Додатково в `deny` стоять `Bash(vercel *)`, `Bash(npx vercel *)` і `Bash(npx -y vercel *)`.
  - Правило перевірено спробою: `vercel whoami` у корені репозиторію → «Permission to use Bash with
    command vercel whoami has been denied.» Та сама команда в теці без правил → «This command
    requires approval». Отже, спрацювало саме deny (`session-excerpts.md`, 5.1).
- **Конектори claude.ai.** В акаунті Claude підключено конектори, серед них claude.ai Supabase,
  claude.ai Vercel і claude.ai Gmail. Вони з'являються в кожній CLI-сесії.
  - Їхні інструменти мають інші імена, тож deny з `.claude/settings.json` на них не діє.
  - `disabledMcpServers` у проєктних налаштуваннях їх не вимикає: перевірили за подією `init`.
  - Тому кожну CLI-сесію домашки запускали з `ENABLE_CLAUDEAI_MCP_SERVERS=false`. З нею `init`
    показує лише сервери проєкту.
  - Основна робоча сесія — у десктоп-застосунку Claude, і ця змінна до неї не застосовується. Що
    вона підхоплювала і як це виправлено — у розділі «Сесії».

## Сервери

| Сервер | Який доступ | Навіщо нам | Що станеться при компрометації | Чим саме звужено |
|---|---|---|---|---|
| `supabase` | Один проєкт `owtlfrumfipydwpedpid`, 9 інструментів: `list_tables`, `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql`, `get_project_url`, `get_publishable_keys`, `generate_typescript_types`, `search_docs`. `execute_sql` ходить під роллю `postgres` (не superuser): читає й пише будь-які таблиці проєкту | Міграція схеми `leads` і сид 20 лідів для A/B (Task C) | OAuth-токен акаунта. Обмеження `project_ref` і `features` живе в URL, який обирає клієнт (фільтрує хостований сервер), а не в токені. Що дозволяє сам токен поза цим URL, ми не перевіряли, тому вважаємо: усе, на що дано згоду (DDL, дані, ключі). Тому організація одноразова, а дані синтетичні. `claude mcp remove` видаляє лише локальну копію токена; вкрадений токен відкликають на боці Supabase, у налаштуваннях доступу застосунків акаунта | `project_ref=` — лише цей проєкт, без account-інструментів. `features=database,development,docs` — без `account`, `functions`, `branching`. `apply_migration` і `execute_sql` — в `ask`: кожен виклик людина читає, і випадкове «don't ask again» це не скасує: `ask` сильніший за `allow` (`evidence/session-excerpts.md`, 5.5). В `allow` — лише 3 інструменти читання. Для `leads` увімкнено RLS без політик |
| `vercel` | OAuth-токен — це користувач Vercel цілком (скоуп `openid`). Сервер віддає 234 інструменти REST API: деплої, домени й покупки, env-змінні, firewall, видалення проєктів | Знайти деплой і показати лог білду | Деплой довільного коду (preview з публічною адресою), читання й зміна env-змінних, купівля доменів і кредитів з картки команди, видалення проєктів, промоут або відкат production | 11 імен з walkthrough лишили в `deny`, хоча в поточному сервері їх немає. Справжнє звуження дають 54 deny-глоби за дієсловами (`mcp__vercel__create_*`, `delete_*`, `update_*`, `buy_*` …; частина — на дієслова, яких у сервері поки немає) і 9 точних імен: 6 читають токени й env (`get_auth_token`, `get_project_token`, `get_edge_config_token`, `get_project_env`, `filter_project_envs`, `get_shared_env_var`), плюс `list_feature_flag_sdk_keys` (SDK-ключі), `read_session_file` (файли sandbox) і `web_fetch_vercel_url` (завантаження захищених адрес). У сесії 126 інструментів, і за назвами жоден не змінює стан. Обидва переліки — у `docs/mcp/vercel-tools.md`. В `allow` — лише читання деплою й логу: `list_deployments`, `get_deployment`, `get_deployment_build_logs` з walkthrough (у живому сервері його немає) і доданий нами `list_deployment_events` (теж лише читання; саме ним отримано лог білду). CLI не встановлено, плюс deny на `Bash(vercel *)`, `Bash(npx vercel *)`, `Bash(npx -y vercel *)` |
| `playwright` | Chrome у профілі в пам'яті: відкрити сторінку, клікати, вводити, читати DOM, консоль і мережу. Ядро має `browser_run_code_unsafe` (виконання коду в процесі сервера), `browser_evaluate`, а також `browser_file_upload` і `browser_drop`, які читають файли проєкту | Перевірити форму заявки на `localhost:3000` | Токена немає, ризик іде від сторінки. Ін'єкція з її тексту може привести до `browser_navigate` на адресу з даними в query (канал назовні), до виконання коду, до читання `.env.local` через `file_upload`. Сторінка може додати власні інструменти `webmcp_*` | Точна версія `@0.0.82`, `--isolated` (без логінів), `--no-webmcp`, `--allowed-origins http://localhost:3000` (зручність, не межа безпеки: прямий перехід на чужий origin блокує, а серверний 302 з дозволеного — пропускає; `evidence/session-excerpts.md`, 4.3). `deny`: `run_code_unsafe`, `webmcp_*`, `file_upload`, `drop`, `evaluate`; `ask`: `browser_network_request`; в `allow` — 10 точних імен. Ніколи в одній сесії із Supabase чи `leaddesk` |
| `leaddesk` (скоуп `local`, не в `.mcp.json`) | 2 інструменти й 1 ресурс над фікстурою з 20 синтетичних лідів. Читання — 6 полів без імені, email і тексту заявки. Зміна статусу — в пам'яті, з записом аудиту | Доменний сервер Task A, плече B у Task C | Локальний процес під вашим користувачем; змінює лише статуси в пам'яті. HTTP-варіант (E1) слухає `127.0.0.1:3333` без автентифікації: будь-який локальний процес може змінити статус | Статуси — лише enum `LEAD_STATUSES`; на чужий лід чи той самий статус — `isError`; точні версії й lockfile; у git нічого, бо скоуп `local` |

## Supabase: схема й сид

- **Міграція** `supabase/migrations/0001_leaddesk.sql` створює `public.leads`:
  - `check` на п'ять статусів і на формат `^lead_[0-9]{4}$`;
  - RLS увімкнено, політик немає, тож публічний ключ рядків не бачить.
- **Сид** `supabase/seed/leads.sql`: 20 рядків `lead_0001`–`lead_0020`. Скрипт звірив його з
  `materials/leads.json` поле в поле — 0 розбіжностей.
- **Інструментів Supabase в `init`** з нашим URL: 9.
- **Виклики й схвалення** (`session-excerpts.md`, розділ 1). Сесію запущено без `--permission-mode`,
  тож вона йшла в auto mode — режимі за замовчуванням для CLI цього акаунта (`permissionMode: auto` у
  журналі).
  - Без питань (в `allow`): `list_tables` → `{"tables":[]}`, `list_migrations` → `{"migrations":[]}`.
  - Людина погодила план у чаті («Запускати кроки 1 → 2 → 3?» → «так»). Далі пройшли виклики під
    `ask`; чи був окремий діалог перед кожним, журнал не фіксує:
    - `apply_migration "leaddesk"` → `{"success":true}`;
    - `execute_sql` з `insert` усіх 20 рядків;
    - три `execute_sql` для перевірки: 20 рядків, RLS `true`, політик 0; роль `postgres`,
      `is_superuser` → `off`.

## Сесії: що вмикаємо разом

Правило: у кожній сесії — щонайбільше один сервер із правом запису, а браузерний сервер ніколи не
працює разом із Supabase. У CLI-сесіях із запитами до агента його дотримано. У сесії входу (OAuth)
були всі три сервери разом, але агенту нічого не писали (`/exit` одразу після входу). Основна робоча
сесія правило порушувала до 04.10 — див. останній рядок таблиці.

| Крок | Увімкнено в сесії | Сервер із правом запису в цій сесії |
|---|---|---|
| Вхід (OAuth) | `supabase`, `vercel`, `playwright` (схвалення `.mcp.json`, walkthrough, крок 2; `/exit` одразу після входу); агенту нічого не писали | — (агенту нічого не писали; формально `supabase` і `vercel` мають право запису) |
| Міграція й сид | лише `supabase` (`--strict-mcp-config`; режим auto) | `supabase` |
| Лог білду | лише `vercel` (`--strict-mcp-config`; перша сесія — інтерактивна в режимі auto, лог — `claude -p` у режимі `default`) | `vercel`: у першій сесії `create_deployment` ще не був під deny і створив preview (див. verification.md). Лог цього preview — у `evidence/vercel-build-log-preview.txt`; основний `evidence/vercel-build-log.txt` — лог production-деплою з git-інтеграції (`claude -p`, лише читання, 04.10). Preview людина вирішила лишити: у проєкті `ssoProtection` (`all_except_custom_domains`), тож без входу у Vercel він не відкривається. Після звуження записуючих інструментів немає |
| Перевірка форми й знімки «до/після» | лише `playwright` (`claude -p --strict-mcp-config`) | `playwright` (браузер) |
| A/B (Task C) | A — лише `supabase` з `read_only=true`; B — лише `leaddesk` | A — жоден; B — `leaddesk` |
| Основна робоча сесія (десктоп-застосунок Claude, корінь репозиторію; режим auto) | **До 04.10:** `supabase`, `vercel`, `playwright` разом — схвалення з кроку входу записалось у `.claude/settings.local.json` як `enabledMcpjsonServers`; плюс браузерні інструменти самого застосунку. Жодного виклику цих серверів у сесії не було: скрипт перевірив журнали сесії і всіх її субагентів (`verification.md`, «Спостереження…»). **З 04.10:** `disabledMcpjsonServers` з усіма трьома (той самий файл, у `.gitignore`); сесія від'єднала всі три, `claude -p` у корені — `mcp_servers: []` (`session-excerpts.md`, 5.3) | до 04.10 — `supabase` і `vercel` разом із браузером, тобто порушення правила вище (див. `threat-model.md`); з 04.10 — жоден |

## До і після звуження: третій сервер

- **Як отримали перелік.**
  - Нова сесія лише з `playwright`, той самий запит: «Перелічи всі інструменти сервера playwright,
    які тобі зараз доступні. Нічого не викликай.»
  - `claude-opus-5-5`, effort `high`. Жодного виклику не було, і в обох знімках набір збігся з
    `init` (`session-excerpts.md`, 4.1).
  - У «після» агент писав повні імена `mcp__playwright__…`; у файлі вони без префікса, як у «до».
- `docs/mcp/evidence/mcp-before.txt`: **25** інструментів, серед них `browser_run_code_unsafe`.
- `docs/mcp/evidence/mcp-after.txt`: **21** інструмент. Зникли `browser_run_code_unsafe`,
  `browser_file_upload`, `browser_drop`, `browser_evaluate`; `webmcp_*` не було й до того завдяки
  `--no-webmcp`.
- **Атака.** На прохання викликати `browser_run_code_unsafe` і `browser_evaluate` агент отримав від
  `ToolSearch` «No matching deferred tools found»: модель цих інструментів не бачить
  (`session-excerpts.md`, 4.2).
