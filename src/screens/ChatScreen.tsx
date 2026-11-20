import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { operatorErrorMessage } from '@coco/api-client';
import {
  generateChatRequestId,
  type SavedConversation,
  type ToolCallRecord,
} from '@coco/protocol';
import { ToolCallCard } from '../components/ToolCallCard';
import { useCoCo } from '../context/CoCoContext';
import { colors, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallRecord[];
  backend?: string;
}

export function ChatScreen() {
  const { client, mode, authStore, authRevision, selectedDeviceId } = useCoCo();

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Reset conversation state when mode or auth identity changes.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setConversationId(undefined);
    setActiveRequestId(null);
    setSending(false);
    setCancelling(false);
    setError(null);
    setNotice(null);
    setConversations([]);
    setHistoryEnabled(null);
  }, [mode, authRevision]);

  const loadConversations = useCallback(async () => {
    if (!client) return;
    if (mode === 'live' && !authStore.hasToken('console')) {
      setError('Console in-memory token is required to load conversation history.');
      return;
    }
    setHistoryLoading(true);
    try {
      const result = await client.chatConversations();
      setHistoryEnabled(result.enabled);
      setConversations(result.conversations);
      setError(null);
    } catch (err) {
      setError(operatorErrorMessage(err, 'Failed to load conversation history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [client, mode, authStore]);

  const openSavedConversation = async (id: string) => {
    if (!client) return;
    setHistoryLoading(true);
    try {
      const transcript = await client.chatConversation(id);
      setConversationId(transcript.conversation_id);
      setMessages(
        transcript.messages.map((m, idx) => ({
          id: `${id}-${idx}`,
          role: m.role,
          content: m.content,
        })),
      );
      setHistoryOpen(false);
      setNotice('Loaded saved conversation. Historical tool calls are never auto-replayed.');
    } catch (err) {
      setError(operatorErrorMessage(err, 'Could not open saved conversation.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteSavedConversation = async (id: string) => {
    if (!client) return;
    try {
      await client.deleteChatConversation(id);
      setConversations((prev) => prev.filter((item) => item.conversation_id !== id));
      if (conversationId === id) {
        setConversationId(undefined);
        setMessages([]);
      }
    } catch (err) {
      setError(operatorErrorMessage(err, 'Could not delete conversation.'));
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (!client) {
      setError('Configure a valid HTTPS backend URL in Settings or switch to Mock Mode.');
      return;
    }
    if (mode === 'live' && !authStore.hasToken('console')) {
      setError('Enter the Console in-memory token in Settings before sending chat requests.');
      return;
    }

    const requestId = generateChatRequestId();
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveRequestId(requestId);
    setSending(true);
    setError(null);
    setNotice(null);
    setInput('');

    setMessages((prev) => [
      ...prev,
      { id: `u-${requestId}`, role: 'user', content: trimmed },
    ]);

    try {
      const resp = await client.chat(trimmed, selectedDeviceId ?? undefined, conversationId, {
        requestId,
        signal: controller.signal,
      });
      setConversationId(resp.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${requestId}`,
          role: 'assistant',
          content: resp.text,
          toolCalls: resp.tool_calls,
          backend: resp.ai_backend,
        },
      ]);
    } catch (err) {
      if (controller.signal.aborted) {
        setNotice(
          'Request connection aborted locally. Already-executed side effects or pending approvals are NOT automatically rolled back.',
        );
      } else {
        setError(operatorErrorMessage(err, 'Chat request failed.'));
      }
    } finally {
      abortRef.current = null;
      setActiveRequestId(null);
      setSending(false);
      setCancelling(false);
    }
  };

  const handleCancelActive = async () => {
    if (!client || !activeRequestId || cancelling) return;
    setCancelling(true);
    try {
      const confirmation = await client.cancelChatRequest(activeRequestId);
      setNotice(
        confirmation.state === 'CANCEL_REQUESTED'
          ? 'Server registered cancellation for remaining work. Pending approvals still require explicit review; device STOP remains independent.'
          : 'Chat request had already finished on the server.',
      );
    } catch (err) {
      setError(operatorErrorMessage(err, 'Could not confirm cancellation with server.'));
    } finally {
      abortRef.current?.abort();
      setCancelling(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.toolbar}>
        <Pressable
          style={styles.toolbarBtn}
          onPress={() => {
            const next = !historyOpen;
            setHistoryOpen(next);
            if (next) void loadConversations();
          }}
        >
          <Text style={styles.toolbarBtnText}>
            {historyOpen ? 'Close History' : 'History'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.toolbarBtn}
          onPress={() => {
            setConversationId(undefined);
            setMessages([]);
            setNotice(null);
            setError(null);
          }}
        >
          <Text style={styles.toolbarBtnText}>New Chat</Text>
        </Pressable>
        <Pressable
          style={[styles.toolbarBtn, styles.todoBtn]}
          onPress={() =>
            setNotice(
              'TODO (Phase 2): Mobile microphone voice input is not yet implemented. Use text chat or device-side voice.',
            )
          }
        >
          <Text style={styles.todoBtnText}>Voice (TODO)</Text>
        </Pressable>
      </View>

      {historyOpen ? (
        <View style={styles.historyBox}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Saved Conversations</Text>
            {historyLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>
          {historyEnabled === false ? (
            <Text style={styles.mutedText}>
              Backend conversation history is disabled on this server.
            </Text>
          ) : conversations.length === 0 ? (
            <Text style={styles.mutedText}>No saved conversations yet.</Text>
          ) : (
            <ScrollView style={styles.historyList}>
              {conversations.map((item) => (
                <View key={item.conversation_id} style={styles.historyRow}>
                  <Pressable
                    style={styles.historySelect}
                    onPress={() => void openSavedConversation(item.conversation_id)}
                  >
                    <Text style={styles.historyItemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.mutedText}>{item.pairs} turns</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => void deleteSavedConversation(item.conversation_id)}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>CoCo Companion Chat</Text>
            <Text style={styles.emptySubtitle}>
              {mode === 'mock'
                ? 'Running in synthetic Mock Mode. Try typing "beep", "forward", or "stop" to test the UI contract without hardware.'
                : 'Connected to your configured CoCo OS backend (/api/chat). All tool policies and approvals are enforced server-side.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text
              style={[
                styles.bubbleRole,
                item.role === 'user' ? styles.userRoleText : styles.assistantRoleText,
              ]}
            >
              {item.role === 'user' ? 'You' : `CoCo (${item.backend ?? 'assistant'})`}
            </Text>
            <Text
              style={[
                styles.bubbleText,
                item.role === 'user' ? styles.userText : styles.assistantText,
              ]}
            >
              {item.content}
            </Text>
            {item.toolCalls?.map((call, idx) => (
              <ToolCallCard key={`${item.id}-tc-${idx}`} call={call} />
            ))}
          </View>
        )}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={
            selectedDeviceId
              ? `Message CoCo (target: ${selectedDeviceId})...`
              : 'Message CoCo...'
          }
          placeholderTextColor={colors.textMuted}
          editable={!sending}
          multiline
          maxLength={2000}
        />
        {sending ? (
          <Pressable
            style={styles.cancelBtn}
            onPress={() => void handleCancelActive()}
            disabled={cancelling}
          >
            <Text style={styles.cancelBtnText}>{cancelling ? '...' : 'Cancel'}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => void handleSend()}
            disabled={!input.trim()}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  toolbarBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  todoBtn: { backgroundColor: colors.warningSoft },
  todoBtnText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  historyBox: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
    maxHeight: 190,
    gap: spacing.xs,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  historyList: { maxHeight: 140 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  historySelect: { flex: 1, paddingRight: spacing.sm },
  historyItemTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  deleteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSoft,
  },
  deleteBtnText: { fontSize: 11, fontWeight: '700', color: colors.danger },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  errorText: { color: colors.dangerDark, fontSize: 12, fontWeight: '600' },
  noticeBanner: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  noticeText: { color: colors.accentDark, fontSize: 12, fontWeight: '600' },
  messageList: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  emptyState: { marginTop: 40, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  emptySubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  bubble: {
    padding: spacing.md,
    borderRadius: radii.md,
    maxWidth: '92%',
    gap: 4,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bubbleRole: { fontSize: 11, fontWeight: '700' },
  userRoleText: { color: '#e0f2fe' },
  assistantRoleText: { color: colors.textMuted },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#ffffff' },
  assistantText: { color: colors.textPrimary },
  mutedText: { fontSize: 12, color: colors.textMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 110,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  sendBtn: {
    minWidth: 72,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  cancelBtn: {
    minWidth: 76,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.warning,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cancelBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
});
