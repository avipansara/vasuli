import { useCallback, useRef, useState } from 'react';
import type { AnalyticsService } from '@/services/analytics-service';
import { trackSettlementReversed } from '@/lib/analytics/track';
import {
  SETTLEMENT_ALREADY_DELETED_COPY,
  SETTLEMENT_DELETE_LOAD_ERROR_COPY,
  SettlementAlreadyDeletedError,
  classifySettlementDeleteError,
  executeSettlementDelete,
  getPostDeleteRefreshFailureCopy,
  getSettlementDeleteSuccessCopy,
  loadSettlementDeleteConfirmationDetails,
  type SettlementDeleteConfirmationDetails,
  type SettlementDeleteDetailReader,
  type SettlementDeleteKind,
  type SettlementDeleteQueryClient,
  type SettlementDeleteReverse,
} from '@/services/settlement-delete-flow';

export type SettlementDeleteRequest = {
  operationId: string;
  currency: string;
  friendId: string;
  friendName?: string;
};

/**
 * React Query `refetch()` never rejects on a query error: it resolves with a
 * result carrying `error`/`isError` unless `throwOnError` is set. Both screens
 * pass the raw `useQuery` refetch, so the flow inspects the resolved result
 * instead of assuming rejection.
 */
export type SettlementDeleteRefetch = () => Promise<unknown>;

function refetchFailed(result: unknown): boolean {
  if (result !== null && typeof result === 'object') {
    const record = result as { error?: unknown; isError?: unknown };
    if (record.error !== null && record.error !== undefined) return true;
    if (record.isError === true) return true;
  }
  return false;
}

async function runRefetch(refetch: SettlementDeleteRefetch): Promise<boolean> {
  try {
    return !refetchFailed(await refetch());
  } catch {
    return false;
  }
}

export type SettlementDeleteDialogHandlerId = 'confirm' | 'dismiss' | 'reload' | 'refresh-close' | 'refresh-result';

export type SettlementDeleteDialogAction = {
  id: 'primary' | 'secondary';
  label: string;
  testID: string;
  destructive?: boolean;
  handler: SettlementDeleteDialogHandlerId;
};

export type SettlementDeleteDialogState =
  | { phase: 'loading'; operationId: string }
  | { phase: 'confirm'; details: SettlementDeleteConfirmationDetails }
  | { phase: 'deleting'; details: SettlementDeleteConfirmationDetails }
  | {
      phase: 'result';
      operationId: string;
      kind?: SettlementDeleteKind;
      title: string;
      body: string;
      tone: 'success' | 'already' | 'stale' | 'error';
      busy?: boolean;
      primary: SettlementDeleteDialogAction;
      secondary?: SettlementDeleteDialogAction;
    };

type UseSettlementDeleteFlowParams = {
  currentUserId: string;
  analytics?: AnalyticsService;
  /** Group entry screen. Scopes exact detail/pair-total invalidation; prefixes cover the rest. */
  groupId?: string;
  queryClient: SettlementDeleteQueryClient;
  refetch: SettlementDeleteRefetch;
  getDetail?: SettlementDeleteDetailReader['getDetail'];
  reverse?: SettlementDeleteReverse;
};

/**
 * Shared whole-operation Delete confirmation/results flow (ticket 04, ADR-0001
 * presentation clarification; uniform path since ADR-0004 ticket 05).
 * Friend detail, Group payment, group adjustment summary, and zero-payment
 * entries all enter here so titles, bodies, and result handling cannot drift
 * between routes. Backfilled and new rows delete identically: one operation
 * ID plus the current expected relationship balance through
 * settlementModule.reverse. The reverse RPC itself is untouched (retired in
 * ticket 06) and has no Reverse UI call site.
 *
 * Corrective behavior:
 * - The complete dialog flow is a cross-platform modal state machine (see
 *   `SettlementDeleteDialogs`), never `Alert`, so web can confirm.
 * - A synchronous lock serializes the whole flow: rapid A/A taps and A/B
 *   requests while any dialog phase is open are ignored. `pendingOperationId`
 *   mirrors the lock for rendering disabled entry points during pending
 *   reads/mutation (and while a result waits for dismissal).
 * - Refresh outcomes honor real React Query refetch semantics (resolved
 *   `{ error }` results count as failures).
 * - Successful deletions are marked deleted locally, so both screens render
 *   the Deleted state even when refresh fails.
 * - Reused receipts show Already deleted; the first stale rejection offers
 *   refresh with a required new confirmation and a second rejection ends the
 *   loop; other failures keep the entry with retry where appropriate.
 */
