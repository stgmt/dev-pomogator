# HTML Style Guide

Self-contained HTML (FR-2) — implemented in `html-renderer.ts` BASE_CSS. This documents the visual contract; the renderer is the source of truth.

## Hard rules

- **Self-contained:** inline `<style>` only. NO external `<link>`. (eval R3-adjacent; tested in ARCH002_01.)
- **No JS framework:** static + native `<details>` for collapse. Zero npm runtime dep.
- **Mermaid:** gated — only via CDN `<script>` when `--mermaid` flag; default OFF → ASCII fallback (no network needed to view).

## Colour tokens (dark theme)

| Token | Hex | Use |
|-------|-----|-----|
| `--rec` | #2563eb | recommended-card border + badge |
| `--good` | #16a34a | ✅ Good |
| `--neutral` | #ca8a04 | ◐ Neutral |
| `--bad` | #dc2626 | ❌ Bad |

## Layout

- **Recommended card pinned top** — `border: 2px solid var(--rec)` + `✅ RECOMMENDED` badge, ALWAYS first in DOM regardless of variant grid shuffle order (position-bias mitigation, FR-8).
- **Variant grid** — `repeat(auto-fit, minmax(300px, 1fr))`.
- Per variant: name, Y-statement (italic muted), chips (maturity ring + cost), Good/Neutral/Bad lists with ✅/◐/❌, failure-modes (if present), When-to-choose, When-NOT-to-choose (red), Confirmation.
- **INDEX.html** — status matrix table (Axis | Status | Chosen).
