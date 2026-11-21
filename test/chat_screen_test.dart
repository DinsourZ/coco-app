import 'dart:convert';

import 'package:coco_app/api.dart';
import 'package:coco_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  testWidgets('mock mode is the default and makes no HTTP requests',
      (tester) async {
    var requests = 0;
    final client = MockClient((_) async {
      requests++;
      return http.Response('{}', 200);
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
    await tester.enterText(find.byType(TextField), 'Hello');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(find.text('You: Hello'), findsOneWidget);
    expect(find.text('CoCo: This is a mock reply.'), findsOneWidget);
    expect(requests, 0);
  });

  testWidgets('real mode uses the injected API and a unique request id',
      (tester) async {
    final bodies = <Map<String, dynamic>>[];
    final client = MockClient((request) async {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response('{"message":"Real reply"}', 200);
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
    await tester.pumpWidget(CoCoApp(useMock: false, api: api));
    for (final message in ['First', 'Second']) {
      await tester.enterText(find.byType(TextField), message);
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();
    }

    expect(bodies.map((body) => body['message']), ['First', 'Second']);
    expect(bodies.map((body) => body['request_id']).toSet(), hasLength(2));
    expect(find.text('CoCo: Real reply'), findsNWidgets(2));
    expect(find.text('CoCo: This is a mock reply.'), findsNothing);
  });
}

