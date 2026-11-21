import 'dart:convert';

import 'package:flutter/material.dart';

import 'api.dart';

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({
    super.key,
    this.api,
    this.isActive = true,
    this.onPendingCountChanged,
  });

  final CoCoApi? api;
  final bool isActive;
  final ValueChanged<int>? onPendingCountChanged;

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  List<_Approval> _pending = [];
  bool _loading = false;
  bool _submitting = false;
  String? _loadError;
  String? _decisionResult;
  bool _decisionFailed = false;
  int _session = 0;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void didUpdateWidget(covariant ApprovalsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.api, oldWidget.api)) {
      _session++;
      _pending = [];
      _loading = false;
      _submitting = false;
      _loadError = null;
      _decisionResult = null;
      _decisionFailed = false;
      _refresh();
    } else if (widget.isActive && !oldWidget.isActive) {
      _refresh();
    }
  }

  bool get _busy => _loading || _submitting;

  bool _isCurrent(int session) => mounted && _session == session;

  Future<void> _refresh() async {
    final api = widget.api;
    if (api == null || _busy) return;
    final session = _session;
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final pending = (await api.listPendingApprovals())
          .map(_Approval.fromJson)
          .toList(growable: false);
      if (!_isCurrent(session)) return;
      setState(() {
        _pending = pending;
        _loading = false;
      });
      widget.onPendingCountChanged?.call(pending.length);
    } catch (error) {
      if (!_isCurrent(session)) return;
      setState(() {
        _loading = false;
        _loadError = 'Unable to load pending approvals. ${_errorText(error)}';
      });
    }
  }

  Future<void> _decide(_Approval approval, {required bool approve}) async {
    final api = widget.api;
    final id = approval.id;
    if (api == null ||
        id == null ||
        _busy ||
        _loadError != null ||
        !_pending.contains(approval) ||
        (approve && !approval.canApprove)) {
      return;
    }

    final session = _session;
    setState(() {
      _submitting = true;
      _decisionResult = null;
    });
    String result;
    var failed = false;
    try {
      result = _responseText(
        await api.resolveApproval(approvalId: id, approve: approve),
      );
    } catch (error) {
      failed = true;
      final response = error is CoCoApiException ? error.response : null;
      result = response == null ? _errorText(error) : _responseText(response);
    }

    if (!_isCurrent(session)) return;
    setState(() {
      _submitting = false;
      _decisionResult =
          '${approve ? 'Approve' : 'Deny'} ${approval.tool}\n$result';
      _decisionFailed = failed;
    });
    // The backend owns the queue, including after a rejection or timeout.
    await _refresh();
  }

  String _errorText(Object error) {
    if (error is! CoCoApiException) return 'The connection is unavailable.';
    final status = error.statusCode;
    return status == null ? error.message : 'HTTP $status. ${error.message}';
  }

  String _responseText(CoCoApiResponse response) {
    final body = response.body;
    final text = !response.hasBody
        ? '(empty body)'
        : body is String
            ? body
            : const JsonEncoder.withIndent('  ').convert(body);
    return 'HTTP ${response.statusCode}\n$text';
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final result = _decisionResult;
    final loadError = _loadError;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Approvals'),
        actions: [
          IconButton(
            tooltip: 'Refresh approvals',
            onPressed: widget.api == null || _busy ? null : _refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_busy) const LinearProgressIndicator(),
            if (result != null)
              Semantics(
                liveRegion: true,
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.all(12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _decisionFailed
                        ? colors.errorContainer
                        : colors.secondaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.25,
                  ),
                  child: SingleChildScrollView(
                    primary: false,
                    child: SelectableText(
                      result,
                      style: TextStyle(
                        color: _decisionFailed
                            ? colors.onErrorContainer
                            : colors.onSecondaryContainer,
                      ),
                    ),
                  ),
                ),
              ),
            if (loadError != null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Semantics(
                  liveRegion: true,
                  child: Text(loadError, style: TextStyle(color: colors.error)),
                ),
              ),
            Expanded(
              child: _pending.isNotEmpty
                  ? ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _pending.length,
                      itemBuilder: (context, index) =>
                          _buildCard(context, _pending[index]),
                    )
                  : Center(
                      child: widget.api == null
                          ? const Text(
                              'Connect to your server to view approvals.')
                          : _busy || loadError != null
                              ? null
                              : const Text('No pending approvals.'),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(BuildContext context, _Approval approval) {
    final enabled = approval.id != null && !_busy && _loadError == null;
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final (label, background, foreground) = switch (approval.risk) {
      'safe' => ('Safe', colors.tertiaryContainer, colors.onTertiaryContainer),
      'approval' => (
          'Approval',
          colors.primaryContainer,
          colors.onPrimaryContainer
        ),
      'blocked' => ('Blocked', colors.errorContainer, colors.onErrorContainer),
      _ => ('Unknown', colors.secondaryContainer, colors.onSecondaryContainer),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(approval.tool, style: theme.textTheme.titleMedium),
                Badge(
                  label: Text(label),
                  backgroundColor: background,
                  textColor: foreground,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Device: ${approval.device}'),
            Text(
              'Arguments: ${approval.argumentsSummary}',
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  onPressed: enabled && approval.canApprove
                      ? () => _decide(approval, approve: true)
                      : null,
                  child: const Text('Approve'),
                ),
                OutlinedButton(
                  onPressed:
                      enabled ? () => _decide(approval, approve: false) : null,
                  child: const Text('Deny'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Approval {
  _Approval.fromJson(Map<String, Object?> json)
      : id = _id(json['id'] ?? json['approval_id']),
        tool = _text(json['tool_name'] ?? json['tool']) ?? 'Unknown tool',
        risk = _text(json['risk'] ?? json['risk_level'])?.toLowerCase(),
        device = _deviceLabel(json),
        argumentsSummary = _argumentsSummary(json);

  final String? id;
  final String tool;
  final String? risk;
  final String device;
  final String argumentsSummary;

  bool get canApprove => risk == 'safe' || risk == 'approval';

  static String? _text(Object? value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;

  static String? _id(Object? value) {
    if (value is! String ||
        _text(value) == null ||
        value == '.' ||
        value == '..') {
      return null;
    }
    return value;
  }

  static String _deviceLabel(Map<String, Object?> json) {
    final device = json['device'];
    return _text(json['device_name']) ??
        _text(device is Map ? device['name'] : device) ??
        _text(json['device_id']) ??
        _text(device is Map ? device['id'] : null) ??
        'No device specified';
  }

  static String _argumentsSummary(Map<String, Object?> json) {
    final summary = _text(json['arguments_summary'] ?? json['args_summary']);
    if (summary != null) return summary;
    final arguments = json['arguments'] ?? json['args'];
    if (arguments == null) return 'None supplied';
    return arguments is String ? arguments : jsonEncode(arguments);
  }
}

