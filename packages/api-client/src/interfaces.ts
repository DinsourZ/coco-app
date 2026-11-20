import type {
  Approval,
  CanceledDevicePairingTicket,
  ChatCancellation,
  ChatResponse,
  ControlContext,
  ConversationList,
  CreatedDevicePairingTicket,
  DeviceCredentialList,
  DeviceInfo,
  DevicePairingTicketList,
  HealthInfo,
  IssuedDeviceCredential,
  LanguageSettings,
  MotionAction,
  MotionCommandResponse,
  OwnedApproval,
  OwnedApprovals,
  RevokedDeviceCredential,
  SavedTranscript,
  VoiceRuntimeStatus,
} from '@coco/protocol';

export interface ChatRequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

export interface CoCoClient {
  readonly mode: 'live' | 'mock';

  // Connection & health
  health(signal?: AbortSignal): Promise<HealthInfo>;

  // Chat & optional server-side conversation history
  chat(
    text: string,
    deviceId?: string,
    conversationId?: string,
    options?: ChatRequestOptions,
  ): Promise<ChatResponse>;
  cancelChatRequest(requestId: string, signal?: AbortSignal): Promise<ChatCancellation>;
  chatConversations(signal?: AbortSignal): Promise<ConversationList>;
  chatConversation(id: string, signal?: AbortSignal): Promise<SavedTranscript>;
  deleteChatConversation(id: string, signal?: AbortSignal): Promise<{ deleted: true }>;

  // Device status & bounded control
  devices(signal?: AbortSignal): Promise<DeviceInfo[]>;
  /**
   * Independent emergency STOP endpoint (`POST /api/devices/{id}/motion/stop`).
   * Deliberately omits `X-CoCo-Control-*` precondition headers so stale UI
   * snapshots never block an emergency stop. Never fabricates success locally.
   */
  emergencyStop(deviceId: string, signal?: AbortSignal): Promise<MotionCommandResponse>;
  motion(
    deviceId: string,
    action: MotionAction,
    context?: ControlContext,
    signal?: AbortSignal,
  ): Promise<MotionCommandResponse>;
  face(
    deviceId: string,
    expression: 'normal' | 'happy' | 'sleep' | 'error',
    context?: ControlContext,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  beep(
    deviceId: string,
    context?: ControlContext,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;

  // Device pairing tickets (console role)
  pairingTickets(signal?: AbortSignal): Promise<DevicePairingTicketList>;
  createPairingTicket(deviceId: string, signal?: AbortSignal): Promise<CreatedDevicePairingTicket>;
  cancelPairingTicket(ticketId: string, signal?: AbortSignal): Promise<CanceledDevicePairingTicket>;

  // Device credential lifecycle (console role)
  deviceCredentials(signal?: AbortSignal): Promise<DeviceCredentialList>;
  rotateDeviceCredential(deviceId: string, signal?: AbortSignal): Promise<IssuedDeviceCredential>;
  revokeDeviceCredential(deviceId: string, signal?: AbortSignal): Promise<RevokedDeviceCredential>;

  // Approvals (requester withdrawal uses console token; approve/reject use approver token)
  ownedApprovals(signal?: AbortSignal): Promise<OwnedApprovals>;
  withdrawApproval(id: string, signal?: AbortSignal): Promise<OwnedApproval>;
  approvals(signal?: AbortSignal): Promise<Approval[]>;
  approve(id: string, signal?: AbortSignal): Promise<Approval>;
  reject(id: string, signal?: AbortSignal): Promise<Approval>;

  // Language & read-only voice runtime status
  getLanguage(signal?: AbortSignal): Promise<LanguageSettings>;
  setLanguage(language: string, signal?: AbortSignal): Promise<LanguageSettings>;
  getVoiceRuntime(signal?: AbortSignal): Promise<VoiceRuntimeStatus>;
}

/**
 * Phase-2 unimplemented mobile capability placeholders.
 * Explicitly marked as `not_implemented` so UI and downstream agents never
 * misrepresent voice capture, audio playback, or push notifications as ready.
 */
export interface UnimplementedCapabilityDescriptor {
  readonly capability: 'mobile_voice_input' | 'mobile_audio_playback' | 'push_notifications';
  readonly status: 'not_implemented';
  readonly todo: string;
}

export const PHASE1_UNIMPLEMENTED_CAPABILITIES: readonly UnimplementedCapabilityDescriptor[] = [
  {
    capability: 'mobile_voice_input',
    status: 'not_implemented',
    todo: 'TODO(phase-2): Bind native microphone capture and streaming ASR transport once mobile audio permissions and backend mobile voice ingress are approved.',
  },
  {
    capability: 'mobile_audio_playback',
    status: 'not_implemented',
    todo: 'TODO(phase-2): Implement native TTS/pack audio playback via expo-av / expo-audio with interruption handling.',
  },
  {
    capability: 'push_notifications',
    status: 'not_implemented',
    todo: 'TODO(phase-2): Add opt-in APNs/FCM push token registration for approval alerts once CoCo backend notification gateway is specified.',
  },
];