export function useSettlementDeleteFlow(params: UseSettlementDeleteFlowParams) {
  const { currentUserId, analytics, groupId, queryClient, refetch, getDetail, reverse } = params;
  const [pendingOperationId, setPendingOperationId] = useState<string | null>(null);
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<readonly string[]>([]);
  const [dialog, setDialog] = useState<SettlementDeleteDialogState | null>(null);
  const staleAttempts = useRef(new Map<string, number>());
  const lockRef = useRef<string | null>(null);
  const lastRequestRef = useRef(new Map<string, SettlementDeleteRequest>());
  const dialogRef = useRef<SettlementDeleteDialogState | null>(null);

  const setDialogState = useCallback((next: SettlementDeleteDialogState | null) => {
    dialogRef.current = next;
    setDialog(next);
  }, []);

  const markLocallyDeleted = useCallback((operationId: string) => {
    setLocallyDeletedIds(current => (current.includes(operationId) ? current : [...current, operationId]));
  }, []);

  const dismissDialog = useCallback(() => {
    lockRef.current = null;
    setPendingOperationId(null);
    setDialogState(null);
  }, [setDialogState]);

  const showAlreadyDeleted = useCallback(async (operationId: string) => {
    markLocallyDeleted(operationId);
    // The reused receipt is final: realtime and focus refetch seams converge
    // activity, so a refresh failure here never reopens deletion.
    await runRefetch(refetch);
    if (lockRef.current !== operationId) return;
    setDialogState({
      phase: 'result',
      operationId,
      title: SETTLEMENT_ALREADY_DELETED_COPY.title,
      body: SETTLEMENT_ALREADY_DELETED_COPY.body,
      tone: 'already',
      primary: {
        id: 'primary',
        label: 'Done',
        testID: `settlement-delete-result-primary-${operationId}`,
        handler: 'dismiss',
      },
    });
  }, [markLocallyDeleted, refetch, setDialogState]);

  const confirmDelete = useCallback(async () => {
    const current = dialogRef.current;
    if (!current || current.phase !== 'confirm') return;
    const { details } = current;
    const { operationId } = details;
    if (lockRef.current !== operationId) return;
    setDialogState({ phase: 'deleting', details });

    try {
      const receipt = await executeSettlementDelete({
        operationId,
        expectedBalance: details.expectedBalance,
        currentUserId,
        friendId: details.friendId,
        ...(groupId ? { groupId } : {}),
        ...(reverse ? { reverse } : {}),
        queryClient,
      });
      staleAttempts.current.delete(operationId);
      // The server deleted the operation: mark it locally before refreshing
      // so the Deleted state renders even when refresh fails.
      markLocallyDeleted(operationId);
      if (lockRef.current !== operationId) return;
      if (receipt.reused) {
        await showAlreadyDeleted(operationId);
        return;
      }
      if (analytics) {
        trackSettlementReversed(analytics, {
          groupId,
          currency: details.currency,
        });
      }
      const refreshed = await runRefetch(refetch);
      if (lockRef.current !== operationId) return;
      if (refreshed) {
        const success = getSettlementDeleteSuccessCopy(details.kind);
        setDialogState({
          phase: 'result',
          operationId,
          kind: details.kind,
          title: success.title,
          body: success.body,
          tone: 'success',
          primary: {
            id: 'primary',
            label: 'Done',
            testID: `settlement-delete-result-primary-${operationId}`,
            handler: 'dismiss',
          },
        });
        return;
      }
      // A successful deletion followed by a refresh failure remains
      // successful: only a refresh is retried, never another deletion.
      const copy = getPostDeleteRefreshFailureCopy(details.kind);
      setDialogState({
        phase: 'result',
        operationId,
        kind: details.kind,
        title: copy.title,
        body: copy.body,
        tone: 'success',
        primary: {
          id: 'primary',
          label: 'Refresh',
          testID: `settlement-delete-result-primary-${operationId}`,
          handler: 'refresh-result',
        },
        secondary: {
          id: 'secondary',
          label: 'Later',
          testID: `settlement-delete-result-secondary-${operationId}`,
          handler: 'dismiss',
        },
      });
    } catch (error) {
      if (lockRef.current !== operationId) return;
      const attempt = staleAttempts.current.get(operationId) ?? 0;
      const outcome = classifySettlementDeleteError(error, attempt);
      if (outcome.kind === 'already_deleted') {
        await showAlreadyDeleted(operationId);
        return;
      }
      if (outcome.kind === 'stale_refresh') {
        staleAttempts.current.set(operationId, attempt + 1);
        setDialogState({
          phase: 'result',
          operationId,
          kind: details.kind,
          title: outcome.title,
          body: outcome.body,
          tone: 'stale',
          primary: {
            id: 'primary',
            label: 'Refresh',
            testID: `settlement-delete-result-primary-${operationId}`,
            handler: 'refresh-close',
          },
          secondary: {
            id: 'secondary',
            label: 'Cancel',
            testID: `settlement-delete-result-secondary-${operationId}`,
            handler: 'dismiss',
          },
        });
        return;
      }
      if (outcome.kind === 'stale_final') {
        staleAttempts.current.delete(operationId);
      }
      if (outcome.retryable) {
        setDialogState({
          phase: 'result',
          operationId,
          kind: details.kind,
          title: outcome.title,
          body: outcome.body,
          tone: 'error',
          primary: {
            id: 'primary',
            label: 'Try again',
            testID: `settlement-delete-result-primary-${operationId}`,
            handler: 'reload',
          },
          secondary: {
            id: 'secondary',
            label: 'Cancel',
            testID: `settlement-delete-result-secondary-${operationId}`,
            handler: 'dismiss',
          },
        });
        return;
      }
      setDialogState({
        phase: 'result',
        operationId,
        kind: details.kind,
        title: outcome.title,
        body: outcome.body,
        tone: 'error',
        primary: {
          id: 'primary',
          label: 'Close',
          testID: `settlement-delete-result-primary-${operationId}`,
          handler: 'dismiss',
        },
      });
    }
  }, [analytics, currentUserId, groupId, markLocallyDeleted, queryClient, refetch, reverse, setDialogState, showAlreadyDeleted]);

  const startLoad = useCallback(async (request: SettlementDeleteRequest, acquire: boolean) => {
    const { operationId } = request;
    if (acquire) {
      // Synchronous gate: state updates flush later, so only the ref blocks
      // taps racing in the same tick (rapid A/A) or a second operation (A/B)
      // while any dialog phase holds the lock.
      if (lockRef.current !== null) return;
      lockRef.current = operationId;
    } else if (lockRef.current !== operationId) {
      return;
    }
    lastRequestRef.current.set(operationId, request);
    setPendingOperationId(operationId);
    setDialogState({ phase: 'loading', operationId });

    let details: SettlementDeleteConfirmationDetails;
    try {
      details = await loadSettlementDeleteConfirmationDetails({
        ...request,
        currentUserId,
        ...(getDetail ? { getDetail } : {}),
      });
    } catch (error) {
      if (lockRef.current !== operationId) return;
      if (error instanceof SettlementAlreadyDeletedError) {
        await showAlreadyDeleted(operationId);
        return;
      }
      setDialogState({
        phase: 'result',
        operationId,
        title: SETTLEMENT_DELETE_LOAD_ERROR_COPY.title,
        body: SETTLEMENT_DELETE_LOAD_ERROR_COPY.body,
        tone: 'error',
        primary: {
          id: 'primary',
          label: 'Try again',
          testID: `settlement-delete-result-primary-${operationId}`,
          handler: 'reload',
        },
        secondary: {
          id: 'secondary',
          label: 'Cancel',
          testID: `settlement-delete-result-secondary-${operationId}`,
          handler: 'dismiss',
        },
      });
      return;
    }

    if (lockRef.current !== operationId) return;
    setDialogState({ phase: 'confirm', details });
  }, [currentUserId, getDetail, setDialogState, showAlreadyDeleted]);

  const requestDelete = useCallback(async (request: SettlementDeleteRequest) => {
    await startLoad(request, true);
  }, [startLoad]);

  const reloadDialogRequest = useCallback(() => {
    const current = dialogRef.current;
    if (!current || current.phase !== 'result') return;
    const request = lastRequestRef.current.get(current.operationId);
    if (!request) {
      dismissDialog();
      return;
    }
    // Retry restarts at authorized loading with a fresh confirmation; the
    // stale attempt counter is preserved so the second rejection ends there.
    void startLoad(request, false);
  }, [dismissDialog, startLoad]);

  const refreshAndCloseDialog = useCallback(async () => {
    const current = dialogRef.current;
    if (!current || current.phase !== 'result') return;
    setDialogState({ ...current, busy: true });
    await runRefetch(refetch);
    // Stale refresh never auto-retries the mutation: closing forces a new
    // confirmation, which reloads details against the refreshed balances.
    if (lockRef.current !== current.operationId) return;
    dismissDialog();
  }, [dismissDialog, refetch, setDialogState]);

  const refreshResultDialog = useCallback(async () => {
    const current = dialogRef.current;
    if (!current || current.phase !== 'result') return;
    setDialogState({ ...current, busy: true });
    const refreshed = await runRefetch(refetch);
    if (lockRef.current !== current.operationId) return;
    if (refreshed && current.kind) {
      const success = getSettlementDeleteSuccessCopy(current.kind);
      setDialogState({
        phase: 'result',
        operationId: current.operationId,
        kind: current.kind,
        title: success.title,
        body: success.body,
        tone: 'success',
        primary: {
          id: 'primary',
          label: 'Done',
          testID: `settlement-delete-result-primary-${current.operationId}`,
          handler: 'dismiss',
        },
      });
      return;
    }
    setDialogState({ ...current, busy: false });
  }, [refetch, setDialogState]);

  const isDeletePending = useCallback(
    (operationId: string) => pendingOperationId === operationId,
    [pendingOperationId],
  );
  const isDeletedLocally = useCallback(
    (operationId: string) => locallyDeletedIds.includes(operationId),
    [locallyDeletedIds],
  );

  return {
    requestDelete,
    confirmDelete,
    dismissDialog,
    reloadDialogRequest,
    refreshAndCloseDialog,
    refreshResultDialog,
    dialog,
    isDeletePending,
    isDeletedLocally,
    pendingOperationId,
  };
}

export type SettlementDeleteFlowApi = ReturnType<typeof useSettlementDeleteFlow>;
