# NOTICE

CoCo App is a public standalone mobile companion client extracted from the
client-facing protocol definitions and TypeScript API/validation contracts of
CoCo OS (MIT License, Copyright (c) 2026 CoCo OS contributors).

## Provenance & Scope

- Source repository: private `DinsourZ/coco-os`
- Source branch & commit: `integration/coco-full-recovery-20261114` (`8b981d7befd6c733f4b7b5942cabd4a64d8f92c8`)
- Extracted scope: client-facing JSON schemas, TypeScript protocol validators,
  API client contracts, and safety invariants.
- Excluded scope: private backend services, ESP32-S3 firmware, mechanical CAD,
  third-party offline ASR/TTS models, firmware font binaries, operational
  scripts, databases, credentials, and private deployment configuration.

## Direct Third-Party Runtime Dependencies

All runtime and development dependencies declared in `package.json` are
installed from the public npm registry under permissive open-source licenses:

- **Expo** (`expo`, `expo-asset`, `expo-clipboard`, `expo-status-bar`) — MIT License
- **React & React Native** (`react`, `react-native`) — MIT License
- **react-native-safe-area-context** — MIT License
- **qrcode** — MIT License (Copyright (c) 2012 Ryan Day)
- **TypeScript** — Apache License 2.0
- **Vitest** — MIT License

No GPL, AGPL, proprietary, or hardware-restricted (e.g., Espressif-only)
source code or binary assets are included in this repository.
