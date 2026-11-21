import 'dart:convert';

import 'package:flutter/material.dart';

import 'api.dart';

/// Lists server-reported devices and exposes only server-advertised quick
/// actions that carry complete control preconditions.
class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key, this.api});

  final CoCoApi? api;

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  List<Map<String, Object?>> _devices = [];
  bool _loading = false;
  bool _stopping = false;
  String? _loadError;
  String? _selectedDeviceId;
  String? _stopMessage;
  bool _stopMessageIsError = false;
  final Set<String> _busyDevices = {};
  final Set<String> _invalidatedDevices = {};
  final Map<String, String> _actionMessages = {};
  final Set<String> _actionErrors = {};
  int _commandRevision = 0;

  @override
  void initState() {
    super.initState();
    if (widget.api != null) _loadDevices();
  }

  @override
  void didUpdateWidget(covariant DevicesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (identical(oldWidget.api, widget.api)) return;
    // Device IDs and control snapshots belong to the configured server/session.
    _devices = [];
    _loading = false;
    _stopping = false;
    _loadError = null;
    _selectedDeviceId = null;
    _stopMessage = null;
    _stopMessageIsError = false;
    _busyDevices.clear();
    _invalidatedDevices.clear();
    _actionMessages.clear();
    _actionErrors.clear();
    _commandRevision++;
    if (widget.api != null) _loadDevices();
  }

  bool _isCurrentApi(CoCoApi api) => mounted && identical(widget.api, api);

  String? _deviceId(Map<String, Object?> device) {
    final value = device['id'] ?? device['device_id'];
    if (value is! String ||
        value.trim().isEmpty ||
        value == '.' ||
        value == '..') {
      return null;
    }
    return value;
  }

  String _deviceName(Map<String, Object?> device) {
    final value = device['name'];
    if (value is String && value.trim().isNotEmpty) return value;
    return _deviceId(device) ?? 'Unnamed device';
  }

  bool? _isOnline(Map<String, Object?> device) {
    final direct = device['online'] ?? device['is_online'];
    if (direct is bool) return direct;
    final state = device['state'];
    if (state is Map && state['online'] is bool) {
      return state['online'] as bool;
    }
    for (final status in [
      direct,
      device['status'],
      device['connection_status'],
      if (state is Map) state['status'],
      if (state is String) state,
    ]) {
      if (status is String) {
        switch (status.toLowerCase()) {
          case 'online':
            return true;
          case 'offline':
            return false;
        }
      }
    }
    return null;
  }

  String _statusLabel(bool? online) => switch (online) {
        true => 'Online',
        false => 'Offline',
        null => 'Status unknown',
      };

  Map<String, String>? _preconditions(Object? value) {
    if (value is! Map || value.isEmpty) return null;
    final result = <String, String>{};
    for (final entry in value.entries) {
      final name = entry.key;
      final headerValue = entry.value;
      if (name is! String ||
          !RegExp(r'^X-CoCo-Control-[A-Za-z0-9-]+$', caseSensitive: false)
              .hasMatch(name) ||
          name.contains(RegExp(r'[\r\n]')) ||
          headerValue is! String ||
          headerValue.trim().isEmpty ||
          headerValue.contains(RegExp(r'[\r\n]'))) {
        return null;
      }
      result[name] = headerValue;
    }
    return result;
  }

  Map<String, String>? _actionPreconditions(
    Map<String, Object?> action,
    Map<String, Object?> device,
  ) {
    final value = action['preconditions'] ??
        action['control_preconditions'] ??
        action['precondition_headers'] ??
        action['headers'] ??
        device['preconditions'] ??
        device['control_preconditions'] ??
        device['control_headers'];
    return _preconditions(value);
  }

  List<Map<String, Object?>> _quickActions(Map<String, Object?> device) {
    final value = device['quick_actions'] ?? device['actions'];
    if (value is! List) return const [];
    return value.map((item) {
      if (item is String) {
        return <String, Object?>{
          'action': item,
          'preconditions': device['preconditions'] ??
              device['control_preconditions'] ??
              device['control_headers'],
        };
      }
      if (item is Map) return Map<String, Object?>.from(item);
      return <String, Object?>{};
    }).toList(growable: false);
  }

  Future<void> _loadDevices() async {
    final api = widget.api;
    if (api == null || _loading) return;
    final revision = _commandRevision;
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final devices = await api.listDevices();
      if (!_isCurrentApi(api)) return;
      final ids = devices.map(_deviceId).whereType<String>().toSet();
      setState(() {
        _devices = devices;
        // A refresh overlapping a command cannot establish a fresh snapshot.
        if (revision == _commandRevision &&
            _busyDevices.isEmpty &&
            !_stopping) {
          _invalidatedDevices.clear();
        }
        if (_selectedDeviceId == null || !ids.contains(_selectedDeviceId)) {
          _selectedDeviceId = ids.isEmpty ? null : ids.first;
        }
      });
    } catch (error) {
      if (_isCurrentApi(api)) setState(() => _loadError = error.toString());
    } finally {
      if (_isCurrentApi(api)) setState(() => _loading = false);
    }
  }

  bool _hasCurrentState(String deviceId) =>
      !_loading &&
      _loadError == null &&
      !_invalidatedDevices.contains(deviceId) &&
      !_busyDevices.contains(deviceId);

  Future<void> _runQuickAction(
    Map<String, Object?> device,
    Map<String, Object?> quickAction,
  ) async {
    final api = widget.api;
    final deviceId = _deviceId(device);
    final action = quickAction['action'] ?? quickAction['name'];
    final preconditions = _actionPreconditions(quickAction, device);
    final bodyValue = quickAction['body'];
    if (bodyValue != null && bodyValue is! Map) return;
    final body = bodyValue is Map
        ? Map<String, Object?>.from(bodyValue)
        : const <String, Object?>{};
    if (api == null ||
        deviceId == null ||
        action is! String ||
        action.trim().isEmpty ||
        action == '.' ||
        action == '..' ||
        _isOnline(device) != true ||
        !_devices.contains(device) ||
        !_hasCurrentState(deviceId) ||
        preconditions == null) {
      return;
    }

    setState(() {
      _busyDevices.add(deviceId);
      _invalidatedDevices.add(deviceId);
      _actionMessages.remove(deviceId);
      _actionErrors.remove(deviceId);
      _commandRevision++;
    });
    try {
      final result = await api.safeAction(
        deviceId: deviceId,
        action: action,
        preconditions: preconditions,
        body: body,
      );
      if (!_isCurrentApi(api)) return;
      setState(() {
        _actionMessages[deviceId] = 'Action result: ${_formatJson(result)}';
      });
    } catch (error) {
      if (!_isCurrentApi(api)) return;
      setState(() {
        _actionMessages[deviceId] = error.toString();
        _actionErrors.add(deviceId);
      });
    } finally {
      if (_isCurrentApi(api)) {
        setState(() {
          _busyDevices.remove(deviceId);
          _commandRevision++;
        });
      }
    }
  }

  Future<void> _emergencyStop() async {
    final api = widget.api;
    final deviceId = _selectedDeviceId;
    if (api == null || deviceId == null || _stopping) return;
    final target = _findDevice(deviceId);
    final targetLabel = target == null
        ? deviceId
        : '${_deviceName(target)} ($deviceId)';
    setState(() {
      _stopping = true;
      _stopMessage = null;
      _stopMessageIsError = false;
      _invalidatedDevices.add(deviceId);
      _commandRevision++;
    });
    try {
      final response = await api.emergencyStop(deviceId);
      if (!_isCurrentApi(api)) return;
      setState(() {
        _stopMessage = '$targetLabel · ${_formatResponse(response)}';
      });
    } catch (error) {
      if (!_isCurrentApi(api)) return;
      final response = error is CoCoApiException ? error.response : null;
      final message = response == null
          ? error.toString()
          : _formatResponse(response);
      setState(() {
        _stopMessage = '$targetLabel · $message';
        _stopMessageIsError = true;
      });
    } finally {
      if (_isCurrentApi(api)) {
        setState(() {
          _stopping = false;
          _commandRevision++;
        });
      }
    }
  }

  String _formatResponse(CoCoApiResponse response) =>
      'HTTP ${response.statusCode}: '
      '${response.hasBody ? _formatJson(response.body) : '(empty response)'}';

  String _formatJson(Object? value) {
    if (value is String) return value;
    try {
      return jsonEncode(value);
    } catch (_) {
      return value.toString();
    }
  }

  List<String> get _deviceIds =>
      _devices.map(_deviceId).whereType<String>().toSet().toList();

  Map<String, Object?>? _findDevice(String id) {
    for (final device in _devices) {
      if (_deviceId(device) == id) return device;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final ids = _deviceIds;
    final selectedId =
        ids.contains(_selectedDeviceId) ? _selectedDeviceId : null;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Devices'),
        actions: [
          IconButton(
            tooltip: 'Refresh devices',
            onPressed: _loading || widget.api == null ? null : _loadDevices,
            icon: _loading
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _deviceList()),
          _emergencyStopBar(ids, selectedId),
        ],
      ),
    );
  }

  Widget _deviceList() {
    if (widget.api == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Connect to your server to load devices.'),
        ),
      );
    }
    if (_loading && _devices.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _loadDevices,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_loadError != null) ...[
            _MessageCard(message: _loadError!, isError: true),
            const SizedBox(height: 12),
          ],
          if (_devices.isEmpty && _loadError == null)
            const _MessageCard(message: 'No devices reported by the server.'),
          for (final device in _devices) ...[
            _deviceCard(device),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }

  Widget _deviceCard(Map<String, Object?> device) {
    final id = _deviceId(device);
    final online = _isOnline(device);
    final actions = _quickActions(device);
    final canSelect = id != null;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            selected: id != null && id == _selectedDeviceId,
            onTap: canSelect && !_stopping
                ? () => setState(() {
                      _selectedDeviceId = id;
                      _stopMessage = null;
                    })
                : null,
            leading: Icon(
              online == true
                  ? Icons.devices
                  : online == false
                      ? Icons.devices_other
                      : Icons.device_unknown,
              color: online == true
                  ? Colors.green.shade700
                  : online == false
                      ? Colors.grey
                      : null,
            ),
            title: Text(_deviceName(device)),
            subtitle: Wrap(
              spacing: 8,
              children: [
                Text(_statusLabel(online)),
                if (id != null) Text(id),
              ],
            ),
            trailing: id != null && id == _selectedDeviceId
                ? const Icon(Icons.check_circle, color: Colors.blue)
                : null,
          ),
          if (actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final quickAction in actions)
                    _quickActionButton(device, quickAction, online),
                ],
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text('No quick actions available.'),
            ),
          if (id != null && _actionMessages.containsKey(id))
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                _actionMessages[id]!,
                style: TextStyle(
                  color: _actionErrors.contains(id) ? Colors.red.shade900 : null,
                ),
              ),
            ),
          if (id != null &&
              _invalidatedDevices.contains(id) &&
              !_busyDevices.contains(id))
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text('Refresh devices before another quick action.'),
            ),
        ],
      ),
    );
  }

  Widget _quickActionButton(
    Map<String, Object?> device,
    Map<String, Object?> quickAction,
    bool? online,
  ) {
    final id = _deviceId(device);
    final action = quickAction['action'] ?? quickAction['name'];
    final validAction = action is String &&
        action.trim().isNotEmpty &&
        action != '.' &&
        action != '..';
    final preconditions = _actionPreconditions(quickAction, device);
    final bodyValue = quickAction['body'];
    final validBody = bodyValue == null || bodyValue is Map;
    final labelValue = quickAction['label'];
    final label = labelValue is String && labelValue.trim().isNotEmpty
        ? labelValue
        : validAction
            ? action as String
            : 'Unavailable action';
    final busy = id != null && _busyDevices.contains(id);
    final enabled = widget.api != null &&
        id != null &&
        validAction &&
        online == true &&
        preconditions != null &&
        validBody &&
        _hasCurrentState(id);
    final reason = online != true
        ? 'Quick actions require an online device.'
        : preconditions == null
            ? 'Quick action disabled: current control preconditions '
                'are unavailable.'
            : !validBody
                ? 'Quick action disabled: its request body is invalid.'
                : busy
                    ? 'A quick action is pending for this device.'
                    : id != null && !_hasCurrentState(id)
                        ? 'Refresh devices before another quick action.'
                        : null;

    return Tooltip(
      message: enabled ? label : reason ?? label,
      child: OutlinedButton.icon(
        onPressed: enabled ? () => _runQuickAction(device, quickAction) : null,
        icon: busy
            ? const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.bolt),
        label: Text(label),
      ),
    );
  }

  Widget _emergencyStopBar(List<String> ids, String? selectedId) {
    final selectedDevice = selectedId == null ? null : _findDevice(selectedId);
    final label = selectedDevice == null
        ? 'Select a device'
        : _deviceName(selectedDevice);
    final canStop = widget.api != null && selectedId != null && !_stopping;
    return Material(
      color: Colors.red.shade50,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Icon(Icons.warning_amber, color: Colors.red.shade800),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Emergency STOP',
                      style: TextStyle(
                        color: Colors.red.shade900,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: selectedId,
                      hint: Text(label),
                      items: [
                        for (final id in ids)
                          DropdownMenuItem<String>(
                            value: id,
                            child: Text(
                              _deviceName(_findDevice(id)!),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: _stopping
                          ? null
                          : (value) => setState(() {
                                _selectedDeviceId = value;
                                _stopMessage = null;
                              }),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.red.shade800,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: canStop ? _emergencyStop : null,
                    icon: _stopping
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.stop_circle_outlined),
                    label: const Text('STOP'),
                  ),
                ],
              ),
              if (_stopMessage != null) ...[
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 120),
                  child: SingleChildScrollView(
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _stopMessage!,
                        style: TextStyle(
                          color: _stopMessageIsError
                              ? Colors.red.shade900
                              : Colors.black87,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message, this.isError = false});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          message,
          style: TextStyle(color: isError ? Colors.red.shade900 : null),
        ),
      ),
    );
  }
}
