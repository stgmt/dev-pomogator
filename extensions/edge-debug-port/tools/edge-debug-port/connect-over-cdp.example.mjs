// Minimal example: connect Playwright to user's running Edge over CDP.
//
// Prerequisites:
//   1. Edge configured with --remote-debugging-port=9222 (run setup-edge-debug-port.ps1).
//   2. Edge process is running (taskbar pin, Start Menu — anything triggered AFTER setup).
//   3. `npm i playwright` in your project.
//
// Usage:
//   node connect-over-cdp.example.mjs https://example.com out.png

import { chromium } from 'playwright';

const targetUrl = process.argv[2] ?? 'https://example.com';
const screenshotPath = process.argv[3] ?? 'screenshot.png';

const browser = await chromium.connectOverCDP('http://localhost:9222');

// User's default Edge profile context — first context returned by CDP attach.
// All cookies, extensions, autofill, MCP browser extension etc. are live here.
const ctx = browser.contexts()[0];

// Reuse an existing tab pointing at the target, otherwise open a fresh one in the same window.
let page = ctx.pages().find((p) => {
  try { return p.url().startsWith(targetUrl); } catch { return false; }
});
if (!page) {
  page = await ctx.newPage();
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30_000 });
}

// CRITICAL: bring the tab to front in its window.
// CDP read-only operations (Page.captureScreenshot, etc.) do NOT activate windows by design,
// so a backgrounded tab returns BLACK frames. bringToFront() makes it visible.
await page.bringToFront();
await page.waitForTimeout(500);

await page.screenshot({ path: screenshotPath, fullPage: false });
console.log('saved', screenshotPath);

// Detach — does NOT close the user's Edge.
await browser.close();
