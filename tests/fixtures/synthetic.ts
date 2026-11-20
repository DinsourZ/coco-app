// 100% synthetic test fixtures. Contains ZERO real device IDs, IPs, or tokens.

import type { DeviceInfo, HealthInfo } from '@coco/protocol';

export const SYNTHETIC_HTTPS_URL = 'https://coco.example.invalid';
export const SYNTHETIC_CONSOLE_TOKEN = 'synthetic-console-token-not-real';
export const SYNTHETIC_APPROVER_TOKEN = 'synthetic-approver-token-not-real';
export const SYNTHETIC_CONTROL_SESSION = '0123456789abcdef0123456789abcdef';

export const SYNTHETIC_HEALTH: HealthInfo = {
  status: 'ok',
  version: '0.1.0-test',
  ai_configured: true,
  ai_model: 'synthetic-model',
  language: 'zh-CN',
  supported_languages: ['zh-CN', 'en-US'],
  scope: 'global',
};

export const SYNTHETIC_DEVICE_ONLINE: DeviceInfo = {
  device_id: 'synth-coco-01',
  online: true,
  firmware: '0.1.0-synth',
  protocol_version: '1',
  capabilities: ['motion', 'face', 'beep'],
  state: 'idle',
  display: {
    selected: 'normal',
    visible: 'normal',
    selected_revision: 2,
    visible_revision: 2,
    visible_valid: true,
    available: true,
    hil_active: false,
    inputs_stale: false,
    coalesced_requests: 0,
    draw_budget_exhaustions: 0,
    draw_failures: 0,
  },
  connection_generation: 7,
  control_session_id: SYNTHETIC_CONTROL_SESSION,
  lease_status: 'active',
  simulation_mode: true,
  hardware_verification: 'SOFTWARE_ONLY',
  motion_fault: null,
  motion_recovery_required: false,
  motion_recovery_reason: null,
};
