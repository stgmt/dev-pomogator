# Use Cases

## UC-1: AI checks current spec status before claiming "done" (happy path)

После завершения implementation phase главный AI вызывает `/spec-status` для honest verification перед report'ом пользователю.

- Шаг 1: AI вызывает `Skill("spec-status")` без args
- Шаг 2: Skill autodetects active spec (recent .progress.json + matching plan)
- Шаг 3: Skill invokes Agent(general-purpose) с context bundle (spec slug, plan path, test paths)
- Шаг 4: Sub-agent читает: .progress.json (currentPhase, files completed), plan todos (verification state), .test-status YAML (passed/failed counts + mtime age), git status (modified/staged/pushed)
- Шаг 5: Sub-agent читает тесты в scope, применяет 12-point quality checklist для каждого
- Шаг 6: Sub-agent возвращает structured JSON: { spec, phase, ac_verified, ac_claimed, tests: { strong, weak, blocked }, git, environmental_blockers }
- Шаг 7: Skill отдаёт human-readable markdown отчёт главному AI
- Результат: AI имеет evidence-backed status перед сообщением пользователю — нет overclaim

**Related stories:** US-1, US-2, US-3

## UC-2: User explicitly requests spec status

Пользователь вызывает `/spec-status <slug>` явно для конкретной спеки (например при ревью PR от AI).

- Шаг 1: Пользователь: `/spec-status fix-bg-output-loss`
- Шаг 2: Skill validates spec exists at .specs/fix-bg-output-loss/
- Шаг 3: Same delegation как в UC-1 но с explicit slug
- Шаг 4: Sub-agent отчёт с emphasis on AC traceability — каждый AC mapped to evidence (test file + line OR ⏸ blocked OR ❌ no evidence)
- Результат: Пользователь видит честную картину что AI реально сделал

**Related stories:** US-1, US-3

## UC-3: Environmental block detected during status check

WSL/Docker умер во время implementation, AI бежит /spec-status чтобы понять что blocked.

- Шаг 1: AI вызывает /spec-status
- Шаг 2: Sub-agent делает `docker ps` — exit code != 0 OR error message
- Шаг 3: Sub-agent проверяет .test-status YAML mtime — last update >5 min ago при state=running → stale heartbeat
- Шаг 4: Output содержит секцию "Environmental Blockers" с конкретными ошибками
- Шаг 5: Tests scope marked ⏸ (blocked), не ❌ (failed); message: "Cannot verify until block resolved"
- Результат: AI и пользователь понимают что failure — не код, а infrastructure; не делают wrong fix

**Related stories:** US-4

## UC-4: Sub-agent flags weak tests (fake-positive risk)

Sub-agent finds tests которые passed но qualitatively weak.

- Шаг 1: Sub-agent читает каждый test file в scope
- Шаг 2: Применяет patterns из strong-tests/tests-create-update skill: assertion strength, mock heaviness, edge case coverage
- Шаг 3: Каждый it()-блок classified: STRONG / WEAK / FAKE-POSITIVE-RISK с reason
- Шаг 4: Output: "5/8 strong, 3/8 weak: { line 42: assertion presence-only, не value; line 67: mocks production parser; line 99: no edge case tested }"
- Результат: AI получает actionable feedback что улучшить в тестах перед claim "tests pass = feature done"

**Related stories:** US-3
