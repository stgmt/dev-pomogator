# PRD — TaskFlow v2 (brownfield — existing stack)

**Status:** active project with existing codebase. The stack is already chosen and in production.

## Existing stack (locked)

The system already runs on **Django 5 + PostgreSQL + Celery + Redis**, deployed on AWS ECS. We use the existing `pyproject.toml` and `requirements.txt`. This V2 only adds new features to the current code — the architecture is NOT being reconsidered.

## New features for V2

1. Add a "task templates" feature so users reuse common task structures.
2. Add CSV export of a workspace's tasks.
3. Improve the existing daily digest to include overdue counts.

## Constraints

- Stay within the current Django + Postgres + Celery stack. Do not introduce new infrastructure.
- Reuse existing auth (django-allauth) and existing S3 bucket for attachments.

## Out of scope

- Any change to hosting, database, or background-job system — these are fixed.
