# Архитектура

## Обзор

```
┌─────────────────────────────────────────────────────────────┐
│                        Stop Event                            │
│                   (Cursor / Claude)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    validate-steps.ts                         │
│                    (Entry Point)                             │
├─────────────────────────────────────────────────────────────┤
│  1. Read stdin (hook input)                                  │
│  2. Find workspace roots                                     │
│  3. Check config (.steps-validator.yaml)                     │
│  4. Detect language                                          │
│  5. Parse step files                                         │
│  6. Analyze quality                                          │
│  7. Generate report                                          │
│  8. Print warnings                                           │
└─────────────────────────────────────────────────────────────┘
```

## Структура файлов

```
extensions/specs-workflow/tools/steps-validator/
├── validate-steps.ts          # Entry point (main)
├── types.ts                   # Интерфейсы и типы
├── config.ts                  # Загрузка .steps-validator.yaml
├── detector.ts                # Определение языка проекта
├── parsers/
│   ├── index.ts               # Фабрика парсеров
│   ├── typescript-parser.ts   # Парсер TS step definitions
│   ├── python-parser.ts       # Парсер Python step definitions
│   └── csharp-parser.ts       # Парсер C# step definitions
├── analyzer.ts                # Анализ качества степов
├── reporter.ts                # Генерация Markdown отчёта
└── logger.ts                  # Логирование ошибок
```

## Компоненты

### 1. Entry Point (validate-steps.ts)

```typescript
async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const workspaceRoots = input.workspaceRoots || [process.cwd()];
    
    for (const root of workspaceRoots) {
      await validateProject(root);
    }
  } catch (error) {
    await logError(error);
    process.exit(0); // Не блокируем пользователя
  }
}

async function validateProject(root: string): Promise<void> {
  // 1. Check config
  const config = await loadConfig(root);
  if (!config.enabled) return;
  
  // 2. Detect language
  const language = await detectLanguage(root, config);
  if (!language) return;
  
  // 3. Parse steps
  const parser = getParser(language);
  const steps = await parser.parseAll(root, config);
  
  // 4. Analyze quality
  const results = analyzeSteps(steps, config);
  
  // 5. Generate report
  await generateReport(root, results);
  
  // 6. Print warnings
  printWarnings(results);
}
```

### 2. Types (types.ts)

```typescript
export type Language = 'typescript' | 'python' | 'csharp';
export type StepType = 'Given' | 'When' | 'Then' | 'And' | 'But';
export type QualityStatus = 'GOOD' | 'WARNING' | 'BAD';

export interface StepDefinition {
  type: StepType;
  pattern: string;
  file: string;
  line: number;
  functionName: string;
  body: string;
}

export interface AnalyzedStep extends StepDefinition {
  quality: StepQuality;
}

export interface StepQuality {
  status: QualityStatus;
  hasAssertion: boolean;
  isEmpty: boolean;
  isPending: boolean;
  hasOnlyLogging: boolean;
  hasTodo: boolean;
  issues: string[];
}

export interface ValidationResult {
  language: Language;
  totalSteps: number;
  steps: AnalyzedStep[];
  summary: {
    good: number;
    warning: number;
    bad: number;
  };
}

export interface ValidatorConfig {
  enabled: boolean;
  stepPaths: Record<Language, string[]>;
  customAssertions: Record<Language, string[]>;
  ignore: string[];
  onBadSteps: 'warn' | 'error' | 'ignore';
  strictness: Record<StepType, 'high' | 'low' | 'inherit'>;
}
```

### 3. Detector (detector.ts)

```typescript
export async function detectLanguage(
  root: string, 
  config: ValidatorConfig
): Promise<Language | null> {
  // Check TypeScript
  const tsPatterns = config.stepPaths.typescript;
  for (const pattern of tsPatterns) {
    const files = await glob(pattern, { cwd: root });
    if (files.length > 0) return 'typescript';
  }
  
  // Check Python
  const pyPatterns = config.stepPaths.python;
  for (const pattern of pyPatterns) {
    const files = await glob(pattern, { cwd: root });
    if (files.length > 0) return 'python';
  }
  
  // Check C#
  const csPatterns = config.stepPaths.csharp;
  for (const pattern of csPatterns) {
    const files = await glob(pattern, { cwd: root });
    if (files.length > 0) return 'csharp';
  }
  
  return null;
}
```

### 4. TypeScript Parser (parsers/typescript-parser.ts)

