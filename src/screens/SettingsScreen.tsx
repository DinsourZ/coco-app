import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  PHASE1_UNIMPLEMENTED_CAPABILITIES,
  operatorErrorMessage,
} from '@coco/api-client';
import type { LanguageSettings, VoiceRuntimeStatus } from '@coco/protocol';
import { StatusBadge } from '../components/StatusBadge';
import { useCoCo } from '../context/CoCoContext';
import { colors, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';

export function SettingsScreen() {
  const {
    mode,
    setMode,
    backendUrl,
    setBackendUrl,
    allowInsecureLocalHttp,
    setAllowInsecureLocalHttp,
    configError,
    authStore,
    setRoleToken,
    clearAllTokens,
    client,
    health,
    healthError,
    checkingHealth,
    refreshHealth,
    socketStatus,
  } = useCoCo();

  const [urlDraft, setUrlDraft] = useState(backendUrl);
  const [consoleTokenDraft, setConsoleTokenDraft] = useState('');
  const [approverTokenDraft, setApproverTokenDraft] = useState('');
  const [langSettings, setLangSettings] = useState<LanguageSettings | null>(null);
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeStatus | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadRuntimeMetadata = useCallback(async () => {
    if (!client) {
      setLangSettings(null);
      setVoiceRuntime(null);
      return;
    }
    try {
      const [lang, voice] = await Promise.all([
        client.getLanguage(),
        client.getVoiceRuntime(),
      ]);
      setLangSettings(lang);
      setVoiceRuntime(voice);
      setStatusError(null);
    } catch (err) {
      setStatusError(operatorErrorMessage(err, 'Could not load language/voice metadata.'));
    }
  }, [client]);

  useEffect(() => {
    void loadRuntimeMetadata();
  }, [loadRuntimeMetadata]);

  const handleApplyUrl = () => {
    setBackendUrl(urlDraft.trim());
    setStatusNotice('Updated backend URL. Checking /health...');
  };

  const handleApplyTokens = () => {
    if (consoleTokenDraft.trim()) {
      setRoleToken('console', consoleTokenDraft.trim());
      setConsoleTokenDraft('');
    }
    if (approverTokenDraft.trim()) {
      setRoleToken('approver', approverTokenDraft.trim());
      setApproverTokenDraft('');
    }
    setStatusNotice('Updated in-memory role tokens (RAM only; never persisted).');
  };

  const handleChangeLanguage = async (language: string) => {
    if (!client) return;
    try {
      const updated = await client.setLanguage(language);
      setLangSettings(updated);
      setStatusNotice(`Global language set to ${updated.language} (${updated.status ?? 'ok'}).`);
      setStatusError(null);
    } catch (err) {
      setStatusError(operatorErrorMessage(err, 'Could not update backend language.'));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode Selection */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connection Mode</Text>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text style={styles.label}>Mock Mode (Synthetic Data)</Text>
            <Text style={styles.mutedText}>
              Develop & preview UI with zero hardware or private backend.
            </Text>
          </View>
          <Switch
            value={mode === 'mock'}
            onValueChange={(useMock) => setMode(useMock ? 'mock' : 'live')}
          />
        </View>
      </View>

      {/* Backend HTTPS/WSS Configuration */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>CoCo Backend Endpoint (HTTPS / WSS)</Text>
        <Text style={styles.mutedText}>
          No server URLs or secrets are hardcoded. Enter your private CoCo OS HTTPS URL when using
          Live Mode.
        </Text>
        <TextInput
          style={styles.input}
          value={urlDraft}
          onChangeText={setUrlDraft}
          placeholder="https://coco.example.invalid"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.rowBetween}>
          <Text style={styles.mutedText}>Allow localhost HTTP (dev only)</Text>
          <Switch
            value={allowInsecureLocalHttp}
            onValueChange={setAllowInsecureLocalHttp}
          />
        </View>
        {mode === 'live' && configError ? (
          <Text style={styles.errorText}>{configError}</Text>
        ) : null}
        <View style={styles.row}>
          <Pressable style={styles.btnPrimary} onPress={handleApplyUrl}>
            <Text style={styles.btnPrimaryText}>Save URL</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => void refreshHealth()}>
            <Text style={styles.btnText}>Test /health</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          {checkingHealth ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          <StatusBadge
            label={health ? `HEALTH: ${health.status}` : 'HEALTH: UNKNOWN'}
            tone={health ? 'success' : 'warning'}
          />
          <StatusBadge label={`WS: ${socketStatus}`} tone="neutral" />
        </View>
        {healthError ? <Text style={styles.errorText}>{healthError}</Text> : null}
      </View>

      {/* In-Memory Role Tokens */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>In-Memory Role Tokens</Text>
        <Text style={styles.mutedText}>
          Tokens are kept strictly in RAM and cleared when the app closes. AI provider keys never
          enter the mobile client.
        </Text>
        <View style={styles.row}>
          <StatusBadge
            label={`Console: ${authStore.hasToken('console') ? 'SET' : 'UNSET'}`}
            tone={authStore.hasToken('console') ? 'success' : 'warning'}
          />
          <StatusBadge
            label={`Approver: ${authStore.hasToken('approver') ? 'SET' : 'UNSET'}`}
            tone={authStore.hasToken('approver') ? 'success' : 'neutral'}
          />
        </View>
        <TextInput
          style={styles.input}
          value={consoleTokenDraft}
          onChangeText={setConsoleTokenDraft}
          placeholder="Console Bearer Token (in-memory only)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          value={approverTokenDraft}
          onChangeText={setApproverTokenDraft}
          placeholder="Approver Bearer Token (optional, separate role)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Pressable style={styles.btnPrimary} onPress={handleApplyTokens}>
            <Text style={styles.btnPrimaryText}>Apply to RAM</Text>
          </Pressable>
          <Pressable
            style={styles.btnDangerOutline}
            onPress={() => {
              clearAllTokens();
              setStatusNotice('Cleared all in-memory tokens.');
            }}
          >
            <Text style={styles.btnDangerOutlineText}>Clear All</Text>
          </Pressable>
        </View>
      </View>

      {statusNotice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{statusNotice}</Text>
        </View>
      ) : null}
      {statusError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{statusError}</Text>
        </View>
      ) : null}

      {/* Global Language & Read-Only Voice Runtime Status */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Language & Voice Runtime (Read-Only)</Text>
        {langSettings ? (
          <>
            <Text style={styles.mutedText}>
              Current global language: {langSettings.language} (gen {langSettings.generation ?? 0})
            </Text>
            <View style={styles.row}>
              {langSettings.supported_languages.map((lang) => (
                <Pressable
                  key={lang}
                  style={lang === langSettings.language ? styles.btnPrimary : styles.btn}
                  onPress={() => void handleChangeLanguage(lang)}
                >
                  <Text
                    style={lang === langSettings.language ? styles.btnPrimaryText : styles.btnText}
                  >
                    {lang}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.mutedText}>Language settings not loaded yet.</Text>
        )}
        {voiceRuntime ? (
          <Text style={styles.mutedText}>
            Backend TTS: {voiceRuntime.tts_provider_type} · ASR: {voiceRuntime.asr_provider_type} ·
            synth_enabled={String(Boolean(voiceRuntime.synth_enabled))}
          </Text>
        ) : null}
      </View>

      {/* Honest Phase-2 TODO Capabilities */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Roadmap / Unimplemented (TODO)</Text>
        {PHASE1_UNIMPLEMENTED_CAPABILITIES.map((item) => (
          <View key={item.capability} style={styles.todoRow}>
            <StatusBadge label="TODO · NOT IMPLEMENTED" tone="warning" />
            <Text style={styles.label}>{item.capability}</Text>
            <Text style={styles.mutedText}>{item.todo}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  label: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  mutedText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  flexOne: { flex: 1, paddingRight: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
  },
  btn: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  btnPrimary: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  btnDangerOutline: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDangerOutlineText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  errorBox: { backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radii.sm },
  errorText: { color: colors.dangerDark, fontSize: 12, fontWeight: '600' },
  noticeBox: { backgroundColor: colors.accentSoft, padding: spacing.md, borderRadius: radii.sm },
  noticeText: { color: colors.accentDark, fontSize: 12, fontWeight: '600' },
  todoRow: {
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 4,
  },
});
