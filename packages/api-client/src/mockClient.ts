import {
  isValidDeviceId,
  type Approval,
  type CanceledDevicePairingTicket,
  type ChatCancellation,
  type ChatResponse,
  type ControlContext,
  type ConversationList,
  type CreatedDevicePairingTicket,
  type DeviceCredential,
  type DeviceCredentialList,
  type DeviceInfo,
  type DevicePairingTicket,
  type DevicePairingTicketList,
  type HealthInfo,
  type IssuedDeviceCredential,
  type LanguageSettings,
  type MotionAction,
  type MotionCommandResponse,
  type OwnedApproval,
  type OwnedApprovals,
  type RevokedDeviceCredential,
  type SavedTranscript,
  type VoiceRuntimeStatus,
} from '@coco/protocol';
import { ApiError } from './errors';
import type { ChatRequestOptions, CoCoClient } from './interfaces';

/**
 * Fully synthetic, offline Mock client for UI development without a physical
 * robot or private backend. Contains zero real device IDs, endpoints, or keys.
 */
export class MockCoCoClient implements CoCoClient {
  readonly mode = 'mock' as const;

  private language = 'zh-CN';
  private languageGen = 1;
  private ticketCounter = 1;
  private conversationCounter = 1;

  private deviceList: DeviceInfo[];
  private tickets: DevicePairingTicket[];
  private credentials: DeviceCredential[];
  private transcripts: Map<string, { title: string; created_at: number; updated_at: number; messages: Array<{ role: 'user' | 'assistant'; content: string }> }>;
  private approvalList: Approval[];

  constructor() {
    const now = Math.floor(Date.now() / 1000);
    this.deviceList = [
      {
        device_id: 'mock-coco-01',
        online: true,
        firmware: '0.1.0-mock',
        protocol_version: '1',
        capabilities: ['motion', 'face', 'beep', 'voice'],
        state: 'idle',
        display: {
          selected: 'normal',
          visible: 'normal',
          selected_revision: 3,
          visible_revision: 3,
          visible_valid: true,
          available: true,
          hil_active: false,
          inputs_stale: false,
          coalesced_requests: 0,
          draw_budget_exhaustions: 0,
          draw_failures: 0,
        },
        boot_mode: 'NORMAL',
        boot_reason: 'POWER_ON',
        last_seen: now - 2,
        connection_generation: 4,
        control_session_id: '0123456789abcdef0123456789abcdef',
        lease_status: 'active',
        simulation_mode: true,
        hardware_verification: 'SOFTWARE_ONLY',
        dangerous_control_enabled: false,
        dangerous_control_reason: 'MOCK_SIMULATION_MODE',
        motion_fault: null,
        motion_recovery_required: false,
        motion_recovery_reason: null,
        uptime_s: 412,
        voice_state: 'idle',
        voice_wake_enabled: false,
      },
      {
        device_id: 'mock-coco-02',
        online: false,
        firmware: '0.1.0-mock',
        protocol_version: '1',
        capabilities: ['motion', 'face', 'beep'],
        state: 'offline',
        display: null,
        last_seen: now - 3600,
        lease_status: 'expired',
        last_disconnect_reason: 'LEASE_EXPIRED',
        simulation_mode: true,
        hardware_verification: 'UNVERIFIED',
        dangerous_control_enabled: false,
        dangerous_control_reason: 'DEVICE_OFFLINE',
      },
    ];

    this.tickets = [
      {
        ticket_id: 'mock-ticket-001',
        device_id: 'mock-coco-03',
        fingerprint: 'sha256:0000mockticket01',
        created_at: now - 30,
        expires_at: now + 570,
      },
    ];

    this.credentials = [
      {
        device_id: 'mock-coco-01',
        status: 'active',
        version: 2,
        fingerprint: 'sha256:0000mockdevice01',
        created_at: now - 86400,
        updated_at: now - 1800,
        revoked_at: null,
      },
      {
        device_id: 'mock-coco-02',
        status: 'revoked',
        version: 1,
        fingerprint: 'sha256:0000mockdevice02',
        created_at: now - 172800,
        updated_at: now - 7200,
        revoked_at: now - 7200,
      },
    ];

    this.transcripts = new Map([
      [
        'mock-conv-001',
        {
          title: 'Mock startup check',
          created_at: now - 600,
          updated_at: now - 540,
          messages: [
            { role: 'user', content: 'Check device status' },
            {
              role: 'assistant',
              content:
                '[Mock Mode] mock-coco-01 is online (simulation_mode=true). No physical robot is connected.',
            },
          ],
        },
      ],
    ]);

    this.approvalList = [
      {
        approval_id: 'mock-appr-001',
        tool: 'device.motion.forward',
        args_redacted: { device_id: 'mock-coco-01', duration_ms: 400, speed: 0.2 },
        reason: 'Synthetic approval example for UI preview',
        status: 'pending',
        created_at: now - 120,
        result_summary: null,
      },
    ];
  }

