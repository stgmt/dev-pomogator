# Post-Merge Cleanup — убрать worktree + ветки + синхронизировать main

## Правило

После того как PR **реально влит** (подтверждено `gh pr view N --json mergedAt` → `mergedAt` non-null, не просто «approved»), агент ОБЯЗАН прибраться за собой в той же сессии:

1. Удалить git worktree, в котором велась работа.
2. Удалить локальную ветку PR.
3. Удалить удалённую ветку (если merge был без `--delete-branch`).
4. Подтянуть локальный `main` до `origin/main` **без** переключения текущего checkout.

Не ждать пинка «прибери worktree» — это рутина закрытия PR, а не отдельная просьба.

## Предусловие (перед merge, не после)

Если полный тест-сьют был частично красным на момент merge — ОБЯЗАН доказать, что падения **предсуществующие**, а не твои, ДО слияния (не «тесты и так красные, вливаю»):

- `git log origin/main..HEAD --name-only` — твоя ветка вообще трогала файлы упавших тестов / их таргеты?
- `git merge-base --is-ancestor origin/main HEAD` — ветка чисто на main?
- Прочитать сами упавшие ассерты — изолированная чужая логика без связи с твоим изменением?

Все три «да» → падения с main, регрессии нет, merge оправдан. Иначе — чинить до merge. См. [[feedback_verify-breadth-not-truncated]] (не объявлять «всё прошло» по усечённому/частичному прогону).

## Безопасная последовательность (запускать из main-репо, НЕ изнутри worktree)

```bash
# 0. Подтвердить, что PR влит
gh pr view <N> --json state,mergedAt   # state=MERGED, mergedAt!=null

# 1. Удалить worktree (--force: внутри обычно gitignored артефакты —
#    Docker .test-status/.docker-status, .dev-pomogator-tmp логи — иначе remove откажет)
git worktree remove --force <path-to-worktree>

# 2. Удалить локальную ветку. ВАЖНО: после squash-merge ветка НЕ ff-merged в main,
#    поэтому `git branch -d` откажет «not fully merged». Использовать -D (мы знаем что влито).
git branch -D <branch>

# 3. Удалить удалённую ветку (если merge был без --delete-branch)
git push origin --delete <branch>

# 4. Синхронизировать локальный main БЕЗ checkout (рабочая копия может быть на другой ветке)
git fetch origin main:main
```

## Грабли (из практики)

- **Из какой папки запускать** — из основного репо, не из удаляемого worktree (иначе «cannot remove current working directory» / cwd повиснет).
- **`-d` vs `-D`** — squash-merge создаёт новый коммит, ветка не становится предком main → `-d` ругается «not fully merged». После подтверждённого merge безопасно `-D`.
- **`--force` на worktree remove** — почти всегда нужен: Docker-прогоны и bg-логи оставляют gitignored файлы, из-за которых `git worktree remove` без force отказывает.
- **Не трогать чужие worktree-ы** — `git worktree list` обычно показывает несколько (параллельные фичи). Удалять ТОЛЬКО свой по точному пути.
- **`git fetch origin main:main`** обновляет локальный ref main, не переключая текущий checkout — безопасно, когда рабочая копия на feature-ветке.
- **`--delete-branch` при merge + локальный worktree** — `gh pr merge --delete-branch` пытается снести и локальную ветку, на которой стоит worktree, и падает. Либо merge без `--delete-branch` + ручная уборка (этот рецепт), либо сначала remove worktree.

## Чеклист

- [ ] PR подтверждён как MERGED (`mergedAt` non-null)
- [ ] (если сьют был красным) доказано что падения предсуществующие — 3 проверки выше
- [ ] worktree удалён (`--force`), только свой
- [ ] локальная ветка удалена (`-D` для squash-merge)
- [ ] удалённая ветка удалена
- [ ] локальный `main` подтянут (`git fetch origin main:main`)
- [ ] `git worktree list` — твоего worktree больше нет, чужие на месте

## История

Создано 2026-05-28 после закрытия PR #19 (honest-status-command, последний из пачки canonical-plugin миграции). Пользователь watched полный цикл (доказательство pre-existing падений → merge → uborka) и потребовал зафиксировать уборку правилом, чтобы стало рутиной. Связано с workflow worktree-setup skill (создаёт worktree-ы, которые этот rule закрывает).
