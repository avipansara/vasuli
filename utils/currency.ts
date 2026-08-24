import AsyncStorage from '@react-native-async-storage/async-storage';

export type CurrencyCode = 'USD' | 'GBP' | 'INR';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  GBP: '£',
  INR: '₹',
};

const STORAGE_KEY = 'vasuli:preferred-currency';

let currentPreferredCurrency: CurrencyCode = 'USD';

AsyncStorage.getItem(STORAGE_KEY).then(val => {
  if (val === 'USD' || val === 'GBP' || val === 'INR') {
    currentPreferredCurrency = val;
  }
}).catch(() => {});

export function getPreferredCurrency(): CurrencyCode {
  return currentPreferredCurrency;
}

export async function hydratePreferredCurrency(): Promise<CurrencyCode> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    if (val === 'USD' || val === 'GBP' || val === 'INR') {
      currentPreferredCurrency = val;
    }
  } catch (error) {
    console.warn('Failed to hydrate preferred currency:', error);
  }
  return currentPreferredCurrency;
}

export async function setPreferredCurrency(currency: CurrencyCode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, currency);
  currentPreferredCurrency = currency;
}

export const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1.0,
  GBP: 0.77,
  INR: 83.33,
};

export function convertCurrency(amount: number, from: string, to: string): number {
  const fromCode = (from || 'USD').toUpperCase() as CurrencyCode;
  const toCode = (to || 'USD').toUpperCase() as CurrencyCode;

  const rateFrom = EXCHANGE_RATES[fromCode] || 1.0;
  const rateTo = EXCHANGE_RATES[toCode] || 1.0;

  if (fromCode === toCode) return amount;

  const amountInUSD = amount / rateFrom;
  return amountInUSD * rateTo;
}

export function getCurrencySymbol(currencyCode: string = 'USD'): string {
  const code = (currencyCode || 'USD').toUpperCase() as CurrencyCode;
  return CURRENCY_SYMBOLS[code] || code;
}

export function formatCurrency(amount: number, currencyCode?: string): string {
  const code = (currencyCode || getPreferredCurrency()).toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code as CurrencyCode];
  return symbol ? `${symbol}${amount.toFixed(2)}` : `${code} ${amount.toFixed(2)}`;
}
