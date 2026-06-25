# Claim-Evidence Gate — Functional Requirements

## Контекст

Stop-хук, который ловит инцидент-первопричину этой фичи: агент презентует РЕЗУЛЬТАТ (таблицу вердиктов fact-check, «работает», «не существует», `[VERIFIED via X]`), которого в этом ходе не производил. Существующие сторожа (pinator) ловят формулировку по словам-триггерам, а не наличие улики. Этот гейт — объединение: один сторож на класс «заявил результат без улики».

Реализация: `tools/claim-evidence-gate/` (`turn_window.ts`, `claim_classifier.ts`, `claim_evidence_gate_stop.ts`, `meridian-judge.ts`). Зарегистрирован в `.claude-plugin/hooks.json` (canonical) + `.claude/settings.json` (dogfood).

## FR (Functional Requirements)

- **FR-1**: Хук SHALL извлекать turn-window — всё после последнего реального user-сообщения (не tool_result): последний assistant-текст (claim) + все `tool_use` (name+input) главной цепочки, ИСКЛЮЧАЯ sidechain-линии.
- **FR-2**: Классификатор SHALL распознавать 4 класса заявлений на `stripCode(text)`: `analysis-verdict` (≥2 строки вердикт-токенов PASS/FAIL/✅/❌), `works-done` («работает/починено/фикс деплоен/тесты зелёные», standalone, не negated, не explainer), `not-found-impossible` («не нашёл/не существует/архитектурно невозможно»), `verified-marker` (`[VERIFIED via X]` на raw-тексте).
- **FR-3**: Гейт SHALL блокировать первый класс, чья улика отсутствует: analysis-verdict/works-done → ≥1 исполнитель (Bash/PowerShell/Task/Agent/mcp); not-found → ≥`CLAIM_GATE_MIN_SEARCH` (default 2) поисковых вызовов (Grep/Glob/WebSearch/WebFetch/octocode/Task); verified-marker → tool_use, чьё имя/вход содержит токен из X.
- **FR-4**: `CLAIM_GATE_ENABLED` SHALL принимать `true` (enforce, **дефолт**), `shadow` (только лог, никогда не блок), `false` (выкл).
- **FR-5**: Каждое срабатывание SHALL дописываться в `.dev-pomogator/.claim-evidence-gate-fires.jsonl` (ts, class, need, tool_uses, claim_snippet, mode, session_id, cwd) — даже в shadow.
- **FR-6**: Гейт SHALL иметь anti-loop (одинаковый claim-hash → approve; > `CLAIM_GATE_MAX_RETRIES` за cooldown → approve), self-marker short-circuit, honor `stop_hook_active`, и fail-open на любой ошибке (вернуть пустой результат).
- **FR-7**: Гейт НЕ ДОЛЖЕН блокировать репорт результата, полученного ПОСЛЕ реального запуска в том же user-ходе (улика в окне) — окно ограничено сообщениями юзера, не ходами ассистента.

### Реализация-2: судить РЕАЛЬНОСТЬ, а не нарратив (решения владельца 2026-06-18)

Судья-слой судил по сообщению агента + глобальному бэклогу — геймабельно (Goodhart). Анализ: `audit-reports/pinator-token-burn-analysis.md`. FR-8..FR-13 — валидированные решения.

