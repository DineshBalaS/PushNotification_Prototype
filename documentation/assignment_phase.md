# 2-Day Assignment Plan: Push Notification Prototype

## Overview

This document outlines the phased approach to building the decoupled, real-time push notification prototype over a two-day period. Because this is a prototype, the focus is strictly on **core business logic, data flow, and required integrations**. Ample margin for error and basic testing is built into the final phase.
_Note: The frontend mobile stack is strictly Bare React Native CLI utilizing `@react-native-firebase/messaging` and `@notifee/react-native`._

---

## Day 1: The Foundation (Backend, Database, and Core API)

_Objective: Set up the environment, define the data structures, and build the APIs necessary to receive triggers and store notifications._

### Phase 1: Environment & Boilerplate Setup (Estimated: 2 Hours)

- **Monorepo Structure:** Scaffold the `/backend`, `/web-app`, and `/mobile-app` directories.
- **Dependency Management:**
  - Install FastAPI, Motor, Pydantic, and Firebase Admin in `/backend`.
  - Initialize Next.js (App Router) in `/web-app`.
  - Initialize Bare React Native CLI with NativeWind in `/mobile-app`.
- **CORS Configuration:** Configure initial CORS middleware in FastAPI.

### Phase 2: Database Schema & Connection (Estimated: 2 Hours)

- **MongoDB Setup:** Establish an async connection using Motor.
- **Data Models (Pydantic):**
  - `User`: A unified collection for all users. Tracks `role` (`patient`, `doctor`, `staff`), a list of `fcm_tokens` strings, and the `requires_sms_fallback` boolean.
  - `NotificationInbox`: Storing title, body, timezone, target `user_id`, read status, and timestamp.
- **Indexes:** Create compound indexes (e.g., `user_id` + `timestamp` descending).

### Phase 3: Backend API & Business Logic (Estimated: 3-4 Hours)

- **Routes:**
  - `POST /users/{user_id}/tokens`: Device token registration endpoint.
  - `POST /notify/appointment-approved`: The main trigger from the Next.js app. Will dispatch to both the assigned Doctor and Patient.
  - `POST /users/{user_id}/fallback`: Endpoint to flag a user if they deny push permissions.
  - `GET /notifications/{user_id}`: Paginated endpoint to fetch the user's notification history.

---

## Day 2: The Experience (Frontend, Notifications, and Integration)

_Objective: Connect the FCM gateway, build the trigger UI, and handle the React Native push experience (lock screen + in-app) securely using Notifee._

### Phase 4: Firebase Integration (Estimated: 2 Hours)

- **Backend Setup:** Initialize the Firebase Admin SDK using service account credentials.
- **FCM Dispatch:** Update the `POST /notify/appointment-approved` endpoint to retrieve the FCM tokens for both target users and dispatch a data payload via Firebase.

### Phase 5: Mobile App Integration (Firebase + Notifee) (Estimated: 3-4 Hours)

- **Native Config:** Configure `build.gradle`, and `Podfile` to bridge `@react-native-firebase/messaging` and `@notifee/react-native`.
- **Onboarding UI:** Build the custom "Soft Prompt" screen.
- **Permissions Logic:**
  - Request OS permission via Firebase/Notifee.
  - If granted: Hit `POST /users/{user_id}/tokens` to register the FCM token.
  - If denied: Hit the `/users/{user_id}/fallback` endpoint.
- **Notification Customization:** Listen for silent/data Firebase payloads in the background/foreground, and use Notifee to trigger a local notification with strict privacy flags (`visibility: private` channels) to satisfy lock-screen security requirements.
- **Notification Center:** Build the "Bell" icon screen using `FlatList`.

### Phase 6: Web Dashboard Trigger (Estimated: 1-2 Hours)

- **UI:** A basic Next.js page with an "Approve Appointment" button.
- **Logic:** Calls the backend `POST /notify/appointment-approved` endpoint.

### Phase 7: Buffer, Testing & Polish (Estimated: 2 Hours)

- **End-to-End Test:** Click the web dashboard button -> verify DB saves -> verify Firebase data push reaches RN App -> verify Notifee local push renders securely on screen.
- **Margin for Error:** Debugging Native iOS/Android dependency issues and CORS.
