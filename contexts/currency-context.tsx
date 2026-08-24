import React, { createContext, useContext, useEffect, useState } from 'react';
import { CurrencyCode, getPreferredCurrency, hydratePreferredCurrency, setPreferredCurrency, formatCurrency as formatCurrencyUtil, getCurrencySymbol } from '@/utils/currency';

interface CurrencyContextType {
  currency: CurrencyCode;
  currencySymbol: string;
  changeCurrency: (currency: CurrencyCode) => Promise<void>;
  formatCurrency: (amount: number, currencyCode?: string) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>('USD');

  useEffect(() => {
    let active = true;
    async function load() {
      const persisted = await hydratePreferredCurrency();
      if (active) {
        setCurrencyState(persisted);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const changeCurrency = async (newCurrency: CurrencyCode) => {
    await setPreferredCurrency(newCurrency);
    setCurrencyState(newCurrency);
  };

  const currencySymbol = getCurrencySymbol(currency);

  const formatCurrency = (amount: number, currencyCode?: string) => {
    return formatCurrencyUtil(amount, currencyCode || currency);
  };

  return (
    <CurrencyContext.Provider value={{ currency, currencySymbol, changeCurrency, formatCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
