import type { AppUpdateDecision } from '@/lib/app-update';
import { SharedModal } from '@/components/ui/shared-modal';
import { ThemedText } from '@/components/themed-text';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type AppUpdatePromptProps = {
  decision: Exclude<AppUpdateDecision, { kind: 'current' }> | null;
  onUpdate: () => void;
  onDismiss: () => void;
  onRetry: () => void;
};

export function AppUpdatePrompt({ decision, onUpdate, onDismiss, onRetry }: AppUpdatePromptProps) {
  if (!decision) return null;

  const isMandatory = decision.kind === 'mandatory';

  return (
    <SharedModal
      visible
      onClose={isMandatory ? onRetry : onDismiss}
      title={`Vasuli ${decision.version} is available`}
      subtitle={decision.title}
      icon="arrow.down.circle.fill"
      footerContent={(
        <View style={styles.footerActions}>
          <TouchableOpacity testID="app-update-now" onPress={onUpdate} style={styles.updateButton}>
            <ThemedText>Update now</ThemedText>
          </TouchableOpacity>
          {!isMandatory && (
            <TouchableOpacity testID="app-update-later" onPress={onDismiss} style={styles.laterButton}>
              <ThemedText>Later</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}>
      <View testID="app-update-release-notes" style={styles.notes}>
        {decision.notes.map((note, index) => (
          <ThemedText key={`${decision.releaseId}-${index}`} style={styles.note}>
            • {note}
          </ThemedText>
        ))}
      </View>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  notes: {
    gap: 10,
    paddingTop: 8,
  },
  note: {
    lineHeight: 22,
  },
  laterButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  footerActions: {
    gap: 4,
  },
  updateButton: {
    alignItems: 'center',
    backgroundColor: '#2DD4BF',
    borderRadius: 14,
    paddingVertical: 16,
  },
});
