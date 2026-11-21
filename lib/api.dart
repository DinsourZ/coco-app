import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

/// A transport error that deliberately excludes response bodies and credentials.
class CoCoApiException implements Exception {
  const CoCoApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => 'CoCoApiException: $message'
      '${statusCode == null ? '' : ' (HTTP $statusCode)'}';
}

/// An app event, retaining all server fields in [payload].
class CoCoAppMessage {
  const CoCoAppMessage(this.type, this.payload);

  final String type;
  final Map<String, Object?> payload;
}

typedef CoCoMessageHandler = void Function(CoCoAppMessage message);
typedef CoCoSocketConnector = WebSocketChannel Function(Uri uri);

/// CoCo transport for mobile, desktop and web.
///
/// Supply the server URI and bearer token at runtime. Credentials live only in
/// memory, never in URLs, logs or persistent storage. An injected HTTP client
/// remains owned by the caller.
class CoCoApi {
  CoCoApi({
    required Uri baseUrl,
    required String token,
    http.Client? client,
    CoCoSocketConnector? socketConnector,
    this.timeout = const Duration(seconds: 30),
    String credentialsPath = '/api/credentials',
  })  : _baseUrl = baseUrl,
        _token = token,
        _client = client ?? http.Client(),
        _ownsClient = client == null,
        _socketConnector = socketConnector ?? WebSocketChannel.connect,
        _credentialsPath = credentialsPath {
    if (!['http', 'https'].contains(baseUrl.scheme) ||
        baseUrl.host.isEmpty ||
        baseUrl.userInfo.isNotEmpty ||
        baseUrl.hasQuery ||
        baseUrl.hasFragment) {
      throw ArgumentError('baseUrl must be an HTTP(S) URI without credentials, '
          'a query or a fragment.');
    }
    if (token.trim().isEmpty || token.contains(RegExp(r'[\r\n]'))) {
      throw ArgumentError('A nonempty bearer token is required.');
    }
    if (timeout <= Duration.zero) {
      throw ArgumentError('timeout must be positive.');
    }
    if (!credentialsPath.startsWith('/') ||
        credentialsPath.contains(RegExp(r'[?#]')) ||
        Uri.parse(credentialsPath).hasAuthority ||
        Uri.parse(credentialsPath).pathSegments.any(
              (part) => part == '.' || part == '..',
            )) {
      throw ArgumentError('credentialsPath must be an absolute API path.');
    }
  }

  static const chatMethod = 'POST';
  static const chatPath = '/api/chat';
  static const appSocketPath = '/ws/app';
  static const appAuthFirstFrame = 'app.auth';

  final Uri _baseUrl;
  String? _token;
  final http.Client _client;
  final bool _ownsClient;
  final CoCoSocketConnector _socketConnector;
  final String _credentialsPath;
  final Duration timeout;
  WebSocketChannel? _socket;
  StreamSubscription<dynamic>? _socketSubscription;
  bool _closed = false;
  bool _credentialsChanging = false;

  String _requireToken() {
    final token = _token;
    if (_closed || token == null) {
      throw StateError('This client is closed or its credentials are retired.');
    }
    return token;
  }

  Uri _uri(List<String> path) => _baseUrl.replace(pathSegments: [
        ..._baseUrl.pathSegments.where((part) => part.isNotEmpty),
        ...path,
      ]);

  String _segment(String value) {
    if (value.trim().isEmpty || value == '.' || value == '..') {
      throw ArgumentError('A nonempty path identifier is required.');
    }
    return value;
  }

  /// POST /api/chat, preserving the scaffold's map-based public interface.
  Future<Map<String, Object?>> postChat(Map<String, Object?> body) async {
    final message = body['message'];
    final requestId = body['request_id'];
    if (message is! String ||
        message.trim().isEmpty ||
        requestId is! String ||
        requestId.trim().isEmpty) {
      throw ArgumentError('message and request_id must be nonempty strings.');
    }
    return _object(await _request('POST', ['api', 'chat'], body: {
      'message': message,
      'request_id': requestId,
    }));
  }

