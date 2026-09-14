import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));

import {
  formatCurrency,
  fromCents,
  getCurrencySymbol,
  getPreferredCurrency,
  normalizeBalance,
  setPreferredCurrency,
  subscribePreferredCurrency,
  toCents,
} from './currency';

describe('currency utilities', () => {
  beforeEach(async () => {
    store.clear();
    vi.clearAllMocks();
    await setPreferredCurrency('USD');
  });

  describe('getCurrencySymbol', () => {
    it('returns correct symbol for supported currencies', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('GBP')).toBe('£');
      expect(getCurrencySymbol('INR')).toBe('₹');
      expect(getCurrencySymbol('usd')).toBe('$');
    });

    it('falls back to currency code when unknown', () => {
      expect(getCurrencySymbol('EUR')).toBe('EUR');
    });

    it('defaults to preferred currency when no code is passed', async () => {
      await setPreferredCurrency('GBP');
      expect(getCurrencySymbol()).toBe('£');
      await setPreferredCurrency('INR');
      expect(getCurrencySymbol()).toBe('₹');
      await setPreferredCurrency('USD');
      expect(getCurrencySymbol()).toBe('$');
    });
  });

  describe('preferred currency subscriptions', () => {
    it('notifies subscribers when preferred currency changes and unrolls correctly', async () => {
      const updates: string[] = [];
      const unsubscribe = subscribePreferredCurrency((c) => updates.push(c));

      await setPreferredCurrency('INR');
      expect(getPreferredCurrency()).toBe('INR');
      expect(formatCurrency(20)).toBe('₹20.00');

      await setPreferredCurrency('GBP');
      expect(getPreferredCurrency()).toBe('GBP');
      expect(formatCurrency(20)).toBe('£20.00');

      unsubscribe();
      await setPreferredCurrency('USD');
      expect(getPreferredCurrency()).toBe('USD');
      expect(updates).toEqual(['INR', 'GBP']);
    });
  });

  describe('formatCurrency', () => {
    it('formats amount with currency symbol and 2 decimal places', () => {
      expect(formatCurrency(25.5, 'USD')).toBe('$25.50');
      expect(formatCurrency(0, 'USD')).toBe('$0.00');
      expect(formatCurrency(-12.345, 'GBP')).toBe('£-12.35');
    });

    it('formats with currency code fallback for unsupported currency', () => {
      expect(formatCurrency(10, 'EUR')).toBe('EUR 10.00');
    });
  });

  describe('toCents and fromCents', () => {
    it('converts dollars to integer cents', () => {
      expect(toCents(10.5)).toBe(1050);
      expect(toCents(0.01)).toBe(1);
      expect(toCents(0.004)).toBe(0);
      expect(toCents(0.006)).toBe(1);
      expect(toCents(-15.25)).toBe(-1525);
    });

    it('converts cents back to dollar amount', () => {
      expect(fromCents(1050)).toBe(10.5);
      expect(fromCents(1)).toBe(0.01);
      expect(fromCents(0)).toBe(0);
      expect(fromCents(-1525)).toBe(-15.25);
    });
  });

  describe('normalizeBalance', () => {
    it('normalizes sub-cent values to zero', () => {
      expect(normalizeBalance(0.004)).toBe(0);
      expect(normalizeBalance(-0.004)).toBe(0);
      expect(normalizeBalance(0.0000001)).toBe(0);
      expect(normalizeBalance(-0)).toBe(0);
      expect(normalizeBalance(0)).toBe(0);
    });

    it('preserves and rounds valid amounts to 2 decimal places', () => {
      expect(normalizeBalance(10.501)).toBe(10.5);
      expect(normalizeBalance(10.509)).toBe(10.51);
      expect(normalizeBalance(-42.126)).toBe(-42.13);
      expect(normalizeBalance(0.01)).toBe(0.01);
      expect(normalizeBalance(-0.01)).toBe(-0.01);
    });
  });
});
