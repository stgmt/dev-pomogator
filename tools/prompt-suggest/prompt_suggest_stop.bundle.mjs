#!/usr/bin/env npx tsx
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// tools/prompt-suggest/prompt_suggest_stop.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
import { fileURLToPath } from "node:url";

// tools/prompt-suggest/prompt_suggest_core.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// tools/_shared/deepseek-model.ts
var OPENROUTER_DEEPSEEK_MODEL = "deepseek/deepseek-v4-flash";
var AIPOMOGATOR_DEEPSEEK_MODEL = "openrouter/deepseek/deepseek-v4-flash";
var DeepSeekCatalogError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "DeepSeekCatalogError";
  }
  code;
};
var catalogCache = /* @__PURE__ */ new Map();
function compatibleDeepSeekId(id) {
  return id === OPENROUTER_DEEPSEEK_MODEL || id === AIPOMOGATOR_DEEPSEEK_MODEL || id.endsWith(`/${OPENROUTER_DEEPSEEK_MODEL}`);
}
async function selectAipomogatorDeepSeek(options) {
  if (options.override) return { model: options.override, source: "environment_override" };
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const cached = catalogCache.get(baseUrl);
  if (cached) return { model: cached, source: "verified_catalog" };
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new DeepSeekCatalogError("catalog_unavailable", "global fetch is unavailable");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5e3);
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/models`, {
      method: "GET",
      signal: controller.signal,
      headers: { authorization: `Bearer ${options.apiKey}` }
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "catalog request timed out" : "catalog request failed";
    throw new DeepSeekCatalogError("catalog_unavailable", reason);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new DeepSeekCatalogError("catalog_unavailable", `catalog HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new DeepSeekCatalogError("catalog_malformed", "catalog is not JSON");
  }
  if (!payload || !Array.isArray(payload.data)) {
    throw new DeepSeekCatalogError("catalog_malformed", "catalog data is not an array");
  }
  const ids = payload.data.map((entry) => entry?.id).filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) {
    throw new DeepSeekCatalogError("catalog_empty", "catalog has no model IDs");
  }
  const selected = ids.find((id) => id === AIPOMOGATOR_DEEPSEEK_MODEL) ?? ids.find(compatibleDeepSeekId);
  if (!selected) {
    throw new DeepSeekCatalogError("compatible_route_absent", "DeepSeek V4 Flash is absent from the catalog");
  }
  catalogCache.set(baseUrl, selected);
  return { model: selected, source: "verified_catalog" };
}

