import { describe, expect, it, vi } from 'vitest';
import { settlementService } from '@/services/settlement-service';
import { reverseSettlementOperation } from '@/services/settlement-reversal';

describe('reverseSettlementOperation', () => {
  it('reverses against the current balance and refreshes both surfaces', async () => {
    const reverse = vi.spyOn(settlementService, 'reverse').mockResolvedValue({
      operationId: 'operation-1',
      status: 'reversed',
      reversedAt: 1,
      reused: false,
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const invalidateHome = vi.fn().mockResolvedValue(undefined);

    await reverseSettlementOperation({
      operationId: 'operation-1',
      getExpectedBalance: async () => 12,
      refresh,
      invalidateHome,
    });

    expect(reverse).toHaveBeenCalledWith('operation-1', 12);
    expect(refresh).toHaveBeenCalledOnce();
    expect(invalidateHome).toHaveBeenCalledOnce();
    reverse.mockRestore();
  });

  it('does not call the reversal RPC when the balance is unavailable', async () => {
    const reverse = vi.spyOn(settlementService, 'reverse');
    const refresh = vi.fn().mockResolvedValue(undefined);
    const invalidateHome = vi.fn().mockResolvedValue(undefined);

    await expect(reverseSettlementOperation({
      operationId: 'operation-1',
      getExpectedBalance: () => undefined,
      refresh,
      invalidateHome,
    })).rejects.toMatchObject({
      code: 'transient',
      message: 'Refresh the Friend details and try again.',
    });

    expect(reverse).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(invalidateHome).not.toHaveBeenCalled();
    reverse.mockRestore();
  });
});
