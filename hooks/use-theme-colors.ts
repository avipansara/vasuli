import { Colors, ExpenseDetailTheme, FriendDetailTheme, FriendsTheme, Gradients } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';

export function useThemeColors() {
  const { colorScheme, isDark } = useTheme();
  const colors = Colors[colorScheme];
  const gradients = Gradients[colorScheme];
  const expenseDetail = ExpenseDetailTheme[colorScheme];
  const friends = FriendsTheme[colorScheme];
  const friendDetail = FriendDetailTheme[colorScheme];

  return {
    colors,
    gradients,
    expenseDetail,
    friends,
    friendDetail,
    colorScheme,
    isDark,
  };
}
