import 'package:flutter/material.dart';

import 'api.dart';

void main() => runApp(const CoCoApp());

class CoCoApp extends StatelessWidget {
  const CoCoApp({super.key, this.useMock = true, this.api});

  final bool useMock;
  final CoCoApi? api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CoCo App',
      home: ChatScreen(useMock: useMock, api: api),
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
          throw StateError('Real chat requires a runtime-configured API client.');
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
