# Phase 2 Development Log: Database, Schema & Architecture Foundation

**Date:** March 19, 2026
**Phase Status:** Completed & Verified

## 1. Context & Objectives Achieved
Phase 2 (and the 2.5 architectural extension) focused strictly on establishing a robust, decoupled, and production-ready Python backend infrastructure for the real-time Push Notification prototype. Before exposing any active REST HTTP routes (Phase 3), we successfully implemented the asynchronous MongoDB layers, rigorous validation constraints, proxy service handlers, and safely locked the environment dependencies.

## 2. Infrastructure & Database Initialization
- **Connection Pipeline (`app/db/database.py`)**: 
  - Integrated `motor` for fully asynchronous, non-blocking MongoDB queries.
  - Implemented automated compound indexing constraints natively (`user_id` + `timestamp` for `notification_inbox` and `owner_id` for `device_tokens`) to ensure fetch pagination remains instantaneous.
- **Configuration Parsing (`app/core/config.py`)**:
  - Bound development database URIs efficiently via strict `pydantic-settings` to block configuration dictionary leaks.
- **Lifecycle Integration (`app/main.py`)**:
  - Hooked DB setup mechanisms to modern FastAPI `@asynccontextmanager` native `lifespan` blocks, ensuring clean network teardowns without zombie processes.

## 3. Domain Entities & API Data Transfer Objects (DTOs)
- **MongoDB Data Entities (`app/models/domain.py`)**:
  - Defined rigid foundational base schemas defining standard properties natively for `Patient`, `Staff`, `Doctor`, `User`, `DeviceToken`, `Appointment`, and `NotificationInbox`. Explicitly forced UTC `datetime` insertions via automated `default_factory`.
- **API Request DTOs (`app/models/schemas.py`)**:
  - Designed aggressive security request parsers (`TokenRegistrationRequest`, `AppointmentCreateRequest`) strictly separating web payloads from database entities utilizing Pydantic's `extra='forbid'` mechanic. This effectively prevents internal fields (such as forced `"pending"` statuses) from experiencing malicious frontend override injections.

## 4. Service Decoupling
- **Notification Interfaces (`app/services/notification_service.py`)**:
  - Abstracted the `send_mock_patient_sms` functionality alongside `dispatch_internal_push` Firebase proxy handlers.
  - Constructed discreet `try-except` sandboxes for these components so that simulated or actual network timeouts during Patient SMS tracking do not brutally crash the primary backend App route or return 500 Internal Server errors to the Web Dashboard.

## 5. Database Seeding & Traceability
- **Mock Entities (`seed_db.py`)**:
  - Leveraged `Faker` to avoid brittle hardcoding, locally populating MongoDB with 10 Patients, 3 Doctors, and 1 Receptionist. This provides Phase 3 with genuine `ObjectId` dependencies to instantly test relational API parameters.
- **Dependency Map (`requirements.txt`)**: 
  - Ran active `pip freeze` commands to log the functional environment state locally stabilizing Vercel or isolated Docker setups downstream.

## 6. Readiness for Phase 3 (Business Routing)
The core foundation is now fully resolved. The project seamlessly proceeds into Phase 3 logic containing:
- **`POST /tokens/register`**: Receives staff schemas, pushing data linearly into `DeviceTokens`.
- **`POST /appointments/request`**: Generates a standard request securely mapping to a real Patient/Doctor reference.
- **`POST /appointments/{id}/approve`**: Flips the appointment status natively, calls the mock patient SMS service concurrently with the Firebase Payload broadcaster locally.
- **`GET /notifications`**: Queries the heavily indexed `notification_inbox`.

*End of Phase 2 Log*
