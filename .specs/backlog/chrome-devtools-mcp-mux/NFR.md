# Non-Functional Requirements (NFR)

## Performance

- **Skill load latency:** SKILL.md грузится Claude plugin-loader-ом без задержки на старт сессии. Skill description ≤ 4096 chars (Anthropic plugin convention) для эффективного caching.
- **Doctor check budget:** все 5 checks (FR-4) суммарно ≤ 20 сек wall-clock на typical машине. Самый медленный — CDMM-3 (`npx -y` resolve + spawn) допускается до 15s timeout; остальные ≤ 1s каждый.
- **Smoke test timeout:** FR-8 fixed 10s timeout. Не зависит от network speed (fail rapidly on broken network).
- **Daemon cold start:** first `cdmcp-mux` connect (auto-spawn daemon + Chrome launch + initialize) ≤ 30s на Windows (puppeteer Chrome download skipped — assumes Chrome already installed). Документируется в Skill.md как expected behavior.

## Security

- **Path validation:** все пути из `extension.json` (skillFiles, toolFiles) и user's `.mcp.json` входы валидируются через `resolveWithinProject(projectPath, path)` per `no-unvalidated-manifest-paths` rule.
- **Atomic writes:** `.mcp.json` обновляется через temp file + `fs.move` per `atomic-config-save` rule. Параллельные installer runs защищены через update lock per `atomic-update-lock` rule (`flag: 'wx'`).
- **No env var leakage:** Doctor JSON output (mode `--json`) MUST redact env values для security; имя env var печатается, value — `<redacted>`. Pattern из `pomogator-doctor` spec.
- **Shared Chrome profile warning:** SKILL.md ОБЯЗАН явно документировать что 2+ Claude сессии видят общие cookies/login (architectural property mux); user-facing warning при первой установке.
- **Cross-context isolation guarantee:** SKILL.md MUST документировать что mux daemon отвергает page-scoped вызовы из чужих контекстов (architectural property из upstream `--experimentalPageIdRouting`); агент не должен полагаться что cross-call possible.

## Reliability

- **Atomic `.mcp.json` writes** (см. Security) — никогда не оставлять corrupted partial JSON.
- **Smart merge preserves user MCP keys:** uninstall и install MUST оставлять остальные `mcpServers` записи нетронутыми. Tested через integration test fixture с pre-existing user MCP server.
- **Idempotent install:** повторный run installer-а с уже установленным extension MUST быть no-op (или version bump only) — без duplicate entries в `config.json.installedExtensions` или `.mcp.json`.
- **Self-healing config:** если `.mcp.json` валидный JSON но запись `chrome-devtools-mcp-mux` отсутствует/corrupted после prior install — doctor CDMM-2 detects + reinstall recovers.
- **Daemon orphan tolerance:** uninstall не убивает running daemon (FR-6.6); user может убить вручную через `cdmcp-mux status` CLI или OS task manager. Doctor может (P1, follow-up) эмитить 🟡 на orphan daemon, но не блокирует ничего.

## Usability

- **Conflict warning UX (FR-5):** интерактивный prompt с 3 опциями + default behavior для CI. Не silent skip; не silent overwrite. Текст warning явно ссылается на Chrome 136 mitigation для обучения пользователя.
- **Doctor traffic-light output:** 🟢/🟡/🔴 grouping (per `pomogator-doctor` pattern). Каждый failed check имеет actionable `fixHint`. Не "something broken" — exact команда или путь.
- **Skill direction language:** SKILL.md description должна быть **command-style** ("use mux", "do not call vanilla chrome-devtools-mcp"), не declarative ("mux can be used"). Pattern: imperative + Triggers + Hard rules tables (mirror `edge-debug-port/SKILL.md`).
- **Installer post-message:** после успешной установки installer выводит one-liner: `chrome-devtools-mcp-mux installed; first browser MCP call will download Chrome (~170MB) если не установлен. Run /pomogator-doctor для verification.`
- **CHANGELOG visible at upgrade:** при bump pinned version в FR-7 — CHANGELOG entry с user-facing описанием что изменилось upstream + дата.
