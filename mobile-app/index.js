/**
 * @format
 *
 * IMPORTANT: The Firebase background handler MUST be registered here, at the
 * module root, before AppRegistry.registerComponent().  React Native's Headless
 * JS runtime boots this file directly when a background FCM message arrives —
 * the React component tree is never mounted in that context, so any handler
 * registered inside a component would never fire.
 */

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
import { useNotificationStore } from './src/store/useNotificationStore';

// ---------------------------------------------------------------------------
// Background / Quit-state FCM handler (modular RNFirebase v22+ API)
//
// setBackgroundMessageHandler(messagingInstance, handler) replaces
// messaging().setBackgroundMessageHandler(handler).
//
// No React context is available here, so we write directly to MMKV via
// Zustand's getState() — the store rehydrates from MMKV on the next
// foreground launch automatically.
// ---------------------------------------------------------------------------
setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
  const title = remoteMessage.notification?.title ?? 'New Notification';
  const body = remoteMessage.notification?.body ?? '';
  const status = remoteMessage.data?.status ?? 'PENDING';

  useNotificationStore.getState().addNotification({
    id: remoteMessage.messageId ?? `msg_${Date.now()}`,
    title,
    body,
    status,
    timestamp: Date.now(),
  });

  console.log(
    `[FCM Background] Saved notification to MMKV | title="${title}" | status="${status}"`,
  );
});

// ---------------------------------------------------------------------------
// Foreground app registration — must come after the background handler.
// ---------------------------------------------------------------------------
AppRegistry.registerComponent(appName, () => App);
