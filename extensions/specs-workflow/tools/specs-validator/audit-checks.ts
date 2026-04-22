/**
 * Audit Checks for spec quality validation (TypeScript, cross-platform).
 *
 * CHECK-9:  PARTIAL_IMPL_DETECTION — FR marker + task [x] → ERROR
 * CHECK-10: TASK_FR_ATOMICITY — task covers >1 FR → WARNING
 * CHECK-11: FR_SPLIT_CONSISTENCY — FR-4a exists but FR-5a doesn't → INFO
 * CHECK-12: BDD_SCENARIO_SCOPE — FR mentions "serial" but scenario only "batch" → WARNING
 * CHECK-13: JIRA_DRIFT — (conditional, Jira-mode) cache vs .jira-cache.json / MCP fetch → WARNING / INFO
 */

import fs from 'fs';
import path from 'path';

export interface AuditFinding {
  check: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
}

const PARTIAL_MARKERS = [
  'НЕ РЕАЛИЗОВАНО',
  'NOT IMPLEMENTED',
  'PARTIAL',
  'TODO: implement',
  'deferred',
  'будущее улучшение',
];

const DOMAIN_TERMS = [
  'batch', 'serial', 'IN', 'OUT', 'inbound', 'outbound',
  'create', 'update', 'delete', 'rollback', 'cancel', 'approve', 'reject',
];

function readFile(specPath: string, filename: string): string {
  const filePath = path.join(specPath, filename);
  if (!fs.existsSync(filePath)) return '';
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  return content;
}

/**
 * CHECK-9: PARTIAL_IMPL_DETECTION
 * FR-N has partial implementation marker but task is marked [x] → ERROR
 */
