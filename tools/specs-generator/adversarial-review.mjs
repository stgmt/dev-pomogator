import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ADVERSARIAL_REVIEW_FILE = 'ADVERSARIAL_REVIEW.md';
export const ADVERSARIAL_REVIEW_SCHEMA = 'adversarial-review@1';

const DERIVED_ARTIFACTS = new Set([
  ADVERSARIAL_REVIEW_FILE,
  '.progress.json',
  '.last-test-run.ndjson',
  'bdd-last-run.ndjson',
]);

function draftPaths(root, relative = '') {
  const current = path.join(root, relative);
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) return draftPaths(root, child);
    if (!entry.isFile() || DERIVED_ARTIFACTS.has(entry.name)) return [];
    // The full authored spec revision includes every prose and executable BDD
    // document, including nested architecture research. Generated run output is
    // deliberately excluded above.
    return /\.(?:md|feature)$/i.test(entry.name) ? [child] : [];
  });
}

function debt(code, detail) {
  return detail ? `${code}: ${detail}` : code;
}

/**
 * Hash exactly the authored draft, not review/progress output. This makes a
 * review stale whenever FR/AC/design/tasks/BDD content changes.
 */
export function draftRevision(targetDir) {
  const files = draftPaths(targetDir).sort();
  const hash = crypto.createHash('sha256');
  for (const name of files) {
    hash.update(name);
    hash.update('\0');
    // Specs are portable between Windows and POSIX. A CRLF-only checkout
    // conversion must not invalidate an otherwise identical review verdict.
    hash.update(fs.readFileSync(path.join(targetDir, name), 'utf8').replace(/\r\n?/g, '\n'));
    hash.update('\0');
  }
  return { sha256: hash.digest('hex'), files };
}

/** Read the bounded machine record embedded at the top of the review artifact. */
export function readAdversarialReview(targetDir) {
  const artifactPath = path.join(targetDir, ADVERSARIAL_REVIEW_FILE);
  if (!fs.existsSync(artifactPath)) return { artifactPath, error: 'MISSING_ARTIFACT' };
  const content = fs.readFileSync(artifactPath, 'utf8');
  const match = content.match(/<!--\s*adversarial-review\s*\n([\s\S]*?)\n\s*-->/i);
  if (!match) return { artifactPath, error: 'MALFORMED_ARTIFACT' };
  try {
    const record = JSON.parse(match[1]);
    return { artifactPath, record };
  } catch {
    return { artifactPath, error: 'MALFORMED_ARTIFACT' };
  }
}

function evidenceState(finding, repoRoot) {
  if (finding?.unverified_blocker === true) return 'UNVERIFIED';
  const evidence = finding?.evidence;
  if (typeof evidence?.file !== 'string' || !evidence.file || !Number.isInteger(evidence.line) || evidence.line < 1) return 'INVALID';
  const file = path.resolve(repoRoot, evidence.file);
  const relative = path.relative(repoRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file)) return 'INVALID';
  const lineCount = fs.readFileSync(file, 'utf8').split(/\r\n?|\n/).length;
  return evidence.line <= lineCount ? 'RESOLVED' : 'INVALID';
}

/**
 * Fail-closed reviewer gate shared by spec-verdict and Finalization STOP. The
 * reviewer writer is intentionally outside this module: agents write the
 * markdown artifact through the MCP door, while this module only validates it.
 */
