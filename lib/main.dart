import 'package:flutter/material.dart';

import 'api.dart';
import 'approvals_screen.dart';
import 'devices_screen.dart';
import 'pairing_screen.dart';

void main() => runApp(const CoCoApp());

class CoCoApp extends StatelessWidget {
  const CoCoApp({super.key, this.useMock = true, this.api});

  final bool useMock;
  final CoCoApi? api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CoCo App',
      home: MainNavigationScreen(useMock: useMock, api: api),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key, this.useMock = true, this.api});

  final bool useMock;
  final CoCoApi? api;

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  static const _approvalsTabIndex = 3;
  int _selectedIndex = 0;
  int _pendingApprovalCount = 0;
  final Set<int> _visitedTabs = {0};

  CoCoApi? _approvalsApi(MainNavigationScreen screen) =>
      !screen.useMock || _visitedTabs.contains(_approvalsTabIndex)
          ? screen.api
          : null;

  @override
  void didUpdateWidget(covariant MainNavigationScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(_approvalsApi(oldWidget), _approvalsApi(widget))) {
      _pendingApprovalCount = 0;
    }
  }

  void _updatePendingApprovalCount(int count) {
    if (_pendingApprovalCount != count) {
      setState(() => _pendingApprovalCount = count);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: [
          ChatScreen(useMock: widget.useMock, api: widget.api),
          if (_visitedTabs.contains(1))
            DevicesScreen(api: widget.api)
          else
            const SizedBox.shrink(),
          if (_visitedTabs.contains(2))
            PairingScreen(api: widget.api)
          else
            const SizedBox.shrink(),
          ApprovalsScreen(
            api: _approvalsApi(widget),
            isActive: _selectedIndex == _approvalsTabIndex,
            onPendingCountChanged: _updatePendingApprovalCount,
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) {
          FocusScope.of(context).unfocus();
          setState(() {
            _visitedTabs.add(index);
            _selectedIndex = index;
          });
        },
        destinations: [
          const NavigationDestination(
            key: ValueKey('chat-tab'),
            icon: Icon(Icons.chat_bubble_outline),
            label: 'Chat',
          ),
          const NavigationDestination(
            key: ValueKey('devices-tab'),
            icon: Icon(Icons.devices_outlined),
            label: 'Devices',
          ),
          const NavigationDestination(
            key: ValueKey('pairing-tab'),
            icon: Icon(Icons.qr_code),
            label: 'Pairing',
          ),
          NavigationDestination(
            key: const ValueKey('approvals-tab'),
            icon: Badge(
              isLabelVisible: _pendingApprovalCount > 0,
              label: Text(
                '$_pendingApprovalCount',
                semanticsLabel: '$_pendingApprovalCount pending '
                    '${_pendingApprovalCount == 1 ? 'approval' : 'approvals'}',
              ),
              child: const Icon(Icons.fact_check_outlined),
            ),
            label: 'Approvals',
          ),
        ],
      ),
    );
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, this.useMock = true, this.api});

  final bool useMock;
  final CoCoApi? api;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _messages = <String>[];
  bool _sending = false;
  int _requestNumber = 0;

  Future<void> _send() async {
    final message = _controller.text.trim();
    if (message.isEmpty || _sending) return;

    setState(() {
      _messages.add('You: $message');
      _sending = true;
    });
    _controller.clear();
    try {
      final String reply;
      if (widget.useMock) {
        reply = 'This is a mock reply.';
      } else {
        final api = widget.api;
        if (api == null) {
          throw StateError(
              'Real chat requires a runtime-configured API client.');
        }
        final response = await api.postChat({
          'message': message,
          'request_id': '${DateTime.now().microsecondsSinceEpoch}'
              '-${_requestNumber++}',
        });
        final text = response['message'] ?? response['reply'];
        reply = text is String ? text : 'Request submitted.';
      }
      if (mounted) setState(() => _messages.add('CoCo: $reply'));
    } catch (_) {
      if (mounted) {
        setState(() => _messages.add('CoCo: Unable to send the message.'));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CoCo Chat')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView.builder(
                reverse: true,
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length,
                itemBuilder: (context, index) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_messages[_messages.length - 1 - index]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: const InputDecoration(labelText: 'Message'),
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _sending ? null : _send,
                    child: const Text('Send'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

