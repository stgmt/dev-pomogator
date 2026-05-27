# PRD — Home VPN Router (greenfield, no code yet)

**Status:** planning. Only this PRD exists. No build manifest, no code.

## Problem

Living in a region where Claude.ai / YouTube / Twitter are blocked. Want all home
devices (iPhone, TV, laptop) to reach blocked sites transparently WITHOUT installing
a VPN app on each device. Local banks must keep working (they block foreign IPs).

## Core capabilities

1. **VPN transport** — tunnel foreign traffic out through an exit server; must survive
   DPI inspection (obfuscation). WireGuard vs AmneziaWG vs VLESS to be decided.
2. **Routing strategy** — split-tunnel: only blocked domains via VPN, bank/local
   traffic stays direct. Full-tunnel breaks banking.
3. **DNS resolution** — router-level DNS with ad-blocking; force devices to use it,
   block DoH/DoT bypass.
4. **Router hardware / firmware** — which device runs this (OpenWrt-compatible router?
   Keenetic? Raspberry Pi?) and which firmware channel.
5. **Exit server hosting** — a VPS abroad to terminate the tunnel; geo matters
   (which country is not blocked by the target sites).
6. **Auto-recovery** — watchdog restarts the tunnel if it drops.

## Constraints

- One person maintaining it, comfortable with SSH but not a network engineer.
- Budget-sensitive: cheap VPS + one-time router cost.

## Out of scope (V1)

- Per-device policy (everyone gets the same routing).
- Mobile app.

## Open questions

- Which VPN protocol survives DPI best is NEEDS CLARIFICATION.
- Exit-server provider/geo is NEEDS CLARIFICATION.
