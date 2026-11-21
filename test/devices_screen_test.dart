import 'dart:async';
import 'dart:convert';

import 'package:coco_app/api.dart';
import 'package:coco_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  testWidgets('Emergency STOP is available offline and shows actual response',
      (tester) async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET') {
        return http.Response(
          '[{"id":"device-1","name":"Desk bot","online":false}]',
          200,
        );
      }
      return http.Response('{"result":"stop queued"}', 202);
    });
    final api = CoCoApi(
      baseUrl: Uri.https('server.invalid', ''),
      token: 'test-only-memory-token',
      client: client,
    );
    addTearDown(() async {
      await api.close();
      client.close();
    });

    await tester.pumpWidget(CoCoApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.devices_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Offline'), findsOneWidget);
    expect(requests, hasLength(1));
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();

    expect(requests, hasLength(2));
    expect(requests.last.url.path, '/api/devices/device-1/motion/stop');
    expect(requests.last.headers.keys.any(
      (name) => name.toLowerCase().startsWith('x-coco-control-'),
    ), isFalse);
    expect(
      find.textContaining('HTTP 202: {"result":"stop queued"}'),
      findsOneWidget,
    );
    expect(find.textContaining('stopped successfully'), findsNothing);
  });

  testWidgets('quick actions require online state and advertised preconditions',
      (tester) async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET') {
        return http.Response(
          jsonEncode([
            {
              'id': 'ready-device',
              'name': 'Ready device',
              'online': true,
              'quick_actions': [
                {
                  'label': 'Tap',
                  'action': 'tap',
                  'preconditions': {'X-CoCo-Control-Version': '8'},
                  'body': {'x': 5, 'y': 9},
                },
              ],
            },
            {
              'id': 'offline-device',
              'name': 'Offline device',
              'online': false,
              'quick_actions': [
                {
                  'label': 'Tap unavailable',
                  'action': 'tap',
                  'preconditions': {'X-CoCo-Control-Version': '8'},
                },
              ],
            },
            {
              'id': 'missing-guard',
              'name': 'Missing guard',
              'online': true,
              'quick_actions': [
                {'label': 'Unguarded', 'action': 'move'},
              ],
            },
          ]),
          200,
        );
      }
      return http.Response('{"accepted":true}', 200);
    });
    final api = CoCoApi(
      baseUrl: Uri.https('server.invalid', ''),
      token: 'test-only-memory-token',
      client: client,
    );
    addTearDown(() async {
      await api.close();
      client.close();
    });

    await tester.pumpWidget(CoCoApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.devices_outlined));
    await tester.pumpAndSettle();

    final tapButton = _quickButton(tester, 'Tap');
    final offlineButton = _quickButton(tester, 'Tap unavailable');
    final unguardedButton = _quickButton(tester, 'Unguarded');
    expect(tapButton.onPressed, isNotNull);
    expect(offlineButton.onPressed, isNull);
    expect(unguardedButton.onPressed, isNull);

    await tester.tap(find.text('Tap'));
    await tester.pumpAndSettle();
    expect(requests, hasLength(2));
    expect(requests.last.url.path, '/api/devices/ready-device/actions/tap');
    expect(requests.last.headers['X-CoCo-Control-Version'], '8');
    expect(jsonDecode(requests.last.body), {'x': 5, 'y': 9});
    expect(_quickButton(tester, 'Tap').onPressed, isNull);
  });

  testWidgets('Emergency STOP displays server HTTP error without success text',
      (tester) async {
    final client = MockClient((request) async => request.method == 'GET'
        ? http.Response('[{"id":"device-1","online":true}]', 200)
        : http.Response('{"error":"controller unavailable"}', 503));
    final api = CoCoApi(
      baseUrl: Uri.https('server.invalid', ''),
      token: 'test-only-memory-token',
      client: client,
    );
    addTearDown(() async {
      await api.close();
      client.close();
    });

    await tester.pumpWidget(CoCoApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.devices_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();

    expect(find.textContaining('HTTP 503'), findsOneWidget);
    expect(find.textContaining('controller unavailable'), findsOneWidget);
    expect(find.textContaining('stop queued'), findsNothing);
    expect(find.textContaining('stopped successfully'), findsNothing);
  });

  testWidgets('STOP does not wait for an in-flight quick action',
      (tester) async {
    final actionResponse = Completer<http.Response>();
    final requests = <http.Request>[];
    final api = _apiFor((request) async {
      requests.add(request);
      if (request.method == 'GET') return _guardedDeviceResponse();
      if (request.url.path.endsWith('/motion/stop')) {
        return http.Response('{"result":"stop queued"}', 202);
      }
      return actionResponse.future;
    });
    await _openDevices(tester, api);

    await tester.tap(find.text('Tap'));
    await tester.pump();
    expect(_quickButton(tester, 'Tap').onPressed, isNull);
    expect(_stopButton(tester).onPressed, isNotNull);
    await tester.tap(find.text('STOP'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(requests, hasLength(3));
    final stop = requests.last;
    expect(stop.method, 'POST');
    expect(stop.url.path, '/api/devices/device-1/motion/stop');
    expect(stop.body, isEmpty);
    expect(stop.headers.keys.any((name) =>
        name.toLowerCase().startsWith('x-coco-control-') ||
        name.toLowerCase().startsWith('if-')), isFalse);
    expect(find.textContaining('HTTP 202: {"result":"stop queued"}'),
        findsOneWidget);

    actionResponse.complete(http.Response('{"accepted":true}', 200));
    await tester.pumpAndSettle();
    expect(_quickButton(tester, 'Tap').onPressed, isNull);
    expect(_stopButton(tester).onPressed, isNotNull);
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();
    expect(requests, hasLength(4));
  });

  testWidgets('STOP remains available during and after a failed refresh',
      (tester) async {
    final refresh = Completer<http.Response>();
    var loads = 0;
    final api = _apiFor((request) async {
      if (request.method == 'GET') {
        return ++loads == 1 ? _guardedDeviceResponse() : refresh.future;
      }
      return http.Response('', 204);
    });
    await _openDevices(tester, api);
    await tester.tap(find.byTooltip('Refresh devices'));
    await tester.pump();

    expect(_quickButton(tester, 'Tap').onPressed, isNull);
    expect(_stopButton(tester).onPressed, isNotNull);
    await tester.tap(find.text('STOP'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('HTTP 204: (empty response)'), findsOneWidget);

    refresh.complete(http.Response('', 503));
    await tester.pumpAndSettle();
    expect(find.textContaining('HTTP 503'), findsOneWidget);
    expect(_quickButton(tester, 'Tap').onPressed, isNull);
    expect(_stopButton(tester).onPressed, isNotNull);
  });

  testWidgets('rejected quick actions need fresh server preconditions',
      (tester) async {
    final actions = <http.Request>[];
    var version = '8';
    final api = _apiFor((request) async {
      if (request.method == 'GET') {
        return _guardedDeviceResponse(version: version);
      }
      actions.add(request);
      return http.Response('{"error":"stale preconditions"}', 412);
    });
    await _openDevices(tester, api);
    await tester.tap(find.text('Tap'));
    await tester.pumpAndSettle();

    expect(actions, hasLength(1));
    expect(find.textContaining('HTTP 412'), findsOneWidget);
    expect(_quickButton(tester, 'Tap').onPressed, isNull);
    version = '9';
    await tester.tap(find.byTooltip('Refresh devices'));
    await tester.pumpAndSettle();
    expect(_quickButton(tester, 'Tap').onPressed, isNotNull);
    await tester.tap(find.text('Tap'));
    await tester.pumpAndSettle();

    expect(actions, hasLength(2));
    expect(actions.map((request) => request.headers['X-CoCo-Control-Version']),
        ['8', '9']);
  });

  testWidgets('STOP clears results while pending and shows transport errors',
      (tester) async {
    final pendingStop = Completer<http.Response>();
    var stopRequests = 0;
    final api = _apiFor((request) async {
      if (request.method == 'GET') return _guardedDeviceResponse();
      return ++stopRequests == 1
          ? http.Response('controller acknowledged request', 202)
          : pendingStop.future;
    });
    await _openDevices(tester, api);
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();
    expect(find.textContaining('HTTP 202'), findsOneWidget);
    expect(_quickButton(tester, 'Tap').onPressed, isNull);

    await tester.tap(find.text('STOP'));
    await tester.pump();
    expect(find.textContaining('HTTP 202'), findsNothing);
    expect(_stopButton(tester).onPressed, isNull);
    await tester.tap(find.text('STOP'));
    await tester.pump();
    expect(stopRequests, 2);

    pendingStop.completeError(http.ClientException('Connection dropped'));
    await tester.pumpAndSettle();
    expect(find.textContaining('CoCo connection failed.'), findsOneWidget);
    expect(find.textContaining('HTTP 202'), findsNothing);
    expect(_stopButton(tester).onPressed, isNotNull);
  });

  for (final response in [
    http.Response('', 204),
    http.Response('queued by controller', 202),
    http.Response('{"ok":false,"error":"not stopped"}', 200),
  ]) {
    testWidgets('STOP displays the actual HTTP ${response.statusCode} result',
        (tester) async {
      final api = _apiFor((request) async => request.method == 'GET'
          ? _guardedDeviceResponse()
          : response);
      await _openDevices(tester, api);
      await tester.tap(find.text('STOP'));
      await tester.pumpAndSettle();

      final body = response.body.isEmpty ? '(empty response)' : response.body;
      expect(find.textContaining('HTTP ${response.statusCode}: $body'),
          findsOneWidget);
      expect(find.textContaining('stopped successfully'), findsNothing);
    });
  }

  testWidgets('a long response keeps STOP visible on a small screen',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var stops = 0;
    final api = _apiFor((request) async {
      if (request.method == 'GET') return _guardedDeviceResponse();
      stops++;
      return http.Response(
        List.filled(100, 'Controller error details').join('\n'),
        503,
      );
    });
    await _openDevices(tester, api);
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('HTTP 503'), findsOneWidget);
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();
    expect(stops, 2);
  });

  testWidgets('switching tabs preserves chat and does not reload device state',
      (tester) async {
    var loads = 0;
    final api = _apiFor((request) async {
      loads++;
      return _guardedDeviceResponse();
    });
    await tester.pumpWidget(CoCoApp(api: api));
    await tester.enterText(find.byType(TextField), 'Hello');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(loads, 0);
    await tester.tap(find.byKey(const ValueKey('devices-tab')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chat-tab')));
    await tester.pumpAndSettle();
    expect(find.text('You: Hello'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('devices-tab')));
    await tester.pumpAndSettle();
    expect(loads, 1);
    expect(find.text('Online'), findsOneWidget);
  });

  testWidgets('changing the runtime API ignores the previous device response',
      (tester) async {
    final oldDevices = Completer<http.Response>();
    final oldApi = _apiFor((_) => oldDevices.future);
    final requests = <http.Request>[];
    final newApi = _apiFor((request) async {
      requests.add(request);
      return request.method == 'GET'
          ? http.Response('[{"id":"new-device","online":false}]', 200)
          : http.Response('stop submitted', 202);
    });
    await tester.pumpWidget(CoCoApp(api: oldApi));
    await tester.tap(find.byKey(const ValueKey('devices-tab')));
    await tester.pump();
    await tester.pumpWidget(CoCoApp(api: newApi));
    await tester.pumpAndSettle();
    oldDevices.complete(_guardedDeviceResponse());
    await tester.pumpAndSettle();

    expect(find.text('device-1'), findsNothing);
    expect(find.text('Offline'), findsOneWidget);
    await tester.tap(find.text('STOP'));
    await tester.pumpAndSettle();
    expect(requests.last.url.path, '/api/devices/new-device/motion/stop');
  });

  testWidgets('a missing API never supplies mock devices or a STOP result',
      (tester) async {
    await tester.pumpWidget(const CoCoApp());
    await tester.tap(find.byKey(const ValueKey('devices-tab')));
    await tester.pumpAndSettle();
    expect(find.text('Connect to your server to load devices.'),
        findsOneWidget);
    expect(_stopButton(tester).onPressed, isNull);
    expect(find.textContaining('HTTP '), findsNothing);
    expect(find.text('Online'), findsNothing);
  });

  testWidgets('list errors can be retried and an empty list has no STOP target',
      (tester) async {
    var loads = 0;
    final api = _apiFor((_) async => ++loads == 1
        ? http.Response('', 503)
        : http.Response('[]', 200));
    await _openDevices(tester, api);
    expect(find.textContaining('HTTP 503'), findsOneWidget);
    expect(_stopButton(tester).onPressed, isNull);
    await tester.tap(find.byTooltip('Refresh devices'));
    await tester.pumpAndSettle();
    expect(loads, 2);
    expect(find.textContaining('HTTP 503'), findsNothing);
    expect(find.text('No devices reported by the server.'), findsOneWidget);
    expect(_stopButton(tester).onPressed, isNull);
  });
}

CoCoApi _apiFor(Future<http.Response> Function(http.Request) respond) {
  final client = MockClient(respond);
  final api = CoCoApi(
    baseUrl: Uri.https('server.invalid', ''),
    token: 'test-only-memory-token',
    client: client,
  );
  addTearDown(() async {
    await api.close();
    client.close();
  });
  return api;
}

http.Response _guardedDeviceResponse({String version = '8'}) => http.Response(
      jsonEncode([
        {
          'id': 'device-1',
          'online': true,
          'quick_actions': [
            {
              'action': 'tap',
              'label': 'Tap',
              'preconditions': {'X-CoCo-Control-Version': version},
            },
          ],
        },
      ]),
      200,
    );

Future<void> _openDevices(WidgetTester tester, CoCoApi api) async {
  await tester.pumpWidget(CoCoApp(api: api));
  await tester.tap(find.byKey(const ValueKey('devices-tab')));
  await tester.pumpAndSettle();
}

OutlinedButton _quickButton(WidgetTester tester, String label) =>
    tester.widget<OutlinedButton>(find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate((widget) => widget is OutlinedButton),
    ));

FilledButton _stopButton(WidgetTester tester) =>
    tester.widget<FilledButton>(find.ancestor(
      of: find.text('STOP'),
      matching: find.byWidgetPredicate((widget) => widget is FilledButton),
    ));
