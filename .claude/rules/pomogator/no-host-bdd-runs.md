# No host BDD/cucumber suite runs — Docker only (hard-enforced)

## Правило (always-apply)

Полный (нефильтрованный) прогон cucumber/BDD-сьюта ОБЯЗАН идти в Docker, НЕ на хосте.
Хостовый полный прогон: (1) исполняет Linux/Docker-only сценарии в чужом окружении → ложные
красные; (2) длится ~70 минут; (3) **перезаписывает канон** `.dev-pomogator/.last-test-run.ndjson`
результатами-артефактами изоляции (параллельные e2e-тесты мутируют общий `settings.json`/`.specs`
во время прогона) → census/вердикт/claim-evidence читают мусор по ВСЕМУ корпусу.

Это cucumber-аналог `tests/setup/ensure-docker.ts` («no bypass by design»), который защищал
ТОЛЬКО vitest-сьют — `node scripts/run-bdd.mjs` (full) и сырой хостовый `cucumber.js` проскакивали
мимо.

## Как правильно

```bash
bash scripts/docker-bdd.sh                          # полный сьют (обновляет канон) — WSL-routed
bash scripts/docker-bdd.sh --name "SPECGEN004_15"   # один сценарий (clobber-safe, канон не трогает)
npm run test:bdd:docker      # то же
/run-tests --docker          # через skill
```

## Что разрешено на хосте: НИЧЕГО (строгий режим, директива владельца)

Решение владельца 2026-06-24: «буквально ничего на машине, всё в Docker». Даже одиночный сценарий
на хосте может дать ложный красный (Linux-only шаги на Windows), поэтому **любой** хостовый запуск
сценарных тестов запрещён — full, `--name`, `--tags`-батч, `--dry-run`, путь, temp-config. Различие
full-vs-filtered больше не действует: на хосте не запускается ничего. Throwaway-режим `run-bdd.mjs`
тоже снят с хоста (он сам отказывается вне Docker).

## Enforcement — ТРИ слоя (defense in depth, проверено live)

1. **PreToolUse-хук** `tools/tui-test-runner/test_guard.ts` (ветка `[test-guard:host-bdd]`) денаит
   **любой** хостовый Bash, запускающий cucumber/run-bdd в ЛЮБОЙ форме:
   - `node scripts/run-bdd.mjs` (full, `--name`, `--tags`, …) → DENY exit 2 → docker-bdd.sh
   - сырой `cucumber.js` / `@cucumber/cucumber` (full, `--name`, `--tags`, `--dry-run`) → DENY → docker-bdd.sh
   - docker-обёрнутый (`docker-bdd.sh`/`docker compose`/`cucumber.docker.json`) → ALLOW;
     prose (`git`/`echo`/…), что лишь УПОМИНАЕТ cucumber → ALLOW.
2. **Runtime-страховка в раннере**: `scripts/run-bdd.mjs` сам отказывается (exit 1) вне Docker
   (`DEV_POMOGATOR_TEST_IN_DOCKER!=1`) — на случай обхода Bash-хука.
3. **Cucumber-уровневый стоп**: `tests/hooks/ensure-docker-bdd.ts` (грузится cucumber'ом из
   `cucumber.json` `import` glob `tests/hooks/**/*.ts` на КАЖДОМ прогоне) бросает на загрузке, если
   `DEV_POMOGATOR_TEST_IN_DOCKER!=1`. Это аналог `tests/setup/ensure-docker.ts` (тот только для
   vitest). Ловит даже прямой `node cucumber.js` в обход хука И run-bdd. Docker-образ метку ставит
   (Dockerfile.test{,.base} ENV + docker-compose.test.yml) → в Docker не падает. No bypass by design.

Слой 1 покрывает Bash-вызовы, слой 2 — вход через run-bdd, слой 3 — сам рантайм cucumber независимо
от точки входа. (Stryker-BDD мутации — отдельный поток: они НЕ пишут канон и грузят свой профиль без
этого guard'а, поэтому не блокируются здесь.)

Матрица закреплена BDD-сценарием SPECGEN004_221 (`tests/step_definitions/feature52_dogfood_hardening.ts`):
full/name/tag-батч/dry-run/run-bdd → deny→docker-bdd; docker-bdd + prose → allow. Прогон guard
вживую через bootstrap: все ноги PASS.

## Инцидент-основание (2026-06-24)

Агент запустил `node scripts/run-bdd.mjs` (полный) на Windows-хосте: 68 минут, exit 1, ~71 упавший
ШАГ (=7 упавших сценариев, все — артефакты изоляции/чужого окружения, не регрессии), и перезаписал
общий канон. Существующий test-guard ловил только clobber частичных прогонов + сырые `npm test`, а
полный хостовый cucumber явно РАЗРЕШАЛ («a FULL real run is fine»). Владелец: «я ж просил сделать
жёсткий блокер не запускать ничего на хосте, через хуки и инструкции». Дыра закрыта этим правилом +
host-bdd веткой guard'а.

## Связанные

- `tests/setup/ensure-docker.ts` — тот же принцип для vitest-сьюта (родитель идеи).
- `.claude/rules/pomogator/no-blocking-on-tests.md` — Docker-прогоны в фоне, не блокировать сессию.
- `.claude/rules/tui-test-runner/centralized-test-runner.md` — тесты только через `/run-tests`.
- Спека: `.specs/spec-generator-v4/` FR-52a (clobber-guard, full-vs-filtered ось).
