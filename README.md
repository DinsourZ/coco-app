# CoCo App Flutter scaffold

- `pubspec.yaml`: Flutter 3.10+ (3.x) and Dart 3, with `http` and the cross-platform `web_socket_channel` transport.
- `lib/main.dart`: Chat and Devices bottom navigation with `useMock: true` by default. The default app makes no network requests.
- `lib/devices_screen.dart`: Server-reported device state, guarded quick actions, and an independent Emergency STOP bar.
- `lib/api.dart`: Runtime-configured HTTP and app WebSocket client.
- `test/`: Transport, chat, navigation, and device safety regression tests.
- `README.md`: This file and the build instructions below.

From this directory, generate the web runner once, then build:

```sh
flutter create --empty --platforms=web --project-name=coco_app .
flutter build web
```

To try the chat in Chrome, run `flutter run -d chrome`.

## Runtime configuration

Construct `CoCoApi(baseUrl: serverUri, token: sessionToken)` using a URI and
token supplied by the running application. There is no default server, bundled
key, environment-file credential, or persistent token storage. Do not put tokens
in URLs, source code, logs, browser storage, preferences, or build-time defines.
Close the client with `await api.close()` when the session ends. If you inject an
`http.Client`, you remain responsible for closing that HTTP client.

To enable real HTTP chat, pass the client to
`CoCoApp(useMock: false, api: api)` or
`ChatScreen(useMock: false, api: api)`. The screen creates a new `request_id` for
each message. It displays an immediate `message`/`reply` when supplied by the
server, otherwise acknowledges submission. Streaming chat and tool/approval UI
can subscribe through `connectAppSocket`; the screen's HTTP mode does not itself
render streamed events or grant approvals.

## Client contract

- `postChat({'message': message, 'request_id': requestId})`: `POST /api/chat`,
  with only these two JSON fields and `Authorization: Bearer ...`.
- `cancelChat(requestId)`: `POST /api/chat/requests/{id}/cancel`.
- `listDevices()`: `GET /api/devices`, returning objects from a JSON array or a
  `devices` envelope.
- `safeAction(deviceId: ..., action: ..., preconditions: ..., body: ...)`:
  `POST /api/devices/{id}/actions/{action}`. Supply the complete current
  `X-CoCo-Control-*` headers from the device state. Empty preconditions,
  non-control header names, and newline-containing values fail locally. The
  server validates the actual preconditions; the client never invents or
  refreshes them to bypass a rejection.
- `emergencyStop(deviceId)`: `POST /api/devices/{id}/motion/stop` with no
  control-precondition headers or request body. Returns the actual HTTP status
  and successful response body (JSON or text), including an explicit empty
  body for responses such as 204. HTTP failures retain the real status code and
  server body in `CoCoApiException.response` so the STOP bar can display the
  actual error. Transport failures and timeouts report errors without inventing
  a server response. STOP is never retried automatically.
- `connectAppSocket(onChat: ..., onTool: ..., onApproval: ..., onMessage: ...,
  onError: ..., onDone: ...)`: connects to `/ws/app` using `wss` for HTTPS and
  `ws` for HTTP. After the handshake, the first client frame is
  `{"type":"app.auth","token": sessionToken}`. Events use a string `type`;
  `chat`/`chat.*`, `tool`/`tool.*`, and `approval`/`approval.*` route to their
  respective callbacks with the full JSON payload. `onMessage` also receives
  unknown types. Invalid frames and transport failures use sanitized errors.
  Approvals are delivered to the application; none are automatically accepted.
- `rotateCredentials(onToken: showTokenOnce)`: `POST /api/credentials/rotate`.
  The successful JSON response must contain a nonempty `token`. It is passed
  once to the display callback, never saved, returned, or installed as the
  client's next bearer token. The callback must display it only for the current
  interaction and discard it on dismissal; do not log or persist it.
- `revokeCredentials()`: `POST /api/credentials/revoke`. Successful rotation
  or revocation clears the old in-memory token and disconnects the socket.
  Further operations require a new client with runtime-supplied credentials.

The scaffold contains no backend specification for device action paths,
credential routes, or event payload fields beyond their event families. The
routes and JSON shapes above make those assumptions explicit. Credential route
prefixes can be changed with the constructor's `credentialsPath` (an absolute
API path, never a URL). A path prefix in `baseUrl` is preserved for gateways.
Identifiers are encoded as individual path segments. HTTP redirects and
automatic retries are disabled. Error strings retain HTTP status codes but
exclude raw response bodies. Only Emergency STOP exposes the server's error
body through its structured response for display in the STOP bar.

The Devices screen reads `id` (or `device_id`), `name`, `online` (or status),
and server-advertised `quick_actions` (or `actions`) from each device. Each
quick-action object supplies an `action` (or `name`), current `preconditions`
(or `control_preconditions`, `precondition_headers`, or `headers`), optional
`label`, and optional JSON `body`. Actions remain disabled unless the device is
online and valid precondition headers are present. Refresh devices after any
command before running another quick action; pending commands, pending
refreshes, and failed refreshes cannot reuse a control snapshot. A precondition
rejection is shown without retrying. Emergency STOP uses the currently selected
device and stays available regardless of online status, quick-action
preconditions, pending quick actions, or refresh failures. Its UI displays the
server's HTTP status and body, including errors, or the transport error. An HTTP
acknowledgement is displayed as received and never presented as proof that the
device has stopped. Long responses scroll within the bar, keeping STOP visible.
Quick-action results stay in their device cards so they cannot cover STOP.

## Checks

```sh
flutter pub get
dart format lib test
flutter analyze
flutter test
```
