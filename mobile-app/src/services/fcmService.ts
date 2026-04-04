import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/api';
import { useNotificationStore } from '../store/useNotificationStore';
import { useOnboardingStore } from '../store/useOnboardingStore';

const FCM_TOKEN_ENDPOINT = `${API_BASE_URL}/api/v1/providers/me/fcm-token`;

/** Avoid spamming Metro when PATCH is intentionally skipped (no provider yet). */
let loggedSkipMissingProvider = false;

/** Prevent stacking listeners if `initializeFCM` runs more than once. */
let tokenRefreshUnsubscribe: (() => void) | null = null;

function hasPersistedProviderIdentity(): boolean {
  const { onboardingComplete, ownerId, ownerType } = useOnboardingStore.getState();
  return (
    onboardingComplete === true &&
    typeof ownerId === 'string' &&
    ownerId.trim().length > 0 &&
    (ownerType === 'doctor' || ownerType === 'staff')
  );
}

// ---------------------------------------------------------------------------
// Sends the FCM token to the backend PATCH endpoint.
//
// Uses `owner_id` + `owner_type` from the onboarding store (post-signup).
// If onboarding is incomplete or ids are missing, skips PATCH and caches the
// token locally only — no retry loop (see `initializeFCM` gated in App.tsx).
//
// Auth note: the backend still accepts explicit owner fields in the body
// (prototype); no Bearer token is attached yet.
// ---------------------------------------------------------------------------
async function syncTokenWithBackend(token: string): Promise<void> {
  if (!hasPersistedProviderIdentity()) {
    if (__DEV__ && !loggedSkipMissingProvider) {
      loggedSkipMissingProvider = true;
      console.debug(
        '[FCM] PATCH skipped — complete onboarding so owner_id and owner_type are available',
      );
    }
    useNotificationStore.getState().setTokenCache(token);
    return;
  }

  loggedSkipMissingProvider = false;

  const { ownerId, ownerType } = useOnboardingStore.getState();
  const owner_id = ownerId!.trim();
  const owner_type = ownerType!;

  const platform =
    Platform.OS === 'ios' || Platform.OS === 'android'
      ? Platform.OS
      : 'unknown';

  if (__DEV__) {
    console.debug(
      '[FCM] PATCH',
      'owner_type=',
      owner_type,
      'owner_id_len=',
      owner_id.length,
      'platform=',
      platform,
    );
  }

  console.log(`[FCM] Syncing token to: ${FCM_TOKEN_ENDPOINT}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(FCM_TOKEN_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcm_token: token,
        owner_type,
        owner_id,
        platform,
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

  useNotificationStore.getState().setTokenCache(token);
}

// ---------------------------------------------------------------------------
// initializeFCM — call when onboarding is complete (see App.tsx).
// Uses RNFirebase v22+ modular API.
// ---------------------------------------------------------------------------
export async function initializeFCM(): Promise<void> {
  const messagingInstance = getMessaging();

  const authStatus = await requestPermission(messagingInstance);
  const isAuthorized =
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL;

  if (!isAuthorized) {
    console.warn(
      '[FCM] Notification permission not granted — no token sync. You can enable notifications in Settings later.',
    );
    return;
  }

  const currentToken = await getToken(messagingInstance);
  if (!currentToken) {
    console.warn('[FCM] Could not retrieve FCM token.');
    return;
  }

  if (__DEV__) {
    console.log('[FCM][DEV] Retrieved FCM token:', currentToken);
    try {
      (globalThis as { __FCM_TOKEN__?: string }).__FCM_TOKEN__ = currentToken;
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

  tokenRefreshUnsubscribe?.();
  tokenRefreshUnsubscribe = onTokenRefresh(
    messagingInstance,
    async (refreshedToken) => {
      if (__DEV__) {
        console.debug('[FCM] Token rotated by Firebase — re-syncing');
      }
      await syncTokenWithBackend(refreshedToken);
    },
  );
}
