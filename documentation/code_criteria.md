# SYSTEM INSTRUCTION: CODE QUALITY & PERFORMANCE STANDARDS

## 1. Efficient Caching Strategies

- **Backend (FastAPI):** Use `functools.lru_cache` strictly for configuration settings (like environment variables) and static lookups.
- **Database (MongoDB):** You must define compound indexes for frequently queried fields (e.g., indexing `user_id` and `timestamp` together for the Notification Inbox).
- **Frontend (Expo):** Implement intelligent state caching for the Notification Inbox. Do not fetch the entire history from the server every time the user navigates to the screen. Use memory caching or lightweight local storage for immediate UI rendering while silently revalidating in the background.

## 2. Lazy Loading & Resource Management

- **Frontend UI:** Use `React.lazy()` and `Suspense` for heavy, non-critical components. For the notification history list, you MUST use React Native's `FlatList`. Configure `initialNumToRender`, `maxToRenderPerBatch`, and `windowSize` properly to ensure smooth scrolling without memory leaks or blank spaces.
- **Backend Data:** Never return an unbounded array of notifications. You must implement pagination (cursor-based or `limit`/`offset`) for the Inbox fetching endpoint.

## 3. Performance Boosters

- **Backend Asynchrony:** Every single I/O bound function, database call (using an async MongoDB driver like Motor), and external API call (Firebase Admin) MUST use `async` and `await`. You are forbidden from blocking the FastAPI event loop with synchronous operations.
- **Database Optimization:** Use MongoDB projections to return _only_ the necessary fields. Avoid pulling full documents if only the title and read status are needed. Use bulk operations (`bulk_write`) if handling multiple records simultaneously.
- **Frontend Rendering:** Assume the Hermes JavaScript engine is enabled. Avoid heavy synchronous calculations on the JS thread. Use `useMemo` and `useCallback` appropriately to prevent unnecessary child component re-renders.

## 4. Production-Ready & Clean Code Architecture

- **Backend Typing & Validation:** Strict Type Hinting is mandatory. Use `Pydantic` models for all request/response validation and MongoDB schema enforcement.
- **Backend Modularity:** Do not dump all code into `main.py`. Structure the app using routers (e.g., `routers/notifications.py`), keeping business logic separated into distinct service layers.
- **Frontend Typing:** Strict TypeScript is mandatory. Define explicit interfaces/types for all API responses and component props. The use of `any` is strictly prohibited.
- **General:** Code must be highly modular, DRY (Don't Repeat Yourself), and adhere to PEP 8 (Python) and standard ESLint rules (React/TypeScript).

## 5. Debug Logs & Error Handling

- **Backend Logging:** The use of plain `print()` statements is forbidden. Use Python's built-in `logging` module. Use `logger.info()` for successful lifecycle events (e.g., "FCM payload dispatched") and `logger.error()` with tracebacks for failures.
- **Backend Exceptions:** Implement custom global exception handlers. Never leak raw database errors or stack traces to the client. Always return standardized JSON error responses (e.g., `{"detail": "User token not found", "code": "TOKEN_MISSING"}`).
- **Frontend Handling:** Implement generic `try/catch` blocks for all network requests. Ensure the UI degrades gracefully. If an API call fails, show a friendly "Failed to load" state with a retry button instead of crashing the app or showing an infinite loading spinner.
