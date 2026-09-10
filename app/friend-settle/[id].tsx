import { ThemedText } from '@/components/themed-text';
import { FriendSettlementConfirmation } from '@/components/settlements/friend-settlement-confirmation';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useAnalytics } from '@/contexts/analytics-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { friendDetailModule } from '@/services/friend-detail-module';
import { createPaymentIntentId, settlementModule } from '@/services/settlement-service';
import { trackSettlementCancelled, trackSettlementCreated, trackSettlementCreationFailed, trackSettlementStarted } from '@/lib/analytics/track';
import type { FriendRelationshipProjection } from '@/services/friend-detail-service';
import type { User } from '@/types/database';
import { formatCurrency } from '@/utils/currency';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, type MutableRefObject, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserWithBalance extends User {
  balance: number;
}

export default function FriendSettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { service: analytics } = useAnalytics();
  const { colors } = useThemeColors();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();

  const [friend, setFriend] = useState<UserWithBalance | null>(null);
  const [relationship, setRelationship] = useState<FriendRelationshipProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const paymentIntentIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      setLoading(true);

      const data = await friendDetailModule.getDetail(currentUserId, id);
      if (!data || !data.friend) {
        Alert.alert('Error', 'Friend not found');
        router.back();
        return;
      }
      setFriend(data.friend);
      const nextRelationship = data.relationship ?? null;
      setRelationship(nextRelationship);
      // A new balance snapshot starts a new payment intent; retries of the
      // same snapshot keep the original intent (see handleCommit).
      paymentIntentIdRef.current = null;
    } catch (error) {
      console.error('Error loading friend data:', error);
      setLoadError(getFetchErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // One `settlement started` per form attempt (mount) once actionable.
  // Friend settlements carry no group context.
  const settlementStartedRef = useRef(false);
  useEffect(() => {
    if (loading || loadError || settlementStartedRef.current) return;
    settlementStartedRef.current = true;
    trackSettlementStarted(analytics, {});
  }, [analytics, loading, loadError]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />
        <View style={styles.skeletonContainer}>
          <Skeleton height={60} borderRadius={24} style={{ marginBottom: 16 }} />
          <Skeleton height={120} borderRadius={24} style={{ marginBottom: 16 }} />
          <Skeleton height={48} borderRadius={12} style={{ marginBottom: 16 }} />
        </View>
      </View>
    );
  }

  if (loadError || !friend) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />
        <AsyncErrorState
          message={loadError || 'Unable to load friend details'}
          onRetry={loadData}
          title="Loading failed"
        />
      </View>
    );
  }

  return (
    <FriendSettleContent
      friend={friend}
      relationship={relationship}
      currentUserId={currentUserId}
      currentUser={user!}
      paymentIntentIdRef={paymentIntentIdRef}
      queryClient={queryClient}
      onRefresh={loadData}
      bottomInset={Math.max(insets.bottom, 16)}
    />
  );
}

