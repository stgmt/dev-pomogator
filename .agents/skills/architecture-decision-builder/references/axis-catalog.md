# Axis Catalog — BMAD seed + cascading map

Seed taxonomy (BMAD 5-tier) implemented in `axis-detector.ts` SEED_AXES. This reference documents the **cascading map** (FR-6) — which choices open new axes.

## Seed axes (detection)

| Axis id | Category | Tier | Activated by (keywords) |
|---------|----------|------|-------------------------|
| database | Data | Critical | persist/relational/database/postgres/store/schema |
| file-storage | Data | Important | file attachment/upload/raw csv/object storage/S3 |
| auth | Auth-Security | Critical | auth/login/tenant/RLS/isolation |
| api | API-Communication | Critical | HTTP/REST/GraphQL/API/endpoint/webhook |
| frontend | Frontend | Important | frontend/dashboard/UI/SPA/web app |
| hosting | Infra-Deployment | Critical | deploy/hosting/server/managed/cloud |
| background-jobs | Infra-Deployment | Important | cron/schedule/digest/batch/queue/worker |
| email | API-Communication | Important | email/notification/digest/SMTP |
| llm | Other | Deferred | LLM/GPT/Claude/OpenRouter/classify |

**Non-webapp domains** (networking / hardware / messaging / devtools / data — RU+EN keywords):

| Axis id | Category | Tier | Activated by (keywords) |
|---------|----------|------|-------------------------|
| network-transport | Networking | Critical | VPN/WireGuard/AmneziaWG/VLESS/proxy/tunnel/обфускац/туннел |
| dns-resolution | Networking | Important | DNS/resolver/DoH/DoT/AdGuard/adblock/NextDNS/fakeip/hijack |
| routing-strategy | Networking | Critical | split-tunnel/full-tunnel/routing/DPI bypass/Zapret/маршрутизац |
| hardware-platform | Hardware | Critical | router/OpenWrt/Keenetic/firmware/прошивк/SBC/embedded/роутер |
| messaging-channel | API-Communication | Important | SMS/voice call/push/Twilio/telephony/IVR/голосов/звонок |
| packaging-distribution | Infra-Deployment | Important | CLI/binary/package manager/npm publish/installer/homebrew/apt/дистрибут |
| data-pipeline | Data | Important | ETL/data pipeline/ingest/stream processing/Kafka/Airflow/конвейер |

> H1 guard: keywords specific — webapp greenfield (TaskFlow) detects 0 non-webapp false-positives; router-vpn PRD detects 4 (network-transport/dns/routing/hardware). Verified via eval + smoke.

Plus L3: `NEEDS CLARIFICATION` / `TBD` lines referencing a tech-choice noun → `clarify-*` deferred axes.

## Cascading map (choice → unlocked axis)

When a variant is chosen, these dependent axes are appended to QUEUE.json (depth cap 2):

| Chosen variant (axis) | Unlocks axis | Why |
|-----------------------|--------------|-----|
| Cloudflare Workers (hosting) | workers-storage (KV vs D1 vs external Postgres) | Workers need a compatible data layer |
| Serverless / Lambda (hosting) | cold-start-mitigation | provisioned concurrency vs accept latency |
| Self-hosted (hosting) | backup-strategy | you own backups/HA |
| Custom backend (api) | auth-provider (Auth0/Clerk/build) | not bundled like Supabase |
| Supabase (database) | — (Auth/Storage bundled, no cascade) | bundled stack closes sub-decisions |
| n8n / external orchestrator (background-jobs) | webhook-ack-pattern | respond-immediately vs sync (R12) |
| VPN protocol chosen (network-transport) | exit-geo-location | which country exit (unblock-target vs latency) |
| OpenWrt router (hardware-platform) | firmware-channel | stable vs snapshot vs custom build |
| split-tunnel (routing-strategy) | domain-list-source | how route-list maintained (manual vs auto-updated) |
| SMS/voice (messaging-channel) | carrier-compliance | A2P 10DLC / number-pool / opt-out (R15 compliance) |

Depth cap = 2: at depth 2 boundary, ask user "расширить дальше?" instead of auto-adding. Cycle detection via axis-id set membership.
