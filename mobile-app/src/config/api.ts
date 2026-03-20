// ---------------------------------------------------------------------------
// API Configuration
//
// IMPORTANT — PHYSICAL DEVICE SETUP:
// `localhost` on an Android physical device resolves to the phone itself,
// not your development machine. You must replace the placeholder IP below
// with your computer's actual local IPv4 address.
//
// How to find your machine's local IPv4 address:
//   Windows: run `ipconfig` in PowerShell → look for "IPv4 Address" under
//            your active Wi-Fi or Ethernet adapter (e.g. 192.168.1.42)
//   macOS  : run `ipconfig getifaddr en0` in Terminal
//   Linux  : run `hostname -I` in Terminal
//
// Your phone and dev machine must be on the same Wi-Fi network.
// ---------------------------------------------------------------------------
export const API_BASE_URL = 'http://192.168.56.1:8000';
//                                ^^^^^^^^^^^
//                                Replace with your machine's IPv4 address