  async health(): Promise<HealthInfo> {
    return {
      status: 'ok (mock)',
      version: '0.1.0-mock',
      ai_configured: false,
      ai_model: 'mock-synthetic-adapter',
      language: this.language,
      supported_languages: ['zh-CN', 'en-US'],
      scope: 'global',
      voice: {
        voice_enabled: false,
        language: this.language,
        supported_languages: ['zh-CN', 'en-US'],
        tts_provider_type: 'fake',
        asr_provider_type: 'unconfigured',
        synth_enabled: false,
      },
    };
  }

  async chat(
    text: string,
    deviceId?: string,
    conversationId?: string,
    _options?: ChatRequestOptions,
  ): Promise<ChatResponse> {
    const trimmed = text.trim();
    const now = Math.floor(Date.now() / 1000);
    const convId = conversationId || `mock-conv-${String(++this.conversationCounter).padStart(3, '0')}`;
    const target = deviceId || 'mock-coco-01';
    const device = this.deviceList.find((item) => item.device_id === target);

    if (device && !device.online && /move|forward|beep|face/i.test(trimmed)) {
      throw new ApiError(404, 'Target device is offline', 'CHAT_DEVICE_OFFLINE');
    }

    const lower = trimmed.toLowerCase();
    let reply = `[Mock Mode] Received "${trimmed}" for ${target}. Connect a live CoCo OS HTTPS backend in Settings for real AI & robot responses.`;
    const toolCalls: ChatResponse['tool_calls'] = [];

    if (lower.includes('stop') || trimmed.includes('停')) {
      if (device && device.online) {
        device.state = 'idle';
        device.last_command_action = 'motion.stop';
        device.last_result_status = 'ok';
        device.last_result_at = now;
      }
      reply = `[Mock Mode] Issued synthetic motion.stop to ${target}. Note: mock mode never controls real hardware.`;
      toolCalls.push({
        tool: 'device.motion.stop',
        args_redacted: { device_id: target },
        category: 'safe',
        status: 'sent',
        result_summary: 'Synthetic STOP acknowledged',
      });
    } else if (lower.includes('beep') || trimmed.includes('嘀')) {
      reply = `[Mock Mode] Queued synthetic beep for ${target}.`;
      toolCalls.push({
        tool: 'device.beep',
        args_redacted: { device_id: target },
        category: 'safe',
        status: 'executed',
        result_summary: 'Synthetic beep ok',
      });
    } else if (lower.includes('forward') || trimmed.includes('前进')) {
      reply = `[Mock Mode] Motion requires explicit approval in safety policy. Created synthetic pending approval.`;
      toolCalls.push({
        tool: 'device.motion.forward',
        args_redacted: { device_id: target, duration_ms: 400, speed: 0.2 },
        category: 'approval',
        status: 'pending_approval',
        approval_id: 'mock-appr-001',
        result_summary: 'Awaiting approver decision (synthetic)',
      });
    }

    const existing = this.transcripts.get(convId);
    if (existing) {
      existing.updated_at = now;
      existing.messages.push({ role: 'user', content: trimmed }, { role: 'assistant', content: reply });
    } else {
      this.transcripts.set(convId, {
        title: trimmed.slice(0, 48) || 'Mock conversation',
        created_at: now,
        updated_at: now,
        messages: [
          { role: 'user', content: trimmed },
          { role: 'assistant', content: reply },
        ],
      });
    }

    return {
      conversation_id: convId,
      text: reply,
      tool_calls: toolCalls,
      ai_backend: 'fallback_parser',
      history_status: 'saved',
      task_id: `mock-task-${now}`,
    };
  }

  async cancelChatRequest(requestId: string): Promise<ChatCancellation> {
    return {
      schema_version: 1,
      scope: 'process',
      request_id: requestId,
      task_id: null,
      state: 'CANCEL_REQUESTED',
    };
  }

  async chatConversations(): Promise<ConversationList> {
    return {
      enabled: true,
      conversations: Array.from(this.transcripts.entries()).map(([conversation_id, item]) => ({
        conversation_id,
        title: item.title,
        created_at: item.created_at,
        updated_at: item.updated_at,
        pairs: Math.floor(item.messages.length / 2),
      })),
    };
  }

  async chatConversation(id: string): Promise<SavedTranscript> {
    const item = this.transcripts.get(id);
    if (!item) throw new ApiError(404, 'Conversation not found');
    return {
      conversation_id: id,
      messages: [...item.messages],
    };
  }

  async deleteChatConversation(id: string): Promise<{ deleted: true }> {
    this.transcripts.delete(id);
    return { deleted: true };
  }

