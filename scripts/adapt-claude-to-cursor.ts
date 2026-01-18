#!/usr/bin/env npx tsx
/**
 * Скрипт адаптации Claude Code команд → Cursor формат
 * 
 * Использование:
 *   npx tsx scripts/adapt-claude-to-cursor.ts <input> <output>
 * 
 * Пример:
 *   npx tsx scripts/adapt-claude-to-cursor.ts \
 *     extensions/suggest-rules/claude/commands/suggest-rules.md \
 *     extensions/suggest-rules/cursor/commands/suggest-rules.md
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// КОНФИГУРАЦИЯ АДАПТАЦИЙ
// ============================================================================

interface AdaptationReport {
  inputFile: string;
  outputFile: string;
  timestamp: string;
  changes: Change[];
  stats: {
    totalReplacements: number;
    frontmatterChanges: number;
    pathReplacements: number;
    categoryReplacements: number;
    argumentReplacements: number;
    otherReplacements: number;
  };
}

interface Change {
  type: 'frontmatter' | 'path' | 'category' | 'argument' | 'critical' | 'template' | 'text';
  original: string;
  replacement: string;
  line?: number;
  count: number;
}

// Frontmatter адаптации
const FRONTMATTER_REMOVE = ['allowed-tools', 'argument-hint'];
const FRONTMATTER_KEEP = ['description'];

// Замены в description
const DESCRIPTION_REPLACEMENTS: [RegExp, string][] = [
  [/Claude rules/gi, 'Cursor rules'],
  [/Claude Code/gi, 'Cursor'],
];

// Замены путей
const PATH_REPLACEMENTS: [RegExp, string][] = [
  [/\.claude\/rules\/\*\*\/\*\.md/g, '.cursor/rules/**/*.mdc'],
  [/\.claude\/rules\//g, '.cursor/rules/'],
  [/~\/\.claude\/rules\//g, ''], // удалить глобальные пути
  [/`\.claude\/rules\/<категория>\/<name>\.md`/g, '`.cursor/rules/<name>.mdc`'],
  [/\.claude\/rules\/<категория>\/rule-name\.md/g, '.cursor/rules/rule-name.mdc'],
  [/\.claude\/rules\/<категория>\//g, '.cursor/rules/'],
  [/antipatterns\/<name>\.md/g, 'antipatterns/<name>.mdc'],
  [/patterns\/<name>\.md/g, 'patterns/<name>.mdc'],
  [/checklists\/<name>\.md/g, 'checklists/<name>.mdc'],
  [/gotchas\/<name>\.md/g, 'gotchas/<name>.mdc'],
  [/<domain>\/<name>\.md/g, '<domain>/<name>.mdc'],
  // Конкретные примеры с именами файлов
  [/no-direct-prod-db\.md(?!c)/g, 'no-direct-prod-db.mdc'],
  // Исправить опечатки типа .mdcc
  [/\.mdcc/g, '.mdc'],
];

// Замены категоризации
const CATEGORY_REPLACEMENTS: [RegExp, string][] = [
  [/🌍 Global/g, '🔵 alwaysApply: true'],
  [/📁 Project/g, '🟡 alwaysApply: false'],
  [/\| 🌍 \*\*Global\*\* \|/g, '| 🔵 **alwaysApply: true** |'],
  [/\| 📁 \*\*Project\*\* \|/g, '| 🟡 **alwaysApply: false** |'],
];

// Замены аргументов
const ARGUMENT_REPLACEMENTS: [RegExp, string][] = [
  [/`\$ARGUMENTS` = `global`:/g, '`$ARGUMENTS` = `always`:'],
  [/`\$ARGUMENTS` = `project`:/g, '`$ARGUMENTS` = `manual`:'],
  [/только 🌍 Global правила/g, 'только 🔵 alwaysApply: true правила'],
  [/только 📁 Project правила/g, 'только 🟡 alwaysApply: false правила'],
];

// Замены критических правил
const CRITICAL_REPLACEMENTS: [RegExp, string][] = [
  [/БЕЗ frontmatter.*Claude Code rules это чистый Markdown/g, 
   'MDC формат — YAML frontmatter обязателен (name, description, alwaysApply)'],
];

// Замены текста
const TEXT_REPLACEMENTS: [RegExp, string][] = [
  [/# Suggest Claude Rules/g, '# Suggest Cursor Rules'],
  [/предложи Claude rules/g, 'предложи Cursor rules (.mdc файлы)'],
  [/Claude rules для/g, 'Cursor rules для'],
];

// Шаблон MDC frontmatter для вставки в примеры
const MDC_FRONTMATTER_TEMPLATE = `---
name: rule-name
description: Краткое описание правила
alwaysApply: true/false
---`;

// ============================================================================
// ПАРСИНГ И АДАПТАЦИЯ
// ============================================================================

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content };
  }
  
  const frontmatterLines = frontmatterMatch[1].split('\n');
  const frontmatter: Record<string, string> = {};
  
  for (const line of frontmatterLines) {
    const match = line.match(/^(\S+):\s*(.*)$/);
    if (match) {
      frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  
  return { frontmatter, body: frontmatterMatch[2] };
}

function adaptFrontmatter(frontmatter: Record<string, string>, changes: Change[]): string {
  const adapted: Record<string, string> = {};
  
  for (const key of FRONTMATTER_KEEP) {
    if (frontmatter[key]) {
      let value = frontmatter[key];
      
      // Применить замены в description
      if (key === 'description') {
        for (const [pattern, replacement] of DESCRIPTION_REPLACEMENTS) {
          if (pattern.test(value)) {
            const original = value;
            value = value.replace(pattern, replacement);
            changes.push({
              type: 'frontmatter',
              original: `${key}: "${original}"`,
              replacement: `${key}: "${value}"`,
              count: 1
            });
          }
        }
      }
      
      adapted[key] = value;
    }
  }
  
  // Логируем удалённые поля
  for (const key of FRONTMATTER_REMOVE) {
    if (frontmatter[key]) {
      changes.push({
        type: 'frontmatter',
        original: `${key}: "${frontmatter[key]}"`,
        replacement: '(удалено)',
        count: 1
      });
    }
  }
  
  // Генерируем новый frontmatter
  const lines = ['---'];
  for (const [key, value] of Object.entries(adapted)) {
    lines.push(`${key}: "${value}"`);
  }
  lines.push('---');
  
  return lines.join('\n');
}

function applyReplacements(
  body: string, 
  replacements: [RegExp, string][], 
  type: Change['type'],
  changes: Change[]
): string {
  let result = body;
  
  for (const [pattern, replacement] of replacements) {
    const matches = result.match(pattern);
    if (matches) {
      const count = matches.length;
      const original = matches[0];
      result = result.replace(pattern, replacement);
      
      changes.push({
        type,
        original: original.slice(0, 50) + (original.length > 50 ? '...' : ''),
        replacement: replacement.slice(0, 50) + (replacement.length > 50 ? '...' : ''),
        count
      });
    }
  }
  
  return result;
}

function adaptTemplateExamples(body: string, changes: Change[]): string {
  // Найти шаблоны правил и добавить MDC frontmatter
  
  // Шаблон для Antipattern - добавить frontmatter
  const antipatternTemplate = body.match(/### Шаблон для Antipattern\n\n```markdown\n# <Название антипаттерна>/);
  if (antipatternTemplate) {
    const oldTemplate = '```markdown\n# <Название антипаттерна>';
    const newTemplate = `\`\`\`markdown
---
name: <название-kebab-case>
description: <Краткое описание>
alwaysApply: true
---

# <Название антипаттерна>`;
    
    if (body.includes(oldTemplate)) {
      body = body.replace(oldTemplate, newTemplate);
      changes.push({
        type: 'template',
        original: 'Antipattern template без frontmatter',
        replacement: 'Antipattern template с MDC frontmatter',
        count: 1
      });
    }
  }
  
  // Шаблон для Pattern/Checklist - добавить frontmatter
  const patternTemplate = body.match(/### Шаблон для Pattern\/Checklist\n\n```markdown\n# <Название>/);
  if (patternTemplate) {
    const oldTemplate = '### Шаблон для Pattern/Checklist\n\n```markdown\n# <Название>';
    const newTemplate = `### Шаблон для Pattern/Checklist

\`\`\`markdown
---
name: <название-kebab-case>
description: <Краткое описание>
alwaysApply: true/false
---

# <Название>`;
    
    if (body.includes('### Шаблон для Pattern/Checklist\n\n```markdown\n# <Название>')) {
      body = body.replace('### Шаблон для Pattern/Checklist\n\n```markdown\n# <Название>', newTemplate);
      changes.push({
        type: 'template',
        original: 'Pattern template без frontmatter',
        replacement: 'Pattern template с MDC frontmatter',
        count: 1
      });
    }
  }
  
  return body;
}

function adaptBody(body: string, changes: Change[]): string {
  let result = body;
  
  // Применить все замены
  result = applyReplacements(result, PATH_REPLACEMENTS, 'path', changes);
  result = applyReplacements(result, CATEGORY_REPLACEMENTS, 'category', changes);
  result = applyReplacements(result, ARGUMENT_REPLACEMENTS, 'argument', changes);
  result = applyReplacements(result, CRITICAL_REPLACEMENTS, 'critical', changes);
  result = applyReplacements(result, TEXT_REPLACEMENTS, 'text', changes);
  
  // Адаптировать шаблоны примеров
  result = adaptTemplateExamples(result, changes);
  
  return result;
}

// ============================================================================
// ОТЧЁТ
// ============================================================================

function generateReport(report: AdaptationReport): string {
  const lines: string[] = [
    '# Отчёт адаптации Claude Code → Cursor',
    '',
    `**Дата:** ${report.timestamp}`,
    `**Входной файл:** \`${report.inputFile}\``,
    `**Выходной файл:** \`${report.outputFile}\``,
    '',
    '## Статистика',
    '',
    `| Категория | Количество замен |`,
    `|-----------|------------------|`,
    `| Frontmatter | ${report.stats.frontmatterChanges} |`,
    `| Пути | ${report.stats.pathReplacements} |`,
    `| Категории | ${report.stats.categoryReplacements} |`,
    `| Аргументы | ${report.stats.argumentReplacements} |`,
    `| Прочее | ${report.stats.otherReplacements} |`,
    `| **ВСЕГО** | **${report.stats.totalReplacements}** |`,
    '',
    '## Детали изменений',
    '',
  ];
  
  // Группировать по типу
  const byType = new Map<string, Change[]>();
  for (const change of report.changes) {
    const list = byType.get(change.type) || [];
    list.push(change);
    byType.set(change.type, list);
  }
  
  const typeNames: Record<string, string> = {
    frontmatter: '### Frontmatter',
    path: '### Пути',
    category: '### Категории',
    argument: '### Аргументы',
    critical: '### Критические правила',
    template: '### Шаблоны',
    text: '### Текст',
  };
  
  for (const [type, name] of Object.entries(typeNames)) {
    const changes = byType.get(type);
    if (changes && changes.length > 0) {
      lines.push(name);
      lines.push('');
      lines.push('| Было | Стало | Кол-во |');
      lines.push('|------|-------|--------|');
      for (const change of changes) {
        lines.push(`| \`${change.original}\` | \`${change.replacement}\` | ${change.count} |`);
      }
      lines.push('');
    }
  }
  
  lines.push('## Результат');
  lines.push('');
  lines.push('✅ Адаптация завершена успешно');
  
  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Использование: npx tsx scripts/adapt-claude-to-cursor.ts <input> <output>');
    console.log('');
    console.log('Пример:');
    console.log('  npx tsx scripts/adapt-claude-to-cursor.ts \\');
    console.log('    extensions/suggest-rules/claude/commands/suggest-rules.md \\');
    console.log('    extensions/suggest-rules/cursor/commands/suggest-rules.md');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const outputFile = args[1];
  
  console.log(`📥 Чтение: ${inputFile}`);
  
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Файл не найден: ${inputFile}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(inputFile, 'utf-8');
  const changes: Change[] = [];
  
  console.log('🔄 Парсинг frontmatter...');
  const { frontmatter, body } = parseFrontmatter(content);
  
  console.log('🔧 Адаптация frontmatter...');
  const adaptedFrontmatter = adaptFrontmatter(frontmatter, changes);
  
  console.log('🔧 Адаптация body...');
  const adaptedBody = adaptBody(body, changes);
  
  // Собрать результат
  const result = adaptedFrontmatter + '\n' + adaptedBody;
  
  // Создать директорию если нужно
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`📤 Запись: ${outputFile}`);
  fs.writeFileSync(outputFile, result);
  
  // Статистика
  const stats = {
    totalReplacements: changes.reduce((sum, c) => sum + c.count, 0),
    frontmatterChanges: changes.filter(c => c.type === 'frontmatter').reduce((sum, c) => sum + c.count, 0),
    pathReplacements: changes.filter(c => c.type === 'path').reduce((sum, c) => sum + c.count, 0),
    categoryReplacements: changes.filter(c => c.type === 'category').reduce((sum, c) => sum + c.count, 0),
    argumentReplacements: changes.filter(c => c.type === 'argument').reduce((sum, c) => sum + c.count, 0),
    otherReplacements: changes.filter(c => !['frontmatter', 'path', 'category', 'argument'].includes(c.type)).reduce((sum, c) => sum + c.count, 0),
  };
  
  // Отчёт
  const report: AdaptationReport = {
    inputFile,
    outputFile,
    timestamp: new Date().toISOString(),
    changes,
    stats
  };
  
  const reportContent = generateReport(report);
  const reportFile = path.join(path.dirname(outputFile), '..', '..', 'adaptation-report.md');
  fs.writeFileSync(reportFile, reportContent);
  
  console.log('');
  console.log('📊 Статистика:');
  console.log(`   Frontmatter: ${stats.frontmatterChanges} замен`);
  console.log(`   Пути: ${stats.pathReplacements} замен`);
  console.log(`   Категории: ${stats.categoryReplacements} замен`);
  console.log(`   Аргументы: ${stats.argumentReplacements} замен`);
  console.log(`   Прочее: ${stats.otherReplacements} замен`);
  console.log(`   ────────────────────`);
  console.log(`   ВСЕГО: ${stats.totalReplacements} замен`);
  console.log('');
  console.log(`📋 Отчёт сохранён: ${reportFile}`);
  console.log('✅ Готово!');
}

main().catch(console.error);
