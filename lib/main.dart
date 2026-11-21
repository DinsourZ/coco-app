import 'package:flutter/material.dart';


void main() {
  runApp(const MaterialApp(title: 'CoCo App', home: ChatScreen()));
}


class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}


class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();

  final _messages = <String>[];

  void _sendMessage() {
    final message = _controller.text.trim();

    if (message.isEmpty) {
      return;
    }

    setState(() {
      _messages.add('You: $message');

      _messages.add('CoCo (mock): Message received.');
    });

    _controller.clear();
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

                itemCount: _messages.length,

                itemBuilder: (context, index) {
                  final message = _messages[_messages.length - 1 - index];

                  return ListTile(title: Text(message));
                },
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

                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),

                  const SizedBox(width: 12),

                  ElevatedButton(
                    onPressed: _sendMessage,

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
