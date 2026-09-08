import { Colors, ExpenseDetailTheme, FriendDetailTheme, FriendsTheme, Gradients, InvitationsTheme, SettleTheme } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';

export function useThemeColors() {
  const { colorScheme, isDark } = useTheme();
  const colors = Colors[colorScheme];
  const gradients = Gradients[colorScheme];
  const expenseDetail = ExpenseDetailTheme[colorScheme];
  const friends = FriendsTheme[colorScheme];
  const friendDetail = FriendDetailTheme[colorScheme];
  const invitations = InvitationsTheme[colorScheme];
  const settle = SettleTheme[colorScheme];

  return {
    colors,
    gradients,
    expenseDetail,
    friends,
    friendDetail,
    invitations,
    settle,
    colorScheme,
    isDark,
  };
}