export function evaluateAdversarialReview(targetDir, { repoRoot = process.cwd() } = {}) {
  let revision;
  try {
    revision = draftRevision(targetDir);
  } catch (error) {
    return {
      status: 'DEPENDENCY_ABSENT',
      accepted: false,
      reviewed_spec_sha256: null,
      current_spec_sha256: null,
      author_run_id: null,
      reviewer_run_id: null,
      reviewer_execution: null,
      reviewer_capability: null,
      round: null,
      finding_counts: null,
      debt: [debt('REPOSITORY_EVIDENCE_UNAVAILABLE', error.message)],
      artifact: path.join(targetDir, ADVERSARIAL_REVIEW_FILE),
    };
  }

  const parsed = readAdversarialReview(targetDir);
  if (parsed.error) return {
    status: 'RED',
    accepted: false,
    reviewed_spec_sha256: null,
    current_spec_sha256: revision.sha256,
    author_run_id: null,
    reviewer_run_id: null,
    reviewer_execution: null,
    reviewer_capability: null,
    round: null,
    finding_counts: null,
    debt: [parsed.error],
    revision,
    artifact: parsed.artifactPath,
  };
  const review = parsed.record;
  const findings = Array.isArray(review.findings) ? review.findings : null;
  const reviewRounds = Number(review.round);
  const debtItems = [];

  if (review.schema !== ADVERSARIAL_REVIEW_SCHEMA) debtItems.push('INVALID_SCHEMA');
  if (review.reviewed_spec_sha256 !== revision.sha256) debtItems.push('STALE_REVIEW');
  if (!review.author_run_id || !review.reviewer_run_id) debtItems.push('MISSING_RUN_IDENTITY');
  if (review.author_run_id && review.author_run_id === review.reviewer_run_id) debtItems.push('SELF_AUTHORED_REVIEW');
  if (review.reviewer_execution !== 'independent-agent') debtItems.push('REVIEWER_NOT_INDEPENDENT');
  if (typeof review.reviewer_capability !== 'string' || !review.reviewer_capability.trim()) debtItems.push('REVIEWER_CAPABILITY_UNAVAILABLE');
  if (!Number.isInteger(reviewRounds) || reviewRounds < 1 || reviewRounds > 3) debtItems.push('INVALID_REVIEW_ROUND');
  if (review.verdict !== 'ACCEPTED') debtItems.push('REVIEW_NOT_ACCEPTED');
  if (!Array.isArray(review.residual_risks) || review.residual_risks.length === 0 || review.residual_risks.some((risk) => !String(risk ?? '').trim())) debtItems.push('MISSING_RESIDUAL_RISKS');
  if (!findings) {
    debtItems.push('MISSING_FINDINGS');
  } else {
    for (const [index, finding] of findings.entries()) {
      const prefix = `FINDING_${index + 1}`;
      if (!['P0', 'P1', 'P2', 'P3'].includes(finding?.severity)) debtItems.push(`${prefix}_INVALID_SEVERITY`);
      if (!finding?.mechanism || !finding?.impact || !finding?.required_resolution) debtItems.push(`${prefix}_INCOMPLETE`);
      const evidence = evidenceState(finding, repoRoot);
      if (evidence === 'UNVERIFIED') debtItems.push(`${prefix}_REPOSITORY_EVIDENCE_UNAVAILABLE`);
      if (evidence === 'INVALID') debtItems.push(`${prefix}_MISSING_EVIDENCE`);
      const state = finding?.status;
      if (state === 'RESOLVED' && evidenceState(finding?.resolution_evidence, repoRoot) !== 'RESOLVED') {
        debtItems.push(`${prefix}_MISSING_RESOLUTION_EVIDENCE`);
      }
      if (['P0', 'P1'].includes(finding?.severity) && state !== 'RESOLVED') debtItems.push(`${prefix}_BLOCKING_${finding.severity}`);
      if (finding?.severity === 'P2' && state !== 'RESOLVED') {
        const waiver = finding?.waiver;
        if (state !== 'WAIVED' || !waiver?.approved_by || !String(waiver.rationale ?? '').trim()) {
          debtItems.push(`${prefix}_P2_REQUIRES_FIX_OR_WAIVER`);
        }
      }
    }
  }

  const status = debtItems.length === 0 ? 'GREEN' : 'RED';
  return {
    status,
    accepted: status === 'GREEN',
    reviewed_spec_sha256: review.reviewed_spec_sha256 ?? null,
    current_spec_sha256: revision.sha256,
    author_run_id: review.author_run_id ?? null,
    reviewer_run_id: review.reviewer_run_id ?? null,
    reviewer_execution: review.reviewer_execution ?? null,
    reviewer_capability: review.reviewer_capability ?? null,
    round: Number.isInteger(reviewRounds) ? reviewRounds : null,
    finding_counts: findings ? Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((severity) => [severity, findings.filter((finding) => finding?.severity === severity).length])) : null,
    debt: debtItems,
    revision,
    artifact: parsed.artifactPath,
  };
}

export function formatAdversarialReviewTemplate({ authorRunId, reviewerRunId, revision, round = 1 }) {
  return `<!-- adversarial-review\n${JSON.stringify({
    schema: ADVERSARIAL_REVIEW_SCHEMA,
    reviewed_spec_sha256: revision,
    author_run_id: authorRunId,
    reviewer_run_id: reviewerRunId,
    reviewer_execution: 'independent-agent',
    reviewer_capability: 'repository-code-review',
    round,
    verdict: 'ACCEPTED',
    findings: [],
    residual_risks: [],
  }, null, 2)}\n-->\n\n# Independent Adversarial Review\n\n## Findings\n\nNo findings. Residual risks are recorded in the machine record above.\n`;
}
