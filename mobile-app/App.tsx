/**
 * @format
 */

import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import InboxScreen from './src/screens/InboxScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { initializeFCM } from './src/services/fcmService';
import { useNotificationStore } from './src/store/useNotificationStore';
import { useOnboardingStore } from './src/store/useOnboardingStore';

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [hydrated, setHydrated] = useState(() =>
    useOnboardingStore.persist.hasHydrated(),
  );
  const onboardingComplete = useOnboardingStore((s) => s.onboardingComplete);

  useEffect(() => {
    if (hydrated) {
      return undefined;
    }
    const unsub = useOnboardingStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    if (useOnboardingStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !onboardingComplete) {
      return;
    }
    initializeFCM().catch((err) => {
      if (__DEV__) {
        console.warn('[App] initializeFCM failed:', err);
      }
    });
  }, [hydrated, onboardingComplete]);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

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
  }, [hydrated]);

  const mainContent = !hydrated ? (
    <View
      style={[
        styles.hydrateContainer,
        isDark ? styles.hydrateBgDark : styles.hydrateBgLight,
      ]}
    >
      <ActivityIndicator size="large" color="#3B82F6" />
    </View>
  ) : onboardingComplete ? (
    <InboxScreen />
  ) : (
    <OnboardingScreen />
  );

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#111827' : '#FFFFFF'}
      />
      {mainContent}
      {/*
        Toast must be rendered at the very top of the component tree so it
        renders above all other views. It is self-positioning via `position`
        passed to Toast.show().
      */}
      <Toast />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  hydrateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hydrateBgDark: { backgroundColor: '#111827' },
  hydrateBgLight: { backgroundColor: '#F9FAFB' },
});

export default App;
