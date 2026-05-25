import { Colors, ExpenseDetailTheme, Gradients } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';

export function useThemeColors() {
  const { colorScheme, isDark } = useTheme();
  const colors = Colors[colorScheme];
  const gradients = Gradients[colorScheme];
  const expenseDetail = ExpenseDetailTheme[colorScheme];

  return {
    colors,
    gradients,
    expenseDetail,
    colorScheme,
    isDark,
  };
}
