# PRD — TaskFlow (greenfield, no code yet)

**Status:** planning. Only this PRD exists. No build manifest, no source code.

## Overview

TaskFlow is a team task-management tool for small remote teams (5-50 users per workspace). Users create tasks, assign them, comment, and receive notifications. Pilot targets 20 workspaces.

## Core capabilities

1. **Persistent data** — workspaces, users, tasks, comments, assignments must be stored relationally and survive restarts.
2. **User authentication** — each user logs in; workspace-level data isolation required.
3. **HTTP API** — the web client talks to the backend over an API for every action (create task, assign, comment).
4. **Web frontend** — a dashboard where users see their tasks and workspace activity.
5. **Email notifications** — when a task is assigned or commented on, the assignee receives an email.
6. **Background jobs** — a daily digest email summarising open tasks per user, sent on a schedule.
7. **File attachments** — users attach files (up to ~25 MB) to tasks; raw files stored outside the database.

## Constraints

- Small team, one developer initially.
- Budget-sensitive: prefer managed services, keep monthly cost predictable.
- Future SaaS phase may add billing and multi-tenant dashboards — choose a stack that does not require a full rewrite later.

## Out of scope (V1)

- Mobile native apps.
- Real-time collaborative editing.
- Analytics dashboards.

## Open questions

- Which LLM (if any) for the "suggest task priority" feature is NEEDS CLARIFICATION.
- Exact email volume per workspace is NEEDS CLARIFICATION.
