import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCoCo } from '../context/CoCoContext';
import { colors, spacing } from '../theme/tokens';
import { StatusBadge, type BadgeTone } from './StatusBadge';

export function ConnectionBanner() {
  const { mode, health, healthError, configError, socketStatus, selectedDevice } = useCoCo();

  let wsTone: BadgeTone = 'neutral';
  let wsLabel = `WS: ${socketStatus}`;
  if (mode === 'mock') {
    wsTone = 'mock';
    wsLabel = 'MOCK MODE (SYNTHETIC)';
  } else if (socketStatus === 'connected') {
    wsTone = 'success';
    wsLabel = 'WS: CONNECTED';
  } else if (socketStatus === 'connecting' || socketStatus === 'reconnecting') {
    wsTone = 'warning';
    wsLabel = `WS: ${socketStatus.toUpperCase()}`;
  } else if (socketStatus === 'error' || socketStatus === 'no_token') {
    wsTone = 'danger';
    wsLabel = socketStatus === 'no_token' ? 'NO CONSOLE TOKEN' : 'WS: ERROR';
  }

  const activeError = mode === 'live' ? configError || healthError : null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.brand}>CoCo App</Text>
        <View style={styles.badges}>
          <StatusBadge label={wsLabel} tone={wsTone} />
          {health ? (
            <StatusBadge
              label={`API ${health.version}`}
              tone={mode === 'mock' ? 'mock' : 'success'}
            />
          ) : null}
        </View>
      </View>
      <Text style={styles.subline} numberOfLines={1}>
        Target device:{' '}
        {selectedDevice
          ? `${selectedDevice.device_id} (${selectedDevice.online ? selectedDevice.state : 'offline'})`
          : 'none selected'}
      </Text>
      {activeError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{activeError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.headerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  brand: {
    color: colors.headerText,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  subline: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  errorBox: {
    marginTop: spacing.xs,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
  },
  errorText: {
    color: colors.dangerDark,
    fontSize: 12,
    fontWeight: '600',
  },
});
