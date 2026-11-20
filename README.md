# CoCo App

Native Android & iOS companion app for **CoCo OS**, built with **Expo React Native + TypeScript**.

> **Security Boundary**: CoCo App is a public thin client. All AI provider keys, tool authorization policies, approval enforcement, device WebSocket routing, and physical hardware safety controls remain exclusively in the private `DinsourZ/coco-os` backend and ESP32-S3 firmware.

## Features (Phase 1)

- **Native Android & iOS Foundation**: Expo SDK 52 + React Native 0.76 + strict TypeScript (`packages/protocol`, `packages/api-client`, `src/`).
- **Zero-Hardware Mock Mode**: Defaults to synthetic **Mock Mode** so UI and workflows can be developed and tested without a physical robot or private backend.
- **Configurable HTTPS / WSS Backend**: Enter your private CoCo OS `https://` URL at runtime (cleartext `http://` is blocked except for explicit local loopback development). Zero hardcoded server addresses or keys.
- **Role-Scoped In-Memory Auth**: `console`, `approver`, and `audit` tokens are held strictly in volatile RAM and authenticated over `Authorization: Bearer` (REST) and first-frame `app.auth` (`/ws/app`).
- **Chat (`/api/chat`)**: Real backend chat contract, in-flight request cancellation (`POST /api/chat/requests/{id}/cancel`), tool call & approval badges, and optional server-side conversation history.
- **Devices & Credential Lifecycle**: Online/offline state, capabilities, display observation, safe quick actions with `X-CoCo-Control-*` preconditions, and per-device credential metadata / rotate / revoke (with RAM-only one-time token display).
- **Device Pairing**: Create/list/cancel one-time pairing tickets with expiry countdowns and plain-text QR code rendering (encodes only `pairing_code`, never auto-claims).
- **Independent Emergency STOP**: Globally accessible STOP bar calling `POST /api/devices/{id}/motion/stop` without precondition headers, reporting genuine server outcomes and never fabricating success.
- **Honest Phase-2 TODOs**: Mobile voice input, native audio playback, and push notifications are explicitly marked `TODO` / `not_implemented`.

## Quick Start

```bash
npm ci
npm run verify
npm start
```

### Verification Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | Strict TypeScript type checking across `packages/`, `src/`, `tests/` |
| `npm run test` | Unit & backend-contract tests with 100% synthetic fixtures |
| `npm run secret-scan` | Scans for forbidden files, secrets, private IPs/URLs, and direct dependency licenses |
| `npm run export:native` | Compiles Expo React Native production bundles for Android & iOS |
| `npm run verify` | Runs all four checks sequentially |

## Documentation

- [Architecture (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)
- [Migration Map (`docs/MIGRATION_MAP.md`)](./docs/MIGRATION_MAP.md)
- [Multi-Agent Governance (`AGENTS.md`)](./AGENTS.md)
- [Multi-Agent Workflow (`docs/AGENT_WORKFLOW.md`)](./docs/AGENT_WORKFLOW.md)
- [Client Protocol (`protocol/coco_protocol.md`)](./protocol/coco_protocol.md)
- [Contributing (`CONTRIBUTING.md`)](./CONTRIBUTING.md)
- [Third-Party Notices (`NOTICE.md`)](./NOTICE.md)

## License

MIT — see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
