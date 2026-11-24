import { useExpenseSplitSheet } from '@/components/expenses/expense-split-sheet-host';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

export default function ExpenseSplitRoute() {
  const { content, clear } = useExpenseSplitSheet();
  useEffect(() => clear, [clear]);
  return content ?? <Redirect href="/(tabs)" />;
}
