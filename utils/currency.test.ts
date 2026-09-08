import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  fromCents,
  getCurrencySymbol,
  normalizeBalance,
  toCents,
} from './currency';

describe('currency utilities', () => {
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
