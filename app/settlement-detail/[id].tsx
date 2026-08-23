import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { SettlementDetailSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { settlementService } from '@/services/settlement-service';
import { userService } from '@/services/user-service';
import { queryKeys } from '@/services/query-keys';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View, ActivityIndicator } from 'react-native';
import { useCurrency } from '@/contexts/currency-context';

export default function SettlementDetailScreen() {
  const { colors, settle, isDark } = useThemeColors();
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const queryKey = useMemo(() => queryKeys.settlements.detail(id), [id]);
  const {
    data,
    error,
    isFetching,
    isLoading,
    isStale,
    refetch,
  } = useQuery({
    queryKey,
    enabled: !!id,
    queryFn: async () => {
      const settlement = await settlementService.getById(id);
      if (!settlement) return null;

      const [fromUser, toUser] = await Promise.all([
        userService.getById(settlement.fromUserId),
        userService.getById(settlement.toUserId),
      ]);

      return {
        settlement,
        fromUser,
        toUser,
      };
    },
  });

  useRefetchOnFocus({
    isFetching,
    isStale,
    refetch,
  });

  if (isLoading && !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Settlement" onBack={() => router.back()} />
        <SettlementDetailSkeleton />
      </View>
    );
  }

  if (error || (isStale && !isFetching && !data)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Settlement" onBack={() => router.back()} />
        <View style={styles.centerContainer}>
          <AsyncErrorState
            title="Unable to load settlement"
            message={getFetchErrorMessage(error) || 'This settlement may have been deleted.'}
            onRetry={refetch}
          />
        </View>
      </View>
    );
  }

  if (!data || !data.settlement) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Settlement" onBack={() => router.back()} />
        <View style={styles.centerContainer}>
          <IconSymbol name="slash.circle" size={48} color={colors.icon} />
          <ThemedText style={[styles.notFoundText, { color: colors.textSecondary }]}>
            Settlement not found
          </ThemedText>
        </View>
      </View>
    );
  }

  const { settlement, fromUser, toUser } = data;
  const isCurrentUserPayer = settlement.fromUserId === user?.id;
  const isCurrentUserPayee = settlement.toUserId === user?.id;

  const payerName = isCurrentUserPayer ? 'You' : (fromUser?.name || 'Someone');
  const payeeName = isCurrentUserPayee ? 'you' : (toUser?.name || 'someone');

  const formattedDate = new Date(settlement.date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavigationHeader title="Settlement" onBack={() => router.back()} />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconContainer, { backgroundColor: settle.selectedCardBackground }]}>
            <IconSymbol name="checkmark.circle.fill" size={32} color={settle.buttonBackground} />
          </View>
          
          <ThemedText style={[styles.amountText, { color: colors.text }]}>
            {formatCurrency(settlement.amount, settlement.currency)}
          </ThemedText>

          <ThemedText style={[styles.descriptionText, { color: colors.text }]}>
            <ThemedText style={{ fontWeight: '600' }}>{payerName}</ThemedText> paid <ThemedText style={{ fontWeight: '600' }}>{payeeName}</ThemedText>
          </ThemedText>
          
          <ThemedText style={[styles.dateText, { color: colors.textSecondary }]}>
            {formattedDate}
          </ThemedText>

          {settlement.notes ? (
            <View style={[styles.notesContainer, { backgroundColor: settle.avatarUnselectedBackground }]}>
              <ThemedText style={[styles.notesLabel, { color: colors.textSecondary }]}>Notes</ThemedText>
              <ThemedText style={[styles.notesText, { color: colors.text }]}>{settlement.notes}</ThemedText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountText: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 48,
    paddingTop: 8,
  },
  descriptionText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 15,
    marginBottom: 24,
  },
  notesContainer: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 15,
  },
  notFoundText: {
    marginTop: 16,
    fontSize: 16,
  }
});
