# 📝 [Draft] PR Review & Notion Writeup: Internal Push Notification Pipeline

## 1. 🎯 TL;DR (The Elevator Pitch)

This PR introduces a decoupled, real-time appointment notification architecture that completely removes patient app-download friction while automating instant alerting for internal staff. It allows patients to book via a lightweight web widget, empowering Receptionists to click "Approve", which synchronously triggers standard SMS/Email responses to the patient while natively broadcasting secure, lock-screen data payloads to all Doctors and Staff using FastAPI, MongoDB, Firebase Cloud Messaging (FCM), and Notifee.

## 2. 🏗️ Architecture & Scope

- **Backend (`/backend`):** FastAPI environment running MongoDB Motor for async data tracking. Built a central `DeviceTokens` registry for token routing and integrated the Firebase Admin SDK to broadcast mass data payloads.
- **Mobile (`/mobile-app`):** Built entirely with Bare React Native CLI and NativeWind. Handles OS-level permissions, registers internal FCM tokens, and intercepts background data to render secure local notifications via Notifee. Features an in-app persistent Notification Center.
- **Web (`/web-app`):** Next.js dashboard housing the lightweight Patient Booking Widget and the central Staff Appointment Console. Employs `react-hot-toast` for local success feedback and a shared dropdown Notification Center.

## 3. 🧠 Key Technical Decisions (The "Why")

- **Why FCM Data-Only Payloads + Notifee?** Standard FCM notification payloads strip away local UI control. By sending _data-only_ payloads from FastAPI, we intercept them silently in the React Native background and use Notifee to manually build the visual notification. This guarantees total control over complex Android/iOS lock-screen security channels.
- **Why Bare React Native CLI?** Shifting to Bare React Native guarantees future-proof access to raw native modules (via `Podfile` and `build.gradle`), ensuring our heavy Firebase/Notifee native integrations compile without any managed-workflow abstraction limits.
- **Why a Dedicated `DeviceTokens` Registry?** The client's production target DB is strictly siloed into multiple collections (Patients, Doctors, Staff, Users). Trying to append `fcm_tokens` directly into those delicate legacy schemas introduces massive migration risks. By creating a standalone `DeviceTokens` collection that simply maps an generic `owner_id` to their hardware tokens, we achieve zero-risk integration that seamlessly scales across all user types.

## 4. 🔒 Privacy & Security (Healthcare Standards)

- **Lock Screen Masking:** All Notifee channels are strictly configured with OS-level privacy flags (`visibility: private`). Sensitive dental appointment details remain completely hidden on the lock screen (showing a generic "Appointment Approved!" title) until the Doctor/Staff member biometrically unlocks their device.
- **Strict Secret Pre-Validation:** Utilizing `pydantic-settings` inside `config.py`, we prevent Google JSON credentials and MongoDB URLs from ever leaking into Git history. If a secret is missing in production, the app strictly crashes at boot rather than failing silently inside the route.

## 5. 🧪 How to Test (Step-by-Step)

- **Backend:** `cd backend`, activate your `venv`, and boot the server: `uvicorn app.main:app --reload`.
- **Mobile:** `cd mobile-app` and boot the Metro bundler via `npm start`. In a second terminal, compile the native code to your emulator/device via `npm run android` (or iOS equivalent).
- **Web:** `cd web-app` and boot the dashboard pipeline using `npm run dev`.
- **Trigger:** Submit an appointment via the Patient Widget on `localhost:3000`. Next, view the Web Console as Staff and explicitly hit **"Approve"**.
- **Verify:**
  1. Watch the FastAPI console for the successful SMS dispatch log.
  2. Lock your mobile emulator screen to verify the Notifee push notification fired perfectly and is visually masked.
  3. Open the mobile app to ensure the Notification Center `FlatList` updated seamlessly.

## 6. 🛑 Out of Scope / Next Steps

- **Actionable Notification Buttons:** Direct "Add to Calendar" tracking buttons embedded directly inside the Android/iOS notification tray itself are deferred to the next phase of the push pipeline.
