/**
 * Shared tag extraction utilities for specs-validator parsers
 */

/**
 * Extract all @featureN tags from a line
 */
export function extractAllFeatureTags(line: string): string[] {
  const tags: string[] = [];
  const regex = /@feature\d+/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    tags.push(match[0]);
  }
  return tags;
}
