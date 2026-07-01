# Marksman LSP — Gap Analysis, Report & Work Plan

> Status: **analysis for sign-off** — no code yet. Author: AI (claude-opus-4-8), 2026-06-03.
> Trigger: `_15` ("binary responds to LSP initialize") could not be closed honestly; investigation revealed the whole Marksman LSP path is unused at runtime.

## 1. Простыми словами (для ревью)

dev-pomogator **скачивает** Marksman (LSP-сервер для Markdown) при установке, проверяет его по sha256, кладёт на диск — и **больше никогда не запускает.** Вся навигация в проекте идёт через другой, graph-backed инструмент (`find_refs`). То есть «интеграция с Marksman по LSP» по факту **не существует** — есть только установщик и флажок, который читает один-единственный тест. Это всплыло, потому что BDD-шаг `_15` «бинарь отвечает на LSP initialize» нечем было закрыть честно: некому отправить этот `initialize`.

Решение (по твоему выбору): **достроить настоящую LSP-интеграцию end-to-end**, с честным BDD против **настоящего** Marksman, обновить спеку (FR-7) под реальность, и добавить правило/скил, чтобы «корневой функционал, который скачивается, но не используется» больше не проходил незамеченным.

## 2. Evidence (airtight)

| Claim | Evidence | Verdict |
|-------|----------|---------|
| Installer works (downloads + verifies + writes binary) | `tools/marksman-installer/postinstall.ts` — real `https.get`, `sha256Hex`/`verifyHash`, writes `.dev-pomogator/bin/marksman` (mode 0o755), fail-open | ✅ real |
| `binary_path` is consumed at runtime | `grep binary_path --include=*.ts tools/` (excl. installer/log/tests) → **NONE** | ❌ never read |
| `resolveLspMode` has a runtime caller | `grep resolveLspMode` (excl. def + tests) → only `tests/step_definitions/phase2-mcp.ts:531` | ❌ test-only |
| `lsp-mode.ts` imported at runtime | `grep lsp-mode --include=*.ts tools/` (excl. tests) → **NONE** | ❌ dead at runtime |
| An LSP / JSON-RPC client exists (lib or hand-rolled) | `grep -i "jsonrpc\|language-server\|lsp"` package.json → NONE; `grep "Content-Length\|InitializeParams\|spawn.*marksman" tools/` → NONE | ❌ no client |
| Navigation actually served by | `tools/spec-mcp-server/tools.ts:670` `find_refs` — graph-backed (edges + task refs), "works with or without the Marksman binary" | ✅ find_refs only |

**Conclusion:** FR-7's Marksman LSP is **vestigial** — installed, verified, then orphaned. `find_refs` (the documented "fallback") is in reality the *only* navigation path, used unconditionally.

## 3. How it was missed (so the prevention is targeted)

- The **install side** had real unit coverage (`selectAsset`/`verifyHash`/`runInstall`) → looked "done".
- The **consumer side** was never built; `resolveLspMode` returned a flag nothing acted on.
- The BDD scenario that *would* have caught it (`_15` "responds to initialize") was **deferred to a manual check** (`return 'pending'`) — so no automated test ever exercised a running Marksman.
- No check flags "a downloaded/installed dependency with zero runtime consumer." A green install suite + a pending smoke step looked healthy.

## 4. Value-delta: what Marksman LSP gives that `find_refs` does not (stated finding)

`find_refs` operates on the **spec graph** (FR/AC/Scenario/Task/File nodes + edges) — it answers "what spec nodes link to this node". Marksman operates on **arbitrary Markdown**: headings, `[[wiki-links]]`, cross-`.md` references, plus LSP features (`textDocument/definition`, `/references`, `/documentSymbol`, hover, broken-link diagnostics) over **all** `.md`, not just modeled spec nodes.

**Decision (user chose build):** wire the **specific** Marksman capabilities the MCP server will expose — `initialize` + `textDocument/definition` + `textDocument/references` over Markdown wiki-links — with `find_refs` as the *genuine* graph-backed fallback when Marksman is unavailable. **Not** a whole LSP client; only the methods consumed.

## 5. Design — "best + BDD-convenient"

```
MCP server startup
  └─ resolveLspMode(repoRoot)
       ├─ 'marksman'    → start MarksmanBridge (spawn binary_path, JSON-RPC/stdio, initialize)
       │                   navigation tools (md_definition / md_references) call the bridge
       └─ 'js-fallback' → navigation tools call find_refs (graph-backed) — genuine fallback
```

