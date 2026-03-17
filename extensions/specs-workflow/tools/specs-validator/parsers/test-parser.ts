/**
 * Test File Parser
 *
 * Extracts test case IDs (CODE_NN format) from .test.ts files
 * and @featureN tags from test comments.
 */

import fs from 'fs';
import path from 'path';

/**
 * Represents a test case found in a .test.ts file
 */
export interface TestCase {
  /** Test case ID, e.g., "CTXMENU001_01" */
  id: string;
  /** Full test name from it() */
  name: string;
  /** The .test.ts file where found */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** @featureN tag if present (from comment above it()) */
  featureTag?: string;
}

// Regex patterns
const PATTERNS = {
  // it('CTXMENU001_01: description', or it("CODE_NN: desc",
  testCase: /^\s*it\(\s*['"](\w+_\d+)[:\s]/,
  // // @feature1
  featureTagComment: /^\s*\/\/\s*(@feature\d+)/,
  // describe('DOMAIN_CODE: Description'
  describeBlock: /^\s*describe\(\s*['"](\w+):\s/,
};

/**
 * Parse a .test.ts file for test case IDs
 */
export function parseTestFile(filePath: string): TestCase[] {
  const cases: TestCase[] = [];
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    return cases;
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return cases;
  }

  const lines = content.split('\n');
  let pendingFeatureTag: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for @featureN comment
    const tagMatch = line.match(PATTERNS.featureTagComment);
    if (tagMatch) {
      pendingFeatureTag = tagMatch[1];
      continue;
    }

    // Check for it('CODE_NN: ...')
    const testMatch = line.match(PATTERNS.testCase);
    if (testMatch) {
      const id = testMatch[1];
      // Extract full test name
      const nameMatch = line.match(/it\(\s*['"](.+?)['"]/);
      const name = nameMatch ? nameMatch[1] : id;

      cases.push({
        id,
        name,
        file: fileName,
        line: lineNumber,
        featureTag: pendingFeatureTag,
      });

      pendingFeatureTag = undefined;
      continue;
    }

    // Reset pending tag if we hit a non-empty, non-comment line
    if (line.trim() && !line.trim().startsWith('//')) {
      pendingFeatureTag = undefined;
    }
  }

  return cases;
}

/**
 * Extract the describe block domain code (e.g., "CTXMENU001" from describe('CTXMENU001: ...'))
 */
export function extractDomainCode(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(PATTERNS.describeBlock);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Find the .test.ts file for a given extension name
 * Convention: tests/e2e/{extension-name}.test.ts
 */
export function findTestFile(testsDir: string, extensionName: string): string | null {
  const candidates = [
    path.join(testsDir, `${extensionName}.test.ts`),
    path.join(testsDir, `${extensionName.replace(/-/g, '_')}.test.ts`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Also search by domain code in describe blocks
  try {
    const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.ts'));
    for (const file of files) {
      const filePath = path.join(testsDir, file);
      const domainCode = extractDomainCode(filePath);
      if (domainCode && domainCode.toLowerCase().includes(extensionName.replace(/-/g, '').toLowerCase())) {
        return filePath;
      }
    }
  } catch {
    // ignore
  }

  return null;
}
