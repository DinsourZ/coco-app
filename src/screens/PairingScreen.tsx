import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { operatorErrorMessage } from '@coco/api-client';
import {
  isValidDeviceId,
  type CreatedDevicePairingTicket,
  type DevicePairingTicket,
} from '@coco/protocol';
import { QrCodeMatrix } from '../components/QrCodeMatrix';
import { StatusBadge } from '../components/StatusBadge';
import { useCoCo } from '../context/CoCoContext';
import { colors, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';

function remainingLabel(expiresAtSeconds: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil(expiresAtSeconds - nowMs / 1000));
  if (seconds === 0) return 'expired';
  if (seconds < 60) return `${seconds}s left`;
  return `${Math.ceil(seconds / 60)}m left`;
}

export function PairingScreen() {
  const { client, mode, authStore, authRevision } = useCoCo();

  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [tickets, setTickets] = useState<DevicePairingTicket[]>([]);
  const [issued, setIssued] = useState<CreatedDevicePairingTicket | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadTickets = useCallback(async () => {
    if (!client) return;
    if (mode === 'live' && !authStore.hasToken('console')) {
      setTickets([]);
      setError('Console in-memory token is required to manage pairing tickets.');
      return;
    }
    setLoading(true);
    try {
      const resp = await client.pairingTickets();
      setTickets(resp.tickets);
      setError(null);
    } catch (err) {
      setError(operatorErrorMessage(err, 'Failed to load pairing tickets.'));
    } finally {
      setLoading(false);
    }
  }, [client, mode, authStore]);

  // Security invariant: clear one-time pairing_code on auth/mode change or unmount.
  useEffect(() => {
    setIssued(null);
    setQrVisible(false);
    setCopied(false);
    setConfirmCancelId(null);
    void loadTickets();
    return () => {
      setIssued(null);
      setQrVisible(false);
    };
  }, [loadTickets, authRevision, mode]);

  const handleCreateTicket = async () => {
    const trimmed = deviceIdInput.trim();
    if (!isValidDeviceId(trimmed)) {
      setError('Device ID must be 1–64 characters matching [A-Za-z0-9._-].');
      return;
    }
    if (!client) {
      setError('Configure a valid HTTPS backend URL or use Mock Mode.');
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    setQrVisible(false);
    setCopied(false);
    try {
      const created = await client.createPairingTicket(trimmed);
      setIssued(created);
      setDeviceIdInput('');
      setNotice(
        created.replaced
          ? `Replaced existing ticket for ${created.ticket.device_id}.`
          : `Issued one-time pairing ticket for ${created.ticket.device_id}.`,
      );
      void loadTickets();
    } catch (err) {
      setError(operatorErrorMessage(err, 'Could not create pairing ticket.'));
    } finally {
      setCreating(false);
    }
  };

  const handleCancelTicket = async (ticketId: string) => {
    if (!client) return;
    try {
      await client.cancelPairingTicket(ticketId);
      setConfirmCancelId(null);
      if (issued?.ticket.ticket_id === ticketId) {
        setIssued(null);
        setQrVisible(false);
      }
      setNotice(`Cancelled pairing ticket ${ticketId}.`);
      void loadTickets();
    } catch (err) {
      setError(operatorErrorMessage(err, 'Could not cancel pairing ticket.'));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Create One-Time Pairing Ticket</Text>
        <Text style={styles.mutedText}>
          Tickets issue a 192-bit single-use pairing code. QR codes encode ONLY the plain-text code
          and never auto-claim or embed backend URLs/tokens.
        </Text>
        <TextInput
          style={styles.input}
          value={deviceIdInput}
          onChangeText={setDeviceIdInput}
          placeholder="Device ID (e.g. coco-unit-01)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.btnPrimary, creating && styles.btnDisabled]}
          disabled={creating}
          onPress={() => void handleCreateTicket()}
        >
          <Text style={styles.btnPrimaryText}>
            {creating ? 'Issuing...' : 'Issue Pairing Ticket'}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {issued ? (
        <View style={styles.secretCard}>
          <Text style={styles.secretTitle}>
            One-Time Pairing Code — {issued.ticket.device_id}
          </Text>
          <Text style={styles.mutedText}>
            Expires: {remainingLabel(issued.ticket.expires_at, now)} · Held in memory only
          </Text>
          <Text selectable style={styles.secretCode}>
            {issued.pairing_code}
          </Text>
          <View style={styles.row}>
            <Pressable
              style={styles.btnPrimary}
              onPress={async () => {
                await Clipboard.setStringAsync(issued.pairing_code);
                setCopied(true);
              }}
            >
              <Text style={styles.btnPrimaryText}>{copied ? 'Copied' : 'Copy Code'}</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => setQrVisible((v) => !v)}>
              <Text style={styles.btnText}>{qrVisible ? 'Hide QR' : 'Show Plain-Text QR'}</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={() => {
                setIssued(null);
                setQrVisible(false);
              }}
            >
              <Text style={styles.btnText}>Dismiss</Text>
            </Pressable>
          </View>
          {qrVisible ? <QrCodeMatrix value={issued.pairing_code} /> : null}
        </View>
      ) : null}

      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Active Tickets ({tickets.length})</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void loadTickets()}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.accent} /> : null}

      {tickets.length === 0 && !loading ? (
        <View style={styles.card}>
          <Text style={styles.mutedText}>No pending pairing tickets.</Text>
        </View>
      ) : (
        tickets.map((ticket) => {
          const ttl = remainingLabel(ticket.expires_at, now);
          const isExpired = ttl === 'expired';
          return (
            <View key={ticket.ticket_id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceId}>{ticket.device_id}</Text>
                <StatusBadge label={ttl} tone={isExpired ? 'danger' : 'warning'} />
              </View>
              <Text style={styles.mutedText}>Ticket: {ticket.ticket_id}</Text>
              <Text style={styles.mutedText}>Fingerprint: {ticket.fingerprint}</Text>
              {confirmCancelId === ticket.ticket_id ? (
                <View style={styles.row}>
                  <Pressable
                    style={styles.btnDanger}
                    onPress={() => void handleCancelTicket(ticket.ticket_id)}
                  >
                    <Text style={styles.btnPrimaryText}>Confirm Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.btn} onPress={() => setConfirmCancelId(null)}>
                    <Text style={styles.btnText}>Keep</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.btnDangerOutline}
                  onPress={() => setConfirmCancelId(ticket.ticket_id)}
                >
                  <Text style={styles.btnDangerOutlineText}>Cancel Ticket</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
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
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  deviceId: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  mutedText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
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
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  btnDanger: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDangerOutline: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  btnDangerOutlineText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  btnDisabled: { opacity: 0.5 },
  refreshBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
  },
  refreshBtnText: { fontSize: 12, fontWeight: '700', color: colors.accentDark },
  errorBox: { backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radii.sm },
  errorText: { color: colors.dangerDark, fontSize: 12, fontWeight: '600' },
  noticeBox: { backgroundColor: colors.accentSoft, padding: spacing.md, borderRadius: radii.sm },
  noticeText: { color: colors.accentDark, fontSize: 12, fontWeight: '600' },
  secretCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  secretTitle: { fontSize: 14, fontWeight: '800', color: colors.warning },
  secretCode: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    padding: spacing.sm,
    backgroundColor: '#ffffff',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
});
