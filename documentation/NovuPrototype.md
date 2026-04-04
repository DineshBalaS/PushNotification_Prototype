# Novu Prototype — Planning Phase

This document captures the **planning phase** for integrating Novu into this prototype. Production hardening is intentionally out of scope until a later phase.

---

## Purpose

- Centralize **multi-channel notification orchestration** (workflows, triggers, preferences) in Novu.
- Prove **end-to-end delivery** on a **minimal slice** before investing in production rollout.

---

## Official documentation (reference)

Use these as the source of truth when implementing:


| Topic                          | Doc                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Architecture overview          | [How Novu Works](https://docs.novu.co/platform/how-novu-works)                                  |
| Workflows                      | [Workflows](https://docs.novu.co/platform/concepts/workflows)                                   |
| Triggering & billing semantics | [Trigger](https://docs.novu.co/platform/concepts/trigger)                                       |
| Subscribers                    | [Subscribers](https://docs.novu.co/platform/concepts/subscribers)                               |
| Topics (broadcasts)            | [Topics](https://docs.novu.co/platform/concepts/topics)                                         |
| Integrations                   | [Integrations](https://docs.novu.co/platform/concepts/integrations)                             |
| Push channel                   | [Push integrations](https://docs.novu.co/platform/integrations/push)                            |
| Preferences                    | [Preferences](https://docs.novu.co/platform/concepts/preferences)                               |
| API keys & endpoints           | [API Keys](https://docs.novu.co/platform/developer/api-keys)                                    |
| Environments & publish         | [Environments](https://docs.novu.co/platform/developer/environments)                            |
| Limits & quotas                | [Limits](https://docs.novu.co/platform/developer/limits)                                        |
| Webhooks                       | [Webhooks](https://docs.novu.co/platform/developer/webhooks)                                    |
| Python SDK                     | [Python SDK](https://docs.novu.co/platform/sdks/server/python)                                  |
| Monitor & debug                | [Monitor and Debug Workflow](https://docs.novu.co/platform/workflow/monitor-and-debug-workflow) |
| Inbox production hardening     | [Prepare Inbox for Production](https://docs.novu.co/platform/inbox/prepare-for-production)      |


---

## Prototype goal (one sentence)

Demonstrate that the application can **fire a Novu workflow** for a **real or test user** on **one primary channel**, with a clear **happy path** suitable for a demo.

---

## Phase 1 — Scope the smallest slice

- Pick **one user action** that should trigger a notification (e.g. a domain event meaningful to the product).
- Pick **one delivery surface** for the first demo:
  - **Push** if the prototype is mobile or web push–centric, or
  - **In-app (Inbox)** if the goal is the fastest visible UI with minimal provider setup.
- Define **done**: when the user performs X, user Y sees Z within an acceptable time window.

**Defer for prototype:** multi-channel complexity, digests and delays, topics, full preference UI, EU region specifics, HMAC for Inbox, webhooks (unless required by the pilot).

---

## Phase 2 — Novu development environment only

- Use Novu’s **development** environment for all prototype work.
- Obtain the **Application Identifier** (public, client-safe) and **Secret Key** (server-only, never exposed in frontend or repos).
- Remember: subscribers, topics, integrations, activity, and keys are **isolated per environment**.

---

## Phase 3 — One workflow in the dashboard

- Create **one workflow** with a stable **workflow identifier** (this is what backend triggers will reference; naming should stay consistent).
- Add **one channel step** aligned with Phase 1 (Push or In-app).
- Keep templates simple: title/body plus a small, stable **payload** for personalization.

**Defer:** step conditions, translations, critical-workflow marking until there is a concrete need.

---

## Phase 4 — Recipients: subscribers first

- Use a **stable internal user id** as Novu’s `subscriberId` (recommended in Novu docs for consistency).
- For the prototype, either:
  - **Just-in-time:** create/update subscriber on trigger, or
  - **Ahead of trigger:** create subscribers at signup or sync.

**Defer:** **Topics** (group broadcast, fan-out) until a second use case requires it.

---

## Phase 5 — Channel setup (minimal)

**If Push**

- Add **one** push provider integration in the Novu Integration Store (e.g. FCM if Firebase is already in use).
- Add a **Push** step to the workflow.
- Ensure **device tokens** exist on the subscriber profile; the prototype may pass tokens **just-in-time** on trigger to avoid building full token sync first.
- Respect the documented limit on device tokens per subscriber channel (see [Limits](https://docs.novu.co/platform/developer/limits)).

**If In-app**

- Add an **In-app** step and wire the **Inbox** using the Application Identifier.
- Treat **HMAC / subscriber hash** as a **later** step when moving toward production (see Prepare Inbox doc above).

---

## Phase 6 — Backend: single trigger path

- On the chosen business event, the backend calls Novu’s **trigger** with:
  - workflow identifier,
  - recipient (`to` — subscriber, and optionally payload data),
  - small, consistent **payload** for templates.
- Prefer the **official Python SDK** (`novu-py`) if the stack is Python; keep **one code path** and **one workflow** for the prototype.

**Prototype rule:** avoid a generic “notification router” until more workflows exist.

---

## Phase 7 — Verify in Novu

- Use the **Activity Feed** and workflow monitoring to confirm runs, statuses, and payloads.
- On failure, check: workflow status, required integrations for each channel step, subscriber fields and credentials (email/phone/push tokens as required by the step).

---

## Phase 8 — Prototype definition of done

The prototype planning phase is satisfied when:

1. Triggers from the app are **repeatable** (not flaky).
2. Runs are **visible** in Novu with enough detail to debug.
3. The chosen channel delivers the message to the user or test device/UI.
4. There is a short written list of **intentional deferrals** (topics, preferences UI, webhooks, production publish flow, etc.).

---

## High-level rollout map (for context after prototype)

When moving beyond the prototype, expect to address in order:

1. Notification catalog (events, critical vs optional, channels).
2. Environment discipline (dev vs prod, publish workflows from dev to prod).
3. Subscriber lifecycle and token hygiene (especially push).
4. Preferences strategy (global, per workflow, critical workflows).
5. Observability (Activity Feed first; webhooks if plan and needs allow).
6. Operational guardrails (limits, ownership, incident runbook).

---

## Relation to this repository

The backend already exposes settings such as MongoDB URL and Firebase credentials path (`backend/app/core/config.py`). A natural alignment is: **keep domain events and user identity in the app**, use **Novu for orchestration and templates**, and connect **push** via Novu’s FCM (or chosen) integration per the Push docs.

---

## Mobile onboarding + push smoke test (Option A)

**Order of operations (repeatable):** Start MongoDB and the FastAPI backend (`uvicorn` on port **8000** from `backend` with `.env` including Novu and Firebase). For a **physical Android** device using `http://localhost:8000` in dev, run **`adb reverse tcp:8000 tcp:8000`**. Optionally use an **empty DB** or clear app storage for a clean run. From `mobile-app`, run **`npm run android`** (Metro bundler as usual). Complete **onboarding** in the app (notifications prompt, role, name, signup); the app persists **`owner_id`** / **`user_id`** / **`owner_type`**, then calls **`PATCH /api/v1/providers/me/fcm-token`** with the stored **`owner_id`**, **`owner_type`**, FCM token, and **`platform`**. Confirm in **Mongo** (`doctor` or `staff`) a document whose **`_id`** matches **`owner_id`** and **`user_id`** matches the Novu subscriber id. In the **Novu dashboard**, open **Subscribers** and verify **`subscriberId`** equals that same **`user_id`** (UUID) and, after a successful token sync, **push / FCM credentials** appear on the subscriber.

**Pass checks:** `PATCH` returns **HTTP 200**; server logs show **Novu subscriber + FCM** sync and **`legacy_mongo=False`** unless `PERSIST_DEVICE_TOKENS_IN_MONGO` is enabled in backend config. If the user **denied** notification permission, signup still completes but token sync is skipped until permission is granted (no Novu device credentials until then).

---

## Changelog

- **Planning phase:** scope, phases, doc links, and deferrals captured in this file.
- **Mobile Option A smoke:** onboarding → signup → `PATCH` → Mongo + Novu subscriber verification documented above.

