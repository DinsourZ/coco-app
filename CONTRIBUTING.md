# Contributing to CoCo App

Thank you for contributing to **CoCo App**!

## Development Prerequisites

- Node.js 20 LTS and npm 10+
- Expo Go or native Android/iOS simulator/device for interactive testing (optional — Mock Mode & automated tests run with zero hardware)

## Quick Start

```bash
npm ci
npm run verify
npm start
```

By default, CoCo App launches in **Mock Mode (Synthetic)** so you can develop and test all UI flows without a physical robot or private CoCo OS backend.

## Branching & Pull Request Policy

1. Create a dedicated feature branch from `main` (e.g., `feat/android-eas-build`, `fix/pairing-countdown`).
2. Keep PRs focused, small, and linked to a GitHub Issue.
3. Never commit secrets, real server URLs, private IPs, or real device credentials.
4. Ensure all local checks pass before opening a PR:
   - `npm run typecheck` — strict TypeScript checking
   - `npm run test` — Vitest unit & backend-contract tests
   - `npm run secret-scan` — forbidden files, secrets, private IPs, and direct dependency license audit
   - `npm run export:native` — Expo Metro bundle export for Android & iOS
5. Direct pushes to `main` are prohibited; all changes merge via reviewed Pull Requests.

## Safety & Security Rules

- Never alter or weaken the independent Emergency STOP flow (`POST /api/devices/{id}/motion/stop`).
- Never store role bearer tokens or one-time pairing/rotated tokens in URLs, logs, or plaintext disk storage.
- Never claim MIT license for third-party code whose license does not permit it; document any attributions in `NOTICE.md`.
- Report security issues privately to the repository owner rather than posting sensitive details in public issues.