  async devices(): Promise<DeviceInfo[]> {
    const now = Math.floor(Date.now() / 1000);
    return this.deviceList.map((d) => ({
      ...d,
      last_seen: d.online ? now - 1 : d.last_seen,
    }));
  }

  async emergencyStop(deviceId: string): Promise<MotionCommandResponse> {
    const target = this.deviceList.find((item) => item.device_id === deviceId);
    if (!target || !target.online) {
      throw new ApiError(404, `device ${deviceId} is offline`);
    }
    const now = Math.floor(Date.now() / 1000);
    target.state = 'idle';
    target.motion_fault = null;
    target.motion_recovery_required = false;
    target.motion_recovery_reason = null;
    target.last_command_action = 'motion.stop';
    target.last_result_status = 'ok';
    target.last_result_at = now;
    return {
      sent: {
        type: 'device.command',
        id: `mock-stop-${now}`,
        action: 'motion.stop',
        args: {},
      },
    };
  }

  async motion(
    deviceId: string,
    action: MotionAction,
    context?: ControlContext,
  ): Promise<MotionCommandResponse> {
    if (action === 'stop') {
      return this.emergencyStop(deviceId);
    }
    const target = this.deviceList.find((item) => item.device_id === deviceId);
    if (!target || !target.online) {
      throw new ApiError(404, `device ${deviceId} is offline`);
    }
    if (
      context &&
      (context.control_session_id !== target.control_session_id ||
        context.connection_generation !== target.connection_generation)
    ) {
      throw new ApiError(409, 'Control context stale', 'CONTROL_CONTEXT_STALE');
    }
    const now = Math.floor(Date.now() / 1000);
    target.last_command_action = `motion.${action}`;
    target.last_result_status = 'ok';
    target.last_result_at = now;
    return {
      sent: {
        type: 'device.command',
        id: `mock-motion-${now}`,
        action: `motion.${action}`,
        args: { duration_ms: 400, speed: 0.2 },
      },
    };
  }

  async face(
    deviceId: string,
    expression: 'normal' | 'happy' | 'sleep' | 'error',
  ): Promise<Record<string, unknown>> {
    const target = this.deviceList.find((item) => item.device_id === deviceId);
    if (!target || !target.online) {
      throw new ApiError(404, `device ${deviceId} is offline`);
    }
    if (target.display) {
      const nextRev = target.display.selected_revision + 1;
      target.display = {
        ...target.display,
        selected: expression,
        visible: expression,
        selected_revision: nextRev,
        visible_revision: nextRev,
      };
    }
    return { sent: { action: `face.${expression}` } };
  }

  async beep(deviceId: string): Promise<Record<string, unknown>> {
    const target = this.deviceList.find((item) => item.device_id === deviceId);
    if (!target || !target.online) {
      throw new ApiError(404, `device ${deviceId} is offline`);
    }
    return { sent: { action: 'beep' } };
  }

  async pairingTickets(): Promise<DevicePairingTicketList> {
    return { tickets: [...this.tickets] };
  }

  async createPairingTicket(deviceId: string): Promise<CreatedDevicePairingTicket> {
    if (!isValidDeviceId(deviceId)) {
      throw new ApiError(400, 'Invalid device ID');
    }
    const now = Math.floor(Date.now() / 1000);
    const id = ++this.ticketCounter;
    const replaced = this.tickets.some((t) => t.device_id === deviceId);
    this.tickets = this.tickets.filter((t) => t.device_id !== deviceId);
    const ticket: DevicePairingTicket = {
      ticket_id: `mock-ticket-${String(id).padStart(3, '0')}`,
      device_id: deviceId,
      fingerprint: `sha256:mockpair${String(id).padStart(8, '0')}`,
      created_at: now,
      expires_at: now + 600,
    };
    this.tickets.unshift(ticket);
    return {
      pairing_code: `MOCK-PAIR-CODE-${String(id).padStart(4, '0')}`,
      ticket,
      replaced,
    };
  }

  async cancelPairingTicket(ticketId: string): Promise<CanceledDevicePairingTicket> {
    const ticket = this.tickets.find((t) => t.ticket_id === ticketId);
    if (!ticket) throw new ApiError(404, 'Pairing ticket not found');
    this.tickets = this.tickets.filter((t) => t.ticket_id !== ticketId);
    return { canceled: true, ticket };
  }

  async deviceCredentials(): Promise<DeviceCredentialList> {
    return {
      mode: 'per-device',
      credentials: this.credentials.map((c) => ({ ...c })),
    };
  }

