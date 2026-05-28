# tools/edge-debug-port

Tools shipped with the `edge-debug-port` extension.

## `setup-edge-debug-port.ps1`

PowerShell script that permanently configures Microsoft Edge to launch with `--remote-debugging-port=<N>` (default 9222).

### Apply

```powershell
pwsh tools/edge-debug-port/setup-edge-debug-port.ps1
```

What it changes:
- All Edge `.lnk` shortcuts found in standard locations (taskbar pin, Quick Launch, Start Menu — current user + all users — Desktop).
- Registry handlers for HTML/MHT/PDF and `microsoft-edge:` URI scheme: `MSEdgeHTM`, `MSEdgeMHT`, `MSEdgePDF`, `microsoft-edge` ProgIDs (HKCU + HKLM where present and writable).

After the script finishes, **close all Edge windows and reopen** for the changes to take effect on the running process. Edge restores prior session if "Continue where you left off" is configured in `edge://settings/onStartup`.

### Custom port

```powershell
pwsh tools/edge-debug-port/setup-edge-debug-port.ps1 -Port 9333
```

### Verify

After Edge restart:

```powershell
curl http://localhost:9222/json/version
```

Should return JSON with `Browser: "Edg/<version>"`.

### Revert

```powershell
pwsh tools/edge-debug-port/setup-edge-debug-port.ps1 -Revert
```

Reads `~/.edge-debug-port-backup.json` and restores all original shortcut Arguments and registry `(Default)` values.

## `connect-over-cdp.example.mjs`

Minimal Playwright example that demonstrates `chromium.connectOverCDP('http://localhost:9222')`. Uses the user's REAL Edge profile (not a disposable one), reuses an existing tab if present, calls `page.bringToFront()` to make it visible, captures a screenshot.

```bash
node connect-over-cdp.example.mjs https://example.com out.png
```

Use this as a template for your own automation scripts.

## Notes for agents

When you need to:

- **Take a screenshot of a page in the user's authenticated session** — use `connectOverCDP`, not `chromium.launch`.
- **Drive a multi-step workflow that needs user's cookies / saved logins** — same.
- **Avoid disrupting user's open tabs** — `connectOverCDP` does not own the browser. `browser.close()` only detaches; it does not kill Edge.

When you should NOT use this:

- One-shot scripts in CI where no user profile exists. Use plain `chromium.launch()` there.
- Headless rendering for pure HTML/CSS testing. CDP is overkill.
