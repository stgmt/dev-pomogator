/**
 * Feature File Parser
 * 
 * Extracts @featureN tags from .feature files (Gherkin)
 */

import fs from 'fs';
import path from 'path';

/**
 * Represents a @featureN tag found in a .feature file
 */
export interface FeatureTag {
  /** The tag itself, e.g., "@feature1" */
  tag: string;
  /** The Scenario name that follows the tag */
  scenario: string;
  /** The file where the tag was found */
  file: string;
  /** Line number (1-based) of the tag */
  line: number;
}

/**
 * Regex patterns for parsing .feature files
 */
const PATTERNS = {
  // # @feature1
  tagComment: /^\s*#\s*(@feature\d+)/,
  // Scenario: Name
  scenario: /^\s*Scenario:\s*(.+)$/,
  // Scenario Outline: Name
  scenarioOutline: /^\s*Scenario Outline:\s*(.+)$/,
};

/**
 * Parse a .feature file for @featureN tags
 * 
 * @param filePath - Absolute path to the .feature file
 * @returns Array of found tags with their associated scenarios
 */
export function parseFeatureFile(filePath: string): FeatureTag[] {
  const tags: FeatureTag[] = [];
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

    // Check for tag comment
    const tagMatch = line.match(PATTERNS.tagComment);
    if (tagMatch) {
      // Also extract all @featureN from the line (in case of multiple)
      const allTags = extractAllFeatureTags(line);
      for (const featureTag of allTags) {
        // Look ahead for the Scenario
        const scenarioName = findNextScenario(lines, i + 1);
        
        tags.push({
          tag: featureTag,
          scenario: scenarioName || 'Unknown',
          file: fileName,
          line: lineNumber,
        });
      }
      continue;
    }

    // Also check for inline @featureN in Scenario lines (less common but possible)
    if (line.includes('@feature') && !line.trim().startsWith('#')) {
      const allTags = extractAllFeatureTags(line);
      const scenarioMatch = line.match(PATTERNS.scenario) || line.match(PATTERNS.scenarioOutline);
      const scenarioName = scenarioMatch ? scenarioMatch[1] : 'Inline';
      
      for (const featureTag of allTags) {
        tags.push({
          tag: featureTag,
          scenario: scenarioName,
          file: fileName,
          line: lineNumber,
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
 * Find the next Scenario after a given line index
 */
function findNextScenario(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < lines.length && i < startIndex + 5; i++) {
    const line = lines[i];
    
    const scenarioMatch = line.match(PATTERNS.scenario);
    if (scenarioMatch) {
      return scenarioMatch[1].trim();
    }

    const outlineMatch = line.match(PATTERNS.scenarioOutline);
    if (outlineMatch) {
      return outlineMatch[1].trim();
    }
  }
  return null;
}

/**
 * Get unique tags from .feature file (deduplicated by tag name)
 */
export function getUniqueFeatureTags(tags: FeatureTag[]): Map<string, FeatureTag> {
  const uniqueTags = new Map<string, FeatureTag>();
  
  for (const tag of tags) {
    // Keep the first occurrence of each tag
    if (!uniqueTags.has(tag.tag)) {
      uniqueTags.set(tag.tag, tag);
    }
  }

  return uniqueTags;
}
