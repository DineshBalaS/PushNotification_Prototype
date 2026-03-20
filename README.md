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

## Backend: Install & Run
1. Ensure MongoDB is running locally at `mongodb://localhost:27017`.
2. Configure environment variables in `backend/.env`:
   - `MONGODB_URL`
   - `MONGODB_DB_NAME`
   - `FIREBASE_CREDENTIALS_PATH` (expects `backend/firebase-service-account.json`)
3. Install dependencies:
   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
4. Start the API (FastAPI via Uvicorn):
   ```powershell
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Backend endpoints (current)
- `GET /health` → `{"status":"ok","version":"2.0.0"}`
- `POST /api/v1/appointments/` (creates appointment, sends “New Appointment Request” to doctor + staff tokens)
- `PATCH /api/v1/appointments/{appointment_id}/status` (atomic status update, notifies assigned doctor)
- `PATCH /api/v1/providers/me/fcm-token` (stores `glenogi_fcm_token` on provider document)

## Run locally (quick)
- Mobile: update `mobile-app/src/config/api.ts` (`API_BASE_URL`) to your dev machine IP (where the backend is reachable), then run the RN app normally.

## Prototype notes
- Auth is a **stub** in the backend (prototype only).
- Push delivery is **FCM-only** in the current implementation.
