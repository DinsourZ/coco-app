import 'dart:async';
import 'dart:convert';

import 'package:coco_app/api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

const _testToken = 'test-only-memory-token';

void main() {
  late List<http.Request> requests;
  late Future<http.Response> Function(http.Request) respond;

  CoCoApi createApi({
    Uri? baseUrl,
    CoCoSocketConnector? socketConnector,
    Duration timeout = const Duration(seconds: 1),
    String credentialsPath = '/api/credentials',
  }) {
    final client = MockClient((request) {
      requests.add(request);
      return respond(request);
    });
    final api = CoCoApi(
      baseUrl: baseUrl ?? Uri.https('server.invalid', ''),
      token: _testToken,
      client: client,
      socketConnector: socketConnector,
      timeout: timeout,
      credentialsPath: credentialsPath,
    );
    addTearDown(() async {
      await api.close();
      client.close();
    });
    return api;
  }

  setUp(() {
    requests = [];
    respond = (_) async => http.Response('{}', 200);
  });

  test('chat sends only message and request_id with bearer authentication',
      () async {
    respond = (_) async => http.Response.bytes(
          utf8.encode('{"message":"Hello 🌍"}'),
          202,
        );
    final api = createApi();
    final result = await api.postChat({
      'message': 'Hello',
      'request_id': 'request-1',
      'ignored': 'not part of the API contract',
    });

    final request = requests.single;
    expect(request.method, 'POST');
    expect(request.url.path, '/api/chat');
    expect(request.url.query, isEmpty);
    expect(request.headers['Authorization'], 'Bearer $_testToken');
    expect(request.headers['Content-Type'], startsWith('application/json'));
    expect(request.followRedirects, isFalse);
    expect(jsonDecode(request.body), {
      'message': 'Hello',
      'request_id': 'request-1',
    });
    expect(result['message'], 'Hello 🌍');
  });

  test('chat rejects missing request ids before sending', () async {
    await expectLater(
      createApi().postChat({'message': 'Hello'}),
      throwsArgumentError,
    );
    expect(requests, isEmpty);
  });

  test('cancel encodes the request id as one path segment and accepts 204',
      () async {
    respond = (_) async => http.Response('', 204);
    await createApi().cancelChat('request/with ?#');

    final request = requests.single;
    expect(request.method, 'POST');
    expect(request.url.pathSegments,
        ['api', 'chat', 'requests', 'request/with ?#', 'cancel']);
    expect(request.url.hasQuery, isFalse);
    expect(request.url.hasFragment, isFalse);
    expect(request.headers['Authorization'], 'Bearer $_testToken');
  });

  for (final envelope in [false, true]) {
    test('listDevices decodes ${envelope ? 'enveloped' : 'bare'} devices',
        () async {
      final devices = [
        {'id': 'device-1', 'name': 'Test device'},
      ];
      respond = (_) async => http.Response(
            jsonEncode(envelope ? {'devices': devices} : devices),
            200,
          );

      expect(await createApi().listDevices(), devices);
      expect(requests.single.method, 'GET');
      expect(requests.single.url.path, '/api/devices');
      expect(requests.single.headers['Authorization'], 'Bearer $_testToken');
    });
  }

  test('safeAction forwards preconditions and JSON without retrying', () async {
    respond = (_) async => http.Response('{"ok":true}', 200);
    final result = await createApi().safeAction(
      deviceId: 'device/1',
      action: 'tap',
      preconditions: {
        'X-CoCo-Control-Version': '7',
        'X-CoCo-Control-State': 'current-state',
      },
      body: {'x': 10, 'y': 20},
    );

    final request = requests.single;
    expect(request.method, 'POST');
    expect(request.url.pathSegments,
        ['api', 'devices', 'device/1', 'actions', 'tap']);
    expect(request.headers['X-CoCo-Control-Version'], '7');
    expect(request.headers['X-CoCo-Control-State'], 'current-state');
    expect(request.headers['Authorization'], 'Bearer $_testToken');
    expect(jsonDecode(request.body), {'x': 10, 'y': 20});
    expect(result, {'ok': true});
  });

  test('safeAction rejects absent, empty, or non-control headers', () async {
    final api = createApi();
    for (final headers in <Map<String, String>>[
      {},
      {'Authorization': 'override'},
      {'X-CoCo-Control-Version': ''},
      {'X-CoCo-Control-Version\n': '7'},
      {'X-CoCo-Control-Version': '7\r\nAuthorization: override'},
    ]) {
      await expectLater(
        api.safeAction(deviceId: 'device-1', action: 'tap',
            preconditions: headers),
        throwsArgumentError,
      );
    }
    expect(requests, isEmpty);
  });

  test('emergencyStop sends no control preconditions and returns server result',
      () async {
    respond = (_) async => http.Response(
          '{"status":"stop_requested"}',
          202,
        );
    final result = await createApi().emergencyStop('device/1');

    final request = requests.single;
    expect(request.method, 'POST');
    expect(request.url.pathSegments,
        ['api', 'devices', 'device/1', 'motion', 'stop']);
    expect(request.headers['Authorization'], 'Bearer $_testToken');
    expect(request.followRedirects, isFalse);
    expect(
      request.headers.keys.where(
        (name) => name.toLowerCase().startsWith('x-coco-control-') ||
            name.toLowerCase().startsWith('if-'),
      ),
      isEmpty,
    );
    expect(request.body, isEmpty);
    expect(result.statusCode, 202);
    expect(result.hasBody, isTrue);
    expect(result.body, {'status': 'stop_requested'});
  });

  test('emergencyStop preserves an empty success status and error status',
      () async {
    respond = (_) async => http.Response('', 204);
    final api = createApi();
    final result = await api.emergencyStop('device-1');
    expect(result.statusCode, 204);
    expect(result.hasBody, isFalse);

    respond = (_) async =>
        http.Response('{"error":"controller unavailable"}', 503);
    await expectLater(
      api.emergencyStop('device-1'),
      throwsA(isA<CoCoApiException>()
          .having((error) => error.statusCode, 'HTTP status', 503)
          .having((error) => error.response?.statusCode, 'response status', 503)
          .having((error) => error.response?.hasBody, 'has body', isTrue)
          .having((error) => error.response?.body, 'server error',
              {'error': 'controller unavailable'})),
    );
    expect(requests, hasLength(2));
  });

  test('emergencyStop returns a plain-text success body verbatim', () async {
    respond = (_) async => http.Response('stop queued', 202);
    final result = await createApi().emergencyStop('device-1');
    expect(result.statusCode, 202);
    expect(result.body, 'stop queued');
    expect(result.hasBody, isTrue);
  });

  test('emergencyStop retains text errors and empty error responses', () async {
    final api = createApi();
    respond = (_) async => http.Response('Controller rejected the stop', 409);
    await expectLater(
      api.emergencyStop('device-1'),
      throwsA(isA<CoCoApiException>()
          .having((error) => error.response?.body, 'server error',
              'Controller rejected the stop')
          .having((error) => error.toString(), 'error text',
              isNot(contains('Controller rejected the stop')))),
    );

    respond = (_) async => http.Response('', 502);
    await expectLater(
      api.emergencyStop('device-1'),
      throwsA(isA<CoCoApiException>()
          .having((error) => error.statusCode, 'HTTP status', 502)
          .having((error) => error.response?.hasBody, 'has body', isFalse)),
    );
    expect(requests, hasLength(2));
  });

  test('emergencyStop retains server-declared failure in a 200 response',
      () async {
    respond = (_) async =>
        http.Response('{"ok":false,"error":"not stopped"}', 200);
    final result = await createApi().emergencyStop('device-1');
    expect(result.statusCode, 200);
    expect(result.body, {'ok': false, 'error': 'not stopped'});
  });

  test('emergencyStop reports transport failure or timeout without retrying',
      () async {
    final api = createApi(timeout: const Duration(milliseconds: 10));
    respond = (_) async => throw http.ClientException(_testToken);
    await expectLater(
      api.emergencyStop('device-1'),
      throwsA(isA<CoCoApiException>()
          .having((error) => error.response, 'no server response', isNull)
          .having((error) => error.statusCode, 'no invented status', isNull)
          .having((error) => error.toString(), 'redacted transport error',
              isNot(contains(_testToken)))),
    );
    respond = (_) => Completer<http.Response>().future;
    await expectLater(
      api.emergencyStop('device-1'),
      throwsA(isA<CoCoApiException>()
          .having((error) => error.message, 'timeout', contains('timed out'))
          .having((error) => error.response, 'no server response', isNull)),
    );
    expect(requests, hasLength(2));
  });

  test('precondition failures retain the status but never echo response data',
      () async {
    respond = (_) async => http.Response('sensitive $_testToken', 412);
    await expectLater(
      createApi().safeAction(
        deviceId: 'device-1',
        action: 'tap',
        preconditions: {'X-CoCo-Control-Version': 'stale'},
      ),
      throwsA(isA<CoCoApiException>()
          .having((e) => e.statusCode, 'status', 412)
          .having((e) => e.response, 'no action response body', isNull)
          .having((e) => e.toString(), 'redacted error',
              isNot(contains(_testToken)))),
    );
    expect(requests, hasLength(1));
  });

  test('redirects fail without replaying authenticated requests', () async {
    respond = (_) async => http.Response('', 302,
        headers: {'location': '/unexpected'});
    await expectLater(
      createApi().listDevices(),
      throwsA(isA<CoCoApiException>()
          .having((e) => e.statusCode, 'status', 302)),
    );
    expect(requests, hasLength(1));
    expect(requests.single.followRedirects, isFalse);
  });

  test('rotation delivers a token once, disconnects and retires the client',
      () async {
    final socket = _FakeSocket();
    final api = createApi(socketConnector: (_) => socket);
    await api.connectAppSocket();
    respond = (_) async => http.Response('{"token":"test-only-new-token"}', 200);
    var displays = 0;
    await api.rotateCredentials(onToken: (token) {
      displays++;
      expect(token, 'test-only-new-token');
    });

    expect(displays, 1);
    expect(requests.single.url.path, '/api/credentials/rotate');
    expect(requests.single.method, 'POST');
    expect(socket.sink.closed, isTrue);
    await expectLater(api.listDevices(), throwsStateError);
    await expectLater(api.rotateCredentials(onToken: (_) => displays++),
        throwsStateError);
    expect(displays, 1);
    expect(requests, hasLength(1));
  });

  test('rotation callback failure cannot replay the one-time token', () async {
    respond = (_) async => http.Response('{"token":"test-only-new-token"}', 200);
    final api = createApi();
    await expectLater(
      api.rotateCredentials(onToken: (_) => throw StateError('Display failed')),
      throwsStateError,
    );
    await expectLater(api.listDevices(), throwsStateError);
    expect(requests, hasLength(1));
  });

  test('successful rotation without a token still retires the old token',
      () async {
    final api = createApi();
    var displays = 0;
    await expectLater(api.rotateCredentials(onToken: (_) => displays++),
        throwsA(isA<CoCoApiException>()));
    expect(displays, 0);
    await expectLater(api.listDevices(), throwsStateError);
  });

  test('malformed successful rotation retires credentials without display',
      () async {
    respond = (_) async => http.Response('malformed $_testToken', 200);
    final api = createApi();
    var displays = 0;
    await expectLater(api.rotateCredentials(onToken: (_) => displays++),
        throwsA(isA<CoCoApiException>()));
    expect(displays, 0);
    await expectLater(api.listDevices(), throwsStateError);
  });

  test('concurrent credential changes cannot display multiple new tokens',
      () async {
    final response = Completer<http.Response>();
    respond = (_) => response.future;
    final api = createApi();
    var displays = 0;
    final rotating = api.rotateCredentials(onToken: (_) => displays++);
    await expectLater(api.rotateCredentials(onToken: (_) => displays++),
        throwsStateError);
    await expectLater(api.revokeCredentials(), throwsStateError);
    response.complete(http.Response('{"token":"test-only-new-token"}', 200));
    await rotating;
    expect(displays, 1);
    expect(requests, hasLength(1));
  });

  test('failed rotation does not display a token or retire valid credentials',
      () async {
    respond = (_) async => http.Response('{"token":"never-display"}', 403);
    final api = createApi();
    var displays = 0;
    await expectLater(api.rotateCredentials(onToken: (_) => displays++),
        throwsA(isA<CoCoApiException>()));
    expect(displays, 0);
    respond = (_) async => http.Response('[]', 200);
    await api.listDevices();
    expect(requests, hasLength(2));
  });

  test('revocation clears credentials and disconnects the socket', () async {
    respond = (_) async => http.Response('', 204);
    final socket = _FakeSocket();
    final api = createApi(socketConnector: (_) => socket);
    await api.connectAppSocket();
    await api.revokeCredentials();

    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/credentials/revoke');
    expect(requests.single.headers['Authorization'], 'Bearer $_testToken');
    expect(socket.sink.closed, isTrue);
    await expectLater(api.listDevices(), throwsStateError);
    await expectLater(api.connectAppSocket(), throwsStateError);
  });

  test('runtime base prefixes and credential paths are respected', () async {
    await createApi(
      baseUrl: Uri.https('server.invalid', '/gateway/'),
      credentialsPath: '/custom/credentials',
    ).revokeCredentials();
    expect(requests.single.url.path, '/gateway/custom/credentials/revoke');
  });

  test('invalid JSON, device shapes and transport errors are sanitized',
      () async {
    final api = createApi();
    for (final body in ['invalid $_testToken', '{}', '[null]']) {
      respond = (_) async => http.Response(body, 200);
      await expectLater(api.listDevices(), throwsA(isA<CoCoApiException>()));
    }
    respond = (_) async => throw http.ClientException(_testToken);
    await expectLater(
      api.listDevices(),
      throwsA(isA<CoCoApiException>().having(
          (e) => e.toString(), 'redacted error', isNot(contains(_testToken)))),
    );
  });

  test('requests time out without a retry', () async {
    respond = (_) => Completer<http.Response>().future;
    await expectLater(
      createApi(timeout: const Duration(milliseconds: 10)).listDevices(),
      throwsA(isA<CoCoApiException>().having(
          (e) => e.message, 'message', contains('timed out'))),
    );
    expect(requests, hasLength(1));
  });

  test('configuration errors do not include the supplied secret', () {
    expect(
      () => CoCoApi(baseUrl: Uri.https('server.invalid', ''),
          token: '$_testToken\n'),
      throwsA(isA<ArgumentError>().having(
          (e) => e.toString(), 'redacted error', isNot(contains(_testToken)))),
    );
  });

  for (final secure in [false, true]) {
    test('socket authenticates first over ${secure ? 'wss' : 'ws'}', () async {
      final connected = Completer<void>();
      final socket = _FakeSocket(ready: connected.future);
      Uri? socketUri;
      final api = createApi(
        baseUrl: Uri(scheme: secure ? 'https' : 'http', host: 'server.invalid'),
        socketConnector: (uri) {
          socketUri = uri;
          return socket;
        },
      );
      final connecting = api.connectAppSocket();
      expect(socket.sink.frames, isEmpty);
      connected.complete();
      await connecting;

      expect(socketUri!.scheme, secure ? 'wss' : 'ws');
      expect(socketUri!.path, '/ws/app');
      expect(socketUri!.query, isEmpty);
      expect(jsonDecode(socket.sink.frames.single as String),
          {'type': 'app.auth', 'token': _testToken});
      await expectLater(api.connectAppSocket(), throwsStateError);
    });
  }

  test('socket dispatches chat, tool, approval and unknown messages', () async {
    final socket = _FakeSocket();
    final chat = <CoCoAppMessage>[];
    final tool = <CoCoAppMessage>[];
    final approval = <CoCoAppMessage>[];
    final all = <CoCoAppMessage>[];
    final errors = <CoCoApiException>[];
    await createApi(socketConnector: (_) => socket).connectAppSocket(
      onChat: chat.add,
      onTool: tool.add,
      onApproval: approval.add,
      onMessage: all.add,
      onError: errors.add,
    );
    socket.incoming.add('{"type":"chat.delta","delta":"Hello"}');
    socket.incoming.add(utf8.encode('{"type":"tool.result","ok":true}'));
    socket.incoming.add('{"type":"approval.request","id":"approval-1"}');
    socket.incoming.add('{"type":"app.ready"}');
    socket.incoming.add('invalid $_testToken');
    socket.incoming.add('{"type":"chat.done"}');
    await Future<void>.delayed(Duration.zero);

    expect(chat.map((e) => e.type), ['chat.delta', 'chat.done']);
    expect(tool.single.payload['ok'], isTrue);
    expect(approval.single.payload['id'], 'approval-1');
    expect(all, hasLength(5));
    expect(errors, hasLength(1));
    expect(errors.single.toString(), isNot(contains(_testToken)));
    expect(socket.sink.frames, hasLength(1));
  });

  test('failed socket handshakes send no auth and sanitize errors', () async {
    final connected = Completer<void>();
    final socket = _FakeSocket(ready: connected.future);
    final api = createApi(socketConnector: (_) => socket);
    final connecting = api.connectAppSocket();
    final assertion = expectLater(
      connecting,
      throwsA(isA<CoCoApiException>().having(
          (e) => e.toString(), 'redacted error', isNot(contains(_testToken)))),
    );
    connected.completeError(StateError(_testToken));
    await assertion;
    expect(socket.sink.frames, isEmpty);
    expect(socket.sink.closed, isTrue);
  });

  test('socket transport errors are sanitized and allow a fresh connection',
      () async {
    final firstSocket = _FakeSocket();
    final secondSocket = _FakeSocket();
    var connections = 0;
    final errors = <CoCoApiException>[];
    final api = createApi(socketConnector: (_) =>
        connections++ == 0 ? firstSocket : secondSocket);
    await api.connectAppSocket(onError: errors.add);
    firstSocket.incoming.addError(StateError(_testToken));
    await Future<void>.delayed(Duration.zero);

    expect(errors, hasLength(1));
    expect(errors.single.toString(), isNot(contains(_testToken)));
    expect(firstSocket.sink.closed, isTrue);
    await api.connectAppSocket();
    expect(jsonDecode(secondSocket.sink.frames.single as String)['type'],
        'app.auth');
  });

  test('normal socket closure is delivered and permits reconnecting', () async {
    final firstSocket = _FakeSocket();
    final secondSocket = _FakeSocket();
    var connections = 0;
    var done = 0;
    final api = createApi(socketConnector: (_) =>
        connections++ == 0 ? firstSocket : secondSocket);
    await api.connectAppSocket(onDone: () => done++);
    await firstSocket.incoming.close();
    expect(done, 1);
    await api.connectAppSocket();
    expect(secondSocket.sink.frames, hasLength(1));
  });

  test('close during handshake never sends credentials', () async {
    final connected = Completer<void>();
    final socket = _FakeSocket(ready: connected.future);
    final api = createApi(socketConnector: (_) => socket);
    final assertion = expectLater(
        api.connectAppSocket(), throwsA(isA<CoCoApiException>()));
    await api.close();
    connected.complete();
    await assertion;
    expect(socket.sink.frames, isEmpty);
    await expectLater(api.listDevices(), throwsStateError);
    await api.close();
  });
}

class _FakeSocket implements WebSocketChannel {
  _FakeSocket({Future<void>? ready}) : ready = ready ?? Future<void>.value();

  final incoming = StreamController<dynamic>();
  @override
  final Future<void> ready;
  @override
  final sink = _FakeSink();
  @override
  Stream<dynamic> get stream => incoming.stream;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeSink implements WebSocketSink {
  final frames = <Object?>[];
  final _done = Completer<void>();
  bool closed = false;

  @override
  void add(dynamic data) => frames.add(data);

  @override
  void addError(Object error, [StackTrace? stackTrace]) =>
      throw UnimplementedError('Unexpected sink error in test.');

  @override
  Future<void> addStream(Stream<dynamic> stream) async {
    await for (final frame in stream) {
      add(frame);
    }
  }

  @override
  Future<void> close([int? closeCode, String? closeReason]) async {
    closed = true;
    if (!_done.isCompleted) _done.complete();
  }

  @override
  Future<void> get done => _done.future;
}