- **FR-8**: Промпт судьи (`meridian-judge.ts::buildJudgePrompt`) SHALL ставить НАБЛЮДАЕМЫЕ tool-факты ПЕРВИЧНО; «running tools this turn is IRRELEVANT» SHALL быть снято. Текст агента — вторичный tiebreaker.
- **FR-9**: Предусловие «осталась незакрытая работа» SHALL считаться по SCOPE СЕССИИ (файлы из tool_use Edit/Write/apply_spec_change → spec-папки → open-задачи в них), не по глобальному бэклогу. Сессия без правок спек → scope 0 → гейт НЕ взводится.
- **FR-10**: Вход судьи SHALL включать наблюдаемые факты от ХУКА: число мутирующих tool_use в ходе; менялось ли рабочее дерево (`git diff`/`git status`); есть ли pending background task. Вердикт по ним в первую очередь (FR-8). Git недоступен → fail-open.
- **FR-11**: Гейт SHALL детектить no-progress: 0 мутаций И 0 изменений дерева между киками → release. Сигналы (tool-delta/tree-delta/повтор claim/верификация блокера) комбинируются СКОРИНГОМ. Заявленный блокер требует наблюдаемого пруфа — хук САМ гонит `git diff/log` — иначе дефолт «не заблокирован».
- **FR-12** (DEFERRED): APPROVE-кейс «легитимно жду делегированную фоновую задачу» (`run_in_background` без completion) — сопоставление spawn↔completion не спроектировано; НЕ в первую итерацию.
- **FR-13**: Монитор долгого тула + эскалация к человеку. **РЕАЛИЗОВАНО** в отдельном живом хуке `bg-task-guard` (FR-16, `.specs/bg-task-guard/`): на зависании в окне [3мин,6мин) блок с инструкцией позвать AskUserQuestion (ждать/убить/продолжить), за окном — allow-stop recovery (headless НЕ виснет, HARD_TTL 15мин). Внутри claim-evidence-gate НЕ дублируется. Тесты GUARD002_36/37.

### Реализация-3: громкое требование токена судьи (решение владельца 2026-06-24)

LLM-судья (FR-8) — единственный слой, ловящий хитрые ленивые стопы, которые regex не берёт («что дальше — чинить X или коммит?»). Без токена `resolveEndpoint()` → null, судья молча не запускается, «почему» — ТОЛЬКО в stderr (юзер в чате не видит). Итог: у юзера без токена умный пинатор тихо выключен. Инцидент 2026-06-24: пинатор не дожал «что дальше?»-спихивание, владелец пинал руками.

- **FR-14**: Резолвер токена (`meridian-judge.ts::resolveEndpoint`) SHALL пробовать ключи в порядке: `CLAIM_GATE_JUDGE_KEY` (→ `CLAIM_GATE_JUDGE_URL` или OpenRouter) → `OPENROUTER_API_KEY` → `CLAUDE_MEM_OPENROUTER_API_KEY` → `AUTO_COMMIT_API_KEY` (→ `AUTO_COMMIT_LLM_URL` или `https://aipomogator.ru/go/v1`). Нет ни одного → null → судья не запускается.
- **FR-15**: WHEN серая зона (стоп с открытой работой сессии, gray-signal) AND `resolveEndpoint()` вернул null THEN гейт SHALL разветвить по причине: **(а) НЕТ токена** (`judgeAvailable()===false`) → **НЕ блокировать**, вернуть НЕ-блокирующее предупреждение (`{decision:'approve', systemMessage}`, видимое в чате), которое требует подключить токен аипомогатора + называет точные переменные (`AUTO_COMMIT_API_KEY` / `OPENROUTER_API_KEY` / `CLAIM_GATE_JUDGE_KEY`) и endpoint (`https://aipomogator.ru/go/v1`) — отсутствие токена это config-пробел юзера, не ленивый стоп (решение владельца 2026-06-25: «без токена блокировать не должен, только предупреждать в чате»); **(б) токен ЕСТЬ, но endpoint недоступен** → блокировать fail-closed (класс `judge-unavailable`: юзер подключил судью и ждёт enforcement; ограничено анти-лупом FR-11). «Почему судья не работает» SHALL быть в чате (предупреждение/reason), НЕ только в stderr. Реализация: `buildJudgeNoTokenDemand` + `warn()` (approve+systemMessage) + `judgeAvailable`-развилка. Управляется `CLAIM_GATE_ENABLED` (shadow/false убирают и предупреждение).

### Реализация-4: «Дальше»-блок всегда будит судью (решение владельца 2026-06-25)

