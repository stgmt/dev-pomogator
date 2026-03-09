# Non-Functional Requirements (NFR)

## Performance

- NFR-P1: Stop hook timeout не более 60 сек (Haiku ~2-5 сек)
- NFR-P2: JSONL парсинг мгновенный (< 50 мс)
- NFR-P3: UserPromptSubmit hook < 100 мс (чтение state file)

## Security

- NFR-S1: `redactSecrets()` убирает API ключи, Bearer токены, sk-* перед отправкой в LLM
- NFR-S2: State file содержит только подсказку (2-12 слов), не контекст сессии

## Reliability

- NFR-R1: Atomic write state file (temp + rename) — правило `atomic-config-save`
- NFR-R2: Fail-open: exit(0) на любую ошибку, ошибки в stderr
- NFR-R3: TTL предотвращает использование устаревших подсказок

## Usability

- NFR-U1: Подсказка 2-12 слов, на языке сессии
- NFR-U2: User perspective — "я бы это набрал", не "AI рекомендует"
- NFR-U3: 💡 emoji для визуальной заметности
- NFR-U4: Молчание (silence) лучше плохой подсказки
