# Audit Category 4: РУДИМЕНТЫ (Rudiments)

**Что это:** Устаревшая информация — уже закрытые open questions, client-side требования в серверных спеках, устаревшие TODO и ссылки.

## Checks

1. Проверить RESEARCH.md на open questions (`- [ ]`) которые уже имеют ответ в других файлах спеки
2. Проверить нет ли client-side требований в серверной спеке (и наоборот) — scope creep
3. Проверить нет ли устаревших ссылок, TODO которые уже сделаны, или дублирующих UC

## Remediation

Для каждого finding:

- Open question с ответом → закрыть `- [x] {вопрос} → {ответ из секции X}` ИЛИ удалить
- Client-side concern в server spec → переместить в отдельную spec ИЛИ пометить `> OUT OF SCOPE — separate frontend spec`
- Устаревший TODO (уже сделано) → удалить или заменить на checkbox-готово
- Дублирующий UC → объединить с оригиналом

## Severity

WARNING — открытые вопросы с известным ответом, scope creep.

## Escape

Если open question действительно нерешён, но не блокирует Phase 3 — пометить:

```markdown
> DEFERRED: {причина}
- [ ] {open question}
```

Validator OPEN_QUESTIONS правило игнорирует `- [ ]` если предыдущая строка содержит `> DEFERRED:`.

## Связанные правила

- [`validation-rules.md`](validation-rules.md) — `OPEN_QUESTIONS`
