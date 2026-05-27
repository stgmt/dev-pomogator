# answer-simple Schema

**N/A** — у этой фичи нет dedicated data schema. См. DESIGN.md > Компоненты для описания artifacts (rule файл + skill файл + manifest JSON), и DESIGN.md > Алгоритм для workflow самопроверки.

Никаких JSON envelopes, data contracts между layers, или validation rules на data shapes в этом extension нет — он чисто declarative: markdown rule (instructions для агента) + markdown skill (instructions для slash-команды) + минимальный JSON manifest (стандартный extension.json format уже описан в `.claude/rules/extension-manifest-integrity.md`).
