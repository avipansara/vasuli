import AsyncStorage from '@react-native-async-storage/async-storage';

export type CurrencyCode = 'USD' | 'GBP' | 'INR';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  GBP: '£',
  INR: '₹',
};

const STORAGE_KEY = 'vasuli:preferred-currency';

let currentPreferredCurrency: CurrencyCode = 'USD';

type CurrencyListener = (currency: CurrencyCode) => void;
const listeners = new Set<CurrencyListener>();

function notifyListeners(currency: CurrencyCode): void {
  for (const listener of listeners) {
    try {
      listener(currency);
    } catch (error) {
      console.error('Error in currency listener:', error);
    }
  }
}

export function subscribePreferredCurrency(listener: CurrencyListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

AsyncStorage.getItem(STORAGE_KEY).then(val => {
  if (val === 'USD' || val === 'GBP' || val === 'INR') {
    if (currentPreferredCurrency !== val) {
      currentPreferredCurrency = val;
      notifyListeners(val);
    }
  }
}).catch(() => {});

export function getPreferredCurrency(): CurrencyCode {
  return currentPreferredCurrency;
}

export async function hydratePreferredCurrency(): Promise<CurrencyCode> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    if (val === 'USD' || val === 'GBP' || val === 'INR') {
      const changed = currentPreferredCurrency !== val;
      currentPreferredCurrency = val;
      if (changed) {
        notifyListeners(val);
      }
    }
  } catch (error) {
    console.warn('Failed to hydrate preferred currency:', error);
  }
  return currentPreferredCurrency;
}

export async function setPreferredCurrency(currency: CurrencyCode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, currency);
  currentPreferredCurrency = currency;
  notifyListeners(currency);
}

export function getCurrencySymbol(currencyCode?: string): string {
  const code = (currencyCode || getPreferredCurrency()).toUpperCase() as CurrencyCode;
  return CURRENCY_SYMBOLS[code] || code;
}

export function formatCurrency(amount: number, currencyCode?: string): string {
  const code = (currencyCode || getPreferredCurrency()).toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code as CurrencyCode];
  return symbol ? `${symbol}${amount.toFixed(2)}` : `${code} ${amount.toFixed(2)}`;
}

/**
 * Converts a dollar/currency amount to integer cents (or minor currency units).
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converts integer cents back to dollar/currency amount.
 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Normalizes balance floats to avoid sub-cent drift (-0.00 or floating precision errors).
 * Any absolute value strictly less than 0.01 is normalized to 0.
 */
export function normalizeBalance(amount: number): number {
  return Math.abs(amount) < 0.01 ? 0 : Number(amount.toFixed(2));
}

