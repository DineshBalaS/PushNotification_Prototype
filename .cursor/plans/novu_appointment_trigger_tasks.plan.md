---
name: Novu appointment trigger (implementation tasks)
overview: "After a successful appointment insert, replace the legacy per-FCM-token loop in create_appointment with Novu workflow triggers addressed by subscriberId (Mongo user_id). Uses existing novu-py client pattern from novu_subscribers.py, new env for workflow id, and BackgroundTasks so HTTP 201 stays fast. Aligns with novu_phase_1_plan — this file is the ordered execution checklist."
todos:
  - id: novu-workflow-manual
    content: "Novu Dashboard: push workflow + identifier; FCM integration; test trigger once"
    status: completed
  - id: config-workflow-id
    content: "Backend: NOVU_APPOINTMENT_WORKFLOW_ID in Settings + .env.example"
    status: completed
  - id: novu-trigger-service
    content: "Backend: app/services module — trigger_async wrapper, payload helpers, logging"
    status: pending
  - id: wire-create-appointment
    content: "appointments.py POST: Novu triggers for doctor + staff user_ids; remove create FCM loop"
    status: pending
  - id: optional-status-patch-novu
    content: "appointments.py PATCH status: optional second task — Novu trigger instead of FCM"
    status: pending
isProject: false
---

# Novu appointment trigger — implementation tasks

## Verified baseline (read from repo + `novu-py` 3.14.2)

| Fact | Source |
|------|--------|
| Subscriber + FCM credentials | [`backend/app/services/novu_subscribers.py`](backend/app/services/novu_subscribers.py) — `sync_subscriber_fcm_to_novu`, `_novu_client()` cached |
| Booking persists `doctor_user_id` | [`backend/app/routers/appointments.py`](backend/app/routers/appointments.py) `create_appointment` — copied from `doctor.user_id` |
| **Create path still pushes via Mongo `device_tokens` + Firebase** | Same file — `_resolve_device_tokens` + `dispatch_fcm_notification` in `BackgroundTasks` |
| Novu config today | [`backend/app/core/config.py`](backend/app/core/config.py) — `novu_secret_key`, `novu_server_url`, `novu_fcm_integration_identifier`, `persist_device_tokens_in_mongo` |
| **`novu_py.Novu` exposes `trigger_async`** | Installed SDK: `trigger_async(*, trigger_event_request_dto=..., idempotency_key=...)` |
| Trigger DTO shape | `workflow_id: str`, `to: Union[str, SubscriberPayloadDtoTypedDict, List[...], ...]`, `payload` optional `Dict[str, Any]` — see `venv/Lib/site-packages/novu_py/models/triggereventrequestdto.py` |
| Subscriber id in typed dict | `novu_py.models.subscriberpayloaddto.SubscriberPayloadDtoTypedDict` — field `subscriber_id` |

**Do not assume:** workflow identifier string (comes from your Novu project). **Do not implement** in this plan: mobile Notifee changes (see [`novu_phase_1_plan_c9799cae.plan.md`](novu_phase_1_plan_c9799cae.plan.md)).

---

## Task 1 — Novu Dashboard (manual, no code)

**Goal:** A workflow exists that sends **Push (FCM)** using the integration you already use for `sync_subscriber_fcm_to_novu`.

**Steps (conceptual):**

1. Integration Store: FCM configured (same as token registration path).
2. Workflows: create workflow; add **Push** step; template uses **payload variables** you will send from the backend (e.g. `patientName`, `appointmentTime`, `appointmentId` — match whatever you implement in Task 4).
3. Copy the workflow **`identifier`** (immutable) — you will set `NOVU_APPOINTMENT_WORKFLOW_ID` to this value.

**Pass criteria (before Task 3):**

1. From Novu dashboard **“Trigger workflow”** (or REST) send a test event to a **real** `subscriberId` that already registered FCM via your app + `PATCH /me/fcm-token`.
2. Device receives push (proves workflow + integration + subscriber).

---

## Task 2 — Config: `NOVU_APPOINTMENT_WORKFLOW_ID`

**Goal:** Workflow id is **env-driven**, not hardcoded.

**Implementation sketch:**

- Add field to [`backend/app/core/config.py`](backend/app/core/config.py), e.g. `novu_appointment_workflow_id: str` with `min_length=1` **or** optional with validation at trigger time — **prefer required** if appointment push is always Novu in this phase.
- Document in [`backend/.env.example`](backend/.env.example).

**Pass criteria:**

1. `uvicorn` starts with a valid `.env` including `NOVU_APPOINTMENT_WORKFLOW_ID`.
2. Missing var fails fast at startup (if required) or logs a single clear error when triggering (if optional + lazy) — pick one strategy and document it in the plan commit.

---

## Task 3 — Service: `trigger_async` wrapper

**Goal:** One place that calls Novu **`trigger_async`** with consistent error handling and **structured logs** (no `502` to the booking client — failures happen inside `BackgroundTasks`, like today’s FCM path).

**Implementation sketch:**

