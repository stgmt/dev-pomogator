/**
 * Find the TOPMOST git repository root in the directory tree.
 *
 * This handles the case where a project is nested inside another git repo
 * (e.g., dev-pomogator/ inside presentation-ai-pomogator/).
 * We want to install plugins into the outermost project, not the nested one.
 *
 * @returns The absolute path to the topmost git repository root, or process.cwd() if not in a git repo
 */
export declare function findRepoRoot(): string;
//# sourceMappingURL=repo.d.ts.map