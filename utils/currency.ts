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

export async function setPreferredCurrency(currency: CurrencyCode): Promise<void> {
  currentPreferredCurrency = currency;
  await AsyncStorage.setItem(STORAGE_KEY, currency);
}

export function getCurrencySymbol(currencyCode: string = 'USD'): string {
  const code = (currencyCode || 'USD').toUpperCase() as CurrencyCode;
  return CURRENCY_SYMBOLS[code] || '$';
}

export function formatCurrency(amount: number, currencyCode: string = 'USD'): string {
  const preferred = getPreferredCurrency();
  const symbol = CURRENCY_SYMBOLS[preferred] || '$';
  return `${symbol}${amount.toFixed(2)}`;
}
