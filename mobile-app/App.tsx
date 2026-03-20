/**
 * @format
 */

import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import InboxScreen from './src/screens/InboxScreen';
import { initializeFCM } from './src/services/fcmService';
import { useNotificationStore } from './src/store/useNotificationStore';

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';

  useEffect(() => {
    // --- FCM initialisation (permission request + token registration) ---
    initializeFCM();

    // --- Foreground message listener (modular RNFirebase v22+ API) ---
    // onMessage(messagingInstance, handler) replaces messaging().onMessage(handler).
    // Only fires when the app is in the FOREGROUND. Background/quit-state
    // messages are handled by setBackgroundMessageHandler in index.js.
    const unsubscribe = onMessage(getMessaging(), async (remoteMessage) => {
      const title = remoteMessage.notification?.title ?? 'New Notification';
      const body = remoteMessage.notification?.body ?? '';
      const status = (remoteMessage.data?.status as string) ?? 'PENDING';

      // 1. Persist to MMKV via Zustand so InboxScreen updates immediately.
      useNotificationStore.getState().addNotification({
        id: remoteMessage.messageId ?? `msg_${Date.now()}`,
        title,
        body,
        status,
        timestamp: Date.now(),
      });

      // 2. Show a non-blocking in-app toast so the active user is alerted
      //    without interrupting their current context.
      Toast.show({
        type: 'info',
        text1: title,
        text2: body,
        position: 'top',
        visibilityTime: 4000,
        autoHide: true,
        topOffset: 56,
      });
    });

    // Cleanup: remove the listener when the component unmounts.
    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#111827' : '#FFFFFF'}
      />
      <InboxScreen />
      {/*
        Toast must be rendered at the very top of the component tree so it
        renders above all other views. It is self-positioning via `position`
        passed to Toast.show().
      */}
      <Toast />
    </SafeAreaProvider>
  );
}

export default App;
