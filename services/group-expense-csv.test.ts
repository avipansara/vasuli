import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupDetailReadModel } from './group-detail-read-model';
import { createGroupExpenseCsv, exportGroupExpensesCsv } from './group-expense-csv';

const nativeMocks = vi.hoisted(() => ({
  file: {
    write: vi.fn(),
    delete: vi.fn(),
  },
  cache: { uri: 'file:///cache' },
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
  events: [] as string[],
}));

vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    exists = true;

    constructor(directory: { uri: string }, name: string) {
      this.uri = `${directory.uri}/${name}`;
    }

    write(content: string) {
      return nativeMocks.file.write(content);
    }

    delete() {
      return nativeMocks.file.delete();
    }
  },
  Paths: { cache: nativeMocks.cache },
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: nativeMocks.isAvailableAsync,
  shareAsync: nativeMocks.shareAsync,
}));

function detail(overrides: Partial<GroupDetailReadModel> = {}): GroupDetailReadModel {
  return {
    group: { id: 'group-1', name: 'Trip / Miami', createdAt: 0, updatedAt: 0 },
    expenses: [],
    members: [
      { id: 'member-a', groupId: 'group-1', userId: 'user-a', role: 'admin', joinedAt: 0, user: { id: 'user-a', name: 'Alex', isActive: true, createdAt: 0 } },
      { id: 'member-b', groupId: 'group-1', userId: 'user-b', role: 'member', joinedAt: 0, user: { id: 'user-b', name: 'Blair', isActive: true, createdAt: 0 } },
    ],
    balances: new Map(),
    availableUsers: [],
    friendshipStatus: new Map(),
    settlements: [],
    scopeTransfers: [],
    cancellations: [],
    ...overrides,
  };
}

describe('exportGroupExpensesCsv on native', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    nativeMocks.events.length = 0;
    nativeMocks.file.write.mockImplementation(async () => {
      nativeMocks.events.push('write-start');
      await Promise.resolve();
      nativeMocks.events.push('write-end');
    });
    nativeMocks.file.delete.mockImplementation(() => {
      nativeMocks.events.push('delete');
    });
    nativeMocks.isAvailableAsync.mockResolvedValue(true);
    vi.stubEnv('EXPO_OS', 'ios');
  });

  it.each([
    { result: 'successful', shareFails: false },
    { result: 'failed', shareFails: true },
  ])('awaits writing and cleans up after a $result share', async ({ shareFails }) => {
    nativeMocks.shareAsync.mockImplementation(async () => {
      nativeMocks.events.push('share');
      if (shareFails) throw new Error('Share was dismissed');
    });

    const exportPromise = exportGroupExpensesCsv(detail(), new Date(Date.UTC(2026, 7, 15)));
    if (shareFails) {
      await expect(exportPromise).rejects.toThrow('Share was dismissed');
    } else {
      await exportPromise;
    }

    expect(nativeMocks.file.write).toHaveBeenCalledWith(expect.stringContaining('\uFEFFExpense ID'));
    expect(nativeMocks.events).toEqual(['write-start', 'write-end', 'share', 'delete']);
    expect(nativeMocks.shareAsync).toHaveBeenCalledWith(
      'file:///cache/Trip - Miami-expenses-2026-08-15.csv',
      {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Export group expenses',
      },
    );
  });

  it('does no file work when sharing is unavailable', async () => {
    nativeMocks.isAvailableAsync.mockResolvedValue(false);

    await expect(exportGroupExpensesCsv(detail())).rejects.toThrow('File sharing is unavailable on this device.');

    expect(nativeMocks.file.write).not.toHaveBeenCalled();
    expect(nativeMocks.file.delete).not.toHaveBeenCalled();
    expect(nativeMocks.shareAsync).not.toHaveBeenCalled();
    expect(nativeMocks.events).toEqual([]);
  });
});

describe('createGroupExpenseCsv', () => {
  it('creates a spreadsheet-friendly flat expense ledger', () => {
    const result = createGroupExpenseCsv(detail({
      expenses: [{
        id: 'expense-1',
        groupId: 'group-1',
        description: 'Dinner, "best" night',
        amount: 60,
        currency: 'USD',
        paidBy: 'user-a',
        category: 'Food',
        notes: 'Split\nthree ways',
        date: Date.UTC(2026, 7, 15),
        effectiveDate: '2026-08-16',
        createdAt: Date.UTC(2026, 7, 15),
        updatedAt: Date.UTC(2026, 7, 16),
        paidByUser: { id: 'user-a', name: 'Alex', isActive: true, createdAt: 0 },
        splits: [
          { id: 'split-a', expenseId: 'expense-1', userId: 'user-a', amount: 30, splitType: 'equal', user: { id: 'user-a', name: 'Alex', isActive: true, createdAt: 0 } },
          { id: 'split-b', expenseId: 'expense-1', userId: 'user-b', amount: 30, splitType: 'equal', user: { id: 'user-b', name: 'Blair', isActive: true, createdAt: 0 } },
        ],
      }],
    }), new Date(Date.UTC(2026, 7, 15)));

    expect(result.fileName).toBe('Trip - Miami-expenses-2026-08-15.csv');
    expect(result.content).toContain('\uFEFFExpense ID,Date,Description,Amount,Currency');
    expect(result.content).toContain('expense-1,2026-08-16,"Dinner, ""best"" night",60.00,USD,Alex,Food,"Split\nthree ways",2026-08-15,2026-08-16,Alex: 30.00 USD; Blair: 30.00 USD');
  });

  it('handles missing optional data and unresolved users', () => {
    const result = createGroupExpenseCsv(detail({
      expenses: [{
        id: 'expense-2',
        description: 'Taxi',
        amount: 12.5,
        currency: 'EUR',
        paidBy: 'user-missing',
        date: Date.UTC(2026, 0, 2),
        createdAt: Date.UTC(2026, 0, 2),
        updatedAt: Date.UTC(2026, 0, 2),
        splits: [{ id: 'split-c', expenseId: 'expense-2', userId: 'user-missing', amount: 12.5, splitType: 'exact' }],
      }],
    }));

    expect(result.content).toContain('expense-2,2026-01-02,Taxi,12.50,EUR,Unknown,,,2026-01-02,2026-01-02,Unknown: 12.50 EUR');
  });
});
