// SessionStart hook — prints a one-screen summary of open backlog
// entries so the agent / user sees pending spec-fix work at session
// start. Quiet (no output) if the backlog is empty or absent.

import { readOpen, readByCategory } from './writer.ts';

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  let open;
  try {
    open = readOpen(repoRoot);
  } catch {
    return; // No backlog dir yet — quiet exit.
  }
  if (open.length === 0) return;

  // Group by category for a one-line histogram.
  const byCat = readByCategory(repoRoot);
  const lines: string[] = [];
  for (const [cat, entries] of byCat) {
    const openOnly = entries.filter((e) => e.status === 'open');
    if (openOnly.length === 0) continue;
    lines.push(`  ${openOnly.length.toString().padStart(4)} ${cat}`);
  }
  if (lines.length === 0) return;

  process.stderr.write(
    `\n[spec-backlog] ${open.length} open backlog entries:\n` +
      lines.join('\n') +
      `\n  → list:    \`dev-pomogator-spec-backlog list\`\n` +
      `  → resolve: \`dev-pomogator-spec-backlog resolve --category <cat>\`\n` +
      `  → skill:   \`/spec-backlog\` (or Skill("spec-backlog"))\n\n`,
  );
}

main().catch(() => {
  /* silent */
});
