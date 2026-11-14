import { describe, expect, it, vi } from 'vitest';
import { filterQueuedExpenseTokens } from './legacy';

const config = { supabaseUrl: 'https://db.example', serviceRoleKey: 'key' };
const notification = { type: 'expense_added' as const, title: 'Expense', body: 'Dinner', data: { expenseId: 'expense-1' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('legacy expense notifications', () => {
  it('only removes recipients already covered by the server queue', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(['queued']));
    expect(await filterQueuedExpenseTokens(['queued', 'other'], notification, config, fetcher)).toEqual(['other']);
  });
  it('continues sending before the migration exists', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'PGRST202' }, 404));
    expect(await filterQueuedExpenseTokens(['old'], notification, config, fetcher)).toEqual(['old']);
  });
  it('does not silently send duplicates when the database check fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'other' }, 500));
    await expect(filterQueuedExpenseTokens(['old'], notification, config, fetcher)).rejects.toThrow();
  });
  it('leaves other notifications alone', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await filterQueuedExpenseTokens(['old'], { ...notification, type: 'invitation_sent' }, config, fetcher)).toEqual(['old']);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
