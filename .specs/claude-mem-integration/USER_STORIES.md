# User Stories

### User Story 1: Бесшовная установка памяти (Priority: P1)

As a пользователь dev-pomogator, I want claude-mem устанавливаться и настраиваться автоматически одним поддерживаемым способом, so that память начинает работать без ручной сборки разрозненных компонентов.

**Требование:** [FR-1](FR.md#fr-1-bootstrap-decision-feature1), [FR-2](FR.md#fr-2-non-interactive-install-command-feature2), [FR-3](FR.md#fr-3-idempotency-and-backoff-feature3)

**Why:** Непинованная и распределённая между bootstrap, upstream installer и hook manifests установка создаёт дрейф и ложный успех.

**Independent Test:** Docker BDD `CMEM001_INSTALL` запускает настоящий bootstrap в чистом HOME/USERPROFILE и проверяет exact pinned artifact, plugin manifest, worker config и повторный no-op.

**Acceptance Scenarios:**

Given чистый пользовательский HOME без claude-mem
When SessionStart bootstrap выполняет установку
Then зарегистрирована поддерживаемая pinned версия с ожидаемыми provider, model и worker runtime

Given claude-mem уже установлен и корректно настроен
When следующий SessionStart запускает bootstrap
Then установка не повторяется и существующая конфигурация не повреждается

### User Story 2: Единая настройка и диагностика (Priority: P1)

As a сопровождающий dev-pomogator, I want bootstrap, doctor и runtime использовать один контракт обнаружения и конфигурации claude-mem, so that они не противоречат друг другу о состоянии установки и worker.

**Требование:** [FR-5](FR.md#fr-5-doctor-detection-feature5), [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6)

**Why:** Installed-state detection сейчас продублирован между bootstrap и doctor, а worker port и MCP ownership разбросаны между upstream settings, hooks и тестами.

**Independent Test:** Docker BDD `CMEM001_CONFIG` меняет isolated manifest, settings и worker state и проверяет одинаковый результат bootstrap detector, `C-CMEM` и `C-CMEM-W`.

**Acceptance Scenarios:**

Given plugin manifest содержит claude-mem и worker settings используют нестандартный порт
When bootstrap и doctor проверяют состояние
Then оба используют одну конфигурацию и сообщают согласованный статус

Given manifest отсутствует, но остались только stale worker artifacts
When central detector проверяет установку
Then он отличает установленный plugin от остаточного runtime state и выдаёт actionable remediation

### User Story 3: Не блокировать работу при падении worker (Priority: P1)

As a пользователь Claude Code, I want недоступный claude-mem worker приводить только к пропуску memory context, so that каждый prompt не зависает до внешнего 60-секундного timeout.

**Требование:** [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4), [FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7)

**Why:** Issues #92/#93 подтверждают, что root cause находится в доступности worker request, а не в размере store, credentials или Chroma.

**Independent Test:** Real installed `session-init` вызывается против responsive и black-hole TCP fixtures; black-hole path завершается до внутреннего deadline без context, positive control возвращает context.

**Acceptance Scenarios:**

Given worker принимает соединение, но не отвечает
When настоящий session-init запрашивает context
Then запрос abort-ится по внутреннему deadline и hook возвращает fail-open

Given worker отвечает до deadline
When настоящий session-init выполняется
Then обычный memory context сохраняется

### User Story 4: Проверяемая Docker и Windows поддержка (Priority: P1)

As a релиз-инженер, I want deterministic Docker tests и отдельный real-install profile покрывать Linux, Windows/WSL и installed artifact, so that green результат доказывает поставляемое поведение, а не мок или отключённый hook.

**Требование:** [FR-2](FR.md#fr-2-non-interactive-install-command-feature2), [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4), [FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7)

**Why:** Default Docker profile сейчас не запускает real installer и legacy CORE019/PLUGIN002 contracts расходятся с текущими endpoint и worker architecture.

**Independent Test:** Default Docker BDD проходит на offline fixtures; explicit network profile устанавливает exact pinned artifact; Windows reaper сценарии используют captured process snapshot и record-only kill seam.

**Acceptance Scenarios:**

Given default Docker suite без сетевого доступа
When запускаются claude-mem lifecycle scenarios
Then install decision, config, worker health, hook matrix и timeout проверяются детерминированными fixtures

Given explicit real-install profile с сетью
When bootstrap устанавливает pinned artifact в isolated HOME
Then проверяются manifest, MCP/worker registration, health и повторная идемпотентность

### User Story 5: Безопасное восстановление Windows worker (Priority: P2)

As a Windows пользователь, I want dev-pomogator устранять только подтверждённый orphaned claude-mem port holder, so that worker восстанавливается без убийства чужих процессов.

**Требование:** [FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7)

**Why:** Локальная mitigation #75 уже GREEN и должна остаться ограниченной sub-spec, а не расширяться до общего process killer.

**Independent Test:** `CMEMMID001_01`–`CMEMMID001_06` проходят через реальный hook launcher с synthetic OS snapshot и record-only kill seam.

**Acceptance Scenarios:**

Given порт 37777 удерживает orphaned процесс с claude-mem signature и мёртвым родителем
When health reaper выполняется
Then завершается только подтверждённое orphan tree и очищается failure state

Given владелец порта жив или не относится к claude-mem
When health reaper выполняется
Then ни один процесс не завершается