- New module e.g. [`backend/app/services/novu_triggers.py`](backend/app/services/novu_triggers.py) (or extend `novu_subscribers.py` if you prefer fewer files — either is fine).
- Reuse **`_novu_client()`** from `novu_subscribers.py` (**import the cached client factory** or **extract shared `get_novu_client()`** to avoid duplicate `Novu(...)` config — avoid duplicating secret/url logic).
- Public async function e.g. `trigger_appointment_booking_workflow(*, workflow_id: str, subscriber_ids: Sequence[str], payload: dict[str, Any], transaction_id: str | None)`:
  - Deduplicate `subscriber_ids`, drop empties.
  - If list empty: **log warning** and return (no API call).
  - Build `TriggerEventRequestDtoTypedDict`: `workflow_id`, `to` as **list of subscriber id strings** (SDK allows `List[Union[str, ...]]` per `ToTypedDict`), `payload` with **JSON-friendly values** (Novu templates often need strings for push data — coerce or document).
  - Optional: `idempotency_key` or `transaction_id` = `appointment_id` to reduce duplicate deliveries on retries.
- Map `models.NovuError` to **logger.error** + optional **debug** body preview (mirror `_raise_app_exception_from_novu` style but **do not raise** in background task).

**Pass criteria:**

1. **Unit-style check:** with a **test script** or **pytest** calling the function with **mocked** `trigger_async` (optional) **or** manual `python -c` in dev against Novu sandbox (user runs with real key).
2. Invalid/missing workflow id surfaces as a **logged** Novu error, not an uncaught exception crashing the worker.

---

## Task 4 — Wire `POST /api/v1/appointments/` (create)

**Goal:** After `insert_one`, enqueue **Novu triggers** instead of **`dispatch_fcm_notification`** for the create path.

**Current code to replace (exact region):** [`appointments.py`](backend/app/routers/appointments.py) — block from “DB read 2: resolve doctor device tokens” through “push skipped” (~lines 110–149).

**Implementation sketch:**

1. **Recipients**
   - **Doctor:** use **`doctor_user_id`** already resolved on the request path. If `None`/empty: **log warning** (“Novu trigger skipped for doctor — no user_id”); do not fail 201.
   - **Staff:** reuse pattern `db.staff.find({}, {"_id": 1, "user_id": 1})`; collect **non-empty string** `user_id`s; **dedupe** against `doctor_user_id` (same person edge case).
2. **Payload enrichment (minimal first):** load **patient** by `ObjectId(request.patient_id)` with projection `name` (and doctor `name` if not already loaded) for template variables — align keys with **Task 1** template. If patient missing, use safe fallbacks (`"Unknown"` / `patient_id` string) — **do not** fail 201.
3. **Background execution:** Today [`push_service.dispatch_fcm_notification`](backend/app/services/push_service.py) is **async** and passed straight to `BackgroundTasks.add_task(...)` — Starlette/FastAPI await it after the response. Do the same for Novu: an **`async def`** that **`await`s** `client.trigger_async(...)` (no `asyncio.run` in the task). If the SDK call were blocking, you would mirror `run_in_executor` like FCM’s Firebase path — **`trigger_async` is async**, so a plain async task is enough.
4. **Remove** per-token FCM loop from **create** only (staff + doctor device_tokens).
5. **INFO** log: `Novu appointment workflow queued | appointment_id=... | recipients=N`.

**Pass criteria:**

1. `POST /api/v1/appointments/` still returns **201** and same JSON body shape [`AppointmentCreatedResponse`](backend/app/models/schemas.py).
2. With valid doctor `user_id` + Novu workflow + registered FCM on that subscriber, **doctor device gets push** after booking.
3. With **no** `doctor_user_id`, appointment **still 201**, log explains skip; **no** unhandled exception.
4. **No regression:** Mongo document still includes `doctor_user_id`, `patient_id`, `doctor_id`, `appointment_time`, `status`.

---

## Task 5 — (Optional / follow-up) `PATCH` status notifications via Novu

**Goal:** Replace doctor-only **FCM** loop in `update_appointment_status` with a **Novu trigger** (same or different `workflow_id` — config as second env if needed).

**Pass criteria:** Status change triggers push via Novu to the doctor’s `doctor_user_id` when present; behavior documented.

---

## Task 6 — Cleanup & docs

**Goal:** Single source of truth for push on create.

**Steps:**

- Confirm **`PERSIST_DEVICE_TOKENS_IN_MONGO=false`** default means create path **does not depend** on `device_tokens` anymore.
- Update [`documentation/NovuPrototype.md`](documentation/NovuPrototype.md) (or README snippet): env vars list includes **`NOVU_APPOINTMENT_WORKFLOW_ID`**, payload keys, and testing steps.
- If Firebase is **only** used for legacy FCM paths, note future removal from `lifespan` (out of scope unless no other router uses Firebase).

**Pass criteria:** Another developer can configure Render + book from Vercel + receive push without reading the code.

---

## Explicit non-goals (this plan)

- Changing **signup** or **PATCH /me/fcm-token** contract (already Novu).
- **Real auth** for providers/patients.
- **Topics** vs per-subscriber triggers — start with **explicit subscriber list**; topics can be a later optimization ([`novu_phase_1_plan_c9799cae.plan.md`](novu_phase_1_plan_c9799cae.plan.md)).

---

## Suggested order

`Task 1` → `Task 2` → `Task 3` → `Task 4` → `Task 5` (optional) → `Task 6`.

Each task’s **pass criteria** must be satisfied before starting the next to avoid stacking failures (especially **Dashboard test** before backend wiring).
