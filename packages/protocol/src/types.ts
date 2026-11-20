// Client-facing TypeScript contracts extracted from CoCo OS
// (branch integration/coco-full-recovery-20261114 @ 8b981d7befd6c733f4b7b5942cabd4a64d8f92c8).

import type { DisplayObservation } from './displayObservation';
import type { ApprovalStatus } from './ownedApprovals';

export type AccessRole = 'console' | 'approver' | 'audit';

export const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

export interface ToolCallRecord {
  tool: string;
  args_redacted: Record<string, unknown>;
  category: 'safe' | 'approval' | 'blocked';
  status: 'executed' | 'sent' | 'pending_approval' | 'blocked' | 'failed';
  result_summary?: string | null;
  approval_id?: string | null;
}

export interface AiUsageTotals {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  overflow: boolean;
}

export interface AiTurnUsage extends AiUsageTotals {
  source: 'provider_reported';
  scope: 'turn_responses';
  coverage: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  provider_calls: number;
  reported_calls: number;
  profiles: Array<
    AiUsageTotals & {
      profile_id: string | null;
      provider_calls: number;
      reported_calls: number;
    }
  >;
}

export interface ChatResponse {
  conversation_id: string;
  text: string;
  tool_calls: ToolCallRecord[];
  ai_backend: 'openai_compatible' | 'fallback_parser';
  ai_profile_id?: string | null;
  ai_usage?: AiTurnUsage | null;
  history_status?: 'disabled' | 'saved' | 'not_saved' | 'bypassed';
  task_id?: string | null;
}

export interface SavedConversation {
  conversation_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  pairs: number;
}

export interface ConversationList {
  enabled: boolean;
  conversations: SavedConversation[];
}

