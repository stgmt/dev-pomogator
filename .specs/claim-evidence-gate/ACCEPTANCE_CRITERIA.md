# Claim-Evidence Gate — Acceptance Criteria (EARS)

Покрытие тестами: `tools/claim-evidence-gate/__tests__/claim-evidence-gate.test.ts` (CEGATE001_01..16),
сценарии: `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature`.

## analysis-verdict (FR-1, FR-3)

- **AC-1**: WHEN последнее сообщение содержит вердикт-grid (≥2 строки PASS/FAIL) AND в turn-window нет исполнитель-инструмента THEN хук SHALL вернуть `{decision:"block"}`. *(CEGATE001_01)*
- **AC-2**: WHEN тот же grid AND Bash выполнялся в этом ходе THEN хук SHALL вернуть `{}`. *(CEGATE001_02)*
- **AC-3**: IF вердикт-токены находятся ТОЛЬКО внутри ```fenced``` блока THEN analysis-verdict НЕ детектится. *(CEGATE001_13)*

## works-done (FR-2, FR-3)

- **AC-4**: WHEN сообщение утверждает «всё работает» AND нет исполнителя в ходе THEN хук SHALL заблокировать. *(CEGATE001_03)*
- **AC-5**: WHEN сообщение лишь резюмирует правку без works-claim («Готово, можно тестировать») THEN хук SHALL вернуть `{}`. *(CEGATE001_04)*
- **AC-6**: IF works-фраза negated («не работает») THEN works-done НЕ детектится. *(CEGATE001_14)*

## not-found-impossible (FR-3)

- **AC-7**: WHEN сообщение утверждает «не существует» AND поисков < 2 THEN хук SHALL заблокировать. *(CEGATE001_05)*
- **AC-8**: WHEN «не существует» AND поисков ≥ 2 THEN хук SHALL вернуть `{}`. *(CEGATE001_06)*

## verified-marker (FR-3)

- **AC-9**: WHEN текст содержит `[VERIFIED via npm test]` AND нет tool_use, совпадающего с «npm test» THEN хук SHALL заблокировать. *(CEGATE001_07)*
- **AC-10**: WHEN тот же маркер AND Bash «npm test» выполнялся THEN хук SHALL вернуть `{}`. *(CEGATE001_08)*

## Режимы, anti-loop, fail-open (FR-4, FR-5, FR-6, FR-7)

- **AC-11**: IF `CLAIM_GATE_ENABLED=shadow` THEN хук SHALL вернуть `{}` AND дописать запись в fires.jsonl. *(CEGATE001_09)*
- **AC-12**: IF `CLAIM_GATE_ENABLED=false` THEN хук SHALL вернуть `{}` без анализа. *(CEGATE001_10)*
- **AC-13**: IF transcript_path отсутствует THEN хук SHALL вернуть `{}` (fail-open). *(CEGATE001_11)*
- **AC-14**: IF `stop_hook_active=true` THEN хук SHALL вернуть `{}` (no re-block). *(CEGATE001_12)*
- **AC-15**: WHEN Bash выполнялся ДО последнего user-сообщения, но не после THEN turn-window НЕ засчитывает его как улику. *(CEGATE001_15)*
- **AC-16**: WHEN сообщение содержит inline-код и цитату THEN stripCode удаляет их до классификации. *(CEGATE001_16)*

## Громкое требование токена судьи (FR-14, FR-15)

- **AC-17**: WHEN gray-zone стоп (открытая работа сессии + gray-signal) AND ни один из `CLAIM_GATE_JUDGE_KEY`/`OPENROUTER_API_KEY`/`CLAUDE_MEM_OPENROUTER_API_KEY`/`AUTO_COMMIT_API_KEY` не задан THEN хук SHALL **НЕ блокировать**, а вернуть `{decision:"approve", systemMessage}`, systemMessage которого требует подключить токен аипомогатора + называет точные переменные + endpoint `https://aipomogator.ru/go/v1` (решение владельца 2026-06-25: без токена — только предупреждение в чате, стоп проходит). *(CEGATE001_17)*
- **AC-18**: WHEN тот же gray-zone стоп AND токен задан THEN ветка «нет токена» НЕ срабатывает (управление уходит реальному LLM-судье). *(CEGATE001_18)*
