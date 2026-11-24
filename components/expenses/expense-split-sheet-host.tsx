import { router } from 'expo-router';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type SplitSheet = {
  open: (content: ReactNode, expanded: boolean) => void;
  content: ReactNode;
  clear: () => void;
};

const SplitSheetContext = createContext<SplitSheet | null>(null);

export function ExpenseSplitSheetHost({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const clear = useCallback(() => setContent(null), []);

  return (
    <SplitSheetContext.Provider value={{
      content,
      clear,
      open: (next, expanded) => {
        setContent(next);
        router.push({ pathname: '/expense-split', params: { expanded: expanded ? '1' : '0' } });
      },
    }}>
      {children}
    </SplitSheetContext.Provider>
  );
}

export function useExpenseSplitSheet() {
  const sheet = useContext(SplitSheetContext);
  if (!sheet) throw new Error('Expense split sheet requires its host');
  return sheet;
}
