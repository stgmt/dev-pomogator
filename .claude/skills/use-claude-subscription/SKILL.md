---
name: use-claude-subscription
description: |
  Wire up the current project to use the user's Claude subscription via
  the local Anthropic-compatible proxy (claude-proxy-infra / Meridian on
  http://127.0.0.1:3456) instead of an ANTHROPIC_API_KEY. Detects the
  project's language stack (Python, Node.js, Go, etc.), edits .env files
  with the right env vars, handles Windows VPN/NO_PROXY quirk, ensures the
  proxy is alive (delegating to proxy-up skill if needed), and verifies
  end-to-end with a smoke test. Use whenever the user says "use claude
  here", "wire claude in this project", "claude через подписку",
  "хочу клода в этом проекте без ключа", "анthropic api без ключа",
  "set up claude api locally", "use my claude subscription here".
---

# use-claude-subscription — wire any project to the local Claude subscription proxy

## When to invoke

User says (any of):

- "use claude in this project" / "set up claude here"
- "use my subscription instead of API key"
- "wire claude api into this app"
- "хочу клода тут без ключа"
- "подключи anthropic к проекту"
- After scaffolding a new project that needs an LLM
- When you encounter a project with hardcoded API key handling and the
  user wants to switch to subscription routing

## Pre-conditions

This skill assumes:

- The local proxy infrastructure is set up (`claude-proxy-infra` cloned).
  If not, point user to clone it: `git clone <claude-proxy-infra-url> D:/repos/claude-proxy-infra`.
- The proxy is running on `http://127.0.0.1:3456` OR can be started.
  Use `proxy-up` skill to verify/start before continuing.

## Step-by-step

### 1. Verify proxy is reachable

```bash
curl -sf http://127.0.0.1:3456/health
```

- If 200 → proceed.
- If connection refused / timeout → invoke `proxy-up` skill first to
  bring it up. Do NOT proceed until /health returns 200.

### 2. Detect project stack

Look for one or more of these signals in the project root (and one
level deep):

| Signal | Stack |
|---|---|
| `package.json` with `@anthropic-ai/sdk` in deps | Node.js + Anthropic SDK |
| `package.json` with `openai` only | Node.js + OpenAI SDK (use OpenAI-compat endpoint) |
| `package.json` with `langchain`, `@langchain/anthropic` | Node.js + LangChain |
| `requirements.txt` / `pyproject.toml` / `uv.lock` with `anthropic` | Python + Anthropic SDK |
| `requirements.txt` with `openai` | Python + OpenAI SDK |
| `requirements.txt` with `langchain-anthropic` or `langgraph` | Python + LangGraph/LangChain |
| `go.mod` with `anthropic-sdk-go` | Go |
| `Cargo.toml` with `anthropic-rs` or similar | Rust |
| Dotnet `.csproj` with Anthropic SDK | C# |

If multiple → pick the primary one driving Claude calls (usually clear
from grep'ping for `anthropic`/`Claude` in source files).

### 3. Locate or create the env-config file

Look for, in order:

1. `.env` (most common)
2. `.env.local`, `.env.development`
3. `config/.env`, `apps/*/env`
4. Project-specific config (`config.yaml`, `appsettings.json`, etc.)

If none exists → create `.env` in project root.

### 4. Set the right env vars (per stack)

For **Anthropic SDK** (Python or Node.js, any version ≥ 0.30):

```ini
ANTHROPIC_BASE_URL=http://127.0.0.1:3456
ANTHROPIC_API_KEY=meridian-placeholder-not-real-key
```

For **OpenAI SDK** clients pointing at Claude (via Meridian's OpenAI-compat):

```ini
OPENAI_BASE_URL=http://127.0.0.1:3456/v1
OPENAI_API_KEY=meridian-placeholder-not-real-key
```

For **LangChain/LangGraph (Python)**: same as Anthropic SDK above. The
`langchain-anthropic` package honors `ANTHROPIC_BASE_URL`.

For **LangChain (Node.js)** with `@langchain/anthropic`: same env vars,
but if the model is constructed with explicit `apiKey` / `baseURL`
options in code, may need to update the constructor too.

### 5. ALWAYS add NO_PROXY (critical on Windows with VPN/V2Ray)

```ini
NO_PROXY=127.0.0.1,localhost,::1
no_proxy=127.0.0.1,localhost,::1
```

Why: Windows system HTTP proxy (V2Ray, Clash, etc.) intercepts loopback
in some HTTP libraries (Python `httpx`, Go `net/http` with proxy from env).
Without NO_PROXY, the SDK gets `503` from the system proxy and never
reaches Meridian. This is a client-side networking issue, not a Meridian
problem.

Skip only if: Linux/macOS without HTTP_PROXY env var set.

### 6. Verify the project's env loader

- **Python**: ensure `python-dotenv` is installed and `load_dotenv()` is
  called before instantiating the Anthropic client. If the project doesn't
  use dotenv, suggest adding it OR setting env vars at process start.
- **Node.js**: same with `dotenv`, or via `--env-file=.env` on Node 20+.
- **Bash/CLI run**: user can `source .env && python app.py`.

### 7. Run a smoke test

Construct a minimal request appropriate to the stack. Example for Python:

```python
import os
from dotenv import load_dotenv
load_dotenv()
import anthropic
c = anthropic.Anthropic()
r = c.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=50,
    messages=[{"role": "user", "content": "say hi in 5 words"}],
)
print(r.content[0].text)
```

Run it. Expected: short text response. If 503 → check NO_PROXY. If 401 →
check proxy /health auth status. If "binary not found" → proxy build
issue, point user to claude-proxy-infra README troubleshooting.

### 8. Report to user

One terse line:

```
Wired <project-name> → http://127.0.0.1:3456 (Claude subscription).
Verified: <one-line smoke test result>.
```

## Stack-specific notes

### LangGraph projects

Standard Anthropic SDK env vars work. The proxy must be in **passthrough
mode** (`MERIDIAN_PASSTHROUGH=1`) for LangGraph's `should_continue`
conditional edges to receive `tool_use` blocks. If you see the SDK
making just one round-trip and never returning tool_use → check
`/health` for `mode:passthrough` (not `mode:internal`).

### Projects using `langchain-anthropic`

```python
from langchain_anthropic import ChatAnthropic
llm = ChatAnthropic(model="claude-sonnet-4-6")  # auto-honors ANTHROPIC_BASE_URL
```

### Projects with custom Anthropic client wrappers

Look for code like:
```python
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
```

This works as-is — the SDK auto-reads `ANTHROPIC_BASE_URL` from env even
when `api_key` is set explicitly.

But beware:
```python
client = anthropic.Anthropic(
    api_key="...",
    base_url="https://api.anthropic.com",  # ← hardcoded, ignores env
)
```

If `base_url` is hardcoded → must change to read from env, or remove the
arg.

### Anthropic SDK on Bedrock / Vertex

If project uses `anthropic.AnthropicBedrock` or `anthropic.AnthropicVertex`,
this skill doesn't apply directly — those are different routing paths
(AWS / GCP, not subscription). Tell user that Meridian is for the
standard `Anthropic` client only.

## Anti-patterns

- ❌ Modifying source code when env vars suffice. The SDK reads
  `ANTHROPIC_BASE_URL` automatically — no client constructor changes needed.
- ❌ Setting only `ANTHROPIC_BASE_URL` without `ANTHROPIC_API_KEY`. The
  SDK requires *some* API key string even if the proxy ignores it; the
  SDK throws ENV missing error before sending request.
- ❌ Forgetting NO_PROXY on Windows. Symptoms: `curl /health` works, but
  `python app.py` returns 503. Ratio of "broken proxy" reports caused by
  this single missing line: high.
- ❌ Committing `.env` to git. The placeholder ANTHROPIC_API_KEY isn't
  secret, but committing other env vars is bad hygiene. Add `.env` to
  `.gitignore` if not already.
- ❌ Running smoke test that consumes 1000+ tokens to "verify". A 5-word
  reply is enough — don't burn subscription budget on a hello-world.
- ❌ Pointing project at `https://api.anthropic.com` "as a fallback".
  Mixing real API key + proxy URL is a recipe for confusion. One source
  of truth.

## When NOT to use this skill

- Project already configured to use Bedrock / Vertex / direct API key
  and user has not asked to change.
- Production deployment (proxy is dev-only — for prod, use real API key
  with billing on Anthropic).
- User explicitly wants to use a different LLM provider.

## Cross-references

- `proxy-up` skill — for proxy operational issues (start/restart/diagnose)
- `D:/repos/claude-proxy-infra/README.md` — user-facing setup docs
- `D:/repos/presentation-reels/.specs/local-claude-subscription-proxy/` — full spec
