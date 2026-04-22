# Create-Specs-BDD-Enforcement Schema

## DetectionResult (bdd-framework-detector.ts return type)

```typescript
interface DetectionResult {
  language: 'csharp' | 'typescript' | 'python' | null;
  framework: 'Reqnroll' | 'SpecFlow' | 'Cucumber.js' | 'Playwright BDD' | 'Behave' | 'pytest-bdd' | null;
  installCommand: string | null;
  hookFileHints: string[];
  configFileHint: string | null;
  fixturesFolderHint: string | null;
  evidence: string[];
  suggestedFrameworks: Framework[];
}
```

- `language`: detected primary language of target test-project (heuristic over `.csproj`/`package.json`/`requirements.txt`/`pyproject.toml`).
- `framework`: detected installed BDD framework or `null` (remediation target).
- `installCommand`: actual shell command for Phase 0 task #1 (e.g. `dotnet add package Reqnroll && dotnet add package Reqnroll.xUnit`).
- `hookFileHints`: ordered list of hook stub file paths per framework convention.
- `configFileHint`: framework config file (e.g. `reqnroll.json`, `cucumber.js`, `behave.ini`, `pytest.ini`).
- `fixturesFolderHint`: conventional folder for test fixtures.
- `evidence`: human-readable grep-strings (path + line + snippet) — written to DESIGN.md `**Evidence:**` field.
- `suggestedFrameworks`: when `framework=null`, fallback list ordered by preference per language.

## .progress.json schema v2

```typescript
interface ProgressFile {
  version: 2;                               // bumped from 1
  featureSlug: string;
  createdAt: string;
  currentPhase: 'Discovery' | 'Context' | 'Requirements' | 'Finalization' | 'Complete';
  phases: {
    Discovery:    { completedAt: string | null; stopConfirmed: boolean; stopConfirmedAt: string | null };
    Context:      { completedAt: string | null; stopConfirmed: boolean; stopConfirmedAt: string | null };
    Requirements: {
      completedAt: string | null;
      stopConfirmed: boolean;
      stopConfirmedAt: string | null;
      bddInfraClassificationComplete: boolean;     // NEW v2
      bddFrameworkSelected: string | null;          // NEW v2 (framework name)
    };
    Finalization: { completedAt: string | null; stopConfirmed: boolean; stopConfirmedAt: string | null };
  };
}
```

Migration v1 → v2: `ensureProgressStateSchema()` (см. specs-generator-core.mjs) добавляет `bddInfraClassificationComplete: false` + `bddFrameworkSelected: null` при чтении старого файла. Backward compatible.

## DESIGN.md `## BDD Test Infrastructure` поля (formal)

| Field | Type | Required | Allowed values |
|-------|------|----------|----------------|
| `**TEST_DATA:**` | string | yes | `TEST_DATA_ACTIVE` \| `TEST_DATA_NONE` |
| `**TEST_FORMAT:**` | string | yes | `BDD` (default) \| `UNIT` (escape hatch) |
| `**Framework:**` | string | required if TEST_FORMAT=BDD | `Reqnroll` \| `SpecFlow` \| `Cucumber.js` \| `Playwright BDD` \| `Behave` \| `pytest-bdd` \| `N/A` (при UNIT) |
| `**Install Command:**` | string | required if TEST_FORMAT=BDD | actual shell command или literal `"already installed"` |
| `**Evidence:**` | string | required if TEST_FORMAT=BDD | grep evidence или reference на RESEARCH.md |
| `**Verdict:**` | string | yes | свободный текст |

Validator `BDD_INFRA_CLASSIFICATION_COMPLETE` (severity ERROR) проверяет все required поля + если TEST_FORMAT=UNIT → требует непустую `## Risks` секцию ≥30 chars в DESIGN.md.

## Правила валидации

- Validator: severity **ERROR** (exit code 1) для missing required полей.
- State machine: `commandConfirmStop(Requirements)` блокирует переход с exit code 1 + actionable blocker если поля missing.
- Backward compat: legacy `**Classification:**` поле принимается с WARNING (migrate to `**TEST_DATA:**`).
