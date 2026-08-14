# Functional Requirements

## FR-1: Dashboard cards and trace

The product SHALL expose a dashboard/report whose primary cards show unspecified graph nodes. The UI SHALL load cards from `get_trace`, and each card SHALL show one combined `status` field for authored lifecycle and verification readiness.

The card SHALL show complete incoming and outgoing relations, evidence and full history returned by `get_trace`.

## FR-2: Browser experience

The dashboard SHALL expose HTTP JSON routes for card detail and return a successful response.
