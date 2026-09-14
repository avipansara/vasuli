import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CurrencyCode,
  getPreferredCurrency,
  hydratePreferredCurrency,
  setPreferredCurrency,
  formatCurrency as formatCurrencyUtil,
  getCurrencySymbol,
  subscribePreferredCurrency,
} from '@/utils/currency';

interface CurrencyContextType {
  currency: CurrencyCode;
  currencySymbol: string;
  changeCurrency: (currency: CurrencyCode) => Promise<void>;
  formatCurrency: (amount: number, currencyCode?: string) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => getPreferredCurrency());

  useEffect(() => {
    const unsubscribe = subscribePreferredCurrency((newCurrency) => {
      setCurrencyState(newCurrency);
    });

    hydratePreferredCurrency().then((persisted) => {
      setCurrencyState(persisted);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const changeCurrency = async (newCurrency: CurrencyCode) => {
    await setPreferredCurrency(newCurrency);
    setCurrencyState(newCurrency);
    try {
      await queryClient.invalidateQueries();
    } catch (error) {
      console.warn('Failed to invalidate queries after currency change:', error);
    }
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

export function useCurrency(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    const fallbackCurrency = getPreferredCurrency();
    return {
      currency: fallbackCurrency,
      currencySymbol: getCurrencySymbol(fallbackCurrency),
      changeCurrency: setPreferredCurrency,
      formatCurrency: (amount: number, currencyCode?: string) =>
        formatCurrencyUtil(amount, currencyCode || fallbackCurrency),
    };
  }
  return context;
}