// tools/prompt-suggest/prompt_suggest_core.ts
var STATE_DIR = path.join(os.homedir(), ".claude");
var STATE_FILE = path.join(STATE_DIR, "prompt-suggestion.json");
var DEFAULT_TTL = 6e5;
var DEFAULT_MODEL = OPENROUTER_DEEPSEEK_MODEL;
function log(level, message) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  process.stderr.write(`[${ts}] [PROMPT-SUGGEST] [${level}] ${message}
`);
}
var dotenvLoaded = false;
function ensureDotenvLoaded() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  for (const name of [".env", ".env.local"]) {
    try {
      const p = path.join(process.cwd(), name);
      if (!fs.existsSync(p)) continue;
      for (const raw of fs.readFileSync(p, "utf-8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
          v = v.slice(1, -1);
        }
        if (!process.env[m[1]]) process.env[m[1]] = v;
      }
    } catch {
    }
  }
}
function loadConfig() {
  ensureDotenvLoaded();
  const enabled = process.env.PROMPT_SUGGEST_ENABLED !== "false";
  const ttl = parseInt(process.env.PROMPT_SUGGEST_TTL || "", 10) || DEFAULT_TTL;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const autoCommitKey = process.env.AUTO_COMMIT_API_KEY;
  let baseUrl = "";
  let apiKey = "";
  let model = process.env.PROMPT_SUGGEST_MODEL || DEFAULT_MODEL;
  if (openrouterKey) {
    baseUrl = "https://openrouter.ai/api/v1";
    apiKey = openrouterKey;
  } else if (autoCommitKey) {
    baseUrl = "https://aipomogator.ru/go/v1";
    apiKey = autoCommitKey;
    model = process.env.PROMPT_SUGGEST_MODEL || AIPOMOGATOR_DEEPSEEK_MODEL;
  }
  return { enabled, ttl, llm: { baseUrl, apiKey, model } };
}
function writeSuggestionState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmpFile = STATE_FILE + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpFile, STATE_FILE);
}
function extractFirstUserMessage(transcriptPath) {
  try {
    const fd = fs.openSync(transcriptPath, "r");
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.toString("utf-8", 0, bytesRead);
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && obj.role === "user" && typeof obj.message === "string") {
          return obj.message.slice(0, 2e3);
        }
        if (obj && obj.type === "human" && typeof obj.content === "string") {
          return obj.content.slice(0, 2e3);
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}
async function callSuggestionLLM(config, messages) {
  let model = config.llm.model;
  if (config.llm.baseUrl.includes("aipomogator.ru")) {
    try {
      const selection = await selectAipomogatorDeepSeek({
        baseUrl: config.llm.baseUrl,
        apiKey: config.llm.apiKey,
        override: process.env.PROMPT_SUGGEST_MODEL
      });
      model = selection.model;
      log("DEBUG", `model selected via ${selection.source}: ${model}`);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "catalog_unavailable";
      log("ERROR", `DeepSeek catalog selection failed: ${code}`);
      return "";
    }
  }
  const url = `${config.llm.baseUrl}/chat/completions`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3e4);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.llm.apiKey}`,
        Connection: "close"
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 50,
        temperature: 0.3
      }),
      signal: ac.signal
    });
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}
function redactSecrets(text) {
  return text.replace(/authorization:\s*bearer\s+[a-z0-9._-]+/gi, "Authorization: Bearer [REDACTED]").replace(/sk-[a-z0-9]{10,}/gi, "sk-[REDACTED]").replace(/api[_-]?key\s*[:=]\s*['"]?[^'"\s]+/gi, "apiKey: [REDACTED]").replace(/token\s*[:=]\s*['"]?[^'"\s]+/gi, "token: [REDACTED]");
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// tools/prompt-suggest/prompt_suggest_stop.ts
function approve(systemMessage) {
  if (systemMessage) {
    process.stdout.write(JSON.stringify({ decision: "approve", systemMessage }));
  } else {
    process.stdout.write("{}");
  }
}
async function main() {
  const config = loadConfig();
  if (!config.enabled) {
    log("DEBUG", "Disabled via PROMPT_SUGGEST_ENABLED=false");
    approve();
    return;
  }
  const raw = await readStdin();
  if (!raw.trim()) {
    approve();
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    log("ERROR", `Failed to parse stdin: ${raw.slice(0, 200)}`);
    approve();
    return;
  }
  if (input.stop_hook_active) {
    log("DEBUG", "stop_hook_active=true, skipping suggestion generation");
    approve();
    return;
  }
  if (!config.llm.apiKey) {
    log("DEBUG", "No API key configured, skipping");
    approve();
    return;
  }
  const lastAssistantMessage = input.last_assistant_message ?? "";
  if (!lastAssistantMessage.trim()) {
    log("DEBUG", "No last_assistant_message, skipping");
    approve();
    return;
  }
  let firstUserMessage = "";
  if (input.transcript_path) {
    firstUserMessage = extractFirstUserMessage(input.transcript_path) ?? "";
  }
  let userContent = "";
  if (firstUserMessage) {
    userContent = `User's request: ${firstUserMessage}

Claude's final response: ${lastAssistantMessage.slice(0, 3e3)}`;
  } else {
    userContent = `Claude's final response: ${lastAssistantMessage.slice(0, 3e3)}`;
  }
  const safeContent = redactSecrets(userContent);
  const promptPath = path2.join(path2.dirname(fileURLToPath(import.meta.url)), "prompt_suggest_prompt.md");
  let systemPrompt;
  try {
    systemPrompt = fs2.readFileSync(promptPath, "utf-8").trim();
  } catch {
    try {
      const fallbackPath = path2.join(process.cwd(), ".dev-pomogator", "tools", "prompt-suggest", "prompt_suggest_prompt.md");
      systemPrompt = fs2.readFileSync(fallbackPath, "utf-8").trim();
    } catch {
      log("ERROR", "Cannot read prompt file");
      approve();
      return;
    }
  }
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: safeContent }
  ];
  log("INFO", `Calling LLM for suggestion (model: ${config.llm.model})`);
  const suggestion = await callSuggestionLLM(config, messages);
  const trimmed = suggestion.trim();
  if (!trimmed) {
    log("INFO", "LLM returned silence \u2014 no suggestion");
    approve();
    return;
  }
  const sessionId = input.session_id ?? "unknown";
  writeSuggestionState({
    suggestion: trimmed,
    timestamp: Date.now(),
    sessionId
  });
  log("INFO", `Suggestion generated: "${trimmed}"`);
  approve(`\u{1F4A1} ${trimmed}`);
}
main().catch((err) => {
  log("ERROR", `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
  approve();
}).finally(() => {
  process.exitCode = 0;
  setTimeout(() => process.exit(0), 2e3).unref();
});
