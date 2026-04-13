import fs from 'fs-extra';
import path from 'path';
const RAW_BASE = 'https://raw.githubusercontent.com/stgmt/dev-pomogator/main';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;
function getLocalUpdateSourceRoot() {
    return process.env.DEV_POMOGATOR_UPDATE_SOURCE_ROOT || null;
}
async function readLocalUpdateFile(relativePath) {
    const sourceRoot = getLocalUpdateSourceRoot();
    if (!sourceRoot) {
        return null;
    }
    const base = path.resolve(sourceRoot);
    const resolved = path.resolve(base, relativePath);
    const relative = path.relative(base, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return null;
    }
    if (!await fs.pathExists(resolved)) {
        return null;
    }
    return fs.readFile(resolved, 'utf-8');
}
async function fetchWithRetry(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'dev-pomogator' },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                // 404 is expected for local/dev-only extensions whose manifest was never
                // pushed upstream — silent skip (no leak to SessionStart hook output).
                // Other statuses (5xx, 403, etc.) indicate real upstream problems → log.
                if (response.status !== 404) {
                    console.log(`  ⚠ HTTP ${response.status} for ${url}`);
                }
                return null;
            }
            return response;
        }
        catch (error) {
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
                continue;
            }
            const message = error instanceof Error ? error.message : String(error);
            console.log(`  ⚠ Fetch failed for ${url}: ${message}`);
            return null;
        }
    }
    return null;
}
export async function fetchExtensionManifest(name) {
    const localManifest = await readLocalUpdateFile(`extensions/${name}/extension.json`);
    if (localManifest) {
        return JSON.parse(localManifest);
    }
    const url = `${RAW_BASE}/extensions/${name}/extension.json`;
    const response = await fetchWithRetry(url);
    if (!response)
        return null;
    return response.json();
}
export async function downloadExtensionFile(extensionName, relativePath) {
    // Centralized paths (.claude/rules/, .claude/commands/, .claude/skills/)
    // live at repo root, not inside extensions/{name}/
    if (relativePath.startsWith('.claude/rules/') || relativePath.startsWith('.claude/commands/') || relativePath.startsWith('.claude/skills/')) {
        const localFile = await readLocalUpdateFile(relativePath);
        if (localFile !== null)
            return localFile;
        const url = `${RAW_BASE}/${relativePath}`;
        const response = await fetchWithRetry(url);
        if (!response)
            return null;
        return response.text();
    }
    // toolFiles/skillFiles in extension.json use target project paths
    // (.dev-pomogator/tools/... or .claude/skills/...) but source files on GitHub
    // are at extensions/{name}/tools/... or extensions/{name}/skills/...
    const remotePath = relativePath
        .replace(/^\.dev-pomogator\//, '')
        .replace(/^\.claude\//, '');
    const localFile = await readLocalUpdateFile(`extensions/${extensionName}/${remotePath}`);
    if (localFile !== null) {
        return localFile;
    }
    const url = `${RAW_BASE}/extensions/${extensionName}/${remotePath}`;
    const response = await fetchWithRetry(url);
    if (!response)
        return null;
    return response.text();
}
//# sourceMappingURL=github.js.map