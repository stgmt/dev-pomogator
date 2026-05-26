/**
 * Polymorphic FR trigger detection — pure regex, no LLM.
 *
 * Mitigation для H2 risk (memory feedback_code-evidence-trumps-domain-sense.md):
 * detection anchored в mechanical grep, не в semantic interpretation. Closed list
 * polymorphism-axis nouns + threshold-2 hits + hard-OUT signals для anti-over-application
 * (memory feedback_single-incident-rules-over-generalize.md).
 *
 * Driver incident: Stocktaking MR Warehouse Transfer 2026-04-27.
 */

export interface TriggerMatch {
  phrase: string;
  line: number;
}

export interface PolymorphicFRResult {
  frId: string;
  lineNumber: number;
  triggers: TriggerMatch[];
  axis?: string;
  hardOut: boolean;
}

/**
 * Closed list polymorphism-axis nouns (14 items).
 * Trade-off: closed list может пропустить экзотические axes (payment-rail, compliance-jurisdiction)
 * — overridable через future config (out of scope for v0.1.0).
 */
export const AXIS_NOUNS = [
  'doctype',
  'type',
  'kind',
  'variant',
  'provider',
  'adapter',
  'tenant',
  'locale',
  'channel',
  'method',
  'role',
  'version',
  'backend',
  'driver',
] as const;

const AXIS_GROUP = AXIS_NOUNS.map((n) => n + 's?').join('|');
// JS `\w` не matches Cyrillic — use `[\p{L}\p{N}]*` с `u` flag для RU word-tail.
const AXIS_GROUP_RU =
  '(?:доктайп[\\p{L}\\p{N}]*|типов?[\\p{L}\\p{N}]*|вариант[\\p{L}\\p{N}]*|провайдер[\\p{L}\\p{N}]*|адаптер[\\p{L}\\p{N}]*|тенант[\\p{L}\\p{N}]*|локал[\\p{L}\\p{N}]*|канал[\\p{L}\\p{N}]*|метод[\\p{L}\\p{N}]*|рол[\\p{L}\\p{N}]*|верси[\\p{L}\\p{N}]*|бэкенд[\\p{L}\\p{N}]*|драйвер[\\p{L}\\p{N}]*)';

/**
 * EN polymorphic dispatch trigger phrases.
 * High-confidence quantifier+axis combinations.
 */
export const POLYMORPHIC_TRIGGERS_EN: RegExp[] = [
  new RegExp(`\\bfor each\\s+(?:${AXIS_GROUP})\\b`, 'gi'),
  new RegExp(`\\bfor every\\s+(?:${AXIS_GROUP})\\b`, 'gi'),
  new RegExp(`\\bevery\\s+(?:${AXIS_GROUP})\\b`, 'gi'),
  new RegExp(`\\b(?:across\\s+)?all\\s+(?:${AXIS_GROUP})\\b`, 'gi'),
  new RegExp(`\\bany\\s+(?:${AXIS_GROUP})\\b`, 'gi'),
  new RegExp(`\\bper[-\\s]+(?:${AXIS_GROUP})\\b`, 'gi'),
  new RegExp(`\\bby[-\\s]+(?:${AXIS_GROUP})\\b`, 'gi'),
  /\bshared\s+(?:validation|pipeline|handler|dispatcher|router|middleware|codepath|code-path)\b/gi,
  /\bcommon\s+(?:pipeline|handler|dispatcher|router|middleware)\b/gi,
  /\bpolymorphic\s+dispatch\b/gi,
  /\benum\s+dispatch\b/gi,
  /\bgeneric\s+(?:handler|guard|gate|validator)\b/gi,
  /\bapplies to\s+(?:all|every|each)\b/gi,
  /\bsame\s+(?:behavior|logic|rule|check|validation)\s+for\b/gi,
];

/**
 * RU polymorphic dispatch trigger phrases.
 * NOTE: JavaScript `\b` не работает с Cyrillic — используем `(?<![\p{L}\p{N}_])` lookarounds + `u` flag.
 */
const RU_BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const RU_BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';

export const POLYMORPHIC_TRIGGERS_RU: RegExp[] = [
  new RegExp(
    `${RU_BOUNDARY_BEFORE}для\\s+каждого\\s+${AXIS_GROUP_RU}${RU_BOUNDARY_AFTER}`,
    'giu',
  ),
  new RegExp(
    `${RU_BOUNDARY_BEFORE}для\\s+всех\\s+${AXIS_GROUP_RU}${RU_BOUNDARY_AFTER}`,
    'giu',
  ),
  new RegExp(
    `${RU_BOUNDARY_BEFORE}все\\s+${AXIS_GROUP_RU}${RU_BOUNDARY_AFTER}`,
    'giu',
  ),
  new RegExp(
    `${RU_BOUNDARY_BEFORE}по\\s+каждому\\s+${AXIS_GROUP_RU}${RU_BOUNDARY_AFTER}`,
    'giu',
  ),
  new RegExp(
    `${RU_BOUNDARY_BEFORE}на\\s+${AXIS_GROUP_RU}${RU_BOUNDARY_AFTER}`,
    'giu',
  ),
  /(?<![\p{L}\p{N}_])переиспользуем(?![\p{L}\p{N}_])/giu,
  /(?<![\p{L}\p{N}_])общ(?:ая|ий|ее|ие)\s+(?:валидация|обработчик|диспатчер|роутер|pipeline|middleware|код-?путь)(?![\p{L}\p{N}_])/giu,
  /(?<![\p{L}\p{N}_])полиморфн[\p{L}\p{N}]+\s+диспатч(?![\p{L}\p{N}_])/giu,
  /(?<![\p{L}\p{N}_])в\s+зависимости\s+от(?![\p{L}\p{N}_])/giu,
];

