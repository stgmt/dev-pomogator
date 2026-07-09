# TUI Debug Verification — обязательная проверка compact bar

## Правило

При ЛЮБОМ изменении TUI/statusline/wrapper/docker-test.sh — ОБЯЗАТЕЛЬНО верифицировать compact bar через screenshot второго монитора. НЕ доверять grep по YAML, docker logs или task output.

## Верификация (каждый раз, одной командой)

```bash
# Всё за один вызов: container + YAML + output + screenshot
echo "=== $(date +%H:%M:%S) ===" \
&& docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null | grep devpom || echo "NO CONTAINER" \
&& YAML=$(ls -t .dev-pomogator/.docker-status/status.*.yaml 2>/dev/null | head -1) \
&& grep -E "updated_at:|state:|passed:|failed:|total:" "$YAML" 2>/dev/null \
&& stat --format="%Y" "$YAML" 2>/dev/null | xargs -I{} bash -c 'echo "age: $(( $(date +%s) - {} ))s"' \
&& powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; \$s=[System.Windows.Forms.Screen]::AllScreens|Where-Object{-not \$_.Primary}|Select-Object -First 1; \$b=\$s.Bounds; \$bmp=New-Object System.Drawing.Bitmap(\$b.Width,\$b.Height); \$g=[System.Drawing.Graphics]::FromImage(\$bmp); \$g.CopyFromScreen(\$b.Left,\$b.Top,0,0,(New-Object System.Drawing.Size(\$b.Width,\$b.Height))); \$p='.dev-pomogator/screenshots/tui-'+(Get-Date -Format 'HHmmss')+'.png'; \$bmp.Save(\$p,[System.Drawing.Imaging.ImageFormat]::Png); \$g.Dispose(); \$bmp.Dispose(); Write-Host \$p"
```

Затем Read screenshot и заполнить таблицу:

| Источник | Значение | Совпадает? |
|----------|----------|-----------|
| Screenshot compact bar | {точный текст} | — |
| YAML `passed:` | {N} | ✓/✗ |
| YAML `total:` | {N} | ✓/✗ |
| YAML age | {N}s | < 10s? |
| Container | {status} | alive? |

## Красные флаги (СТОП и исследуй)

- `updated_at` старше 60s при running state → YAML heartbeat мёртв → тесты зависли
- Container Up > 15 min для filtered рана → тесты зависли (stdin hang?)
- Compact bar показывает `0✅` или stale данные → YamlReader читает stale YAML
- `SKIP_BUILD=1` после изменения Docker-related файлов → image старый, fix не в контейнере!
- `passed` не растёт между двумя проверками → зависание на конкретном тесте

## Gotchas из практики

### 1. SKIP_BUILD guard
ПОСЛЕ изменения любого из файлов ниже — `SKIP_BUILD` ЗАПРЕЩЁН:
- `Dockerfile.test`, `docker-compose.test.yml`
- `test_runner_wrapper.ts` / `.cjs`
- `yaml_writer.ts`

Docker image копирует файлы при build. SKIP_BUILD = старый код в контейнере.

### 2. CJS → tsx → TS wrapper stdin chain
`wrapper.cjs` spawns tsx с `stdio`. tsx spawns `test_runner_wrapper.ts`. TS wrapper spawns vitest. Vitest spawns тесты. Тесты spawn hooks.

stdin наследуется по ВСЕЙ цепочке. Если CJS shim использует `stdio: 'inherit'` для stdin — hooks внутри тестов получат stdin привязанный к ENTRYPOINT → `readStdin()` зависает навечно.

Fix: CJS shim ОБЯЗАН использовать `stdio: ['pipe', 'inherit', 'inherit']` для stdin.

### 3. vitest discovery cache конфликт
`vitest list --json` создаёт cache. Следующий `vitest run` может получить stale cache → "No test suite found".

Fix: discovery ОБЯЗАН использовать `--no-cache`.

### 4. vitest discovery file filters
`discoverTestCount()` ОБЯЗАН передавать file filter args из commandArgs в discovery command. Иначе discovery считает ВСЕ тесты проекта (745) а не filtered subset (76).

### 5. Второй монитор
Claude Code терминал на ВТОРОМ мониторе (не primary). Screenshot primary = браузер. Всегда:
```powershell
$s = [Screen]::AllScreens | Where-Object { -not $_.Primary }
```

## Антипаттерн

```
# ❌ "Compact bar показывает прогресс" без screenshot
# ❌ grep YAML без проверки updated_at age
# ❌ SKIP_BUILD после wrapper изменений
# ❌ Говорить "тесты бегут" когда output не растёт
# ❌ Доверять container Up time без проверки output growth
```
