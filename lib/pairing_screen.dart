import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'api.dart';

/// Displays a server-issued code for the device's pairing flow, without claiming.
class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key, this.api, this.now = DateTime.now});

  final CoCoApi? api;
  final DateTime Function() now;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen>
    with WidgetsBindingObserver {
  PairingTicket? _ticket;
  Timer? _countdown;
  int _secondsRemaining = 0;
  int _requestRevision = 0;
  bool _loading = false;
  bool _expired = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didUpdateWidget(covariant PairingScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (identical(oldWidget.api, widget.api)) return;
    _countdown?.cancel();
    _requestRevision++;
    _ticket = null;
    _secondsRemaining = 0;
    _loading = false;
    _expired = false;
    _error = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _updateCountdown();
  }

  Future<void> _requestTicket() async {
    final api = widget.api;
    if (api == null || _loading) return;
    final revision = ++_requestRevision;
    _countdown?.cancel();
    setState(() {
      _loading = true;
      _ticket = null;
      _secondsRemaining = 0;
      _expired = false;
      _error = null;
    });
    try {
      final ticket = await api.requestPairingTicket();
      if (!mounted || revision != _requestRevision) return;
      setState(() {
        _ticket = ticket;
        _loading = false;
      });
      _updateCountdown();
    } catch (error) {
      if (!mounted || revision != _requestRevision) return;
      setState(() {
        _loading = false;
        // Never display raw transport errors or server response bodies.
        _error = error is CoCoApiException && error.statusCode != null
            ? 'Unable to request a pairing ticket (HTTP ${error.statusCode}).'
            : 'Unable to request a pairing ticket. Try again.';
      });
    }
  }

  void _updateCountdown() {
    _countdown?.cancel();
    final ticket = _ticket;
    if (!mounted || ticket == null) return;
    final remaining = ticket.expiresAt.difference(widget.now());
    if (remaining <= Duration.zero) {
      setState(() {
        _ticket = null;
        _secondsRemaining = 0;
        _expired = true;
      });
      return;
    }
    setState(() {
      // Round up so a still-valid ticket never reads 00:00.
      _secondsRemaining =
          (remaining.inMicroseconds + Duration.microsecondsPerSecond - 1) ~/
              Duration.microsecondsPerSecond;
    });
    const tick = Duration(seconds: 1);
    _countdown = Timer(remaining < tick ? remaining : tick, _updateCountdown);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _countdown?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ticket = _ticket;
    final minutes = (_secondsRemaining ~/ 60).toString().padLeft(2, '0');
    final seconds = (_secondsRemaining % 60).toString().padLeft(2, '0');
    return Scaffold(
      appBar: AppBar(title: const Text('Pairing')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Scan the QR code or enter the pairing code on your device. '
              'Complete pairing on that device.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            if (widget.api == null)
              const Text('Connect to your server to request a pairing ticket.'),
            if (_loading)
              const Center(child: CircularProgressIndicator()),
            if (_error != null) Text(_error!),
            if (_expired)
              const Text(
                'Pairing ticket expired. Request a new ticket to try again.',
                textAlign: TextAlign.center,
              ),
            if (ticket != null) ...[
              Center(
                child: QrImageView(
                  // Only the validated plain-text code, never the ticket,
                  // a claim URL, bearer token, or any other response field.
                  data: ticket.code,
                  version: QrVersions.auto,
                  size: 240,
                  backgroundColor: Colors.white,
                  semanticsLabel: 'Pairing code QR code',
                ),
              ),
              const SizedBox(height: 16),
              SelectableText(
                ticket.code,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Expires in $minutes:$seconds',
                key: const ValueKey('pairing-countdown'),
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: widget.api == null || _loading ? null : _requestTicket,
              child: Text(_loading
                  ? 'Requesting ticket…'
                  : ticket != null || _expired
                      ? 'Request new ticket'
                      : 'Request pairing ticket'),
            ),
          ],
        ),
      ),
    );
  }
}