  async rotateDeviceCredential(deviceId: string): Promise<IssuedDeviceCredential> {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.credentials.find((c) => c.device_id === deviceId);
    const nextVersion = existing ? existing.version + 1 : 1;
    const updated: DeviceCredential = {
      device_id: deviceId,
      status: 'active',
      version: nextVersion,
      fingerprint: `sha256:mockrotv${String(nextVersion).padStart(8, '0')}`,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      revoked_at: null,
    };
    this.credentials = [updated, ...this.credentials.filter((c) => c.device_id !== deviceId)];
    return {
      token: `mock-rotated-device-token-v${nextVersion}-synthetic`,
      credential: updated,
      disconnected: true,
    };
  }

  async revokeDeviceCredential(deviceId: string): Promise<RevokedDeviceCredential> {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.credentials.find((c) => c.device_id === deviceId);
    if (!existing) throw new ApiError(404, 'Credential not found');
    const changed = existing.status !== 'revoked';
    const updated: DeviceCredential = {
      ...existing,
      status: 'revoked',
      updated_at: now,
      revoked_at: existing.revoked_at ?? now,
    };
    this.credentials = this.credentials.map((c) => (c.device_id === deviceId ? updated : c));
    return {
      credential: updated,
      changed,
      disconnected: changed,
    };
  }

  async ownedApprovals(): Promise<OwnedApprovals> {
    const now = Math.floor(Date.now() / 1000);
    return {
      schema_version: 1,
      scope: 'requester_owned',
      storage: 'PROCESS_LOCAL',
      generated_at: now,
      limit: 50,
      has_more: false,
      approvals: this.approvalList.map((a) => ({
        approval_id: a.approval_id,
        tool: a.tool,
        status: a.status,
        created_at: a.created_at,
        expires_at: a.created_at + 300,
        decided_at: a.status === 'pending' ? null : now,
        reason_summary: a.reason,
        arguments_summary: JSON.stringify(a.args_redacted),
        summary_truncated: false,
        payload_digest: '0'.repeat(64),
        task_id: null,
        withdrawable: a.status === 'pending',
      })),
    };
  }

  async withdrawApproval(id: string): Promise<OwnedApproval> {
    const item = this.approvalList.find((a) => a.approval_id === id);
    if (!item) throw new ApiError(404, 'Approval not found');
    const now = Math.floor(Date.now() / 1000);
    item.status = 'withdrawn';
    return {
      approval_id: item.approval_id,
      tool: item.tool,
      status: 'withdrawn',
      created_at: item.created_at,
      expires_at: item.created_at + 300,
      decided_at: now,
      reason_summary: item.reason,
      arguments_summary: JSON.stringify(item.args_redacted),
      summary_truncated: false,
      payload_digest: '0'.repeat(64),
      task_id: null,
      withdrawable: false,
    };
  }

  async approvals(): Promise<Approval[]> {
    return this.approvalList.map((a) => ({ ...a }));
  }

  async approve(id: string): Promise<Approval> {
    const item = this.approvalList.find((a) => a.approval_id === id);
    if (!item) throw new ApiError(404, 'Approval not found');
    item.status = 'approved';
    item.result_summary = 'Approved in synthetic mock mode';
    return { ...item };
  }

  async reject(id: string): Promise<Approval> {
    const item = this.approvalList.find((a) => a.approval_id === id);
    if (!item) throw new ApiError(404, 'Approval not found');
    item.status = 'rejected';
    item.result_summary = 'Rejected in synthetic mock mode';
    return { ...item };
  }

  async getLanguage(): Promise<LanguageSettings> {
    return {
      language: this.language,
      supported_languages: ['zh-CN', 'en-US'],
      default_language: 'zh-CN',
      scope: 'global',
      generation: this.languageGen,
      persisted: false,
    };
  }

  async setLanguage(language: string): Promise<LanguageSettings> {
    if (!['zh-CN', 'en-US'].includes(language)) {
      throw new ApiError(400, 'Unsupported language', 'unsupported_language');
    }
    const previous = this.language;
    const status = previous === language ? 'unchanged' : 'applied';
    if (status === 'applied') {
      this.language = language;
      this.languageGen += 1;
    }
    return {
      language: this.language,
      previous_language: previous,
      supported_languages: ['zh-CN', 'en-US'],
      default_language: 'zh-CN',
      scope: 'global',
      generation: this.languageGen,
      persisted: false,
      status,
    };
  }

  async getVoiceRuntime(): Promise<VoiceRuntimeStatus> {
    return {
      language: this.language,
      generation: this.languageGen,
      scope: 'global',
      queue_depth: 0,
      speaking: false,
      tts_provider_type: 'fake',
      asr_provider_type: 'unconfigured',
      tts: { provider: 'fake', locale: this.language },
      asr: { provider: 'unconfigured', locale: this.language },
      pack_version: 1,
      catalog_message_count: 0,
      audio_files_present: 0,
      audio_files_declared: 0,
      persisted: false,
      synth_enabled: false,
      tts_is_fake: true,
    };
  }
}
