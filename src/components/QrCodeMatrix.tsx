import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildPlainTextQrMatrix } from '../utils/qrMatrix';
import { colors, radii, spacing } from '../theme/tokens';

interface QrCodeMatrixProps {
  value: string;
  pixelSize?: number;
}

/**
 * Pure React Native QR renderer using View cells (no DOM canvas/SVG required).
 * Encodes plain-text pairing codes only.
 */
export function QrCodeMatrix({ value, pixelSize = 196 }: QrCodeMatrixProps) {
  const matrix = useMemo(() => {
    try {
      return buildPlainTextQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return <Text style={styles.error}>Unable to render QR matrix.</Text>;
  }

  const cellSize = Math.max(2, Math.floor(pixelSize / matrix.size));
  const renderedSize = cellSize * matrix.size;

  const rows: React.ReactNode[] = [];
  for (let r = 0; r < matrix.size; r += 1) {
    const cells: React.ReactNode[] = [];
    for (let c = 0; c < matrix.size; c += 1) {
      const dark = matrix.modules[r * matrix.size + c];
      cells.push(
        <View
          key={c}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: dark ? '#000000' : '#ffffff',
          }}
        />,
      );
    }
    rows.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>,
    );
  }

  return (
    <View style={styles.frame}>
      <View style={{ width: renderedSize, height: renderedSize }}>{rows}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
});
