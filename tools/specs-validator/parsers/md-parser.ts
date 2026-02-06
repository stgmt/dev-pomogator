/**
 * MD File Parser
 * 
 * Extracts @featureN tags from MD files (FR.md, ACCEPTANCE_CRITERIA.md, USE_CASES.md)
 */

import fs from 'fs';
import path from 'path';
import type { SpecCompleteness } from '../completeness';

/**
 * Represents a @featureN tag found in an MD file
 */
export interface MdTag {
  /** The tag itself, e.g., "@feature1" */
  tag: string;
  /** The source identifier, e.g., "FR-1", "AC-1", "UC-1" */
  source: string;
  /** The file where the tag was found */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Full heading text */
  text: string;
}

/**
 * Regex patterns for parsing MD headings
 */
const PATTERNS = {
  // ## FR-1: Title @feature1
  fr: /^##\s+FR-(\d+):\s*(.+?)(?:\s+(@feature\d+))?$/,
  // ## AC-1 (FR-1): Title @feature1
  ac: /^##\s+AC-(\d+)\s*\(FR-\d+\):\s*(.+?)(?:\s+(@feature\d+))?$/,
  // ## UC-1: Title @feature1
  uc: /^##\s+UC-(\d+):\s*(.+?)(?:\s+(@feature\d+))?$/,
  // Generic @featureN pattern
  featureTag: /@feature(\d+)/g,
};

/**
 * MD files to parse for @featureN tags
 */
const MD_FILES_TO_PARSE = [
  'FR.md',
  'ACCEPTANCE_CRITERIA.md',
  'USE_CASES.md',
];

/**
 * Parse a single MD file for @featureN tags
 * 
 * @param filePath - Absolute path to the MD file
 * @returns Array of found tags
 */
export function parseMdFile(filePath: string): MdTag[] {
  const tags: MdTag[] = [];
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    return tags;
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return tags;
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Try to match FR pattern
    const frMatch = line.match(PATTERNS.fr);
    if (frMatch) {
      const [, num, title] = frMatch;
      // Extract all @featureN from the line
      const allTags = extractAllFeatureTags(line);
      for (const featureTag of allTags) {
        tags.push({
          tag: featureTag,
          source: `FR-${num}`,
          file: fileName,
          line: lineNumber,
          text: title.trim(),
        });
      }
      continue;
    }

    // Try to match AC pattern
    const acMatch = line.match(PATTERNS.ac);
    if (acMatch) {
      const [, num, title] = acMatch;
      const allTags = extractAllFeatureTags(line);
      for (const featureTag of allTags) {
        tags.push({
          tag: featureTag,
          source: `AC-${num}`,
          file: fileName,
          line: lineNumber,
          text: title.trim(),
        });
      }
      continue;
    }

    // Try to match UC pattern
    const ucMatch = line.match(PATTERNS.uc);
    if (ucMatch) {
      const [, num, title] = ucMatch;
      const allTags = extractAllFeatureTags(line);
      for (const featureTag of allTags) {
        tags.push({
          tag: featureTag,
          source: `UC-${num}`,
          file: fileName,
          line: lineNumber,
          text: title.trim(),
        });
      }
      continue;
    }

    // For other lines, just check if they contain @featureN
    // This catches tags in other places like USER_STORIES.md or TASKS.md
    if (line.includes('@feature')) {
      const allTags = extractAllFeatureTags(line);
      for (const featureTag of allTags) {
        tags.push({
          tag: featureTag,
          source: 'other',
          file: fileName,
          line: lineNumber,
          text: line.trim().substring(0, 100), // Truncate long lines
        });
      }
    }
  }

  return tags;
}

/**
 * Extract all @featureN tags from a line
 */
function extractAllFeatureTags(line: string): string[] {
  const tags: string[] = [];
  const regex = /@feature\d+/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    tags.push(match[0]);
  }
  return tags;
}

/**
 * Parse all relevant MD files in a spec
 * 
 * @param spec - Spec completeness result
 * @returns Array of all found tags
 */
export function parseMdFiles(spec: SpecCompleteness): MdTag[] {
  const allTags: MdTag[] = [];

  for (const mdFile of MD_FILES_TO_PARSE) {
    const filePath = path.join(spec.specPath, mdFile);
    const tags = parseMdFile(filePath);
    allTags.push(...tags);
  }

  return allTags;
}

/**
 * Get unique tags from MD files (deduplicated by tag name)
 */
export function getUniqueMdTags(tags: MdTag[]): Map<string, MdTag> {
  const uniqueTags = new Map<string, MdTag>();
  
  for (const tag of tags) {
    // Keep the first occurrence of each tag
    if (!uniqueTags.has(tag.tag)) {
      uniqueTags.set(tag.tag, tag);
    }
  }

  return uniqueTags;
}
