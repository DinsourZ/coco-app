import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ToolCallRecord } from '@coco/protocol';
import { colors, radii, spacing } from '../theme/tokens';
import { StatusBadge, type BadgeTone } from './StatusBadge';

export function ToolCallCard({ call }: { call: ToolCallRecord }) {
  let tone: BadgeTone = 'neutral';
  if (call.status === 'executed' || call.status === 'sent') tone = 'success';
  else if (call.status === 'pending_approval') tone = 'warning';
  else if (call.status === 'blocked' || call.status === 'failed') tone = 'danger';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.toolName}>{call.tool}</Text>
        <StatusBadge label={call.status.toUpperCase()} tone={tone} />
      </View>
      <Text style={styles.meta}>Category: {call.category}</Text>
      {call.approval_id ? (
        <Text style={styles.meta}>Approval ID: {call.approval_id}</Text>
      ) : null}
      {call.result_summary ? (
        <Text style={styles.summary}>{call.result_summary}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  toolName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  summary: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
