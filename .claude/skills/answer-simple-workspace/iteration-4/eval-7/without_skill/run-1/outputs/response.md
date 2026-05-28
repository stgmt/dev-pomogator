Понял задачу. Ниже разбор плана с акцентом на ключевой нерешённый вопрос (rollback vs skip).

## Краткий статус плана

Структура шагов (staging → verify → prod batch-by-batch) разумная — стандартный canary-подход. Но есть критичный gap: **не определена политика обработки failure на per-tenant уровне**. Это нужно решить ДО запуска, потому что от ответа зависит дизайн самого migration script (idempotency, transaction boundaries, state tracking).

## Главный вопрос: rollback vs skip per-tenant

Это не бинарный выбор. Зависит от двух факторов:

### Фактор 1: атомарность миграции внутри tenant'а
- **Если миграция per-tenant атомарна** (всё или ничего, например через DB transaction): failure → tenant остаётся на старой схеме → можно безопасно **skip** и продолжить остальных, разобраться позже.
- **Если миграция per-tenant НЕ атомарна** (multi-step, частичное состояние возможно): failure → tenant в broken state → **rollback обязателен**, иначе следующий deploy на этом tenant'е словит inconsistency.

### Фактор 2: independence tenant'ов друг от друга
- **Tenants независимы** (shared-nothing): можно skip и продолжить — failed tenant изолирован.
- **Tenants шарят что-то** (shared schema registry, cross-tenant references): возможно нужен полный rollback батча.

## Рекомендация (если оба фактора в нашу пользу)

Если миграция атомарна per-tenant И tenants независимы — **continue-on-failure with quarantine**:

1. Migration script помечает failed tenant как `migration_status=failed` и продолжает следующего.
2. Failed tenant'ы не получают deploy v0.3.1 (feature flag по migration_status).
3. После prod rollout — отдельный manual triage failed tenant'ов.

Это лучше чем "rollback всего батча" — один странный tenant не блокирует release для остальных.

## Что добавил бы в план перед Friday

1. **Pre-flight на staging**: прогнать миграцию НЕ только на чистом staging, а на снапшоте production data (хотя бы выборке legacy pre-v0.2 tenants). Edge case ловится только на реальных данных.
2. **Idempotency check**: migration script должен быть повторно запускаемым без побочных эффектов — иначе retry после failure невозможен.
3. **Dry-run mode**: запуск с `--dry-run` логирует что было бы сделано, без записи. Обязательно для prod batches.
4. **Backup/snapshot перед каждым prod batch** — даже если решим "skip on failure", нужна точка отката если что-то системное сломается.
5. **Metrics/alerts**: per-batch success rate, время миграции на tenant, count of legacy-format tenants. Без этого "verify all tenants мигрированы" — ручная боль.
6. **Batch size policy**: первый prod batch — 1-2 tenant'а (canary), потом постепенное увеличение. Не равные батчи.

## Вопросы которые нужно закрыть до Friday

1. Миграция per-tenant атомарна? (DB transaction или multi-step?)
2. Сколько tenants в pre-v0.2 формате? (если 2-3 — можно вручную, если 200 — нужна автоматика)
3. Есть ли SLA на downtime per-tenant во время миграции?
4. Кто owner на triage failed tenants после rollout?
5. Возможен ли rollback v0.3.1 deploy если массовый failure обнаружится только в prod?

## Если кратко — мой ответ на вопрос "rollback или skip"

**Skip с quarantine** при условии что миграция атомарна per-tenant. Rollback всего батча — только если обнаружится >5-10% failure rate (signal что проблема системная, не tenant-specific).

Нужно ли расписать конкретные шаги для migration script (idempotency pattern, status tracking schema), или сначала закроем вопросы по фактору 1 (атомарность)?
