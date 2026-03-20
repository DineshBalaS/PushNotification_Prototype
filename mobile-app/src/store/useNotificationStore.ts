import { createMMKV } from 'react-native-mmkv';
import type { MMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// MMKV v4 API — instances are created via createMMKV(), not `new MMKV()`.
// `MMKV` is a type-only interface in v4; the Nitro HybridObject is constructed
// internally by the native factory.
//
// Wrapped in try/catch because the Nitro native module is only available
// after a full native rebuild that includes react-native-mmkv. If the module
// is missing from the currently installed APK, the store falls back to
// in-memory (no persistence) until a rebuild is done.
// ---------------------------------------------------------------------------
let storage: MMKV | null = null;
try {
  storage = createMMKV({ id: 'notification-store' });
} catch (e) {
  console.error(
    '[Store] MMKV init failed — persistence disabled until native rebuild:',
    e,
  );
}

// ---------------------------------------------------------------------------
// Custom Zustand storage adapter for the persist middleware.
// v4 uses remove(key) instead of delete(key).
// Optional-chaining on `storage` degrades gracefully when MMKV is absent.
// ---------------------------------------------------------------------------
const mmkvStorage = {
  getItem: (key: string): string | null => {
    return storage?.getString(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    storage?.set(key, value);
  },
  removeItem: (key: string): void => {
    storage?.remove(key);
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Notification {
  id: string;
  title: string;
  body: string;
  status: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  fcmTokenCache: string | null;

  // Actions
  addNotification: (payload: Omit<Notification, 'read'>) => void;
  markAsRead: (id: string) => void;
  setTokenCache: (token: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],
      fcmTokenCache: null,

      addNotification: (payload) =>
        set((state) => ({
          notifications: [
            { ...payload, read: false },
            ...state.notifications,
          ],
        })),

      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        })),

      setTokenCache: (token) => set({ fcmTokenCache: token }),
    }),
    {
      name: 'notification-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
