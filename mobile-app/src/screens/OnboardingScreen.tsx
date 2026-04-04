/**
 * Prototype onboarding: notification explainer → role → name (+ optional doctor
 * specialty) → signup API → `completeOnboarding`.
 *
 * If the user denies notification permission, they can still finish signup;
 * push may be limited until they enable notifications in system settings.
 */
import {
  AuthorizationStatus,
  getMessaging,
  requestPermission,
} from '@react-native-firebase/messaging';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import {
  ProviderSignupApiError,
  signUpProvider,
} from '../services/providerApi';
import {
  type ProviderOwnerType,
  useOnboardingStore,
} from '../store/useOnboardingStore';

type WizardStep = 0 | 1 | 2;

export default function OnboardingScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  const [step, setStep] = useState<WizardStep>(0);
  const [ownerType, setOwnerType] = useState<ProviderOwnerType | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const colors = isDark ? stylesDark : stylesLight;

  const goPermissionStep = useCallback(async () => {
    try {
      const status = await requestPermission(getMessaging());
      const granted =
        status === AuthorizationStatus.AUTHORIZED ||
        status === AuthorizationStatus.PROVISIONAL;
      if (__DEV__) {
        console.debug('[Onboarding] requestPermission status=', status);
      }
      if (!granted) {
        Toast.show({
          type: 'info',
          text1: 'Notifications off',
          text2:
            'You can still create your account. Enable notifications later in Settings for push alerts.',
          position: 'top',
          visibilityTime: 5000,
        });
      }
    } catch (e) {
      console.warn('[Onboarding] requestPermission failed:', e);
      Toast.show({
        type: 'info',
        text1: 'Could not request notifications',
        text2: 'Continue to signup; you can enable notifications later.',
        position: 'top',
      });
    }
    setStep(1);
  }, []);

  const onSubmit = useCallback(async () => {
    if (!ownerType) {
      Toast.show({
        type: 'error',
        text1: 'Select a role',
        text2: 'Choose doctor or staff.',
      });
      return;
    }
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      Toast.show({
        type: 'error',
        text1: 'Name required',
        text2: 'Enter first and last name.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const specTrim = specialty.trim();
      const res = await signUpProvider({
        owner_type: ownerType,
        first_name: fn,
        last_name: ln,
        ...(ownerType === 'doctor' && specTrim !== ''
          ? { specialty: specTrim }
          : {}),
      });

      if (__DEV__) {
        console.debug(
          '[Onboarding] signup ok owner_type=',
          res.owner_type,
          'owner_id_len=',
          res.owner_id.length,
        );
      }

      completeOnboarding({
        ownerId: res.owner_id,
        userId: res.user_id,
        ownerType: res.owner_type,
        displayName: `${fn} ${ln}`,
      });

      Toast.show({
        type: 'success',
        text1: 'Welcome',
        text2: 'Your account is ready.',
        position: 'top',
      });
    } catch (e) {
      const message =
        e instanceof ProviderSignupApiError
          ? e.userMessage
          : 'Something went wrong. Try again.';
      if (__DEV__) {
        console.warn('[Onboarding] signup failed:', e);
      }
      Toast.show({
        type: 'error',
        text1: 'Signup failed',
        text2: message,
        position: 'top',
        visibilityTime: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }, [ownerType, firstName, lastName, specialty, completeOnboarding]);

  const renderStep0 = () => (
    <View style={styles.stepBlock}>
      <Text style={[styles.title, colors.title]}>Stay updated</Text>
      <Text style={[styles.body, colors.muted]}>
        We use notifications for appointment and message alerts. Tap below to
        allow or deny the system prompt.
      </Text>
      <Text style={[styles.hint, colors.muted]}>
        If you deny access, you can still finish signup. Push may not work until
        you turn notifications on in device Settings.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue to role selection"
        onPress={() => {
          goPermissionStep().catch((err) => {
            if (__DEV__) {
              console.warn('[Onboarding] goPermissionStep:', err);
            }
          });
        }}
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && styles.primaryBtnPressed,
        ]}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
      </Pressable>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepBlock}>
      <Text style={[styles.title, colors.title]}>Your role</Text>
      <Text style={[styles.body, colors.muted]}>
        Are you signing up as a doctor or staff?
      </Text>
      <View style={styles.roleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign up as doctor"
          onPress={() => {
            setOwnerType('doctor');
            setStep(2);
          }}
          style={({ pressed }) => [
            styles.roleChip,
            { borderColor: isDark ? '#4B5563' : '#D1D5DB' },
            ownerType === 'doctor' && styles.roleChipSelected,
            pressed && styles.roleChipPressed,
          ]}
        >
          <Text
            style={[
              styles.roleChipText,
              ownerType === 'doctor'
                ? styles.roleChipTextSelected
                : isDark
                  ? styles.roleChipTextDarkUnselected
                  : null,
            ]}
          >
            Doctor
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign up as staff"
          onPress={() => {
            setOwnerType('staff');
            setStep(2);
          }}
          style={({ pressed }) => [
            styles.roleChip,
            { borderColor: isDark ? '#4B5563' : '#D1D5DB' },
            ownerType === 'staff' && styles.roleChipSelected,
            pressed && styles.roleChipPressed,
          ]}
        >
          <Text
            style={[
              styles.roleChipText,
              ownerType === 'staff'
                ? styles.roleChipTextSelected
                : isDark
                  ? styles.roleChipTextDarkUnselected
                  : null,
            ]}
          >
            Staff
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setStep(0)}
        style={styles.linkBtn}
      >
        <Text style={[styles.linkText, colors.link]}>Back</Text>
      </Pressable>
    </View>
  );

  const renderStep2 = () => (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, colors.title]}>Your details</Text>
      <Text style={[styles.body, colors.muted]}>
        {ownerType === 'doctor'
          ? 'Name and optional specialty (defaults to General if empty).'
          : 'Your name as it should appear in the app.'}
      </Text>
      <TextInput
        accessibilityLabel="First name"
        placeholder="First name"
        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        style={[styles.input, colors.input, colors.inputText]}
      />
      <TextInput
        accessibilityLabel="Last name"
        placeholder="Last name"
        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        style={[styles.input, colors.input, colors.inputText]}
      />
      {ownerType === 'doctor' ? (
        <TextInput
          accessibilityLabel="Specialty optional"
          placeholder="Specialty (optional)"
          placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
          value={specialty}
          onChangeText={setSpecialty}
          autoCapitalize="words"
          style={[styles.input, colors.input, colors.inputText]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create account"
        disabled={submitting}
        onPress={() => {
          onSubmit().catch((err) => {
            if (__DEV__) {
              console.warn('[Onboarding] onSubmit:', err);
            }
          });
        }}
        style={({ pressed }) => [
          styles.primaryBtn,
          submitting && styles.primaryBtnDisabled,
          pressed && !submitting && styles.primaryBtnPressed,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Create account</Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setStep(1)}
        style={styles.linkBtn}
        disabled={submitting}
      >
        <Text style={[styles.linkText, colors.link]}>Back</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, colors.root]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.inner,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  stepBlock: { flex: 1, justifyContent: 'center' },
  scrollContent: { paddingBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  primaryBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  linkBtn: { marginTop: 16, paddingVertical: 8, alignSelf: 'flex-start' },
  linkText: { fontSize: 15 },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  roleChipPressed: { opacity: 0.85 },
  roleChipSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  roleChipText: { fontSize: 15, fontWeight: '600', color: '#4B5563' },
  roleChipTextDarkUnselected: { color: '#9CA3AF' },
  roleChipTextSelected: { color: '#FFFFFF' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
});

const stylesLight = StyleSheet.create({
  root: { backgroundColor: '#F9FAFB' },
  title: { color: '#111827' },
  muted: { color: '#6B7280' },
  link: { color: '#3B82F6' },
  input: { borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  inputText: { color: '#111827' },
});

const stylesDark = StyleSheet.create({
  root: { backgroundColor: '#111827' },
  title: { color: '#F9FAFB' },
  muted: { color: '#9CA3AF' },
  link: { color: '#60A5FA' },
  input: { borderColor: '#374151', backgroundColor: '#1F2937' },
  inputText: { color: '#F9FAFB' },
});
