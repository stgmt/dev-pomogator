# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Спека architecture-decision-builder: 16 FR, 16 AC (EARS), 18 CHK, 9 Key Decisions, SCHEMA (PolicyId + Insight + policy_fit/correction_log/selected_policy), 17 BDD scenarios (@feature1..@feature17), 35 TASKS (TDD-порядок)
- FR-11 Eval suite: 2-слойный debug/benchmark (deterministic CLI evals + qualitative rubric R1-R23 с R3 anti-hallucination); golden bench scenario-bhph
- **FR-16 Selection policy** (default `mvp-poc`): рекомендация зависит от цели проекта — 5 политик (mvp-poc/production-grade/cost-optimal/scale-ready/portability), `policy_fit[]` per variant, demonstration-таблица «вариант × политика», policy-badge. Default mvp-poc = проще/быстрее → time-to-market↓
- **FR-13 Cross-axis synthesis**: команда `synthesis` собирает AXIS-*.md → emergent insights поперёк осей (≥2 axis-id), SYNTHESIS.md+html. Главный кейс bhph «Variant F» был emergent
- **FR-14 Correction-log**: опц. `VariantModel.correction_log[]` → секция `## Corrections` (reasoning journey, рендерится только при непустом)
- **FR-15 Live context7**: дисциплина в SKILL.md — `[VERIFIED via context7:<lib> <ver>]` вместо second-hand фактов; allowed-tools += context7 MCP
- rubric R21 (policy-selected) / R22 (policy-demonstration) / R23 (cross-axis-synthesis); eval-10 synthesis + eval-11 policy
- **R24 two-lens + scorecard + reality (BLOCKING)** — каждый вариант несёт `business_summary` (бизнес-линза: получаешь/срок/цена/риск), `scorecard[]` (имплементатор-линза → карта-сравнение критерии × варианты с цветовой оценкой: Стоимость/Лёгкость интеграции/Кривая обучения/Ops/SSL-HTTPS/Масштаб/lock-in/экосистема) и `reality_check[]` («из реала»: SSL+certbot+renew, бэкапы+restore, мониторинг, secrets, обновления ОС, склейка). Рендерится в HTML+md. Фикс обратной связи «html малоинформативно, две роли не разделены, источников мало, не подсвечивает реал»

### Changed
- FR-4 + FR-7: Phase 1.75 теперь auto-mode по умолчанию — авто-применение рекомендации без блокирующего STOP на каждой оси (паттерн «делай/начинай»); interactive-mode opt-in через `--interactive`. Override через финальный batch-review
- extension.json specs-workflow v1.21.0 → v1.22.0 (synthesis.ts + SYNTHESIS.md.template в toolFiles)

### Fixed
- N/A

## [0.1.0] - TBD

### Added
- Initial implementation (планируется): subskill + 9 helper scripts + 2 rules + 2 templates + create-spec Phase 1.75 integration + ARCHITECTURE_COVERAGE audit category