function FriendSettleContent({
  friend,
  relationship,
  currentUserId,
  currentUser,
  paymentIntentIdRef,
  queryClient,
  onRefresh,
  bottomInset,
}: {
  friend: UserWithBalance;
  relationship: FriendRelationshipProjection | null;
  currentUserId: string;
  currentUser: User;
  paymentIntentIdRef: MutableRefObject<string | null>;
  queryClient: {
    invalidateQueries(options: { queryKey: readonly unknown[] }): Promise<unknown>;
    setQueryData<T>(queryKey: readonly unknown[], updater: (current: T | undefined) => T): void;
  };
  onRefresh: () => void;
  bottomInset: number;
}) {
  const { settle, isDark } = useThemeColors();
  const { service: analytics } = useAnalytics();

  const settlementCurrency = relationship?.settleableTotal?.currency ?? relationship?.zeroNetCurrency;

  const netAmount = relationship?.settleableTotal?.amount ?? 0;
  const handleCommit = async (amount: number) => {
    if (!relationship || !settlementCurrency) {
      throw new Error('Choose one currency with an outstanding balance before settling.');
    }
    const paymentIntentId = paymentIntentIdRef.current ?? createPaymentIntentId();
    paymentIntentIdRef.current = paymentIntentId;
    try {
      const receipt = await settlementModule.commit({
        currentUserId,
        friendId: friend.id,
        paymentIntentId,
        currency: settlementCurrency,
        amount,
        directBalance: relationship.directBalance,
        groupBalances: relationship.groupBalances,
        date: Date.now(),
        expectedBalance: netAmount,
        friend,
        currentUser,
        queryClient,
      });
      paymentIntentIdRef.current = null;
      trackSettlementCreated(analytics, { currency: receipt.currency ?? settlementCurrency });
      if (!receipt.reused && (receipt.cancellations?.length ?? 0) > 0) {
        trackSettlementCancelled(analytics, { currency: receipt.currency ?? settlementCurrency });
      }
      return {
        totalAmount: receipt.totalAmount,
        currency: receipt.currency,
        reused: receipt.reused,
      };
    } catch (error) {
      trackSettlementCreationFailed(analytics, { currency: settlementCurrency, error });
      console.error('[Settlement][friend-screen] settlement commit failed', {
        friendId: friend.id,
        currency: settlementCurrency,
        amount,
        expectedBalance: netAmount,
        error: error instanceof Error ? { name: error.name, message: error.message } : error,
      });
      throw error;
    }
  };

  const handleDone = () => {
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: settle.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <View style={[styles.profileCard, {
          backgroundColor: settle.cardBackground,
          borderColor: settle.cardBorder,
          borderWidth: 1,
          shadowColor: '#000000',
          shadowOpacity: isDark ? 0.32 : 0.12,
          elevation: 5,
        }]}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: settle.avatarSelectedBackground }]}>
              <Text style={[styles.avatarText, { color: settle.avatarText }]}>
                {friend.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileTextContainer}>
              <ThemedText style={[styles.profileName, { color: settle.textPrimary }]}>
                {friend.name}
              </ThemedText>
              <ThemedText style={[styles.profileEmail, { color: settle.textSecondary }]}>
                {friend.email || `${friend.name.toLowerCase().replace(/\s+/g, '.')}@vasuli.app`}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: settle.cardBorder }]} />
          <View
            testID="friend-settlement-relationship-summary"
            accessibilityRole="summary"
            accessibilityLabel={`Combined relationship summary, ${formatCurrency(Math.abs(netAmount), settlementCurrency)}`}
            style={styles.balanceRow}
          >
            <ThemedText
              numberOfLines={2}
              style={[styles.balanceLabelText, { color: settle.textSecondary }]}
            >
              Combined relationship summary
            </ThemedText>
            <ThemedText
              numberOfLines={1}
              style={[styles.balanceValueText, { color: settle.accentText }]}
            >
              {formatCurrency(Math.abs(netAmount), settlementCurrency)}
            </ThemedText>
          </View>
        </View>

        {!settlementCurrency ? (
          <ThemedText style={[styles.helperText, { color: settle.textSecondary }]}>
            This relationship has balances in multiple currencies. Open the Friend detail page and choose one currency to settle.
          </ThemedText>
        ) : (
          <FriendSettlementConfirmation
            key={`${friend.id}:${netAmount}:${relationship?.directBalance ?? 0}:${relationship?.groupBalances.map(group => `${group.groupId}:${group.amount}`).join('|') ?? ''}`}
            friendName={friend.name}
            currentUserId={currentUserId}
            friendId={friend.id}
            netAmount={netAmount}
            currency={settlementCurrency}
            directBalance={relationship?.directBalance ?? 0}
            groupBalances={relationship?.groupBalances ?? []}
            onCommit={handleCommit}
            onRefresh={onRefresh}
            onDone={handleDone}
            onCancel={() => router.back()}
            bottomInset={bottomInset}
          />
        )}
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skeletonContainer: {
    padding: 20,
    gap: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  profileCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  profileTextContainer: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 14,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabelText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    marginRight: 12,
  },
  balanceValueText: {
    flexShrink: 0,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