  Future<void> cancelChat(String requestId) async {
    await _request('POST', [
      'api', 'chat', 'requests', _segment(requestId), 'cancel',
    ]);
  }

  /// Accepts an array or a {"devices": [...]} envelope.
  Future<List<Map<String, Object?>>> listDevices() async {
    final response = await _request('GET', ['api', 'devices']);
    final devices = response is Map ? response['devices'] : response;
    if (devices is! List) {
      throw const CoCoApiException('Invalid devices response.');
    }
    return devices.map(_object).toList(growable: false);
  }

  /// POST /api/devices/{deviceId}/actions/{action}.
  ///
  /// Pass complete X-CoCo-Control-* preconditions from the current device
  /// state. Headers are forwarded verbatim; stale preconditions are reported
  /// as HTTP errors, never retried or replaced with invented values.
  Future<Map<String, Object?>> safeAction({
    required String deviceId,
    required String action,
    required Map<String, String> preconditions,
    Map<String, Object?> body = const {},
  }) async {
    if (preconditions.isEmpty ||
        preconditions.entries.any((entry) =>
            !RegExp(r'^X-CoCo-Control-[A-Za-z0-9-]+$', caseSensitive: false)
                .hasMatch(entry.key) ||
            entry.key.contains(RegExp(r'[\r\n]')) ||
            entry.value.trim().isEmpty ||
            entry.value.contains(RegExp(r'[\r\n]')))) {
      throw ArgumentError('Nonempty X-CoCo-Control-* headers are required.');
    }
    return _object(await _request('POST', [
      'api', 'devices', _segment(deviceId), 'actions', _segment(action),
    ], body: body, headers: preconditions));
  }

  /// POST {credentialsPath}/rotate and deliver `token` once to [onToken].
  ///
  /// The callback should display the token once, never log or persist it.
  /// This client does not retain or install the new token. Rotation retires
  /// the old credentials; subsequent use requires a new runtime-configured
  /// client, including when the display callback throws.
  Future<void> rotateCredentials({
    required void Function(String token) onToken,
  }) async {
    final response = await _changeCredentials('rotate');
    final token = _object(response)['token'];
    if (token is! String || token.trim().isEmpty) {
      throw const CoCoApiException('Rotation did not return a one-time token.');
    }
    onToken(token);
  }

  /// POST {credentialsPath}/revoke and discard the in-memory bearer token.
  Future<void> revokeCredentials() async {
    await _changeCredentials('revoke');
  }

  Future<Object?> _changeCredentials(String operation) async {
    _requireToken();
    if (_credentialsChanging) {
      throw StateError('A credential change is already in progress.');
    }
    _credentialsChanging = true;
    try {
      return await _request('POST', [
        ...Uri.parse(_credentialsPath).pathSegments.where((p) => p.isNotEmpty),
        operation,
      ], onSuccess: () => _token = null);
    } finally {
      _credentialsChanging = false;
      // A successful change invalidates the old token even if JSON is malformed.
      if (_token == null) await disconnectAppSocket();
    }
  }

