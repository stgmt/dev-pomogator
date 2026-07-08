# MCP claude-in-chrome Only — No PowerShell Desktop Captures

Когда session-pilot skill (или любой другой code path в этом плагине) нуждается в browser interaction (navigation, screenshot, page reading), MUST использовать `mcp__claude-in-chrome__*` MCP tools. **PowerShell desktop screenshots ЗАПРЕЩЕНЫ для verification в этом плагине.**

## Правильно

```python
# In skill scenarios
mcp__claude-in-chrome__navigate(tabId=311098076, url="http://localhost:8083")
mcp__claude-in-chrome__screenshot(tabId=311098076, save_to_disk=True)
mcp__claude-in-chrome__read_page(tabId=311098076, filter="interactive")
```

## Неправильно

```powershell
# ❌ Don't do this in session-pilot scenarios
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$bmp.Save("desktop.png", ...)
```

## Почему

User explicitly stated this requirement: «юзать блять клауде хроме экстеншн а не ту хуйню что ы юзаешь ща для браузера». Reasons:

1. **Reliability**: PowerShell screenshots capture whatever's on the screen at that moment. Tab может быть в фоне, перекрыто другим окном, на другом мониторе. claude-in-chrome captures the actual tab content regardless of Z-order.
2. **Specificity**: claude-in-chrome targets specific tab by ID. PowerShell captures whole desktop, requires post-processing to crop.
3. **Page content access**: claude-in-chrome's `read_page` returns accessibility tree (sortable headers, action buttons, status indicators). PowerShell screenshot is opaque pixels — can't programmatically verify «status column shows LIVE».
4. **Cross-platform**: claude-in-chrome works identical on Windows/Mac/Linux. PowerShell is Windows-only.
5. **Testability**: claude-in-chrome operations are mockable for tests. Desktop screenshots aren't.

## Когда исключения допустимы

**Никогда** в session-pilot scenarios. Если действительно нужен desktop-level capture (e.g. for debugging Z-order issue в самом dashboard), это done outside session-pilot skill в personal session.

## Verification format

When skill scenario verifies dashboard state via screenshot:

```
mcp__claude-in-chrome__navigate({tabId: <id>, url: "http://localhost:8083"})
sleep 2
mcp__claude-in-chrome__screenshot({tabId: <id>, save_to_disk: true})
# Read the saved screenshot via Read tool
# Then output verdict:
# CONFIRMED: dashboard rendered, N worktrees visible, top row is Y with LIVE indicator
# OR
# DENIED: <specific reason — what was expected vs what was seen>
```

## Tab management

session-pilot skill scenarios:
1. Call `mcp__claude-in-chrome__tabs_context_mcp` first to get tab group context
2. If no tab exists, call `mcp__claude-in-chrome__tabs_create_mcp`
3. Use returned `tabId` for subsequent operations
4. Per project rule `claude-in-chrome-multisession`, isolation is automatic

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Screenshot timeout 30s | Tab is hidden, Chrome throttles canvas RAF | Bring tab to foreground via system, OR rely on `read_page` (DOM-based, not RAF-dependent) |
| `read_page` returns empty | Page not loaded yet | Add `sleep 2` after navigate |
| «Tab not in current group» | Tab from different MCP session | Recreate tab via `tabs_create_mcp` |
| canvas pixels all 0 | Background tab, throttled paint | Same as above — DOM-read instead |

## Не отступай от этого правила

User has been explicit. Это hard requirement, не предложение. Any verification in session-pilot scenarios using PowerShell `[System.Drawing.Bitmap]` or similar is automatic regression — fix immediately.
