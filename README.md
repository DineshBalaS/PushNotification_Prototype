# Dental Appointment Push Notification Prototype

A decoupled, real-time push notification prototype engineered to securely route appointment updates from a staff dashboard to both Doctors and Patients.

This project is built as a **Monorepo** consisting of three strictly isolated environments: a Python API, a Next.js web trigger, and a Bare React Native mobile application.

## 🏗 Architecture & Tech Stack

### 1. The Backend (`/backend`)

- **Framework:** FastAPI (Python 3.x)
- **Database:** MongoDB (using `motor` for async operations)
- **Data Integrity:** Strict Type Hinting via Pydantic
- **Push Gateway:** Firebase Admin SDK (FCM)
- **Role:** Handles device token registration, notification history storage (`NotificationInbox`), and dispatches data-only Firebase payloads by querying a unified `Users` collection.

### 2. The Web Dashboard (`/web-app`)

- **Framework:** Next.js (App Router) with Strict TypeScript
- **Styling:** Tailwind CSS v4
- **Role:** A simple web interface simulating a Staff/Receptionist action. It triggers the `POST /notify/appointment-approved` endpoint, passing target user IDs to the backend.

### 3. The Mobile App (`/mobile-app`)

- **Framework:** Bare React Native CLI (TypeScript)
- **Styling:** NativeWind (Tailwind mapped to React Native stylesheets)
- **Push Handlers:**
  - `@react-native-firebase/messaging` (Listens for silent FCM data payloads)
  - `@notifee/react-native` (Renders custom, high-fidelity local notifications)
- **Role:** Handles OS push permissions, registers tokens to the backend, securely renders lock-screen notifications, and features an in-app Notification Center (Bell icon).

## 🚀 Core Features & UX

- **Multi-Role Dispatching:** A single staff click on the Web Dashboard securely routes notifications to _both_ the corresponding Patient and the assigned Doctor.
- **Lock-Screen Privacy:** Enforces OS-level privacy flags (`visibility: private`). Lock screens show a generic title (e.g., "You're All Set! 🦷") and safely hide private appointment details until the user biometrically unlocks their device.
- **Soft-Prompt Onboarding:** Educates the user on the value of notifications _before_ triggering the native iOS/Android permission modal.
- **SMS Fallback Protocol:** If a user denies native push permissions, the backend flags their MongoDB profile (`requires_sms_fallback: true`) for alternative tracking.
- **Persistent Inbox:** Users can browse their notification history within the app via a paginated `FlatList` fetching from the backend.

## 📂 Data Flow Blueprint

1. **Trigger:** Web app fires `POST /notify/appointment-approved`.
2. **Storage:** FastAPI logs the notification details into the `NotificationInbox` collection.
3. **Dispatch:** FastAPI queries the unified `Users` collection, grabs the `fcm_tokens` arrays for the Patient and Doctor, and dispatches an FCM payload.
4. **Delivery:** The React Native app intercepts the Firebase payload in the background/foreground.
5. **Rendering:** Notifee processes the payload and triggers a secure local notification on the user's device.

## 🛠 Project Constraints

- **Strict Isolation:** Code from `/web-app` (e.g., HTML `<div>`) and `/mobile-app` (e.g., React Native `<View>`) must never bleed into each other.
- **No Relational SQL:** The database strictly leverages MongoDB document schemas without Prisma/SQLAlchemy.
- **Bare Native Elements:** Modifying `Podfile`, `build.gradle`, and `AndroidManifest.xml` is required for Notifee and Firebase integrations.

---

_This repository is strictly a prototype. As such, authentication is bypassed using a simulated "role" assignment, prioritizing the core notification pipeline and data flow._
