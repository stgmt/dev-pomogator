#!/usr/bin/env node
/**
 * PreToolUse Hook — Reqnroll Cucumber Expression Slash Guard
 *
 * Blocks Write/Edit of .cs files with Reqnroll step definitions where:
 *   - Pattern has NO regex metacharacters (auto-detected as Cucumber Expression by Reqnroll 2.x)
 *   - Pattern contains unescaped `/` (becomes alternative operator in CE, causes parser errors)
 *
 * Example violation:
 *   [When(@"я запрашиваю список через /v1/models")]
 *                                      ^^^ unescaped / → CE alternative → "Alternative may not be empty"
 *
 * Fixes:
 *   A) Add ^$ anchors to force regex detection: [When(@"^text /path$")]
 *   B) Escape / for CE: [When(@"text \/path")]
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (violation found)
 *
 * Fail-open: any error → exit(0)
 */

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;      // For Write tool
    new_string?: string;   // For Edit tool
    [key: string]: unknown;
  };
}

interface Violation {
  line: number;
  keyword: string;   // Given|When|Then|And
  pattern: string;   // Resolved pattern string
  slashIndex: number; // Position of unescaped `/`
}

/**
 * Regex indicators — if ANY appear in the resolved pattern, Reqnroll treats as regex (not CE).
 * Cucumber Expression parameter types like {int}, {string}, {word} use {...} not ().
 */
const REGEX_INDICATORS: RegExp[] = [
  /\(/,        // any paren → regex group (CE uses {param})
  /\[/,        // bracket → regex character class
  /\\d/,       // \d digit shorthand
  /\\w/,       // \w word char shorthand
  /\\s/,       // \s whitespace shorthand
  /\\b/,       // \b word boundary
  /\\\./,      // \. escaped dot
  /\\\+/,      // \+ escaped plus
  /\\\?/,      // \? escaped question
  /\\\*/,      // \* escaped star
  /\.[*+?]/,   // .* .+ .?
];

/** Check if resolved pattern contains regex-only constructs */
function hasRegexIndicators(pattern: string): boolean {
  if (pattern.startsWith('^') || pattern.endsWith('$')) return true;
  return REGEX_INDICATORS.some((rx) => rx.test(pattern));
}

/**
 * Resolve C# string literal to its actual value.
 *   verbatim=true  → @"..." — only "" is escape for "
 *   verbatim=false → "..."  — standard C# escapes (\\ \" \n \t \r)
 */
function resolveString(raw: string, verbatim: boolean): string {
  if (verbatim) {
    return raw.replace(/""/g, '"');
  }
  return raw
    .replace(/\\\\/g, '\x00')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\x00/g, '\\');
}

/** Find first unescaped `/` in resolved pattern; returns position or -1 */
function findUnescapedSlash(pattern: string): number {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '/' && (i === 0 || pattern[i - 1] !== '\\')) {
      return i;
    }
  }
  return -1;
}

/** Scan content for Reqnroll CE slash violations */
function analyzeContent(content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split('\n');

  // Match [Given|When|Then|And(...)] at any indent, with optional "Attribute" suffix
  const attrRegex = /\[\s*(Given|When|Then|And)(?:Attribute)?\s*\(/;
  const verbatimRegex = /^\s*@"((?:[^"]|"")*)"/;
  const regularRegex = /^\s*"((?:[^"\\]|\\.)*)"/;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const attrMatch = attrRegex.exec(line);
    if (!attrMatch) continue;

    const keyword = attrMatch[1];
    const afterOpen = line.slice((attrMatch.index ?? 0) + attrMatch[0].length);

    let pattern: string | null = null;
    const vMatch = verbatimRegex.exec(afterOpen);
    if (vMatch) {
      pattern = resolveString(vMatch[1], true);
    } else {
      const rMatch = regularRegex.exec(afterOpen);
      if (rMatch) {
        pattern = resolveString(rMatch[1], false);
      }
    }

    if (pattern === null) continue;

    // Skip if pattern is regex (will match `/` as literal)
    if (hasRegexIndicators(pattern)) continue;

    // Pattern is Cucumber Expression — check for unescaped `/`
    const slashIdx = findUnescapedSlash(pattern);
    if (slashIdx >= 0) {
      violations.push({
        line: lineIdx + 1,
        keyword,
        pattern,
        slashIndex: slashIdx,
      });
    }
  }

  return violations;
}

/** Build actionable deny message */
function buildDenyMessage(filePath: string, violations: Violation[]): string {
  const lines: string[] = [];
  lines.push(`🚫 Reqnroll CE Slash Guard: ${violations.length} violation(s) in ${filePath}`);
  lines.push('');

  for (const v of violations) {
    lines.push(`  line ${v.line}: [${v.keyword}(@"${v.pattern}")]`);
    lines.push(`    └─ unescaped "/" at position ${v.slashIndex} — Reqnroll 2.x parses as Cucumber Expression alternative`);
  }

  lines.push('');
  lines.push('Почему это баг:');
  lines.push('  Паттерн БЕЗ regex-метасимволов (.*, ^$, \\d, скобок) Reqnroll интерпретирует');
  lines.push('  как Cucumber Expression. В CE `/` = оператор альтернативы (как "yes/no").');
  lines.push('  Если `/path` в начале → пустая левая ветка → "Alternative may not be empty".');
  lines.push('  Если `a/b` внутри → матч идёт по альтернативам "a" ИЛИ "b", не как literal.');
  lines.push('');
  lines.push('Фикс — выбери один:');
  lines.push('  A) Добавить ^$ anchors (форсит regex-детекцию, минимально-инвазивный):');
  lines.push('     [When(@"^я запрашиваю GET /v1/models$")]');
  lines.push('');
  lines.push('  B) Эскейпить "/" как "\\/" (правильный CE-escape):');
  lines.push('     [When(@"я запрашиваю GET \\/v1\\/models")]');
  lines.push('');
  lines.push('См. правило: .claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md');

  return lines.join('\n');
}

async function main(): Promise<void> {
  // TTY check — interactive mode, not a hook invocation
  if (process.stdin.isTTY) {
    process.exit(0);
  }

  let inputData = '';
  for await (const chunk of process.stdin) {
    inputData += chunk.toString();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  let data: PreToolUseInput;
  try {
    data = JSON.parse(inputData);
  } catch {
    process.exit(0);
  }

  // Only guard Write/Edit
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') {
    process.exit(0);
  }

  const filePath = data.tool_input?.file_path;
  if (!filePath || !filePath.endsWith('.cs')) {
    process.exit(0);
  }

  // Extract content from tool_input (differs between Write and Edit)
  const content = data.tool_name === 'Write'
    ? data.tool_input?.content
    : data.tool_input?.new_string;

  if (typeof content !== 'string' || content.length === 0) {
    process.exit(0);
  }

  // Fast path — no step definition attributes → allow
  if (!/\[\s*(Given|When|Then|And)/.test(content)) {
    process.exit(0);
  }

  const violations = analyzeContent(content);
  if (violations.length === 0) {
    process.exit(0);
  }

  const denyMessage = buildDenyMessage(filePath, violations);
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[reqnroll-ce-guard] ${denyMessage}`,
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// Fail-open wrapper: any uncaught error → allow
main().catch(() => {
  process.exit(0);
});