  /// Connect /ws/app and send app.auth as the first client frame.
  ///
  /// Routes `chat[.*]`, `tool[.*]`, and `approval[.*]` event families.
  /// [onMessage] receives every valid event, including unknown types.
  /// No automatic reconnect or replay can duplicate a device action.
  Future<void> connectAppSocket({
    CoCoMessageHandler? onChat,
    CoCoMessageHandler? onTool,
    CoCoMessageHandler? onApproval,
    CoCoMessageHandler? onMessage,
    void Function(CoCoApiException error)? onError,
    void Function()? onDone,
  }) async {
    final token = _requireToken();
    if (_socket != null) {
      throw StateError('An app socket is already connected or connecting.');
    }
    final uri = _uri(['ws', 'app']).replace(
      scheme: _baseUrl.scheme == 'https' ? 'wss' : 'ws',
    );
    WebSocketChannel? channel;
    try {
      final socket = _socketConnector(uri);
      channel = socket;
      _socket = socket;
      _socketSubscription = socket.stream.listen(
        (dynamic frame) {
          if (!identical(_socket, socket) || _closed) return;
          CoCoAppMessage event;
          try {
            final String text;
            if (frame is String) {
              text = frame;
            } else if (frame is List<int>) {
              text = utf8.decode(frame);
            } else {
              throw const FormatException();
            }
            final payload = _object(jsonDecode(text));
            final type = payload['type'];
            if (type is! String || type.isEmpty) {
              throw const FormatException();
            }
            event = CoCoAppMessage(type, Map.unmodifiable(payload));
          } catch (_) {
            onError?.call(const CoCoApiException('Invalid app socket message.'));
            return;
          }
          switch (event.type.split('.').first) {
            case 'chat':
              onChat?.call(event);
              break;
            case 'tool':
              onTool?.call(event);
              break;
            case 'approval':
              onApproval?.call(event);
              break;
          }
          onMessage?.call(event);
        },
        onError: (Object error) {
          if (!identical(_socket, socket)) return;
          _socket = null;
          _socketSubscription = null;
          unawaited(_closeSocket(socket));
          onError?.call(const CoCoApiException('App socket connection failed.'));
        },
        onDone: () {
          if (!identical(_socket, socket)) return;
          _socket = null;
          _socketSubscription = null;
          onDone?.call();
        },
        cancelOnError: true,
      );
      await socket.ready.timeout(timeout);
      if (!identical(_socket, socket) || _closed || _token != token) {
        throw StateError('The app socket was closed during connection.');
      }
      socket.sink.add(jsonEncode({'type': appAuthFirstFrame, 'token': token}));
    } catch (_) {
      if (identical(_socket, channel)) {
        await disconnectAppSocket();
      } else if (channel != null) {
        await _closeSocket(channel);
      }
      throw const CoCoApiException('Could not authenticate the app socket.');
    }
  }

  Future<Object?> _request(
    String method,
    List<String> path, {
    Map<String, Object?>? body,
    Map<String, String> headers = const {},
    void Function()? onSuccess,
  }) async {
    final token = _requireToken();
    final request = http.Request(method, _uri(path))
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        ...headers,
      });
    if (body != null) {
      try {
        request.body = jsonEncode(body);
      } catch (_) {
        throw ArgumentError('The request body must be JSON serializable.');
      }
      request.headers['Content-Type'] = 'application/json';
    }
    try {
      final response = await (() async {
        final streamed = await _client.send(request);
        return http.Response.fromStream(streamed);
      })().timeout(timeout);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw CoCoApiException('CoCo request failed.',
            statusCode: response.statusCode);
      }
      onSuccess?.call();
      if (response.bodyBytes.isEmpty) return <String, Object?>{};
      return jsonDecode(utf8.decode(response.bodyBytes));
    } on CoCoApiException {
      rethrow;
    } on TimeoutException {
      throw const CoCoApiException('CoCo request timed out.');
    } on FormatException {
      throw const CoCoApiException('Invalid JSON response.');
    } catch (_) {
      // Transport exceptions can contain headers or response data.
      throw const CoCoApiException('CoCo connection failed.');
    }
  }

  Map<String, Object?> _object(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const CoCoApiException('Expected a JSON object.');
    }
    return Map<String, Object?>.from(value);
  }

  Future<void> _closeSocket(WebSocketChannel socket) async {
    try {
      await socket.sink.close(1000).timeout(timeout);
    } catch (_) {
      // Cleanup must not expose server-supplied close reasons or secrets.
    }
  }

  Future<void> disconnectAppSocket() async {
    final socket = _socket;
    final subscription = _socketSubscription;
    _socket = null;
    _socketSubscription = null;
    final closing = socket == null ? Future<void>.value() : _closeSocket(socket);
    if (subscription != null) {
      try {
        await subscription.cancel().timeout(timeout);
      } catch (_) {
        // Cancellation errors must not leak transport data or prevent cleanup.
      }
    }
    await closing;
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _token = null;
    await disconnectAppSocket();
    if (_ownsClient) _client.close();
  }
}
