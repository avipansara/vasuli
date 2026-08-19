import { CombinedSettlementError } from './combined-settlement-errors';
import { settlementService } from './settlement-service';

export type SettlementReversalParams = {
  operationId: string;
  getExpectedBalance: () => number | undefined | Promise<number | undefined>;
  refresh: () => Promise<unknown>;
  invalidateHome: () => Promise<unknown>;
};

/**
 * Reverse an operation against a fresh relationship snapshot, then refresh
 * both the local detail surface and the Friends Home projection.
 */
export async function reverseSettlementOperation({
  operationId,
  currency,
  getExpectedBalance,
  refresh,
  invalidateHome,
}: SettlementReversalParams): Promise<void> {
  const expectedBalance = await getExpectedBalance();
  if (expectedBalance === undefined) {
    throw new CombinedSettlementError('transient', 'Refresh the Friend details and try again.');
  }

  await settlementService.reverse(operationId, expectedBalance);
  await Promise.all([refresh(), invalidateHome()]);
}