```typescript
const STEP_PATTERN = /(Given|When|Then|And|But)\s*\(\s*['"`](.+?)['"`]\s*,\s*(async\s+)?(?:function\s*\(|(?:\([^)]*\)\s*=>))/g;

export class TypeScriptParser implements Parser {
  async parseFile(filePath: string): Promise<StepDefinition[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const steps: StepDefinition[] = [];
    
    let match;
    while ((match = STEP_PATTERN.exec(content)) !== null) {
      const type = match[1] as StepType;
      const pattern = match[2];
      const startIndex = match.index;
      const line = this.getLineNumber(content, startIndex);
      const body = this.extractBody(content, startIndex);
      const functionName = this.extractFunctionName(content, startIndex);
      
      steps.push({
        type,
        pattern,
        file: filePath,
        line,
        functionName,
        body,
      });
    }
    
    return steps;
  }
  
  private extractBody(content: string, startIndex: number): string {
    // Find opening brace/arrow and extract until closing
    // Handle nested braces
    // ...
  }
}
```

### 5. Analyzer (analyzer.ts)

```typescript
const ASSERTION_PATTERNS: Record<Language, RegExp[]> = {
  typescript: [
    /\bexpect\s*\(/,
    /\.toBe\(/,
    /\.toEqual\(/,
    /\.toContain\(/,
    /\.toHaveText\(/,
    /\bassert\s*\(/,
  ],
  python: [
    /\bassert\s+/,
    /pytest\.raises/,
    /\.should\./,
  ],
  csharp: [
    /\bAssert\./,
    /\.Should\(\)/,
    /\bExpect\(/,
  ],
};

const BAD_PATTERNS: Record<Language, RegExp[]> = {
  typescript: [
    /^\s*console\.(log|warn|error)\s*\(/m,
    /^\s*return\s*;?\s*$/m,
    /throw\s+new\s+Error\s*\(\s*['"]Pending/,
  ],
  python: [
    /^\s*pass\s*$/m,
    /^\s*print\s*\(/m,
    /^\s*return\s*$/m,
  ],
  csharp: [
    /^\s*Console\.Write/m,
    /ScenarioContext\.StepIsPending/,
    /throw\s+new\s+PendingStepException/,
  ],
};

export function analyzeStep(
  step: StepDefinition, 
  language: Language,
  config: ValidatorConfig
): AnalyzedStep {
  const issues: string[] = [];
  
  // Check if empty
  const isEmpty = step.body.trim().length === 0 || 
                  step.body.trim() === 'pass' ||
                  step.body.trim() === '{}';
  
  // Check for assertions
  const assertionPatterns = [
    ...ASSERTION_PATTERNS[language],
    ...(config.customAssertions[language] || []).map(p => new RegExp(p)),
  ];
  const hasAssertion = assertionPatterns.some(p => p.test(step.body));
  
  // Check for bad patterns
  const hasBadPattern = BAD_PATTERNS[language].some(p => p.test(step.body));
  const hasOnlyLogging = hasBadPattern && !hasAssertion;
  
  // Check for pending/TODO
  const hasTodo = /TODO|FIXME/i.test(step.body);
  const isPending = /Pending|StepIsPending|NotImplemented/i.test(step.body);
  
  // Determine status
  let status: QualityStatus = 'GOOD';
  
  if (step.type === 'Then') {
    // Then MUST have assertion
    if (isEmpty) {
      status = 'BAD';
      issues.push('Empty body');
    } else if (!hasAssertion) {
      status = 'BAD';
      issues.push(hasOnlyLogging ? 'Only logging, no assertion' : 'No assertion found');
    }
  }
  
  if (hasTodo) {
    status = status === 'BAD' ? 'BAD' : 'WARNING';
    issues.push('TODO/FIXME comment found');
  }
  
  if (isPending) {
    status = status === 'BAD' ? 'BAD' : 'WARNING';
    issues.push('Pending implementation');
  }
  
  return {
    ...step,
    quality: {
      status,
      hasAssertion,
      isEmpty,
      isPending,
      hasOnlyLogging,
      hasTodo,
      issues,
    },
  };
}
```

### 6. Reporter (reporter.ts)

```typescript
export async function generateReport(
  root: string, 
  result: ValidationResult
): Promise<void> {
  const reportPath = path.join(root, 'steps-validation-report.md');
  
  const content = `# Steps Validation Report

Generated: ${new Date().toISOString()}
Language: ${result.language}

## Summary

| Status | Count |
|--------|-------|
| ✅ GOOD | ${result.summary.good} |
| ⚠️ WARNING | ${result.summary.warning} |
| ❌ BAD | ${result.summary.bad} |

**Total steps analyzed:** ${result.totalSteps}

---

${generateBadSection(result)}

${generateWarningSection(result)}

${generateGoodSection(result)}
`;

  await fs.writeFile(reportPath, content);
}

export function printWarnings(result: ValidationResult): void {
  const badSteps = result.steps.filter(s => s.quality.status === 'BAD');
  
  if (badSteps.length === 0) return;
  
  console.log(`⚠️ Steps Validation: Found ${badSteps.length} bad steps (Then without assertions)`);
  
  for (const step of badSteps.slice(0, 5)) {
    console.log(`   - ${step.file}:${step.line} ${step.type}('${step.pattern}')`);
  }
  
  if (badSteps.length > 5) {
    console.log(`   ... and ${badSteps.length - 5} more`);
  }
  
  console.log('See steps-validation-report.md for details.');
}
```

## Диаграмма потока данных

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  .steps.ts   │     │  _steps.py   │     │  *Steps.cs   │
│    files     │     │    files     │     │    files     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  TypeScript  │     │    Python    │     │     C#       │
│    Parser    │     │    Parser    │     │    Parser    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ StepDefinition[] │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │    Analyzer      │
                   │ (check quality)  │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ AnalyzedStep[]   │
                   └────────┬─────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
     ┌──────────────┐            ┌──────────────┐
     │   Reporter   │            │    stdout    │
     │ (markdown)   │            │  (warnings)  │
     └──────────────┘            └──────────────┘
              │
              ▼
     ┌──────────────────────┐
     │ steps-validation-    │
     │ report.md            │
     └──────────────────────┘
```

## Обработка ошибок

```typescript
// logger.ts
export async function logError(error: Error): Promise<void> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const logDir = path.join(homeDir, '.dev-pomogator', 'logs');
  const logFile = path.join(logDir, 'steps-validator.log');
  
  await fs.mkdir(logDir, { recursive: true });
  
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ERROR: ${error.message}\n${error.stack}\n\n`;
  
  await fs.appendFile(logFile, logEntry);
}
```
