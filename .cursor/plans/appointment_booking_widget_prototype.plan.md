---
name: Appointment booking widget (prototype)
overview: "Add a minimal Next.js sample page with a Book Appointment button that opens a modal (doctor list + date + time), then POSTs to the existing FastAPI POST /api/v1/appointments/ so the current insert + notification workflow is unchanged. Includes a small backend read API for doctors because none exists today."
todos:
  - id: backend-doctors-list
    content: "Backend: GET /api/v1/doctors (or equivalent) listing Mongo doctor _id + display fields"
    status: completed
  - id: prototype-patient-id
    content: "Prototype patient_id source (env or minimal GET /patients) — must be valid Mongo ObjectId string"
    status: completed
  - id: web-env-api-client
    content: "web-app: NEXT_PUBLIC_API_BASE_URL + typed fetch helper for appointments + doctors"
    status: completed
  - id: web-modal-ui
    content: "web-app: Book button, modal, doctor selection, date+time → ISO UTC appointment_time"
    status: completed
  - id: web-submit-verify
    content: "web-app: POST handling, user-visible success/error; manual E2E checklist vs backend"
    status: completed
isProject: false
---

# Prototype: appointment booking widget (web)

## Design reference (non-code)

- **Image 1:** Full GLENO dashboard (sidebar, week grid, mini-calendar, **Create Appointment**, doctor/patient toggle) — use as visual north star; this prototype implements only the **booking slice** in a smaller surface.
- **Image 2:** Compact card — selected date header, month nav, day grid, pill **Create Appointment** — calendar density and CTA placement should inform the modal layout.
- **Target UX for this plan:** one **Book appointment** button on a minimal sample page → **modal** with **doctor choice**, **date** (calendar-style), **time**, then **submit**. Teal/glass styling is optional polish after behavior works (Task 6).

## Baseline (verified in repo)

| Piece | Location | Notes |
|--------|-----------|--------|
| Create appointment | `POST /api/v1/appointments/` | `[backend/app/routers/appointments.py](backend/app/routers/appointments.py)` |
| Request body | `AppointmentCreateRequest` | `[backend/app/models/schemas.py](backend/app/models/schemas.py)` — **`patient_id`** (Mongo ObjectId string), **`doctor_id`** (Mongo ObjectId string), **`appointment_time`** (datetime, **UTC**) |
| CORS | `allow_origins=["*"]` | `[backend/app/main.py](backend/app/main.py)` — browser calls from `localhost:3000` OK |
| List doctors API | **None** | Only `[providers](backend/app/routers/providers.py)` signup + FCM and `[appointments](backend/app/routers/appointments.py)` — **widget needs a new read endpoint or hardcoded IDs** |
| Web app | Next.js 16 starter | `[web-app/app/page.tsx](web-app/app/page.tsx)` is still the default template |

**Workflow after POST:** unchanged — same insert into `appointments`, same doctor/staff FCM path (or future Novu path per other plans).

---

## Task 1 — Backend: list doctors for the modal

**Goal:** The UI can load **current** doctors from Mongo without opening Compass.

**Implementation sketch:**

- Add router e.g. `GET /api/v1/doctors` in a new file `backend/app/routers/doctors.py` (or extend a small `catalog` router), register in `[backend/app/main.py](backend/app/main.py)`.
- Query `db.doctor.find({}, {"_id": 1, "name": 1, "specialty": 1})` (add `user_id` only if the UI needs it — not required for booking).
- Response shape: JSON array of `{ "id": "<ObjectId string>", "name": "...", "specialty": "..." }` (field names stable and documented).

**Pass criteria (check before Task 2):**

1. With API + Mongo seeded (`seed_db.py`), `GET http://127.0.0.1:8000/api/v1/doctors` returns **200** and a **non-empty** JSON array when `doctor` collection has rows.
2. Each item’s `id` is a **24-char hex** string valid for `doctor_id` on create appointment.
3. OpenAPI (`/docs`) shows the new operation; no server startup errors.

---

## Task 2 — Prototype `patient_id` source ✅ Option A

**Goal:** `POST /api/v1/appointments/` **requires** `patient_id` as **Mongo ObjectId** of a real `patient` document (see schema docstring). The widget must supply it without guessing.

**Implemented:** **Option A** — `NEXT_PUBLIC_BOOKING_PATIENT_ID` in `web-app` (see `[web-app/.env.example](web-app/.env.example)`). Resolver + validation: `[web-app/lib/booking-config.ts](web-app/lib/booking-config.ts)` (`getBookingPatientId()`). Default example id matches the demo patient you seeded; override on **Vercel** to the `_id` of the patient row in **production** Mongo.

**Pass criteria:**

1. Using the chosen `patient_id`, a manual `curl`/Swagger `POST /api/v1/appointments/` with that id + valid `doctor_id` + ISO `appointment_time` returns **201** and `appointment_id`.
2. If `patient_id` is wrong, API returns **400/404** as defined today — widget plan should surface that message later (Task 5).

