# Claim-Evidence Gate (pinator)

Stop-хук, который ловит ленивый стоп / спихивание / заявленный-но-непроверенный результат и пинает агента доделать.

## Что делает (кратко)

- Ловит заявления результата без улики (вердикт/«работает»/«не нашёл»/`[VERIFIED]`) — FR-1..FR-3, FR-7.
- ИИ-судья (помогатор/Haiku) ловит хитрые ленивые стопы по наблюдаемым фактам — FR-8..FR-11.
- Непроверенный блокер → блок (FR-11); обязательная секция «Дальше».
- Режимы `CLAIM_GATE_ENABLED` (enforce/shadow/false), анти-луп, fail-open — FR-4..FR-6.
- **FR-14/FR-15 (нов.): без токена аипомогатора умный судья выключен — гейт ГРОМКО требует подключить токен в чате**, а не молчит в stderr.

## Где код

`tools/claim-evidence-gate/` (`claim_evidence_gate_stop.ts`, `meridian-judge.ts`, `claim_classifier.ts`, `turn_window.ts`); бандл `claim_evidence_gate_stop.bundle.mjs`. Регистрация: `.claude-plugin/hooks.json` + `.claude/settings.json` (Stop). Долгие задачи/эскалация — в `bg-task-guard` (FR-13).

## Тесты

`tools/claim-evidence-gate/__tests__/claim-evidence-gate.test.ts` (CEGATE001_01..18) + judge-bench.

## Связанные

- [`.specs/bg-task-guard/FR.md`](../../bg-task-guard/FR.md) — монитор фоновых задач + эскалация (FR-16).
- [`.specs/prompt-suggest/`](../../prompt-suggest/FR.md) — sibling «следующий шаг» хук.
- Superseded by live [`.specs/pinator/`](../../pinator/README.md).