/**
 * Hard-OUT signals — when FR scopes OUT of polymorphic dispatch.
 * Mitigation для H1 risk: prevent over-application на single-variant FRs.
 */
export const HARD_OUT_PATTERNS: RegExp[] = [
  /\bonly\b/gi,
  /\bsingle\b/gi,
  /\bspecific\b/gi,
  /(?<![\p{L}\p{N}_])только(?![\p{L}\p{N}_])/giu,
  /(?<![\p{L}\p{N}_])единственн[\p{L}\p{N}]+/giu,
  /(?<![\p{L}\p{N}_])конкретн[\p{L}\p{N}]+/giu,
  /^\s*>\s*OUT\s+OF\s+SCOPE/gim,
  /\[OUT_OF_SCOPE:/g,
];

/**
 * Strip fenced code blocks before regex matching.
 * Code examples shouldn't trigger polymorphism detection.
 */
function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, '');
}

/**
 * Extract FR sections from FR.md content.
 * Each section starts с `## FR-N:` header и ends перед next FR header или EOF.
 */
function extractFRSections(
  content: string,
): Array<{ frId: string; lineNumber: number; body: string }> {
  const lines = content.split('\n');
  const sections: Array<{ frId: string; lineNumber: number; body: string }> = [];
  let currentFR: { frId: string; lineNumber: number; lines: string[] } | null =
    null;

  const frHeaderRe = /^##\s+(FR-\d+)[:\s]/;

  for (let i = 0; i < lines.length; i++) {
    const match = frHeaderRe.exec(lines[i]);
    if (match) {
      if (currentFR) {
        sections.push({
          frId: currentFR.frId,
          lineNumber: currentFR.lineNumber,
          body: currentFR.lines.join('\n'),
        });
      }
      currentFR = { frId: match[1], lineNumber: i + 1, lines: [lines[i]] };
    } else if (currentFR) {
      currentFR.lines.push(lines[i]);
    }
  }

  if (currentFR) {
    sections.push({
      frId: currentFR.frId,
      lineNumber: currentFR.lineNumber,
      body: currentFR.lines.join('\n'),
    });
  }

  return sections;
}

function findMatches(text: string, patterns: RegExp[]): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const lines = text.split('\n');
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineMatches = lines[i].match(pattern);
      if (lineMatches) {
        for (const m of lineMatches) {
          matches.push({ phrase: m, line: i + 1 });
        }
      }
    }
  }
  return matches;
}

function hasHardOut(text: string): boolean {
  for (const pattern of HARD_OUT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

function detectAxis(triggers: TriggerMatch[]): string | undefined {
  for (const trigger of triggers) {
    const lower = trigger.phrase.toLowerCase();
    for (const noun of AXIS_NOUNS) {
      if (lower.includes(noun)) return noun;
    }
    if (/доктайп/i.test(trigger.phrase)) return 'doctype';
    if (/тип/i.test(trigger.phrase)) return 'type';
    if (/вариант/i.test(trigger.phrase)) return 'variant';
    if (/провайдер/i.test(trigger.phrase)) return 'provider';
    if (/адаптер/i.test(trigger.phrase)) return 'adapter';
  }
  return undefined;
}

/**
 * Detect polymorphic FRs в content.
 *
 * Threshold-2: returns FR if hits >= 2, OR FR if hits >= 1 AND has hard-OUT signal
 * (то return с hardOut: true для diagnostic visibility).
 *
 * FRs без any triggers are NOT returned.
 */
export function detectPolymorphicFRs(
  content: string,
): PolymorphicFRResult[] {
  const stripped = stripCodeBlocks(content);
  const sections = extractFRSections(stripped);
  const results: PolymorphicFRResult[] = [];

  const allTriggers = [...POLYMORPHIC_TRIGGERS_EN, ...POLYMORPHIC_TRIGGERS_RU];

  for (const section of sections) {
    const triggers = findMatches(section.body, allTriggers);
    const hardOut = hasHardOut(section.body);

    // Don't return FRs без any triggers — not polymorphic candidates.
    if (triggers.length === 0) continue;

    // Hard-OUT priority: if hard-OUT present с >= 1 trigger → return c hardOut=true.
    if (hardOut) {
      results.push({
        frId: section.frId,
        lineNumber: section.lineNumber,
        triggers,
        axis: detectAxis(triggers),
        hardOut: true,
      });
      continue;
    }

    // Threshold: >= 2 trigger hits required (без hard-OUT).
    if (triggers.length < 2) continue;

    results.push({
      frId: section.frId,
      lineNumber: section.lineNumber,
      triggers,
      axis: detectAxis(triggers),
      hardOut: false,
    });
  }

  return results;
}
