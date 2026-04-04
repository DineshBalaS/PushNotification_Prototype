import { createMMKV } from 'react-native-mmkv';
import type { MMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Matches backend `owner_type` for providers (doctor | staff).
 */
export type ProviderOwnerType = 'doctor' | 'staff';

export interface OnboardingCompletePayload {
  ownerId: string;
  userId: string;
  ownerType: ProviderOwnerType;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// MMKV — same pattern as `useNotificationStore`: separate instance id, graceful
// fallback when native module is missing until rebuild.
// ---------------------------------------------------------------------------
let storage: MMKV | null = null;
try {
  storage = createMMKV({ id: 'onboarding-store' });
  if (__DEV__) {
    console.debug('[OnboardingStore] MMKV instance ready (id=onboarding-store)');
  }
} catch (e) {
  console.error(
    '[OnboardingStore] MMKV init failed — onboarding persistence disabled until native rebuild:',
    e,
  );
}

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

const initialPersistedState = {
  onboardingComplete: false,
  ownerId: null as string | null,
  userId: null as string | null,
  ownerType: null as ProviderOwnerType | null,
  displayName: null as string | null,
};

interface OnboardingState {
  onboardingComplete: boolean;
  ownerId: string | null;
  userId: string | null;
  ownerType: ProviderOwnerType | null;
  displayName: string | null;

  completeOnboarding: (payload: OnboardingCompletePayload) => void;
  /** Clears onboarding and provider ids (e.g. QA / dev). */
  reset: () => void;
}

function isValidPayload(payload: OnboardingCompletePayload): boolean {
  const oid = payload.ownerId?.trim();
  const uid = payload.userId?.trim();
  const ot = payload.ownerType;
  return Boolean(oid && uid && (ot === 'doctor' || ot === 'staff'));
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialPersistedState,

      completeOnboarding: (payload) => {
        if (!isValidPayload(payload)) {
          console.error(
            '[OnboardingStore] completeOnboarding ignored — invalid payload (missing ownerId, userId, or ownerType)',
          );
          return;
        }
        const ownerId = payload.ownerId.trim();
        const userId = payload.userId.trim();
        const displayName =
          payload.displayName !== undefined && payload.displayName !== null
            ? payload.displayName.trim() || null
            : null;

        if (__DEV__) {
          console.debug(
            '[OnboardingStore] completeOnboarding',
            payload.ownerType,
            'ownerId_len=',
            ownerId.length,
            'userId_len=',
            userId.length,
            'has_displayName=',
            displayName !== null,
          );
        }

        set({
          onboardingComplete: true,
          ownerId,
          userId,
          ownerType: payload.ownerType,
          displayName,
        });
      },

      reset: () => {
        if (__DEV__) {
          console.debug('[OnboardingStore] reset — clearing persisted onboarding state');
        }
        set({ ...initialPersistedState });
      },
    }),
    {
      name: 'onboarding-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        onboardingComplete: state.onboardingComplete,
        ownerId: state.ownerId,
        userId: state.userId,
        ownerType: state.ownerType,
        displayName: state.displayName,
      }),
    },
  ),
);
