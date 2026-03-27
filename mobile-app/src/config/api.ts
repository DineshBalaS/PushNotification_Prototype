// ---------------------------------------------------------------------------
// API Configuration
//
// Development (Android physical device):
// This repo’s recommended setup is to use:
//   adb reverse tcp:8000 tcp:8000
// With ADB reverse, the phone can reach your computer’s localhost:8000.
//
// Production:
// Replace PROD_API_BASE_URL with your deployed HTTPS backend (e.g. Vercel).
// ---------------------------------------------------------------------------
import { Platform } from 'react-native';

const DEV_API_BASE_URL_ANDROID = 'http://localhost:8000';
const PROD_API_BASE_URL = 'https://example.com';

export const API_BASE_URL =
  __DEV__ && Platform.OS === 'android'
    ? DEV_API_BASE_URL_ANDROID
    : PROD_API_BASE_URL;
