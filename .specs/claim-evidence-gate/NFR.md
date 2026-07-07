# Non-Functional Requirements

## Performance

Синхронно, без сети/subprocess в быстром слое; пропуск линий >1MB; укладывается в Stop-таймаут (<5s). ИИ-судья — единственный сетевой вызов, только в серой зоне, с одним ретраем; нет токена → мгновенный null (без сети).

## Security

Snippet усечён до 200 символов; per-repo marker/fires scoping через `cwd`; токен судьи читается из env/.env, не логируется и не попадает в reason (в требовании — только ИМЕНА переменных, не значения).

## Reliability

Fail-open везде (любая ошибка → `{}`); atomic marker write; corrupt JSONL-линии пропускаются; бандл self-contained (esbuild) → работает у юзеров без `node_modules`; warn-on-failure wrapper в манифесте.

## Usability

Причина блока простым языком с конкретным следующим шагом; FR-15 — требование токена с точными переменными + endpoint; env kill-switch `CLAIM_GATE_ENABLED=false`; `shadow` для тихого аудита.
