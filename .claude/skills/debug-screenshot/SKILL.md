---
name: debug-screenshot
description: >
  Screenshot-driven debugging and visual verification. Take screenshots of the current screen,
  analyze what's visible, form and test hypotheses about UI state. Use this skill whenever you
  need to verify something visually — TUI state, terminal output, window layout, error dialogs,
  or any situation where "seeing" the screen would help debug or confirm behavior. Also use when
  the user says "покажи", "проверь визуально", "скринь", "screenshot", "что на экране",
  "видно ли", or asks you to verify UI state.
allowed-tools: Bash, Read
---

# /debug-screenshot — Visual Debugging & Hypothesis Testing

## When to use

- Verifying UI state (TUI shows correct data, window layout is right)
- Debugging "it doesn't work" — screenshot shows what the user actually sees
- Before/after comparison (take screenshot, make change, take another)
- Hypothesis testing: "I think the TUI shows X" → screenshot → confirm/deny
- When the user asks to check something visual

## Taking a screenshot

Run the bundled PowerShell script (Windows only):

```bash
powershell -ExecutionPolicy Bypass -File extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1 -Label "description"
```

The script saves to `.dev-pomogator/screenshots/screen-{timestamp}-{label}.png` and prints the path.

Then read the image:

```
Read the saved PNG file path to view it
```

Screenshots are multimodal — Claude can see and analyze the image content.

## Hypothesis-driven debugging workflow

When debugging visual issues, follow this cycle:

### 1. State the hypothesis

Before taking a screenshot, write down what you expect to see:

```
Hypothesis: TUI compact bar should show "🔄 vitest 38✅ 2❌" after running tests through wrapper
```

### 2. Capture evidence

Take a screenshot with a descriptive label:

```bash
powershell -ExecutionPolicy Bypass -File extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1 -Label "after-wrapper-run"
```

### 3. Analyze

Read the screenshot and compare with hypothesis:

- **Confirmed** → hypothesis was correct, move on
- **Denied** → describe what you actually see, form new hypothesis
- **Inconclusive** → need more data (different area, zoom, or additional screenshots)

### 4. Report

Summarize findings:

```
Hypothesis: TUI shows test progress after wrapper run
Evidence: screenshot-20260316-232511-after-wrapper-run.png
Result: DENIED — TUI shows "no test runs" because PID 36640 watches session a109bc97, not 95c373fa
Next: Kill stale TUI, verify correct session
```

## Before/after comparison

For changes that should affect the UI:

1. Screenshot with `-Label "before-change"`
2. Make the change
3. Screenshot with `-Label "after-change"`
4. Compare both images and report differences

## Tips

- Use descriptive labels — they become part of the filename and help track the debugging session
- Screenshots go to `.dev-pomogator/screenshots/` which is gitignored
- On non-Windows: this skill currently supports Windows only (System.Windows.Forms)
- For terminal-only checks, prefer reading process output directly — screenshots are for when you need to see the actual rendered UI
