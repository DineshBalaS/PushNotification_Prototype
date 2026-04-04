---
name: Mobile onboarding + signup (Option A)
overview: Prototype flow—push permission explainer → role (doctor/staff) → name fields → POST signup (Mongo + user_id) → existing PATCH /me/fcm-token for Novu (no separate Novu call at signup). Tasks are ordered; each has pass criteria before starting the next.
todos: []
isProject: false
---

# Mobile onboarding + provider signup — task plan (Option A)

**Scope:** Backend `POST` creates `doctor` or `staff` with new `user_id`; Novu subscriber + FCM only via **existing** `PATCH /api/v1/providers/me/fcm-token` after the app has `owner_id` + FCM token.

**Out of scope for this plan:** Real auth/JWT, duplicate-user prevention, iOS dev URL fix (optional follow-up), appointment triggers.

## Plan progress

- **Task 1** — Backend signup schema + `POST /api/v1/providers/signup` (completed)
- **Task 2** — Backend logging + error shape (completed)
- **Task 3** — Mobile persisted onboarding state (completed)
- **Task 4** — Mobile API client for signup (completed)
- **Task 5** — Mobile onboarding UI (completed)
- **Task 6** — Mobile `App.tsx` routing (completed; wired with Task 5 for end-to-end flow)
- **Task 7** — FCM sync from stored provider identity
- **Task 8** — End-to-end smoke documentation

---

## Task 1 — Backend: signup schema + `POST /api/v1/providers/signup`

**Status: completed.**

**Do:** Add a Pydantic request model (`owner_type`, `first_name`, `last_name`, optional `specialty` for doctor). Add `POST` handler on the providers router that inserts one `doctor` or `staff` document: `user_id = uuid4`, `name` built from first+last (document convention), `specialty` required for doctor (default e.g. `General` if omitted). Return JSON: `owner_id` (24-hex ObjectId string), `user_id` (UUID string), `owner_type`.

**Pass criteria:**

- `POST` with valid doctor body returns **201** and body includes `owner_id`, `user_id`, `owner_type` matching request.
- `POST` with valid staff body returns **201** with same shape.
- Invalid `owner_type` or empty names → **422** or **400** with stable `code` where applicable.
- Mongo document exists in `doctor` or `staff` with matching `_id`, `user_id`, and `name`.

---

## Task 2 — Backend: logging + error shape

**Status: completed.**

**Do:** INFO log on successful signup (include `owner_type`, `owner_id`, `user_id`, no secrets). Reuse `AppException` for predictable JSON errors if insert fails.

**Pass criteria:**

- Successful signup produces one clear INFO line in server logs.
- Duplicate key / DB failure does not return raw stack to client (existing global handler behavior preserved).

---

## Task 3 — Mobile: persisted auth / onboarding state

**Status: completed.**

**Do:** New Zustand (+ MMKV persist, same pattern as `useNotificationStore`) or extend a dedicated store: fields e.g. `onboardingComplete`, `ownerId`, `ownerType`, `userId` (optional `displayName`). Actions: `completeOnboarding(payload)`, `reset()` (dev only optional).

**Pass criteria:**

- After `completeOnboarding`, killing and relaunching the app still reads `onboardingComplete === true` and correct ids from storage.
- Fresh install / cleared storage shows `onboardingComplete === false`.

---

## Task 4 — Mobile: API client for signup

**Status: completed.**

**Do:** Small module (e.g. `src/services/providerApi.ts`) calling `POST ${API_BASE_URL}/api/v1/providers/signup` with JSON body; parse success JSON; throw or return typed error on non-OK.

**Pass criteria:**

- With backend running and `adb reverse` (Android) configured, a manual call from a dev-only button or temporary `useEffect` succeeds and returns `owner_id` / `user_id`.
- Network error / 4xx surfaces a readable error for UI (no silent failure).

---

## Task 5 — Mobile: onboarding UI (screens / flow)

**Status: completed.**

**Do:** New screen(s) or single wizard: (1) Short copy + primary action leading to `requestPermission` (FCM); (2) role toggle doctor vs staff; (3) `TextInput` first name + last name; (4) for doctor, specialty (field or fixed default per Task 1); (5) Submit → call signup API → `completeOnboarding` with response.

**Pass criteria:**

- User can complete flow without crash; denied notification permission is handled (still allow signup OR block with message—pick one behavior and document in UI copy).
- On success, store holds `owner_id` / `user_id` / `owner_type` from server.

---

## Task 6 — Mobile: `App.tsx` routing

**Status: completed.**

**Do:** If `!onboardingComplete`, render onboarding; else render `InboxScreen` (and existing Toast / listeners).

**Pass criteria:**

- First launch shows onboarding; after completion, relaunch shows Inbox only.
- No double-mount of onboarding after success.

---

## Task 7 — Mobile: FCM sync uses stored provider identity (Option A)

**Do:** Remove hardcoded `IMPERSONATED_OWNER_`* from `fcmService.ts`. `syncTokenWithBackend` reads `ownerId` + `ownerType` from Task 3 store. If onboarding incomplete or ids missing, skip PATCH (log once). After onboarding, `initializeFCM` runs and PATCH includes `fcm_token`, `owner_type`, `owner_id`, `platform`.

**Pass criteria:**

- New user after signup: server logs show PATCH with **new** `owner_id` (not old Harper id) and Novu sync succeeds (same as current verification).
- User who denied permission: no broken loop of failed PATCHs every second (skip or retry policy explicit in code).

---

## Task 8 — End-to-end smoke (manual)

**Do:** Document in this file or `documentation/NovuPrototype.md` (one short paragraph): order of operations—seed or empty DB, `npm run android`, complete onboarding, confirm Mongo + Novu subscriber.

**Pass criteria:**

- You can repeat: install → onboard → see subscriber in Novu with `subscriberId` = returned `user_id` and push credentials after token sync.
- `PATCH` still returns **200** and logs `legacy_mongo=False` unless flag enabled.

---

## Task dependency graph (summary)

```text
1 → 2
3 → 4 → 5 → 6 → 7 → 8
     ↑
     requires 1 (running backend)
```

Start **Task 1** before **Task 4**; **Task 3** can parallel **Task 1–2**; **Task 7** depends on **3** and **5–6**.

---

## Optional follow-ups (not required to close this plan)

- Reset onboarding from settings for QA.
- `api.ts` iOS dev base URL when not using Android.
- Rate limit / captcha on signup for any shared environment.

