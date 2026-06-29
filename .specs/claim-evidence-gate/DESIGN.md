# Design

## Реализуемые требования

FR-1..FR-13 (детект + судья + блокер-пруф + режимы + анти-луп + наблюдаемые факты) + новые FR-14, FR-15 (токен судьи + громкое требование).

## Поток (Stop-хук)

1. Прочитать вход (`cwd`, `transcript_path`, `stop_hook_active`); `CLAIM_GATE_ENABLED=false` → approve.
2. `extractTurnWindow` (FR-1): последний текст + tool_uses с последнего реального user-сообщения.
3. `firstUnsupported` (FR-2/FR-3): первый класс заявления без улики → block.
4. Серая зона (FR-8..FR-11): открытая работа сессии (`task-census` scope) + gray-signal → ИИ-судья `judgeStop`.
   - verdict.block → block; verdict===null → **FR-15**: если `judgeAvailable()===false` (нет токена) → block c `buildJudgeNoTokenDemand(openWork)` (видимое требование токена); иначе endpoint-down reason.
5. Анти-луп (FR-6/FR-11): хеш/cooldown/work-delta release; fail-open на любой ошибке → approve.

## Ключевые решения (FR-15)

| Решение | Почему |
|---|---|
| `buildJudgeNoTokenDemand` вынесена в `meridian-judge.ts`, экспортируется | тестируемо без запуска `main()` (хук зовёт main на верхнем уровне); судья-доменная |
| Различать «нет токена» vs «endpoint лежит» через `judgeAvailable()` | юзеру без токена нужно ДРУГОЕ сообщение (подключи), чем при сетевом сбое |
| Требование = block-reason, не stderr | block-reason виден в чате; stderr — нет (корень инцидента) |
| Ограничено FR-11 release | реально оффлайн-юзер не виснет навсегда |

## Reuse

`resolveEndpoint`/`judgeAvailable`/`judgeStop` (`meridian-judge.ts`), `task-census` scope (FR-9), marker-utils анти-луп.

## Project Context & Constraints

> Skipped: brownfield хук в устоявшейся подсистеме (`tools/claim-evidence-gate/`); стек и ограничения фиксированы (Node builtins + esbuild-бандл + Stop-hook контракт). FR-15 — локальная правка поведения, новой архитектуры нет.

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE — pure-function + spawn-the-real-hook тесты, без фикстур/внешнего состояния. Судья-путь пинится judge-bench.ts.

## BDD/Test

`tools/claim-evidence-gate/__tests__/claim-evidence-gate.test.ts` — CEGATE001_17 (текст требования), CEGATE001_18 (token→endpoint flip). Судья-путь пинится judge-bench.ts.

## Judge layer — non-tail exception (FR-23, 2026-06-29)

The Meridian/помогатор LLM judge (`meridian-judge.ts`) is pinned LIVE in `tools/claim-evidence-gate/bench/judge-bench.ts` — a non-deterministic LLM cannot be a deterministic `@featureN` cucumber scenario, so its behaviour is asserted by a majority-of-3 live bench against the real endpoint, NOT a `*.test.ts`. The judge layer is therefore NOT a target of the BDD-only migration (FR-5 of `bdd-only-migration`), and its absence from cucumber is NOT an FR-6 "keep-on-vitest" refusal — it is the genuine non-deterministic-judge exception. Only the DETERMINISTIC gate surface (classifier / evidence-window / blocker-proof / census / game_guard facts — the `CEGATE001` scenarios) is BDD-migratable.
