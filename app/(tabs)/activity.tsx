import { ActivityCard } from '@/components/activity/activity-card';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { getDeletedExpenseTargetIds } from '@/lib/activity-link';
import { activityService } from '@/services/activity-service';
import { initDatabase } from '@/services/api';
import { queryKeys } from '@/services/query-keys';
import type { Activity } from '@/types/database';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

function getTimePeriod(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && date.toDateString() === now.toDateString()) return 'Today';
  if (diffDays === 1 || (diffDays === 0 && date.toDateString() !== now.toDateString())) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Earlier';
}

export default function ActivityScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const PAGE_SIZE = 20;

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const activityQueryKey = useMemo(() => queryKeys.activity.list(currentUserId), [currentUserId]);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: activityQueryKey,
    enabled: !!currentUserId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      await initDatabase();
      return activityService.getUserActivities(currentUserId, PAGE_SIZE, pageParam);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((count, page) => count + page.length, 0);
    },
  });
  const activities = useMemo(() => data?.pages.flat() ?? [], [data]);
  const deletedExpenseTargetIds = useMemo(() => getDeletedExpenseTargetIds(activities), [activities]);
  const loading = isLoading && activities.length === 0;
  const loadError = isError ? getFetchErrorMessage(error) : null;

  useEffect(() => {
    if (!loading && !isFetchingNextPage) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fadeAnim, loading, isFetchingNextPage, slideAnim]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleLoadMore = () => {
    if (!loading && !isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const renderActivityItem = useCallback(
    ({ item }: { item: Activity }) => (
      <ActivityCard
        activity={item}
        currentUserId={currentUserId}
        deletedExpenseTargetIds={deletedExpenseTargetIds}
      />
    ),
    [currentUserId, deletedExpenseTargetIds]
  );

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <LoadingState message="Loading more..." />
      </View>
    );
  };

  const groupedActivities = useMemo(
    () => activities.reduce((acc, activity) => {
      const period = getTimePeriod(activity.createdAt);
      const existing = acc.find((g: { title: string }) => g.title === period);
      if (existing) {
        existing.data.push(activity);
      } else {
        acc.push({ title: period, data: [activity] });
      }
      return acc;
    }, [] as { title: string; data: Activity[] }[]),
    [activities]
  );

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={[styles.headerLabel, { color: colors.textSecondary }]}>Recent</ThemedText>
        <ThemedText type="header" style={[styles.headerTitle, { color: colors.text }]}>Activity</ThemedText>
      </View>

      {loading ? (
        <LoadingState message="Loading activity..." />
      ) : loadError ? (
        <AsyncErrorState
          message={loadError}
          onRetry={refetch}
          title="Couldn't load activity"
        />
      ) : activities.length === 0 ? (
        <Animated.View style={[
          styles.emptyContainer,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={48} name="clock" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, { color: colors.text }]}>
            No activity yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            Your expense and payment history will appear here
          </ThemedText>
        </Animated.View>
      ) : (
        <SectionList
          sections={groupedActivities}
          renderItem={renderActivityItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {title}
              </ThemedText>
            </View>
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
              titleColor={colors.textSecondary}
              colors={[colors.tint]}
              progressBackgroundColor={colors.background}
            />
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'column',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    gap: 4,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
