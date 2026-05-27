# Phase 1: Discovery

**Файлы:** USER_STORIES.md, USE_CASES.md, RESEARCH.md
**Цель:** Определить кто, зачем, что — до того как обсуждать формальные требования.

## Step 0 (только в Jira-mode)

Если `.specs/{slug}/JIRA_SOURCE.md` существует — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 1 (extract roles, user goals, reproduction flow). Если файла нет — пропустить.

## Pre-Write Verification Checklist (ОБЯЗАТЕЛЬНО)

Перед написанием USER_STORIES/USE_CASES/RESEARCH — выполнить **3 минимальные** проверки. Полный 8-пункт checklist в [`phase2_requirements-and-design.md`](phase2_requirements-and-design.md); для Discovery достаточно:

### CL-1: Memory-aware context priming

ДО первого Write — выполнить:

```bash
# Derive project-encoded cwd: Claude Code заменяет '/', '\', ':' на '-' в pwd
# Пример: D:\repos\dev-pomogator → D--repos-dev-pomogator
encoded=$(pwd | sed 's|[:/\\]|-|g')
ls ~/.claude/projects/${encoded}/memory/feedback_*.md 2>/dev/null
```

Если файлы существуют — **прочитать каждый Read tool-ом**. Они содержат active constraints для этой spec (no-hardcoded patterns, env-first patterns, anti-patterns user wants avoided). Применять при написании USER_STORIES "Why" / "Independent Test" + RESEARCH "Risk Assessment".

### CL-2: Verify external file paths cited in RESEARCH.md

Каждый file path упоминаемый в `RESEARCH.md "Где лежит реализация"` — Read tool сначала. Без verified content — НЕ писать claim про architecture / behavior этого файла. (Phase 2 расширяет это на CLI + API claims.)

### CL-3: Verify CLI commands cited in independent tests

Каждый CLI command в USER_STORIES "Independent Test" (`gh ...`, `git ...`, `node ...`) — Bash `--help` first. Цитировать relevant usage в RESEARCH.md. Без verification — claim не пишется.

---

После этих 3 пунктов — приступать к Алгоритму ниже. Полный checklist в Phase 2 reference.

## Алгоритм

1. **Создать структуру:** `.dev-pomogator/tools/specs-generator/scaffold-spec.ts -Name "{feature-slug}"` — создаст 13 файлов в `.specs/{slug}/`.

2. **Опросить пользователя о целях и ролях.** В Jira-mode — уточнить только то, что НЕ покрыто `JIRA_SOURCE.md` (не переспрашивать reporter).

3. **Заполнить USER_STORIES.md** — вызвать `Skill("discovery-forms")` (extension specs-workflow). Skill заполняет USER_STORIES.md блоками с Priority + Why + Independent Test + Acceptance Scenarios и добавляет `## Risk Assessment` таблицу в RESEARCH.md. Если skill недоступен (spec не v3) — заполнить вручную в том же v3-формате (hook `user-story-form-guard` блокирует Write без Priority/Why/IT/AC).

4. **Заполнить USE_CASES.md** — UC-1 (happy path) + edge cases. Каждый UC должен быть связан с одной или несколькими User Stories.

5. **Заполнить RESEARCH.md** (если нужен ресерч). **ВАЖНО:** на этом шаге вызвать `Skill("research-workflow")` чтобы делегировать технические находки и верификацию гипотез standalone-skill'у:

   ```
   Skill("research-workflow")
   ```

   `research-workflow` skill пройдёт 4 фазы (Уточнение → Исследование → Верификация → Отчёт) и вернёт verifed findings — их вписать в `RESEARCH.md` секцию `## Технические находки`. В Jira-mode секция `## Problem` ссылается на `JIRA_SOURCE.md`: `См. JIRA_SOURCE.md ## Description (Verbatim)` — не дублировать текст. Секция `## Risk Assessment` уже добавлена `discovery-forms` skill'ом на шаге 3 — при ручном заполнении hook `risk-assessment-guard` требует ≥2 non-placeholder rows.

6. **Проверить статус:** `.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}"`

## STOP #1

Перед STOP-точкой вывести Executive Summary в чат:

```markdown
## 💬 Ключевые решения Phase 1: Discovery

- Решение 1 (1 строка)
- Решение 2
- Решение 3 (max 5 bullets)

Подтверди для перехода в Phase 1.5. Детали: [USER_STORIES.md](USER_STORIES.md), [USE_CASES.md](USE_CASES.md), [RESEARCH.md](RESEARCH.md).
```

После подтверждения пользователем:

```
.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Discovery
```

## Progress display

После каждого заполненного файла (USER_STORIES, USE_CASES, RESEARCH) выводить:

```
📊 Spec Progress: {slug} — Phase 1/4: Discovery
Files: {done}/{total} complete — Next: {next_action}
```

## Next phase

После STOP #1 → перейти к [`phase1.5_project-context.md`](phase1.5_project-context.md).
