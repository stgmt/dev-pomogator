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
var STATE_DIR = path.join(os.homedir(), ".claude");
var STATE_FILE = path.join(STATE_DIR, "prompt-suggestion.json");
var DEFAULT_TTL = 6e5;
var DEFAULT_MODEL = "anthropic/claude-3-haiku";
function log(level, message) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  process.stderr.write(`[${ts}] [PROMPT-SUGGEST] [${level}] ${message}
`);
}
function loadConfig() {
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
    model = process.env.PROMPT_SUGGEST_MODEL || "openrouter/anthropic/claude-3-haiku";
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
  const url = `${config.llm.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.llm.apiKey}`
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      max_tokens: 50,
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(3e4)
  });
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
  return content;
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
  process.exit(0);
});
