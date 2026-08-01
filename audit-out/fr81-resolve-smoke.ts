import { resolveRepoRoot } from '../tools/spec-mcp-server/server.ts';
const cwd = process.cwd();
const r = resolveRepoRoot('${CLAUDE_PROJECT_DIR}', cwd);
console.log(r === cwd ? 'OK' : 'FAIL', r);
