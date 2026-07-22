export function renderWindowsContextModeGuidance(): string {
  return [
    '# context-mode Windows/worktree guidance',
    '',
    '- `language: shell` executes bash semantics; invoke PowerShell explicitly with `pwsh -NoProfile`.',
    '- `ctx_execute_file` is confined to the current project root.',
    '- Use `ctx_batch_execute` for external worktree paths, large logs, and paths outside the active project root.',
    '- Wrap compound shell commands with `bash -c` when the shell parser would otherwise split them incorrectly.',
  ].join('\n');
}
