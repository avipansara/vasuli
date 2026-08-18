export type CombinedSettlementErrorCode =
  | 'invalid_input'
  | 'stale_balance'
  | 'unauthorized'
  | 'conflict'
  | 'transient';

export class CombinedSettlementError extends Error {
  constructor(
    public readonly code: CombinedSettlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CombinedSettlementError';
  }
}

export function mapCombinedSettlementError(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return new CombinedSettlementError('transient', 'The payment could not be confirmed. Please retry.');
  }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = message.match(/SETTLEMENT_[A-Z_]+/)?.[0];
  if (!code) return new CombinedSettlementError('transient', 'The payment could not be confirmed. Please retry.');

  const mappings: Record<string, [CombinedSettlementErrorCode, string]> = {
    SETTLEMENT_STALE_BALANCE: ['stale_balance', 'This balance changed. Refresh and try again.'],
    SETTLEMENT_FRIENDSHIP_REQUIRED: ['unauthorized', 'You can only settle with an accepted friend.'],
    SETTLEMENT_GROUP_SCOPE_INVALID: ['unauthorized', 'This Group is no longer shared by both people.'],
    SETTLEMENT_ALLOCATION_DIRECTION_INVALID: ['invalid_input', 'The payment direction is no longer valid.'],
    SETTLEMENT_ALLOCATION_OVER_BALANCE: ['invalid_input', 'The payment exceeds the current outstanding balance.'],
    SETTLEMENT_ALLOCATION_TOTAL_MISMATCH: ['invalid_input', 'The settlement allocation is invalid.'],
    SETTLEMENT_AMOUNT_INVALID: ['invalid_input', 'Enter an amount with at most two decimal places.'],
    SETTLEMENT_CURRENCY_REQUIRED: ['invalid_input', 'A settlement currency is required.'],
    SETTLEMENT_ALLOCATIONS_REQUIRED: ['invalid_input', 'Choose a settlement scope.'],
    SETTLEMENT_ALLOCATION_INVALID: ['invalid_input', 'The settlement allocation is invalid.'],
    SETTLEMENT_CURRENCY_UNSUPPORTED: ['invalid_input', 'This settlement currency is not supported.'],
    SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT: ['conflict', 'This payment was already submitted with different details.'],
    SETTLEMENT_MODE_INVALID: ['invalid_input', 'This settlement mode is not supported.'],
    SETTLEMENT_GROUP_REQUIRED: ['invalid_input', 'Choose a group to settle.'],
    SETTLEMENT_TRANSFERS_INVALID: ['invalid_input', 'The settlement transfer plan is invalid.'],
    SETTLEMENT_TRANSFERS_REQUIRED: ['invalid_input', 'Choose the balances to clear.'],
    SETTLEMENT_TRANSFER_INVALID: ['invalid_input', 'The settlement transfer is invalid.'],
    SETTLEMENT_OPERATION_INVALID: ['transient', 'The settlement operation could not be confirmed. Please retry.'],
  };
  const mapping = mappings[code];
  return mapping ? new CombinedSettlementError(mapping[0], mapping[1]) : error;
}
