/**
 * Tag Matcher
 * 
 * Matches @featureN tags between MD files and .feature files
 */

import type { MdTag } from './parsers/md-parser';
import type { FeatureTag } from './parsers/feature-parser';

/**
 * Match status for a @featureN tag
 */
export type MatchStatus = 'COVERED' | 'NOT_COVERED' | 'ORPHAN';

/**
 * Result of matching a single @featureN tag
 */
export interface MatchResult {
  /** The @featureN tag */
  tag: string;
  /** Match status */
  status: MatchStatus;
  /** Source in MD file (if exists) */
  mdSource?: MdTag;
  /** Source in .feature file (if exists) */
  featureSource?: FeatureTag;
}

/**
 * Summary of match results
 */
export interface MatchSummary {
  /** Total number of unique tags */
  total: number;
  /** Number of COVERED tags */
  covered: number;
  /** Number of NOT_COVERED tags */
  notCovered: number;
  /** Number of ORPHAN tags */
  orphan: number;
}

/**
 * Match tags between MD files and .feature file
 * 
 * Logic:
 * - Tag in MD but not in .feature → NOT_COVERED
 * - Tag in .feature but not in MD → ORPHAN
 * - Tag in both → COVERED
 * 
 * @param mdTags - Tags from MD files
 * @param featureTags - Tags from .feature file
 * @returns Array of match results
 */
export function matchTags(mdTags: MdTag[], featureTags: FeatureTag[]): MatchResult[] {
  const results: MatchResult[] = [];
  
  // Create maps for quick lookup
  const mdTagMap = new Map<string, MdTag>();
  for (const tag of mdTags) {
    if (!mdTagMap.has(tag.tag)) {
      mdTagMap.set(tag.tag, tag);
    }
  }

  const featureTagMap = new Map<string, FeatureTag>();
  for (const tag of featureTags) {
    if (!featureTagMap.has(tag.tag)) {
      featureTagMap.set(tag.tag, tag);
    }
  }

  // Collect all unique tags
  const allTags = new Set<string>();
  for (const tag of mdTags) {
    allTags.add(tag.tag);
  }
  for (const tag of featureTags) {
    allTags.add(tag.tag);
  }

  // Match each tag
  for (const tag of allTags) {
    const mdSource = mdTagMap.get(tag);
    const featureSource = featureTagMap.get(tag);

    let status: MatchStatus;

    if (mdSource && featureSource) {
      status = 'COVERED';
    } else if (mdSource && !featureSource) {
      status = 'NOT_COVERED';
    } else {
      status = 'ORPHAN';
    }

    results.push({
      tag,
      status,
      mdSource,
      featureSource,
    });
  }

  // Sort results: NOT_COVERED first, then ORPHAN, then COVERED
  // Within each group, sort by tag name
  results.sort((a, b) => {
    const statusOrder: Record<MatchStatus, number> = {
      'NOT_COVERED': 0,
      'ORPHAN': 1,
      'COVERED': 2,
    };
    
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    
    return a.tag.localeCompare(b.tag);
  });

  return results;
}

/**
 * Calculate summary statistics from match results
 */
export function calculateSummary(results: MatchResult[]): MatchSummary {
  const summary: MatchSummary = {
    total: results.length,
    covered: 0,
    notCovered: 0,
    orphan: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case 'COVERED':
        summary.covered++;
        break;
      case 'NOT_COVERED':
        summary.notCovered++;
        break;
      case 'ORPHAN':
        summary.orphan++;
        break;
    }
  }

  return summary;
}

/**
 * Filter results by status
 */
export function filterByStatus(results: MatchResult[], status: MatchStatus): MatchResult[] {
  return results.filter(r => r.status === status);
}
