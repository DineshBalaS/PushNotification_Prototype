# 2-Day Assignment Plan: Push Notification Prototype

## Overview

This document outlines the phased approach to building the decoupled, real-time push notification prototype over a two-day period. Because this is a prototype, the focus is strictly on **core business logic, data flow, and required integrations**.
_Note: Patients do not receive FCM pushes. Staff/Doctors utilize the Bare React Native CLI Mobile App._

---

## Day 1: The Foundation (Backend, Database, and Core API)

### Phase 1: Environment & Boilerplate Setup (Completed)

- Monorepo scaffolded. FastAPI backend strictly modularized per `code_criteria.md`.
- Next.js and Bare React Native CLI initialized.

### Phase 2: Database Schema & Connection (Estimated: 2 Hours)

- **MongoDB Setup:** Establish an async connection using Motor.
- **Data Models (Pydantic):**
  - `DeviceToken`: Central registry schema containing `owner_id`, `owner_type`, and the `fcm_tokens` array (decoupled from the core Users).
  - `Appointments`: Tracking `status` (`pending` vs `approved`), `doctor_id`, `patient_id`.
  - `NotificationInbox`: Shared inbox polled by both Web and Mobile apps.

### Phase 3: Backend API & Business Logic (Estimated: 3-4 Hours)

- **Routes:**
  - `POST /tokens/register`: Device token registration (for Staff/Doctors mapping into the `DeviceTokens` registry).
  - `POST /appointments/request`: Creates a pending booking (triggered by the Web Widget).
  - `POST /appointments/{appointment_id}/approve`: Approves booking, triggers mocked Patient SMS/WhatsApp log, and fires internal Push to Doctors/Staff.
  - `GET /notifications`: Fetches history (used by Web Dropdown & Mobile Bell icon).

---

## Day 2: The Experience (Frontend, Notifications, and Integration)

### Phase 4: Web Dashboard (Console & Widget) (Estimated: 2-3 Hours)

- **Patient Booking Widget:** A lightweight Next.js component to select a doctor ID, date, and time.
- **Staff Console:** A dashboard to view pending requests and click "Approve".
- **UX Feedback:** Render immediate local confirmation using toasts and populate a simple dropdown header Notification Center.

### Phase 5: Firebase Integration (Estimated: 2 Hours)

- **FCM Dispatch:** Update the `POST /appointments/{id}/approve` endpoint to query ALL `"doctor"` and `"staff"` tokens from the `DeviceTokens` registry, and broadcast the payload via Firebase Admin SDK.

### Phase 6: Mobile App Integration (React Native + Notifee) (Estimated: 3 Hours)

- **Native Config:** Configure `build.gradle` and `Podfile` for `@react-native-firebase/messaging` and `@notifee/react-native`.
- **Permissions:** Register OS FCM token directly to the backend.
- **Internal Push Reception:** Process silent Firebase data payloads and utilize Notifee to trigger highly-customized, privacy-first (`visibility: private`) lock-screen and foreground notifications.
- **Notification Center:** A simple `FlatList` component sharing identical data with the Web App.

### Phase 7: Buffer, Testing & Polish (Estimated: 2 Hours)

- **End-to-End Test:** Widget Request -> Web Console Approve -> Mock SMS log verified -> Firebase broadcast -> Mobile App Notifee rendering.