export interface SavedTranscript {
  conversation_id: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface DeviceInfo {
  device_id: string;
  online: boolean;
  firmware?: string | null;
  protocol_version?: string | null;
  capabilities: string[];
  state: string;
  display?: DisplayObservation | null;
  boot_mode?: string | null;
  boot_reason?: string | null;
  boot_history_status?: string | null;
  boot_recovery_reason?: string | null;
  boot_count?: number | null;
  unexpected_resets?: number | null;
  unexpected_resets_total?: number | null;
  last_seen?: number | null;
  connection_session?: string | null;
  connection_generation?: number | null;
  control_session_id?: string | null;
  last_heartbeat?: number | null;
  lease_expires_at?: number | null;
  lease_status?: string | null;
  last_disconnect_reason?: string | null;
  last_safety_stop_reason?: string | null;
  pending_motion_count?: number;
  pending_audio_count?: number;
  pending_total_count?: number;
  hardware_verification?: string | null;
  simulation_mode?: boolean | null;
  build_profile?: string | null;
  firmware_commit?: string | null;
  build_dirty?: boolean | null;
  idf_version?: string | null;
  protocol_compatibility?: string | null;
  protocol_compatibility_reason?: string | null;
  dangerous_control_enabled?: boolean;
  dangerous_control_reason?: string | null;
  motion_fault?: 'DEVICE_ERROR' | 'STOP_UNCONFIRMED' | null;
  motion_fault_reason?: string | null;
  motion_fault_since?: number | null;
  motion_recovery_required?: boolean | null;
  motion_recovery_reason?: 'BOOT_CONFIRMATION_REQUIRED' | null;
  control_owner_mode?: string | null;
  control_owner_status?: string | null;
  control_owner_reason?: string | null;
  last_command_id?: string | null;
  last_command_action?: string | null;
  last_command_kind?: string | null;
  last_command_at?: number | null;
  last_result_status?: string | null;
  last_ack_status?: string | null;
  last_result_command_id?: string | null;
  last_result_detail?: string | null;
  last_result_error_category?: string | null;
  last_result_at?: number | null;
  uptime_s?: number | null;
  free_heap?: number | null;
  min_free_heap?: number | null;
  voice_state?: string | null;
  voice_pause_reason?: string | null;
  voice_autostart?: boolean | null;
  voice_muted?: boolean | null;
  voice_mic_owned?: boolean | null;
  voice_utterances_started?: number | null;
  voice_utterances_completed?: number | null;
  voice_utterances_aborted?: number | null;
  voice_interruptions?: number | null;
  voice_last_error?: string | null;
  voice_aec?: string | null;
  voice_vad_tuning?: string | null;
  voice_wake_enabled?: boolean | null;
  voice_wake_state?: string | null;
  voice_wake_model?: string | null;
  voice_wake_phrase?: string | null;
  voice_wake_detections?: number | null;
  voice_wake_error?: string | null;
}

export interface DevicePairingTicket {
  ticket_id: string;
  device_id: string;
  fingerprint: string;
  created_at: number;
  expires_at: number;
}

export interface DevicePairingTicketList {
  tickets: DevicePairingTicket[];
}

export interface CreatedDevicePairingTicket {
  pairing_code: string;
  ticket: DevicePairingTicket;
  replaced: boolean;
}

export interface CanceledDevicePairingTicket {
  canceled: boolean;
  ticket: DevicePairingTicket;
}

export interface DeviceCredential {
  device_id: string;
  status: 'active' | 'revoked';
  version: number;
  fingerprint: string;
  created_at: number;
  updated_at: number;
  revoked_at: number | null;
}

export interface DeviceCredentialList {
  mode: 'per-device';
  credentials: DeviceCredential[];
}

export interface IssuedDeviceCredential {
  token: string;
  credential: DeviceCredential;
  disconnected: boolean;
}

export interface RevokedDeviceCredential {
  credential: DeviceCredential;
  changed: boolean;
  disconnected: boolean;
}

export interface Approval {
  approval_id: string;
  tool: string;
  args_redacted: Record<string, unknown>;
  reason: string;
  status: ApprovalStatus;
  created_at: number;
  result_summary?: string | null;
}

export interface VoiceHealthSummary {
  voice_enabled?: boolean;
  language?: string;
  supported_languages?: string[];
  language_store_healthy?: boolean;
  tts_provider_type?: string;
  asr_provider_type?: string;
  tts_is_fake?: boolean;
  synth_enabled?: boolean;
  scope?: string;
  generation?: number;
  control_plane_mode?: string;
  queue_depth?: number;
  pack_version?: number;
  catalog_message_count?: number;
  audio_files_present?: number;
  audio_files_declared?: number;
}

export interface HealthInfo {
  status: string;
  version: string;
  ai_configured: boolean;
  ai_model: string;
  language?: string;
  supported_languages?: string[];
  scope?: string;
  voice?: VoiceHealthSummary;
}

export type LanguageChangeStatus =
  | 'applied'
  | 'unchanged'
  | 'rejected'
  | 'degraded'
  | 'failed';

export interface LanguageSettings {
  language: string;
  supported_languages: string[];
  default_language?: string;
  scope?: string;
  generation?: number;
  persisted?: boolean;
  status?: LanguageChangeStatus;
  previous_language?: string;
  message?: string;
  error_code?: string;
  tts?: Record<string, string | number>;
  asr?: Record<string, string | number>;
  request_id?: string;
}

export interface VoiceRuntimeStatus {
  language: string;
  generation: number;
  scope: string;
  queue_depth: number;
  speaking: boolean;
  current_message_id?: string | null;
  last_status?: string | null;
  tts_provider_type: string;
  asr_provider_type: string;
  tts: Record<string, string | number>;
  asr: Record<string, string | number>;
  pack_version: number;
  catalog_message_count: number;
  audio_files_present: number;
  audio_files_declared: number;
  persisted: boolean;
  synth_enabled?: boolean;
  tts_is_fake?: boolean;
}

export type MotionAction = 'stop' | 'forward' | 'backward' | 'left' | 'right';

export interface MotionCommandResponse {
  sent: Record<string, unknown>;
}

export type AppSocketStatus =
  | 'no_token'
  | 'mock'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type AppSocketOutboundFrame =
  | { type: 'app.auth'; token: string }
  | { type: 'ping' }
  | { type: 'settings.language.get'; request_id?: string }
  | { type: 'settings.language.set'; language: string; request_id?: string };

export interface AppSocketInboundEvent {
  type: string;
  device_id?: string;
  [key: string]: unknown;
}
