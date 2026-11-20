import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCoCo } from '../context/CoCoContext';
import { colors, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';

/**
 * Independent Emergency STOP entry point mounted globally above navigation.
 *
 * Safety invariants:
 * - Calls `POST /api/devices/{device_id}/motion/stop` without `X-CoCo-Control-*`
 *   precondition headers so stale snapshots never block STOP.
 * - Never fabricates a successful stop if the backend request fails.
 * - Explicitly notes that software STOP does not replace physical power cutoff.
 */
export function EmergencyStopBar() {
  const { selectedDeviceId, stopBusy, lastStopOutcome, triggerEmergencyStop } = useCoCo();

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.title}>EMERGENCY STOP</Text>
          <Text style={styles.hint} numberOfLines={2}>
            Software stop only (does not cut servo power). Target:{' '}
            {selectedDeviceId ?? 'no device'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Emergency Stop Device"
          disabled={stopBusy || !selectedDeviceId}
          onPress={() => {
            void triggerEmergencyStop();
          }}
          style={({ pressed }) => [
            styles.stopButton,
            (!selectedDeviceId || stopBusy) && styles.stopButtonDisabled,
            pressed && styles.stopButtonPressed,
          ]}
        >
          {stopBusy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.stopButtonText}>STOP</Text>
          )}
        </Pressable>
      </View>
      {lastStopOutcome ? (
        <Text
          style={[
            styles.outcome,
            lastStopOutcome.ok ? styles.outcomeOk : styles.outcomeFail,
          ]}
        >
          {lastStopOutcome.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.dangerDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  hint: {
    color: '#7f1d1d',
    fontSize: 11,
  },
  stopButton: {
    minWidth: 88,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  stopButtonPressed: {
    backgroundColor: colors.dangerDark,
  },
  stopButtonDisabled: {
    opacity: 0.5,
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  outcome: {
    fontSize: 11,
    fontWeight: '600',
  },
  outcomeOk: {
    color: colors.success,
  },
  outcomeFail: {
    color: colors.dangerDark,
  },
});
