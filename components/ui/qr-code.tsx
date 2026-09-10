import QRCodeGenerator from 'qrcode';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface QRCodeProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  testID?: string;
}

export function QRCode({
  value,
  size = 220,
  color = '#000000',
  backgroundColor = '#ffffff',
  testID = 'qr-code-view',
}: QRCodeProps) {
  const { moduleSize, runs } = useMemo(() => {
    if (!value) return { moduleSize: 0, runs: [] };
    try {
      const qr = QRCodeGenerator.create(value, { errorCorrectionLevel: 'M' });
      const qrSize = qr.modules.size;
      const margin = 2; // Quiet zone padding modules
      const totalModules = qrSize + margin * 2;
      const cell = size / totalModules;
      const data = qr.modules.data;

      // Group contiguous dark cells in each row into single horizontal bars
      const bars: { x: number; y: number; width: number }[] = [];
      for (let y = 0; y < qrSize; y++) {
        let runStart = -1;
        for (let x = 0; x < qrSize; x++) {
          const isDark = data[y * qrSize + x];
          if (isDark) {
            if (runStart === -1) runStart = x;
          } else {
            if (runStart !== -1) {
              bars.push({
                x: (runStart + margin) * cell,
                y: (y + margin) * cell,
                width: (x - runStart) * cell,
              });
              runStart = -1;
            }
          }
        }
        if (runStart !== -1) {
          bars.push({
            x: (runStart + margin) * cell,
            y: (y + margin) * cell,
            width: (qrSize - runStart) * cell,
          });
        }
      }

      return { moduleSize: cell, runs: bars };
    } catch (e) {
      console.error('Error generating QR code:', e);
      return { moduleSize: 0, runs: [] };
    }
  }, [value, size]);

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          backgroundColor,
        },
      ]}
    >
      {runs.map((run, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: run.x,
            top: run.y,
            width: run.width,
            height: moduleSize,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
});
