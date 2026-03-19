# Dental Appointment Push Notification Prototype

A decoupled, real-time alert prototype automating the booking pipeline between Patients and Internal Staff.

This project is built as a **Monorepo** consisting of three strictly isolated environments: a Python API, a Next.js web console, and a Bare React Native mobile application for internal broadcasting.

## 🏗 Architecture & Tech Stack

### 1. The Backend (`/backend`)

- **Framework:** FastAPI (Python 3.x)
- **Database:** MongoDB (using `motor` for async operations)
- **Data Integrity:** Strict Type Hinting via Pydantic
- **Push Gateway:** Firebase Admin SDK (FCM)
- **Router Model:** Instead of modifying core user collections, pushes route seamlessly through a decoupled `DeviceTokens` registry.

### 2. The Web Dashboard (`/web-app`)

- **Framework:** Next.js (App Router) with Strict TypeScript
- **Styling:** Tailwind CSS v4
- **Role:** Houses the Patient Booking Widget, the Central Staff Approval Console, and Dropdown Notification visualizers.

### 3. The Internal Mobile App (`/mobile-app`)

- **Framework:** Bare React Native CLI (TypeScript)
- **Styling:** NativeWind
- **Push Handlers:** `@react-native-firebase/messaging` & `@notifee/react-native`
- **Role:** A secure, internal-only app for Staff and Doctors providing high-fidelity lock-screen push notifications and an in-app history Bell endpoint.

## 🚀 Core Booking Flow & UX

1. **The Request:** A patient submits an appointment via the lightweight Web Widget. The appointment state logs as "Pending".
2. **The Approval:** A single Staff member clicks "Approve" on their Desktop Console. A local success Toast instantly confirms their action.
3. **The Patient Reply:** The FastAPI backend securely triggers a mocked external SMS/WhatsApp/Email response to the Patient.
4. **The Internal Broadcast:** The backend queries the standalone `DeviceTokens` registry for everyone registered as a Doctor or Staff member, and broadcasts a mass data-payload to their mobile devices.
5. **The Safe Delivery:** Notifee processes the incoming Firebase payload entirely inside the Mobile OS, displaying a "Private" localized notification respecting biometric lock-screen security.
