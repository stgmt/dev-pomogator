# Environmental Blocker Is Not a Stop — fix the env, then the gate

## Правило

Любой environmental сбой на тест-гейте (Docker buildx hang, WSL crash `0x80072...`, timeout,
network, чистая нехватка места под build cache) **НЕ является причиной** пометить gate как
`BLOCKED`/«environmental_blocker» и заклеймить работу сделанной. Environmental plopus = вы ещё
**не прогоняли** целевой сьют — вердикт RED/NOT_READY остаётся в силе, пока не выполнен зелёный
прогон (или не найден **конкретный спек-баг файл:строка**, который и есть настоящий RED).

Остановка на «окружение не дало прогон» подменяет честный RED на «не проверил» и маскирует
недоделку.

## Когда применяется

- `npm test` / `docker-bdd.sh` / `/run-tests` падает ДО выполнения сценариев (билд, таймаут, WSL).
- Пометка `.feature` в фиче-статусе как BLOCKED из-за среды.
- Любой «runner didn't produce results» при наличии конкретного окружения-фикса.

## Правильный порядок

1. **Проверить живость окружения**: `wsl --shutdown` + refresh, `docker version`, `docker ps`.
2. **Диагностировать корень**: `docker system prune` (у нас был build cache ~29GB), `docker buildx ls`,
   `docker compose build` exit-код, `git.exe` из Windows-git-bridge в buildx (git-контекст).
3. **Сузить прогон**: `scripts/docker-bdd.sh --name <OUR_SLUG>` (целевые сценарии) вместо полного
   сьюта 50+ features — быстрее и изолирует наш gate.
4. **Догнать до зелёного** ИЛИ до спек-бага (файл:строка), который и объявляем RED.
5. Откатывать окружение до рабочего (prune/rebuild/перезапуск WSL) — покачивать, не архивировать.

Запрещено: «environment blocked» как финальный статус spec/feature; закоммит с `Status: BLOCKED` по
причине среды без повтора через фикс окружения; считать live-smoke заменой Docker-BDD-gate.

## Связанные

- `.carl/rules/pomogator/no-blocking-on-tests.md` — не блокировать сессию, background+tee.
- `.carl/rules/pomogator/no-host-bdd-runs.md` — BDD только в Docker; но это не «запрет чинить Docker».
- Memory: `feedback_env-blocker-is-not-a-stop-fix-the-env.md`.

## Инцидент

2026-08-15: docker-bdd полный прогон оборвался WSL (`0x80072 74c`), целевой — завис на buildx
(`git.exe` контекст). Я поместил BLOCKED вместо ретрая с `docker system prune`/целевой фильтрацией.
Владелец: «это не блокер, ты должен такое чинить».