export function checkPartialImpl(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const frContent = readFile(specPath, 'FR.md');
  const tasksContent = readFile(specPath, 'TASKS.md');
  if (!frContent || !tasksContent) return findings;

  // Find FR-N sections with partial markers
  const frSections = frContent.split(/^## /m).slice(1);
  for (const section of frSections) {
    const idMatch = section.match(/^(FR-\d+[a-z]?)/);
    if (!idMatch) continue;
    const frId = idMatch[1];

    for (const marker of PARTIAL_MARKERS) {
      if (section.toLowerCase().includes(marker.toLowerCase())) {
        // Check if task referencing this FR is [x]
        const tasksLines = tasksContent.split('\n');
        for (const line of tasksLines) {
          if (/^\s*-\s*\[x\]/i.test(line) && line.includes(frId)) {
            findings.push({
              check: 'PARTIAL_IMPL_DETECTION',
              category: 'ERRORS',
              severity: 'ERROR',
              message: `PARTIAL_IMPL: ${frId} has partial implementation marker '${marker}' but task is marked complete [x]`,
              details: 'Either remove the marker from FR.md or uncheck the task in TASKS.md',
            });
            break;
          }
        }
        break; // one marker per FR is enough
      }
    }
  }

  return findings;
}

/**
 * CHECK-10: TASK_FR_ATOMICITY
 * A single task references >1 FR → WARNING
 */
export function checkTaskAtomicity(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const tasksContent = readFile(specPath, 'TASKS.md');
  if (!tasksContent) return findings;

  const taskLines = tasksContent.split('\n').filter(l => /^\s*-\s*\[[ x]\]/.test(l));

  for (const line of taskLines) {
    const frRefs = line.match(/FR-\d+[a-z]?/g);
    if (!frRefs) continue;
    const unique = [...new Set(frRefs)];
    if (unique.length > 1) {
      findings.push({
        check: 'TASK_FR_ATOMICITY',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `TASK_ATOMICITY: Task covers multiple FRs: ${unique.join(', ')}`,
        details: `Task: ${line.trim()}`,
      });
    }
  }

  return findings;
}

/**
 * CHECK-11: FR_SPLIT_CONSISTENCY
 * FR-4a exists but adjacent FR-5 has no sub-variants → INFO
 */
export function checkFrSplitConsistency(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const frContent = readFile(specPath, 'FR.md');
  if (!frContent) return findings;

  // Extract all FR IDs
  const frIds = [...frContent.matchAll(/## FR-(\d+)([a-z])?/g)];
  const frNumbers = new Map<number, string[]>(); // number → [sub-variants]

  for (const m of frIds) {
    const num = parseInt(m[1], 10);
    const variant = m[2] || '';
    if (!frNumbers.has(num)) frNumbers.set(num, []);
    if (variant) frNumbers.get(num)!.push(variant);
  }

  // Find FRs with sub-variants
  const splitFRs = [...frNumbers.entries()].filter(([, variants]) => variants.length > 0);

  for (const [splitNum, variants] of splitFRs) {
    // Check adjacent FRs (±1)
    for (const offset of [-1, 1]) {
      const adjacentNum = splitNum + offset;
      const adjacentVariants = frNumbers.get(adjacentNum);
      if (adjacentVariants !== undefined && adjacentVariants.length === 0) {
        const splitList = variants.map(v => `FR-${splitNum}${v}`).join(', ');
        findings.push({
          check: 'FR_SPLIT_CONSISTENCY',
          category: 'INCONSISTENCY',
          severity: 'INFO',
          message: `FR_SPLIT_CONSISTENCY: FR-${splitNum} has sub-variant(s) (${splitList}) but adjacent FR-${adjacentNum} does not`,
          details: `Review whether FR-${adjacentNum} should also be split`,
        });
      }
    }
  }

  return findings;
}

/**
 * CHECK-12: BDD_SCENARIO_SCOPE
 * FR mentions domain term but BDD scenario doesn't cover it → WARNING
 */
export function checkBddScenarioScope(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const frContent = readFile(specPath, 'FR.md');
  if (!frContent) return findings;

  // Find .feature file
  const files = fs.readdirSync(specPath);
  const featureFile = files.find(f => f.endsWith('.feature'));
  if (!featureFile) return findings;
  const featureContent = readFile(specPath, featureFile);
  if (!featureContent) return findings;

  // Parse FR sections with @featureN tags
  const frSections = frContent.split(/^## /m).slice(1);

  for (const section of frSections) {
    const idMatch = section.match(/^(FR-\d+[a-z]?)/);
    const tagMatch = section.match(/@feature(\d+[a-z]?)/);
    if (!idMatch || !tagMatch) continue;

    const frId = idMatch[1];
    const featureTag = `@feature${tagMatch[1]}`;

    // Extract domain terms from FR
    const frTerms = DOMAIN_TERMS.filter(t =>
      section.toLowerCase().includes(t.toLowerCase())
    );
    if (frTerms.length === 0) continue;

    // Extract scenario text for this @featureN
    const scenarioRegex = new RegExp(
      `#\\s*${featureTag}\\s*\\n\\s*Scenario[^]*?(?=\\n\\s*#\\s*@feature|\\n\\s*#\\s*$|$)`,
      'gi'
    );
    const scenarioMatches = featureContent.match(scenarioRegex);
    if (!scenarioMatches) continue;

    const scenarioText = scenarioMatches.join('\n').toLowerCase();

    // Check which FR terms are missing from scenarios
    const missingTerms = frTerms.filter(t => !scenarioText.includes(t.toLowerCase()));
    const presentTerms = frTerms.filter(t => scenarioText.includes(t.toLowerCase()));

    if (missingTerms.length > 0 && presentTerms.length > 0) {
      findings.push({
        check: 'BDD_SCENARIO_SCOPE',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `BDD_SCENARIO_SCOPE: ${frId} mentions '${missingTerms.join("', '")}' but ${featureTag} scenarios only cover '${presentTerms.join("', '")}'`,
      });
    }
  }

  return findings;
}

/**
 * CHECK-13: JIRA_DRIFT
 * Conditional audit: активируется только если .jira-cache.json присутствует в spec directory
 * (marker Jira-mode). Сравнивает cached snapshot vs. live Jira (через MCP, если доступен):
 *   - Issue.updated timestamp — WARNING если reporter изменил description после intake
 *   - comment_count — WARNING если новые комментарии
 *   - attachments hashes — WARNING для changed/added/removed
 *   - Если MCP недоступен — INFO "drift check skipped"
 *
 * MCP access: эта функция НЕ делает live MCP calls сама (runtime не имеет MCP handle).
 * Она сравнивает cache с expected markers / delegates live check to audit-runner каноничный wrapper.
 * При реальном MCP wiring (через audit-runner или hook environment) — передать current Jira state
 * через опциональный параметр liveJiraState.
 */
export interface JiraLiveState {
  issueUpdatedAt?: string;
  commentCount?: number;
  attachmentHashes?: Record<string, string>; // id → sha256
  status?: string;
  priority?: string;
}

export function checkJiraDrift(
  specPath: string,
  liveJiraState?: JiraLiveState | null,
  mcpUnavailable = false,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const cachePath = path.join(specPath, '.jira-cache.json');
  if (!fs.existsSync(cachePath)) {
    return findings; // Not Jira-mode — no-op
  }

  let cache: {
    jira_key?: string;
    issue_updated_at?: string | null;
    comment_count?: number;
    attachments?: Array<{ id: string; filename: string; hash: string }>;
    metadata?: { status?: string | null; priority?: string | null };
  };
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (err) {
    findings.push({
      check: 'JIRA_DRIFT',
      category: 'JIRA_DRIFT',
      severity: 'WARNING',
      message: `JIRA_DRIFT: Cannot parse .jira-cache.json: ${(err as Error).message}`,
      details: 'Re-run /jira-intake-resync to regenerate cache.',
    });
    return findings;
  }

  if (mcpUnavailable || !liveJiraState) {
    findings.push({
      check: 'JIRA_DRIFT',
      category: 'JIRA_DRIFT',
      severity: 'INFO',
      message: 'JIRA_DRIFT: Jira MCP unavailable, drift check skipped.',
      details: `Cached state from ${cache.jira_key || '<unknown>'} used as-is. Run /jira-intake-resync when MCP is available to refresh.`,
    });
    return findings;
  }

  // Issue.updated drift
  if (liveJiraState.issueUpdatedAt && cache.issue_updated_at
      && liveJiraState.issueUpdatedAt !== cache.issue_updated_at) {
    findings.push({
      check: 'JIRA_DRIFT',
      category: 'JIRA_DRIFT',
      severity: 'WARNING',
      message: `JIRA_DRIFT: Issue modified since intake. Cached: ${cache.issue_updated_at}, live: ${liveJiraState.issueUpdatedAt}.`,
      details: 'Reporter may have updated description or added comments. Run /jira-intake-resync to sync and review updated JIRA_SOURCE.md before proceeding.',
    });
  }

  // Comment count drift
  if (typeof liveJiraState.commentCount === 'number' && typeof cache.comment_count === 'number') {
    const delta = liveJiraState.commentCount - cache.comment_count;
    if (delta > 0) {
      findings.push({
        check: 'JIRA_DRIFT',
        category: 'JIRA_DRIFT',
        severity: 'WARNING',
        message: `JIRA_DRIFT: ${delta} new comment(s) since intake (cached: ${cache.comment_count}, live: ${liveJiraState.commentCount}).`,
        details: 'New comments may contain clarifications or new requirements. Run /jira-intake-resync to fetch updated comments into JIRA_SOURCE.md.',
      });
    }
  }

  // Attachment drift (added / changed / removed)
  if (liveJiraState.attachmentHashes && Array.isArray(cache.attachments)) {
    const cachedById = new Map<string, string>();
    for (const att of cache.attachments) {
      cachedById.set(att.id, att.hash);
    }
    const liveIds = new Set(Object.keys(liveJiraState.attachmentHashes));
    const cachedIds = new Set(cachedById.keys());

    for (const id of liveIds) {
      if (!cachedIds.has(id)) {
        findings.push({
          check: 'JIRA_DRIFT',
          category: 'JIRA_DRIFT',
          severity: 'WARNING',
          message: `JIRA_DRIFT: New attachment uploaded in Jira (id=${id}) not in cache.`,
          details: 'Run /jira-intake-resync to download new attachment and re-tag role.',
        });
      } else if (cachedById.get(id) !== liveJiraState.attachmentHashes[id]) {
        findings.push({
          check: 'JIRA_DRIFT',
          category: 'JIRA_DRIFT',
          severity: 'WARNING',
          message: `JIRA_DRIFT: Attachment id=${id} content changed (hash mismatch).`,
          details: 'Reporter may have replaced attachment. Run /jira-intake-resync to refresh.',
        });
      }
    }
    for (const id of cachedIds) {
      if (!liveIds.has(id)) {
        findings.push({
          check: 'JIRA_DRIFT',
          category: 'JIRA_DRIFT',
          severity: 'WARNING',
          message: `JIRA_DRIFT: Cached attachment id=${id} removed from Jira.`,
          details: 'Attachment deleted by reporter. Evidence references in FR/AC may become stale.',
        });
      }
    }
  }

  // Status / priority change (INFO — non-blocking but worth noting)
  if (liveJiraState.status && cache.metadata?.status
      && liveJiraState.status !== cache.metadata.status) {
    findings.push({
      check: 'JIRA_DRIFT',
      category: 'JIRA_DRIFT',
      severity: 'INFO',
      message: `JIRA_DRIFT: Issue status changed: '${cache.metadata.status}' → '${liveJiraState.status}'.`,
    });
  }

  return findings;
}

/**
 * Run all audit checks on a spec directory.
 *
 * JIRA_DRIFT is conditional: executes only if .jira-cache.json is present.
 * Without live MCP state, emits INFO "drift check skipped" (fail-open, не блокирует).
 * audit-runner / hook environment can call checkJiraDrift(specPath, liveState, false)
 * directly if it has MCP handle.
 */
export function runAllChecks(
  specPath: string,
  jiraLiveState?: JiraLiveState | null,
  mcpUnavailable = true,
): AuditFinding[] {
  return [
    ...checkPartialImpl(specPath),
    ...checkTaskAtomicity(specPath),
    ...checkFrSplitConsistency(specPath),
    ...checkBddScenarioScope(specPath),
    ...checkJiraDrift(specPath, jiraLiveState ?? null, mcpUnavailable),
  ];
}
