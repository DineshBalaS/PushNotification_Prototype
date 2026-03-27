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
const IMPERSONATED_OWNER_TYPE = 'doctor';
const IMPERSONATED_OWNER_ID = '69bb8c9997dbc788acc28b3d'; // Dr. Harper

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
  console.log(`[FCM] Syncing token to: ${FCM_TOKEN_ENDPOINT}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(FCM_TOKEN_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcm_token: token,
        owner_type: IMPERSONATED_OWNER_TYPE,
        owner_id: IMPERSONATED_OWNER_ID,
        platform: 'android',
      }),
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
  } catch (error) {
    console.warn('[FCM] Backend unreachable — token cached locally only:', error);
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
    return;
  }

  const currentToken = await getToken(messagingInstance);
  if (!currentToken) {
    console.warn('[FCM] Could not retrieve FCM token.');
    return;
  }

  // Debug-only: make it easy to verify token retrieval in RN DevTools.
  // Note: this should not be relied on for production security.
  if (__DEV__) {
    console.log('[FCM][DEV] Retrieved FCM token:', currentToken);
    // Also expose it on global for quick inspection in some debuggers.
    try {
      (globalThis as any).__FCM_TOKEN__ = currentToken;
    } catch {
      // Ignore if global assignment is restricted in the current runtime.
    }
  }

  const cachedToken = useNotificationStore.getState().fcmTokenCache;
  const isNewOrRotated = currentToken !== cachedToken;

  if (isNewOrRotated) {
    console.log('[FCM] Token is new or rotated — syncing with backend.');
  } else {
    console.log('[FCM] Token unchanged — syncing anyway (debug mode).');
  }
  await syncTokenWithBackend(currentToken);

  onTokenRefresh(messagingInstance, async (refreshedToken) => {
    console.log('[FCM] Token rotated by Firebase — re-syncing with backend.');
    await syncTokenWithBackend(refreshedToken);
  });
}
