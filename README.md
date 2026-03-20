# Dental Appointment Push Notifications (Prototype)

Monorepo for appointment-driven push notifications:
- **Backend (`/backend`)**: FastAPI + async MongoDB (Motor) + Firebase Admin (FCM)
- **Mobile (`/mobile-app`)**: React Native app that receives FCM and shows an in-app “Inbox”
- **Web (`/web-app`)**: Next.js scaffold (currently template-only)

## What happens (FCM flow)
1. Mobile registers its **FCM token** to the backend: `PATCH /api/v1/providers/me/fcm-token`
2. When an appointment is created or its status changes, the backend enqueues **FCM sends** (via FastAPI `BackgroundTasks`).
3. Mobile handles messages in:
   - **Foreground**: `onMessage(...)` → store + toast
   - **Background/quit-state**: `setBackgroundMessageHandler(...)` → store (MMKV) for the Inbox

## Backend endpoints (current)
- `GET /health` → `{"status":"ok","version":"2.0.0"}`
- `POST /api/v1/appointments/` (creates appointment, sends “New Appointment Request” to doctor + staff tokens)
- `PATCH /api/v1/appointments/{appointment_id}/status` (atomic status update, notifies assigned doctor)
- `PATCH /api/v1/providers/me/fcm-token` (stores `glenogi_fcm_token` on provider document)

## Run locally (quick)
- Backend: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` (from `/backend`)
- Mobile: update `mobile-app/src/config/api.ts` (`API_BASE_URL`) to your dev machine IP, then run the RN app normally.

## Prototype notes
- Auth is a **stub** in the backend (prototype only).
- Push delivery is **FCM-only** in the current implementation.
