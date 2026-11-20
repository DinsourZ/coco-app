# CoCo App Client Protocol (v0.1)

Adapted from CoCo OS `protocol/coco_protocol.md` (`integration/coco-full-recovery-20261114` @ `8b981d7befd6c733f4b7b5942cabd4a64d8f92c8`) for the public CoCo App mobile client. Authoritative JSON Schemas reside in [`protocol/schemas/`](./schemas/).

## Security Boundaries

- **Server-Side Authority**: All tool authorization, approval decisions, actuation bounds, and hardware safety checks live exclusively in the private CoCo OS backend and ESP32-S3 firmware.
- **No AI Provider Secrets in Client**: AI provider API keys never enter CoCo App.
- **Role-Scoped In-Memory Tokens**: CoCo App separates `console`, `approver`, and `audit` bearer tokens in volatile RAM. Tokens are never placed in URL query strings, cookies, logs, or plaintext disk files.
- **Software STOP vs. Physical Safety**: `POST /api/devices/{device_id}/motion/stop` is an independent, precondition-free software control command. It does **not** replace physical actuator power cutoff.
- **Plain-Text Pairing Codes**: One-time 192-bit pairing tickets are created via REST (`POST /api/device-pairing/tickets/{device_id}`). QR codes displayed in the app encode **only** the plain-text `pairing_code` and never auto-claim or embed bearer tokens.

## Verified REST Endpoints (Client-Facing)

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /health` | Public | Backend health, version, AI/voice status summary |
| `POST /api/chat` | `console` | Send chat turn (`text`, optional `device_id`, `request_id`, `conversation_id`, `remember`) |
| `POST /api/chat/requests/{request_id}/cancel` | `console` | Register cancellation for an in-flight chat request (`202 Accepted`) |
| `GET /api/chat/conversations` | `console` | List saved conversations (returns `enabled: false` when disabled) |
| `GET /api/chat/conversations/{id}` | `console` | Fetch saved transcript (never auto-replays tools) |
| `DELETE /api/chat/conversations/{id}` | `console` | Delete saved conversation |
| `GET /api/devices` | `console` | Read online/offline state, capabilities, lease, fault, display & voice status |
| `POST /api/devices/{id}/motion/stop` | `console` | Independent emergency STOP (omits `X-CoCo-Control-*` preconditions) |
| `POST /api/devices/{id}/motion/{action}` | `console` | Bounded motion (`forward`, `backward`, `left`, `right`) with `X-CoCo-Control-Session` + `X-CoCo-Control-Generation` |
| `POST /api/devices/{id}/face/{expression}` | `console` | Set display expression (`normal`, `happy`, `sleep`, `error`) with control context |
| `POST /api/devices/{id}/beep` | `console` | Trigger bounded device beep with control context |
| `GET /api/device-pairing/tickets` | `console` | List active pairing tickets (non-secret metadata) |
| `POST /api/device-pairing/tickets/{device_id}` | `console` | Create one-time pairing ticket (returns one-time `pairing_code`) |
| `DELETE /api/device-pairing/tickets/{ticket_id}` | `console` | Cancel an active pairing ticket |
| `GET /api/devices/credentials` | `console` | List per-device credential metadata (`status`, `version`, `fingerprint`) |
| `POST /api/devices/{id}/credential/rotate` | `console` | Rotate device credential (returns one-time `token`, disconnects old session) |
| `DELETE /api/devices/{id}/credential` | `console` | Revoke device credential |
| `GET /api/approvals/mine` | `console` | Read requester-owned approval summaries |
| `POST /api/approvals/{id}/withdraw` | `console` | Withdraw requester's own pending approval |
| `GET /api/approvals` | `approver` | List approval queue |
| `POST /api/approvals/{id}/approve` | `approver` | Approve pending tool call |
| `POST /api/approvals/{id}/reject` | `approver` | Reject pending tool call |
| `GET /api/settings/language` | Public | Read global language settings |
| `PUT /api/settings/language` | `console` | Update global language (`zh-CN` / `en-US`) |
| `GET /api/voice/runtime` | Public | Read-only backend voice runtime metadata |

## App WebSocket (`/ws/app`)

1. Connect over `wss://<configured-host>/ws/app` (cleartext `ws://` permitted only for explicit loopback dev).
2. Send first application frame immediately after open:
   ```json
   { "type": "app.auth", "token": "<in-memory-console-token>" }
   ```
   Invalid or missing auth closes the socket with WebSocket policy violation (`1008`).
3. Send keepalive `{"type": "ping"}` every 30 seconds (well within backend `app_ws_idle_timeout_s`, default 300s). Server responds with `{"type": "pong"}`.
4. Server pushes live updates such as `app.device_update`, `settings.language.changed`, and `app.approval_update`. See [`schemas/app_message.schema.json`](./schemas/app_message.schema.json).