Инцидент 2026-06-25: пинатор не пнул announce-and-stop («…Берусь за них? скажи»). Корень (улики: `audit-reports/pinator-no-kick-analysis.md`): судья запускался только при `openWork > 0`, а `openWork` берётся из кэш-снимка task-census, который ОТСТАЁТ от свежеотредактированных спек → `openWork=0` ложно → судья не запускался (доказано: editedSlugs=[claude-mem-integration, claim-evidence-gate, spec-mcp-usability-dogfood], ни одной в census → openWork=0; судья при openTasks=0 блокирует 6/6). Плюс `lastUserPrompt` возвращал СОБСТВЕННЫЙ многострочный блок-окрик гейта как «запрос юзера».

- **FR-17**: WHEN ход заканчивается секцией «Дальше:» (NEXT_SECTION_RE) при gray-signal THEN гейт SHALL эскалировать к судье НЕЗАВИСИМО от `openWork` И `analysisOnly` — именованный next-блок это собственный сигнал агента «анонсировал и встал», а кэш может лгать `openWork=0`. Путь `openWork>0` сохраняет guard `analysisOnly`. Судья сам ОДОБРЯЕТ легитимный отчёт-стоп (нет over-fire). Реализация: чистая `isJudgeArmed` (`meridian-judge.ts`). Тесты: CEGATE001_19/20/21 + judge-bench `next-block-announce-and-stop` (block) / `next-block-legit-report` (approve).
- **FR-18**: WHEN последнее user-сообщение является блок-окриком Stop-хука (первая непустая строка — маркер инъекции ⚠️/📋/«Stop hook feedback») THEN `lastUserPrompt` SHALL пропустить ВСЁ сообщение (не построчно), чтобы продолжение многострочного окрика («Нужно: …») не утекало как «запрос юзера» и не переключало `analysisOnly`. Тест: CEGATE001_38.
- **FR-19** (DONE): `openWork` для session-edited спек, отсутствующих в кэш-снимке census, SHALL считаться по живому TASKS.md (топ-уровневые `- [ ]`, без placeholder'ов/sub-items), fail-open, без rebuild на hot-path. Чинит корень напрямую (openWork 0→реальное на свежей спеке; защищает non-«Дальше» announce-and-stop). Реализация: `liveOpenForUncensusedSlugs` (`task-census.ts`), wired в `openWork`. Тест: CEGATE001_39 (2/0/0). FR-17 остаётся load-bearing.

- **FR-20** (DONE): ранний само-пропуск по ИМЕНИ гейта (`claimText.includes('claim-evidence-gate'|'deferred-work')` → `return approve()`) УДАЛЁН (решение владельца 2026-06-25 «выпиливай эту хуйню»). Он давал бесплатный стоп ЛЮБОМУ отчёту, называющему гейт/спеку/файл по имени — статус-отчёт с открытой работой и без «Дальше:» проскакивал, ничего не проверялось (инцидент 2026-06-25, пруф: `audit-reports/pinator-no-kick-analysis.md`). Тот же класс, что снятие маркеров «пинатор»/«ДОДЕЛЫВАЙ» 2026-06-17. Отчёт ПРО гейт теперь оценивается как любой другой (карв-ауты судьи + standalone-claim guard ловят настоящую мета-дискуссию без blanket-скипа по имени). `SELF_MARKER` (только ПРЕФИКС блок-причины) сохранён; `!claimText.trim()` сохранён. Тест: CEGATE001_40. Доказано: тот самый инцидент-отчёт теперь блокируется (no-next-section, openWork=4 через FR-19).

## NFR (Non-Functional Requirements)

- **Performance**: синхронно, без сети/subprocess в быстром слое; пропуск линий >1MB; Stop-таймаут (<5s).
- **Security**: snippet усечён до 200 символов; per-repo marker/fires scoping через cwd; токен не логируется и не в reason (только имена переменных).
- **Reliability**: fail-open везде; atomic marker write; corrupt JSONL-линии пропускаются; self-contained бандл.
- **Usability**: причина блока простым языком + что прогнать + подсказка `[UNVERIFIED]`; env kill-switch (`false`).

## Out of Scope

- Улика в ПРЕДЫДУЩЕМ user-ходе — known limitation.
- Семантическая проверка claim↔tool в быстром слое — гейт лексический/структурный для скорости (судья — отдельный слой).
