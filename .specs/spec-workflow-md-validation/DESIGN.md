# Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Cursor / Claude                         │
│                    beforeSubmitPrompt                        │
│                    UserPromptSubmit                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ stdin: JSON
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   validate-specs.ts                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ readStdin   │→ │ findSpecs   │→ │ checkCompleteness   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                              │               │
│                                              ▼               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  For each complete spec                  ││
│  │  ┌───────────┐  ┌───────────────┐  ┌─────────────────┐  ││
│  │  │ MD Parser │→ │ Feature Parser│→ │    Matcher      │  ││
│  │  └───────────┘  └───────────────┘  └─────────────────┘  ││
│  │                                              │           ││
│  │                                              ▼           ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │                    Reporter                          │││
│  │  │  - validation-report.md                              │││
│  │  │  - stdout warnings                                   │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. validate-specs.ts (Entry Point)

```typescript
interface HookInput {
  conversation_id: string;
  workspace_roots: string[];
  prompt?: string;
}

async function main(): Promise<void>
```

Responsibilities:
- Read JSON from stdin
- Find .specs/ folder
- Check config for enabled: false
- Orchestrate validation pipeline
- Handle errors gracefully

### 2. completeness.ts

```typescript
const REQUIRED_MD_FILES = [
  'ACCEPTANCE_CRITERIA.md', 'CHANGELOG.md', 'DESIGN.md',
  'FILE_CHANGES.md', 'FR.md', 'NFR.md', 'README.md',
  'REQUIREMENTS.md', 'RESEARCH.md', 'TASKS.md',
  'USE_CASES.md', 'USER_STORIES.md'
];

interface SpecCompleteness {
  isComplete: boolean;
  specPath: string;
  specName: string;
  missingFiles: string[];
  featureFile: string | null;
}

function checkCompleteness(specDir: string): SpecCompleteness
function findCompleteSpecs(specsRoot: string): SpecCompleteness[]
```

### 3. parsers/md-parser.ts

```typescript
interface MdTag {
  tag: string;           // @feature1
  source: string;        // FR-1, AC-1, UC-1
  file: string;          // FR.md
  line: number;          // 15
  text: string;          // Full heading text
}

function parseMdFile(filePath: string): MdTag[]
function parseMdFiles(spec: SpecCompleteness): MdTag[]
```

Parses:
- `## FR-N: {Title} @featureN`
- `## AC-N (FR-N): {Title} @featureN`
- `## UC-N: {Title} @featureN`

### 4. parsers/feature-parser.ts

```typescript
interface FeatureTag {
  tag: string;           // @feature1
  scenario: string;      // Scenario name
  file: string;          // spec.feature
  line: number;          // 25
}

function parseFeatureFile(filePath: string): FeatureTag[]
```

Parses:
- `# @featureN` before Scenario

### 5. matcher.ts

```typescript
type MatchStatus = 'COVERED' | 'NOT_COVERED' | 'ORPHAN';

interface MatchResult {
  tag: string;
  status: MatchStatus;
  mdSource?: MdTag;
  featureSource?: FeatureTag;
}

function matchTags(mdTags: MdTag[], featureTags: FeatureTag[]): MatchResult[]
```

Logic:
- Tag in MD but not in .feature → NOT_COVERED
- Tag in .feature but not in MD → ORPHAN
- Tag in both → COVERED

### 6. reporter.ts

```typescript
interface ReportOptions {
  specPath: string;
  specName: string;
  results: MatchResult[];
}

function generateReport(options: ReportOptions): void
function printWarnings(results: MatchResult[]): void
```

Generates:
- `.specs/{name}/validation-report.md`
- stdout warnings for NOT_COVERED and ORPHAN

## Data Flow

```
stdin (JSON) 
    → parse workspace_roots
    → find .specs/ folder
    → check .specs-validator.yaml
    → for each subdir in .specs/:
        → check 13 required files
        → if complete:
            → parse FR.md, ACCEPTANCE_CRITERIA.md, USE_CASES.md
            → extract @featureN tags
            → parse *.feature
            → extract # @featureN tags
            → match tags
            → generate validation-report.md
            → print warnings to stdout
```

## File Locations

| Component | Path |
|-----------|------|
| Source | `extensions/specs-workflow/tools/specs-validator/` |
| Installed | `~/.dev-pomogator/scripts/validate-specs.ts` |
| Report | `.specs/{feature}/validation-report.md` |
| Logs | `~/.dev-pomogator/logs/specs-validator.log` |
