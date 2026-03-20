import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { API_BASE_URL } from '../config/api';
import { useNotificationStore } from '../store/useNotificationStore';

const FCM_TOKEN_ENDPOINT = `${API_BASE_URL}/api/v1/providers/me/fcm-token`;

// ---------------------------------------------------------------------------
// Sends the FCM token to the backend PATCH endpoint.
//
// Auth note: the backend provider endpoint uses a prototype auth stub
// (get_current_provider) — no Bearer token is attached yet.
//
// Resilience: if the backend is unreachable or returns an error, the token
// is still cached locally so the app doesn't retry on every cold start.
// The next successful sync will overwrite the cache naturally.
// ---------------------------------------------------------------------------
async function syncTokenWithBackend(token: string): Promise<void> {
  // #region agent log
  fetch(
    'http://127.0.0.1:7703/ingest/f5fb0264-6c01-4c5c-bf77-43c4e9004fbd',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '1d42bc',
      },
      body: JSON.stringify({
        sessionId: '1d42bc',
        runId: 'run1',
        hypothesisId: 'H3_fetch_attempt',
        location: 'fcmService.ts:syncTokenWithBackend:entry',
        message: 'Token sync fetch invoked',
        data: { endpoint: FCM_TOKEN_ENDPOINT },
        timestamp: Date.now(),
      }),
    },
  ).catch(() => {});
  // #endregion agent log

  console.log(`[FCM] Syncing token to: ${FCM_TOKEN_ENDPOINT}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(FCM_TOKEN_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcm_token: token }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      console.warn(
        `[FCM] Backend responded with ${response.status}: ${body}`,
      );
    } else {
      console.log('[FCM] Token synced with backend successfully.');
    }

    // #region agent log
    fetch(
      'http://127.0.0.1:7703/ingest/f5fb0264-6c01-4c5c-bf77-43c4e9004fbd',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '1d42bc',
        },
        body: JSON.stringify({
          sessionId: '1d42bc',
          runId: 'run1',
          hypothesisId: 'H3_fetch_response',
          location: 'fcmService.ts:syncTokenWithBackend:after_fetch',
          message: 'Fetch completed',
          data: { ok: response.ok, status: response.status },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion agent log
  } catch (error) {
    console.warn('[FCM] Backend unreachable — token cached locally only:', error);

    // #region agent log
    fetch(
      'http://127.0.0.1:7703/ingest/f5fb0264-6c01-4c5c-bf77-43c4e9004fbd',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '1d42bc',
        },
        body: JSON.stringify({
          sessionId: '1d42bc',
          runId: 'run1',
          hypothesisId: 'H3_fetch_error',
          location: 'fcmService.ts:syncTokenWithBackend:catch',
          message: 'Fetch threw network error',
          data: { name: (error as any)?.name, message: (error as any)?.message },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion agent log
  }

  // Always cache regardless of backend success — prevents infinite retry loops
  // when the backend is down. The token is valid even without backend sync.
  useNotificationStore.getState().setTokenCache(token);
}

// ---------------------------------------------------------------------------
// initializeFCM — call once on app foreground mount (e.g. inside App.tsx).
// Uses RNFirebase v22+ modular API.
// ---------------------------------------------------------------------------
export async function initializeFCM(): Promise<void> {
  const messagingInstance = getMessaging();

  const authStatus = await requestPermission(messagingInstance);
  const isAuthorized =
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL;

  if (!isAuthorized) {
    console.warn('[FCM] Notification permission not granted.');

    // #region agent log
    fetch(
      'http://127.0.0.1:7703/ingest/f5fb0264-6c01-4c5c-bf77-43c4e9004fbd',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '1d42bc',
        },
        body: JSON.stringify({
          sessionId: '1d42bc',
          runId: 'run1',
          hypothesisId: 'H1_permission_block',
          location: 'fcmService.ts:initializeFCM:not_authorized',
          message: 'Permission not granted; aborting token sync',
          data: { isAuthorized, authStatus },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion agent log
    return;
  }

  const currentToken = await getToken(messagingInstance);
  if (!currentToken) {
    console.warn('[FCM] Could not retrieve FCM token.');
    return;
  }

  const cachedToken = useNotificationStore.getState().fcmTokenCache;
  // #region agent log
  fetch(
    'http://127.0.0.1:7703/ingest/f5fb0264-6c01-4c5c-bf77-43c4e9004fbd',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '1d42bc',
      },
      body: JSON.stringify({
        sessionId: '1d42bc',
        runId: 'run1',
        hypothesisId: 'H2_cache_skip',
        location: 'fcmService.ts:initializeFCM:token_compare',
        message: 'Token compare against cached value',
        data: {
          tokenPresent: !!currentToken,
          cachedPresent: !!cachedToken,
          shouldSync: currentToken !== cachedToken,
        },
        timestamp: Date.now(),
      }),
    },
  ).catch(() => {});
  // #endregion agent log

  if (currentToken !== cachedToken) {
    console.log('[FCM] Token is new or rotated — syncing with backend.');
    await syncTokenWithBackend(currentToken);
  } else {
    console.log('[FCM] Token unchanged — skipping backend sync.');
  }

  onTokenRefresh(messagingInstance, async (refreshedToken) => {
    console.log('[FCM] Token rotated by Firebase — re-syncing with backend.');
    await syncTokenWithBackend(refreshedToken);
  });
}
