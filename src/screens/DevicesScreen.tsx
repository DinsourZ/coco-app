import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { operatorErrorMessage } from '@coco/api-client';
import {
  readControlContext,
  type DeviceCredential,
  type DeviceInfo,
  type IssuedDeviceCredential,
} from '@coco/protocol';
import { StatusBadge } from '../components/StatusBadge';
import { useCoCo } from '../context/CoCoContext';
import { colors, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';

export function DevicesScreen() {
  const {
    client,
    mode,
    authStore,
    authRevision,
    devices,
    devicesLoading,
    devicesError,
    refreshDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    triggerEmergencyStop,
  } = useCoCo();

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Device Credential Lifecycle state (metadata + memory-only one-time rotated token)
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [issuedCred, setIssuedCred] = useState<IssuedDeviceCredential | null>(null);
  const [confirmCredAction, setConfirmCredAction] = useState<{
    action: 'rotate' | 'revoke';
    deviceId: string;
  } | null>(null);
  const [credCopied, setCredCopied] = useState(false);

  const loadCredentials = useCallback(async () => {
    if (!client) return;
    if (mode === 'live' && !authStore.hasToken('console')) {
      setCredentials([]);
      return;
    }
    setCredsLoading(true);
    try {
      const resp = await client.deviceCredentials();
      setCredentials(resp.credentials);
      setCredsError(null);
    } catch (err) {
      setCredsError(operatorErrorMessage(err, 'Could not load device credential metadata.'));
    } finally {
      setCredsLoading(false);
    }
  }, [client, mode, authStore]);

  // Security invariant: clear any one-time rotated token whenever auth changes or view unmounts.
  useEffect(() => {
    setIssuedCred(null);
    setConfirmCredAction(null);
    setCredCopied(false);
    void loadCredentials();
    return () => {
      setIssuedCred(null);
    };
  }, [loadCredentials, authRevision, mode]);

  const sendSafeDeviceAction = async (
    device: DeviceInfo,
    label: string,
    fn: () => Promise<unknown>,
  ) => {
    setActionBusy(`${device.device_id}:${label}`);
    setActionError(null);
    setActionNotice(null);
    try {
      await fn();
      setActionNotice(`${label} acknowledged by backend for ${device.device_id}.`);
      void refreshDevices();
    } catch (err) {
      setActionError(operatorErrorMessage(err, `${label} failed.`));
    } finally {
      setActionBusy(null);
    }
  };

  const executeCredentialAction = async () => {
    if (!client || !confirmCredAction) return;
    const { action, deviceId } = confirmCredAction;
    setActionBusy(`cred:${deviceId}`);
    setCredsError(null);
    setCredCopied(false);
    try {
      if (action === 'rotate') {
        const result = await client.rotateDeviceCredential(deviceId);
        setIssuedCred(result);
        setActionNotice(
          `Rotated credential for ${deviceId} (v${result.credential.version}). Copy the one-time token now; it is never stored on disk.`,
        );
      } else {
        const result = await client.revokeDeviceCredential(deviceId);
        setActionNotice(
          `Revoked credential for ${deviceId} (disconnected=${String(result.disconnected)}).`,
        );
      }
      setConfirmCredAction(null);
      void loadCredentials();
    } catch (err) {
      setCredsError(operatorErrorMessage(err, `Failed to ${action} device credential.`));
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Devices ({devices.length})</Text>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => {
            void refreshDevices();
            void loadCredentials();
          }}
        >
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {devicesLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {devicesError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{devicesError}</Text>
        </View>
      ) : null}
      {actionError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{actionError}</Text>
        </View>
      ) : null}
      {actionNotice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{actionNotice}</Text>
        </View>
      ) : null}

      {devices.length === 0 && !devicesLoading ? (
        <View style={styles.card}>
          <Text style={styles.mutedText}>No devices reported by backend.</Text>
        </View>
      ) : null}

      {devices.map((device) => {
        const isSelected = device.device_id === selectedDeviceId;
        const controlCtx = readControlContext(device) ?? undefined;
        return (
          <View
            key={device.device_id}
            style={[styles.card, isSelected && styles.cardSelected]}
          >
            <View style={styles.rowBetween}>
              <Pressable
                style={styles.titleArea}
                onPress={() => setSelectedDeviceId(device.device_id)}
              >
                <Text style={styles.deviceId}>{device.device_id}</Text>
                <Text style={styles.metaText}>
                  fw {device.firmware ?? 'unknown'} · proto {device.protocol_version ?? '?'}
                  {device.simulation_mode ? ' · SIM' : ''}
                </Text>
              </Pressable>
              <View style={styles.badgeRow}>
                <StatusBadge
                  label={device.online ? 'ONLINE' : 'OFFLINE'}
                  tone={device.online ? 'success' : 'danger'}
                />
                {isSelected ? <StatusBadge label="TARGET" tone="accent" /> : null}
              </View>
            </View>

            <View style={styles.kvGrid}>
              <Text style={styles.kvText}>State: {device.state}</Text>
              <Text style={styles.kvText}>Lease: {device.lease_status ?? 'unknown'}</Text>
              <Text style={styles.kvText}>
                Display: {device.display?.visible ?? 'UNKNOWN'}
              </Text>
              <Text style={styles.kvText}>
                HW Verify: {device.hardware_verification ?? 'UNVERIFIED'}
              </Text>
              <Text style={styles.kvText}>
                Voice: {device.voice_state ?? 'n/a'}
              </Text>
              <Text style={styles.kvText}>
                Motion Fault: {device.motion_fault ?? 'none'}
              </Text>
            </View>

            {device.motion_recovery_required ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  Boot STOP confirmation required before motion ({device.motion_recovery_reason ?? 'BOOT_CONFIRMATION_REQUIRED'}).
                </Text>
              </View>
            ) : null}

            <View style={styles.capRow}>
              {device.capabilities.map((cap) => (
                <StatusBadge key={cap} label={cap} tone="neutral" />
              ))}
            </View>

            {device.last_command_action ? (
              <Text style={styles.metaText}>
                Last cmd: {device.last_command_action} ({device.last_result_status ?? 'pending'})
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.btn, !device.online && styles.btnDisabled]}
                disabled={!device.online || !client || Boolean(actionBusy)}
                onPress={() =>
                  void sendSafeDeviceAction(device, 'Beep', () =>
                    client!.beep(device.device_id, controlCtx),
                  )
                }
              >
                <Text style={styles.btnText}>Beep</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, !device.online && styles.btnDisabled]}
                disabled={!device.online || !client || Boolean(actionBusy)}
                onPress={() =>
                  void sendSafeDeviceAction(device, 'Face Happy', () =>
                    client!.face(device.device_id, 'happy', controlCtx),
                  )
                }
              >
                <Text style={styles.btnText}>Happy Face</Text>
              </Pressable>
              <Pressable
                style={styles.stopSmallBtn}
                onPress={() => void triggerEmergencyStop(device.device_id)}
              >
                <Text style={styles.stopSmallBtnText}>STOP</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* Device Credential Lifecycle */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Device Credentials (Per-Device)</Text>
        {credsLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      {credsError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{credsError}</Text>
        </View>
      ) : null}

      {issuedCred ? (
        <View style={styles.secretCard}>
          <Text style={styles.secretTitle}>
            One-Time Rotated Token — {issuedCred.credential.device_id} (v{issuedCred.credential.version})
          </Text>
          <Text style={styles.secretWarning}>
            Held in volatile RAM only. Shown once; dismiss after delivering via controlled provisioning.
          </Text>
          <Text selectable style={styles.secretCode}>
            {issuedCred.token}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.btnPrimary}
              onPress={async () => {
                await Clipboard.setStringAsync(issuedCred.token);
                setCredCopied(true);
              }}
            >
              <Text style={styles.btnPrimaryText}>{credCopied ? 'Copied' : 'Copy Token'}</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={() => {
                setIssuedCred(null);
                setCredCopied(false);
              }}
            >
              <Text style={styles.btnText}>Clear from Screen</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {confirmCredAction ? (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>
            Confirm {confirmCredAction.action.toUpperCase()} for {confirmCredAction.deviceId}?
          </Text>
          <Text style={styles.mutedText}>
            {confirmCredAction.action === 'rotate'
              ? 'Rotating invalidates the previous token and disconnects the current device session.'
              : 'Revoking immediately disconnects the device until re-paired or re-registered.'}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.stopSmallBtn}
              onPress={() => void executeCredentialAction()}
            >
              <Text style={styles.stopSmallBtnText}>Confirm {confirmCredAction.action}</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => setConfirmCredAction(null)}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {credentials.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.mutedText}>
            No per-device credential metadata loaded (requires Console token & scoped credential mode).
          </Text>
        </View>
      ) : (
        credentials.map((cred) => (
          <View key={cred.device_id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.deviceId}>{cred.device_id}</Text>
              <StatusBadge
                label={`${cred.status.toUpperCase()} v${cred.version}`}
                tone={cred.status === 'active' ? 'success' : 'neutral'}
              />
            </View>
            <Text style={styles.metaText}>Fingerprint: {cred.fingerprint}</Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.btn, Boolean(issuedCred) && styles.btnDisabled]}
                disabled={Boolean(issuedCred) || Boolean(actionBusy)}
                onPress={() =>
                  setConfirmCredAction({ action: 'rotate', deviceId: cred.device_id })
                }
              >
                <Text style={styles.btnText}>Rotate</Text>
              </Pressable>
              {cred.status === 'active' ? (
                <Pressable
                  style={[styles.btnDangerOutline, Boolean(issuedCred) && styles.btnDisabled]}
                  disabled={Boolean(issuedCred) || Boolean(actionBusy)}
                  onPress={() =>
                    setConfirmCredAction({ action: 'revoke', deviceId: cred.device_id })
                  }
                >
                  <Text style={styles.btnDangerOutlineText}>Revoke</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  refreshBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
  },
  refreshBtnText: { fontSize: 12, fontWeight: '700', color: colors.accentDark },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardSelected: { borderColor: colors.accent, borderWidth: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  titleArea: { flex: 1 },
  deviceId: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  metaText: { fontSize: 12, color: colors.textMuted },
  mutedText: { fontSize: 12, color: colors.textSecondary },
  badgeRow: { flexDirection: 'row', gap: 6 },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kvText: { fontSize: 12, color: colors.textSecondary, minWidth: '45%' },
  capRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: 4 },
  btn: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
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
  stopSmallBtn: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopSmallBtnText: { fontSize: 13, fontWeight: '800', color: '#ffffff' },
  errorBox: { backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radii.sm },
  errorText: { color: colors.dangerDark, fontSize: 12, fontWeight: '600' },
  noticeBox: { backgroundColor: colors.accentSoft, padding: spacing.md, borderRadius: radii.sm },
  noticeText: { color: colors.accentDark, fontSize: 12, fontWeight: '600' },
  warnBox: { backgroundColor: colors.warningSoft, padding: spacing.sm, borderRadius: radii.sm },
  warnText: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  secretCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  secretTitle: { fontSize: 14, fontWeight: '800', color: colors.warning },
  secretWarning: { fontSize: 12, color: colors.textSecondary },
  secretCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    padding: spacing.sm,
    backgroundColor: '#ffffff',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  confirmCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirmTitle: { fontSize: 14, fontWeight: '800', color: colors.dangerDark },
});
