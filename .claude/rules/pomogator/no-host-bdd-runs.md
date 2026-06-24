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

## Что разрешено на хосте (harm-precise: full-vs-filtered)

Вред наносит ТОЛЬКО полный прогон (пишет канон, чужое окружение). **Фильтрованный** хостовый
прогон (`--name`/`--tags`/`--dry-run`) через `node scripts/run-bdd.mjs` уходит в throwaway, канон
не трогает, идёт секунды — он РАЗРЕШЁН (быстрая итерация по одному сценарию). Поэтому блокируется
именно полный (нефильтрованный) хостовый запуск, а не любой.

## Enforcement (hook + проверено live)

PreToolUse-хук `tools/tui-test-runner/test_guard.ts` (ветка `[test-guard:host-bdd]`) денаит Bash,
который на хосте запускает полный cucumber/run-bdd:
- `node scripts/run-bdd.mjs` (без фильтра) → DENY exit 2 → docker-bdd.sh
- сырой `cucumber.js` / `@cucumber/cucumber` (без фильтра) → DENY exit 2 → docker-bdd.sh
- фильтрованный run-bdd → ALLOW; docker-обёрнутый (`docker-bdd.sh`/`docker compose`/
  `cucumber.docker.json`) → ALLOW; prose (`git`/`echo`/…), что лишь УПОМИНАЕТ cucumber → ALLOW.

Матрица закреплена BDD-сценарием SPECGEN004_221 (`tests/step_definitions/feature52_dogfood_hardening.ts`),
включая регресс-ногу на точную команду инцидента (full `run-bdd.mjs` → deny). Прогон guard вживую
через bootstrap: все ноги PASS.

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
