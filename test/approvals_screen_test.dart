import 'dart:convert';

import 'package:coco_app/api.dart';
import 'package:coco_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  testWidgets('approval decisions show server results and refresh the count',
      (tester) async {
    final pending = <Map<String, Object?>>[
      {
        'id': 'status/1',
        'tool_name': 'Read status',
        'risk': 'safe',
        'arguments_summary': 'Include battery level',
        'device_name': 'Desk phone',
      },
      {
        'id': 'update-2',
        'tool': 'Update settings',
        'risk_level': 'approval',
        'args': {'volume': 3},
        'device_id': 'phone-2',
        'status': 'pending',
      },
      {'id': 'blocked-3', 'tool': 'Blocked tool', 'risk': 'blocked'},
      {'id': 'closed-4', 'tool': 'Resolved tool', 'status': 'denied'},
    ];
    final decisions = <http.Request>[];
    var allowDeny = false;
    final client = MockClient((request) async {
      if (request.method == 'GET' &&
          request.url.path == '/gateway/api/approvals') {
        return http.Response(jsonEncode({'approvals': pending}), 200);
      }
      decisions.add(request);
      switch (request.url.pathSegments.last) {
        case 'approve':
          pending.removeWhere((item) => item['id'] == 'status/1');
          return http.Response('{"state":"queued by server"}', 202);
        case 'deny':
          if (!allowDeny) return http.Response('Decision is locked', 409);
          pending.removeWhere((item) => item['id'] == 'update-2');
          return http.Response('', 204);
        default:
          return http.Response('Unknown route', 404);
      }
    });
    const token = 'test-only-memory-token';
    final api = CoCoApi(
      baseUrl: Uri.https('server.invalid', '/gateway'),
      token: token,
      client: client,
    );
    addTearDown(() async {
      await api.close();
      client.close();
    });

    final tab = find.byKey(const ValueKey('approvals-tab'));
    Finder count(String value) =>
        find.descendant(of: tab, matching: find.text(value));
    Finder card(String tool) =>
        find.ancestor(of: find.text(tool), matching: find.byType(Card));
    Finder action(String tool, String label) =>
        find.descendant(of: card(tool), matching: find.text(label));

    await tester.pumpWidget(CoCoApp(useMock: false, api: api));
    await tester.pumpAndSettle();
    expect(count('3'), findsOneWidget);

    await tester.tap(tab);
    await tester.pumpAndSettle();
    expect(find.text('Safe'), findsOneWidget);
    expect(find.text('Approval'), findsOneWidget);
    expect(find.text('Blocked'), findsOneWidget);
    expect(find.text('Device: Desk phone'), findsOneWidget);
    expect(find.text('Arguments: Include battery level'), findsOneWidget);
    expect(find.text('Arguments: {"volume":3}'), findsOneWidget);
    expect(find.text('Resolved tool'), findsNothing);
    final blockedApprove = find.descendant(
      of: card('Blocked tool'),
      matching: find.widgetWithText(FilledButton, 'Approve'),
    );
    expect(tester.widget<FilledButton>(blockedApprove).onPressed, isNull);

    await tester.tap(action('Read status', 'Approve'));
    await tester.pumpAndSettle();
    final approval = decisions.single;
    expect(approval.method, 'POST');
    expect(approval.url.pathSegments, [
      'gateway',
      'api',
      'approvals',
      'status/1',
      'approve',
    ]);
    expect(approval.headers['Authorization'], 'Bearer $token');
    expect(find.textContaining('HTTP 202'), findsOneWidget);
    expect(find.textContaining('queued by server'), findsOneWidget);
    expect(find.text('Read status'), findsNothing);
    expect(count('2'), findsOneWidget);

    await tester.tap(action('Update settings', 'Deny'));
    await tester.pumpAndSettle();
    expect(decisions, hasLength(2));
    expect(decisions.last.method, 'POST');
    expect(decisions.last.url.path, '/gateway/api/approvals/update-2/deny');
    expect(find.textContaining('HTTP 409'), findsOneWidget);
    expect(find.textContaining('Decision is locked'), findsOneWidget);
    expect(find.text('Update settings'), findsOneWidget);
    expect(count('2'), findsOneWidget);

    allowDeny = true;
    await tester.tap(action('Update settings', 'Deny'));
    await tester.pumpAndSettle();
    expect(decisions, hasLength(3));
    expect(find.textContaining('HTTP 204'), findsOneWidget);
    expect(find.textContaining('(empty body)'), findsOneWidget);
    expect(find.text('Update settings'), findsNothing);
    expect(count('1'), findsOneWidget);
  });
}