- **`tools/marksman-lsp/bridge.ts`** (new, production): spawn the binary at `binary_path`, JSON-RPC over stdio with LSP `Content-Length` framing, `initialize`/`initialized` handshake, `textDocument/didOpen`, `textDocument/definition` + `/references`, `shutdown`/`exit`. Inject `spawn` for tests. Surfaces a typed `initialize` capabilities result (this is what `_15` asserts).
- **MCP wiring** (`tools.ts`): on `'marksman'`, navigation tools delegate to the bridge; on failure/unavailable, fall back to `find_refs`. `binary_path` finally gets read.
- **LSP client lib decision:** prefer the small, battle-tested `vscode-jsonrpc` for framing rather than hand-rolling `Content-Length` parsing (fewer edge-case bugs). To be confirmed in the spec's architecture-decision axis.

### BDD strategy (the anti-fake-green core)

- Honest e2e = spawn the **REAL** Marksman, real `initialize`, assert its **actual** capabilities response (and a real `references` round-trip on a fixture `.md`). **No stub.**
- The test **runs for real in a guaranteed environment**: the **Docker test image installs the real Linux Marksman** (the installer already fetches it). 
- **A skip in the Docker (guaranteed) env is a FAILURE, not a pass.** Host/offline may `skip-with-reason`, but the suite must prove the binary was exercised somewhere it's guaranteed present — otherwise we rebuild the always-skip fake-green this whole thread came from.

## 6. Work plan (phased, verify each)

| Phase | Work | Verify |
|-------|------|--------|
| P0 | This analysis + sign-off; create spec `.specs/marksman-lsp-integration/` + branch `feat/marksman-lsp-integration` | doc reviewed |
| P1 | `bridge.ts` — spawn + JSON-RPC framing + `initialize` handshake (injectable spawn) + unit tests | unit green |
| P2 | MCP wiring: `resolveLspMode === 'marksman'` starts bridge; `md_definition`/`md_references` tools delegate, fall back to `find_refs` | unit + integration |
| P3 | Docker test image installs real Marksman; **real e2e** BDD: `_15` (initialize) + `_16` (fallback) rewritten to spawn real binary; skip-in-Docker = fail | e2e green in Docker |
| P4 | Spec updates (§7) + skill/prevention (§8); reconcile FR-7 to reality | specs-validator + the new gate |

## 7. Spec updates (FR-7 anchor)

- **FR-7** rewritten: Marksman LSP is the *primary* MD-navigation surface for `md_definition`/`md_references`; `find_refs` is the graph-backed *fallback*. (Today the text implies this; reality is the inverse — the plan makes FR-7 *true*.)
- **ACCEPTANCE_CRITERIA**: AC for the bridge handshake + the fallback switch (EARS).
- **`.feature`**: `_15`/`_16` rewritten as **real e2e** (spawn real Marksman); add a scenario for `md_references` round-trip + a scenario for "Marksman absent → md_references served by find_refs".
- **DESIGN**: the bridge architecture + the `vscode-jsonrpc`-vs-hand-rolled decision.

## 8. Prevention skill/rule (tightly scoped — avoid H1 over-generalization)

New rule **`dead-integration-guard`** (mirrors the scope-gate / variant-matrix gate shape):

- **Trigger WHEN** a diff adds/installs an **external dependency, downloaded binary, or installer** (e.g. a `postinstall` that fetches a binary, a new `bin/` artifact, a service the code "configures").
- **Require:** the dependency has (a) at least one **runtime consumer** (not just a flag-resolver / a test), AND (b) an **e2e that exercises it against the real artifact** in a guaranteed environment.
- **Hard-OUT** (no fire): dev-deps/build-tools, type-only packages, removals, pure version bumps, docs.
- **Connects to** existing `verify-against-real-artifact` (real producer output) + `integration-tests-first` (no unit-only coverage of a critical flow). This rule adds the missing axis: *"installed ≠ integrated"* — a green install suite must not be mistaken for a working integration.

## 9. Process notes

- **Own spec + branch.** This is a distinct multi-file feature; bolting it onto the live, co-edited `feat/phase-2a-...` branch invites the `_48` duplicate-block collision at LSP-bridge scale.
- `_15`/`_16` stay **honest-red** on the current branch until P3 lands on the feature branch.
- Keep/drop value-delta (§4) is a **stated finding**, not a blocker — build is the chosen path.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
