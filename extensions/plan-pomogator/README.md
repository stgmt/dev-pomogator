# plan-pomogator

Единый набор правил и инструментов для plan‑pomogator планов.

## Что устанавливает

### Rules
- Cursor: `.cursor/rules/plan-pomogator.mdc`
- Claude Code: `.claude/rules/plan-pomogator.md`

### Tools
- `.dev-pomogator/tools/plan-pomogator/`:
  - `requirements.md` — требования к формату
  - `template.md` — копипаст‑шаблон
  - `validate-plan.ts` — ручной валидатор структуры

## Быстрый старт
```
npx tsx .dev-pomogator/tools/plan-pomogator/validate-plan.ts <path-to-plan.md>
```