---

## Task 3 — Web: API base URL and client helpers ✅

**Goal:** No hardcoded API host in source; configure via env (local + Vercel).

**Implemented:**

- `[web-app/lib/api.ts](web-app/lib/api.ts)` — `getApiBaseUrl()`, `getJson`, `postJson`, `ApiError`, `fetchHealth`, `fetchDoctors`, `createAppointment`; dev-only `console.debug` / failure `console.error`; base URL = **URL origin only** (path segment warned and ignored).
- `[web-app/components/DevApiHealthProbe.tsx](web-app/components/DevApiHealthProbe.tsx)` — **development only**: calls `fetchHealth()` on mount; logs `[api] health probe OK` or a warning.
- `[web-app/app/layout.tsx](web-app/app/layout.tsx)` — mounts `DevApiHealthProbe`.
- `[web-app/.env.example](web-app/.env.example)` — Render/Vercel notes for `NEXT_PUBLIC_API_BASE_URL`.

**Pass criteria:**

1. `npm run build` in `web-app` succeeds (env optional at build time if you use fallback only in dev — prefer required env for clarity).
2. From browser devtools on the sample page, a test call to `${BASE}/health` returns **200** (proves URL correct).

---

## Task 4 — Web: Book button + modal (doctor, date, time) ✅

**Goal:** Match mock flow: trigger opens modal; user selects **one doctor**, **one date**, **one time**; values held in React state until submit.

**Implemented:**

- `[web-app/app/page.tsx](web-app/app/page.tsx)` — server page + metadata; renders `[DentistLanding](web-app/components/dentist-landing.tsx)`.
- `[web-app/components/dentist-landing.tsx](web-app/components/dentist-landing.tsx)` — teal “Riverside Dental” placeholder; **`next/dynamic`** loads `[BookingModal](web-app/components/booking/BookingModal.tsx)` with **`ssr: false`**, doctors fetched only after open; loading UI while chunk loads.
- `[web-app/components/booking/BookingModal.tsx](web-app/components/booking/BookingModal.tsx)` — radios, month calendar, `<input type="time">`, **`toISOString()`** payload; **`getBookingPatientId`** + **`createAppointment`**; ESC / backdrop / **Close**; dev **`console.debug`**; body scroll lock.
- `[web-app/app/globals.css](web-app/app/globals.css)` — `.dentist-page` gradient.

**Pass criteria:**

1. Opening modal shows **all doctors** from API (count matches Task 1).
2. Selecting doctor + date + time updates state; **Submit** disabled until all three + patient id source (Task 2) are present.
3. No console errors during open/select/close.

---

## Task 5 — Web: POST appointment + user feedback ✅

**Goal:** Submit calls existing backend; user sees clear outcome. Appointments carry **doctor `user_id`** (Novu `subscriberId`) resolved **server-side** from the doctor document — not sent by the client.

**Payload (unchanged):** `patient_id`, `doctor_id`, `appointment_time` only.

**Backend:** `[appointments.py](backend/app/routers/appointments.py)` stores `doctor_user_id` on insert; **201** body includes `doctor_user_id`; FCM `data_payload` includes it when set; PATCH status FCM adds it when present on the appointment doc. Sparse index on `appointments.doctor_user_id`.

**Web:** `[BookingModal](web-app/components/booking/BookingModal.tsx)` shows **error code** (`ApiError.code`), success text with **appointment_id** + subscriber line, **Book another** (resets form), blocks duplicate confirm until reset.

**Pass criteria:**

1. Successful booking: Mongo `appointments` has new doc with matching `patient_id`, `doctor_id`, `appointment_time`, `status` **PENDING**.
2. Backend log line appears for appointment created (and FCM queued or skipped — same as today).
3. Invalid `doctor_id` still returns **404** `DOCTOR_NOT_FOUND` — UI shows readable error.

---

## Task 6 — Optional polish (after Tasks 1–5 pass)

- Teal / glass styles approximating mocks; reuse Tailwind already in `web-app`.
- Loading skeleton while doctors fetch; disable double-submit.
- Copy reference PNGs into `web-app/public/design/` only if you want them versioned — not required for functionality.

---

## End-to-end checklist (all tasks done)

1. Backend up, DB seeded, at least one patient and one doctor.
2. Widget: book one slot → **201** → document visible in Mongo.
3. Repeat with wrong patient id → error shown, no silent failure.
4. `npm run lint` (web) and backend unchanged except new router + registration.

---

## Explicit non-goals (avoid scope creep)

- Changing notification transport (FCM vs Novu) — separate plan.
- Auth on booking endpoint — out of scope unless you add it globally later.
- Staff calendar grid / week view — only the **minimal modal** + sample page for this prototype.
