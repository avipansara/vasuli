import { ThemedText } from '@/components/themed-text';
import { SharedModal } from '@/components/ui/shared-modal';
import type {
  SettlementDeleteDialogAction,
  SettlementDeleteDialogHandlerId,
  SettlementDeleteFlowApi,
} from '@/hooks/use-settlement-delete-flow';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getSettlementDeleteConfirmationCopy } from '@/services/settlement-delete-flow';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

function DialogFooterButton({
  action,
  disabled,
  onPress,
}: {
  action: SettlementDeleteDialogAction;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, friendDetail } = useThemeColors();
  const isDestructive = action.destructive === true;
  const isDisabled = disabled === true;
  const backgroundColor = isDestructive
    ? friendDetail.dangerSurface
    : friendDetail.dialogSecondarySurface;
  const borderColor = isDestructive ? friendDetail.danger : friendDetail.dialogSecondaryBorder;
  const textColor = isDestructive
    ? friendDetail.danger
    : colors.text;

  return (
    <TouchableOpacity
      testID={action.testID}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: isDisabled }}
      activeOpacity={0.7}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.footerButton,
        {
          backgroundColor,
          borderColor,
          opacity: isDisabled ? 0.5 : 1,
        },
      ]}>
      <ThemedText type="defaultSemiBold" style={[styles.footerButtonText, { color: textColor }]}>
        {action.label}
      </ThemedText>
    </TouchableOpacity>
  );
}

function DialogFooter({
  primary,
  secondary,
  busy,
  onAction,
}: {
  primary: SettlementDeleteDialogAction;
  secondary?: SettlementDeleteDialogAction;
  busy?: boolean;
  onAction: (handler: SettlementDeleteDialogHandlerId) => void;
}) {
  return (
    <View style={styles.footerRow}>
      {secondary ? (
        <View style={styles.footerHalf}>
          <DialogFooterButton
            action={secondary}
            disabled={busy === true}
            onPress={() => onAction(secondary.handler)}
          />
        </View>
      ) : null}
      <View style={secondary ? styles.footerHalf : styles.footerFull}>
        <DialogFooterButton
          action={primary}
          disabled={busy === true}
          onPress={() => onAction(primary.handler)}
        />
      </View>
    </View>
  );
}

/**
 * Cross-platform Delete confirmation/results dialogs for the shared
 * ticket-04 flow (uniform path since ADR-0004 ticket 05: backfilled and new
 * rows confirm here identically). `Alert` buttons do not render on web, so
 * every phase of the dialog flow renders through the existing `SharedModal`
 * (React Native Modal) pattern with operation-specific test IDs. Copy stays
 * exactly as implemented in `services/settlement-delete-flow.ts`.
 */
export function SettlementDeleteDialogs({ flow }: { flow: SettlementDeleteFlowApi }) {
  const { dialog } = flow;

  const onAction = (handler: SettlementDeleteDialogHandlerId) => {
    if (handler === 'confirm') void flow.confirmDelete();
    else if (handler === 'dismiss') flow.dismissDialog();
    else if (handler === 'reload') flow.reloadDialogRequest();
    else if (handler === 'refresh-close') void flow.refreshAndCloseDialog();
    else void flow.refreshResultDialog();
  };

  if (!dialog) return null;

  if (dialog.phase === 'loading') {
    return (
      <SharedModal
        visible
        onClose={flow.dismissDialog}
        title="Loading settlement"
        subtitle="Loading settlement details…"
        icon="clock">
        <View
          testID="settlement-delete-dialog"
          accessibilityRole="alert"
          accessibilityLabel="Loading settlement details">
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ThemedText testID="settlement-delete-dialog-title" type="title" style={styles.hiddenTitle}>
              Loading settlement
            </ThemedText>
            <ThemedText testID="settlement-delete-dialog-body" style={styles.hiddenTitle}>
              Loading settlement details…
            </ThemedText>
          </View>
        </View>
      </SharedModal>
    );
  }

  if (dialog.phase === 'confirm' || dialog.phase === 'deleting') {
    const { details } = dialog;
    const busy = dialog.phase === 'deleting';
    const confirm = getSettlementDeleteConfirmationCopy({
      kind: details.kind,
      paymentAmountText: details.paymentAmountText,
      friendName: details.friendDisplayName,
      clearedBalances: details.clearedBalances,
    });
    const { operationId } = details;
    return (
      <SharedModal
        visible
        onClose={flow.dismissDialog}
        title={confirm.title}
        subtitle={confirm.body}
        icon="trash"
        footerContent={
          <View testID="settlement-delete-dialog">
            <DialogFooter
              busy={busy}
              onAction={onAction}
              primary={{
                id: 'primary',
                label: busy ? 'Deleting…' : 'Delete',
                testID: `settlement-delete-confirm-${operationId}`,
                destructive: true,
                handler: 'confirm',
              }}
              secondary={{
                id: 'secondary',
                label: 'Cancel',
                testID: `settlement-delete-cancel-${operationId}`,
                handler: 'dismiss',
              }}
            />
          </View>
        }>
        <View
          accessibilityRole="alert"
          accessibilityLabel={`${confirm.title}. ${confirm.body}`}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ThemedText testID="settlement-delete-dialog-title" type="title" style={styles.hiddenTitle}>
              {confirm.title}
            </ThemedText>
            <ThemedText testID="settlement-delete-dialog-body" style={styles.hiddenTitle}>
              {confirm.body}
            </ThemedText>
          </View>
        </View>
      </SharedModal>
    );
  }

  const icon = dialog.tone === 'success' || dialog.tone === 'already'
    ? 'checkmark.circle.fill'
    : dialog.tone === 'stale'
      ? 'clock'
      : 'exclamationmark.triangle.fill';
  return (
    <SharedModal
      visible
      onClose={flow.dismissDialog}
      title={dialog.title}
      subtitle={dialog.body}
      icon={icon}
      footerContent={
        <View testID="settlement-delete-dialog">
          <DialogFooter
            busy={dialog.busy === true}
            onAction={onAction}
            primary={dialog.primary}
            {...(dialog.secondary ? { secondary: dialog.secondary } : {})}
          />
        </View>
      }>
      <View
        accessibilityRole="alert"
        accessibilityLabel={`${dialog.title}. ${dialog.body}`}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ThemedText testID="settlement-delete-dialog-title" type="title" style={styles.hiddenTitle}>
            {dialog.title}
          </ThemedText>
          <ThemedText testID="settlement-delete-dialog-body" style={styles.hiddenTitle}>
            {dialog.body}
          </ThemedText>
        </View>
      </View>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerHalf: {
    flex: 1,
  },
  footerFull: {
    flex: 1,
  },
  footerButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footerButtonText: {
    fontSize: 15,
  },
  // Title/body already render in the SharedModal header; these hidden nodes
  // expose stable operation-agnostic test IDs plus screen-reader text without
  // duplicating visible copy.
  hiddenTitle: {
    position: 'absolute',
    opacity: 0,
    height: 0,
  },
});
