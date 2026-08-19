import { ActivityCard } from '@/components/activity/activity-card';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ActivityListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getDeletedExpenseTargetIds } from '@/lib/activity-link';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { queryKeys } from '@/services/query-keys';
import type { Activity } from '@/types/database';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, RefreshControl, SectionList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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
  const { gradients, colors, friendDetail: friendDetailTheme, isDark } = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const PAGE_SIZE = 20;

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const activityQueryKey = useMemo(
    () => queryKeys.activity.list(currentUserId, activitySearch),
    [activitySearch, currentUserId]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => setActivitySearch(searchQuery.trim()), 250);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isStale,
    refetch,
  } = useInfiniteQuery({
    queryKey: activityQueryKey,
    enabled: !!currentUserId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      return activityService.getUserActivities(currentUserId, PAGE_SIZE, pageParam, activitySearch);
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
  const hasSearch = activitySearch.length > 0;

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

  useRefetchOnFocus({
    enabled: !!currentUserId,
    isFetching,
    isStale,
    refetch,
  });

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
      <View style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
        <Skeleton height={50} borderRadius={10} />
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
    <View
      style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <ThemedText type="header" style={[styles.headerTitle, { color: isDark ? '#f8fafc' : colors.text }]}>Activity</ThemedText>
        <View style={[styles.searchContainer, {
          backgroundColor: colors.card,
          borderWidth: isDark ? 1 : 0,
          borderColor: colors.border,
          shadowColor: isDark ? 'transparent' : '#64748B',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.04,
          shadowRadius: 6,
          elevation: isDark ? 0 : 2,
        }]}>
          <IconSymbol
            name="magnifyingglass"
            size={17}
            color={isDark ? '#10b981' : friendDetailTheme.actionIcon}
          />
          <TextInput
            accessibilityLabel="Search activities"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchQuery}
            placeholder="Search activities, groups, or people"
            placeholderTextColor={isDark ? '#9ba6b8' : colors.textSecondary}
            returnKeyType="search"
            style={[styles.searchInput, { color: isDark ? '#f8fafc' : colors.text }]}
            value={searchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              accessibilityLabel="Clear activity search"
              hitSlop={8}
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchButton}>
              <IconSymbol
                name="xmark.circle.fill"
                size={18}
                color={isDark ? '#9ba6b8' : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityListSkeleton />
      ) : loadError ? (
        <AsyncErrorState
          message={loadError}
          onRetry={refetch}
          title="Couldn't load activity"
        />
      ) : activities.length === 0 ? (
        <Animated.View style={[
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }], flex: 1 }
        ]}>
          <EmptyState
            icon={hasSearch ? 'magnifyingglass' : 'clock'}
            title={hasSearch ? 'No matching activity' : 'No activity yet'}
            subtitle={hasSearch ? `No activities match “${activitySearch}”.` : 'Your expense and payment history will appear here'}
          />
        </Animated.View>
      ) : (
        <SectionList
          sections={groupedActivities}
          renderItem={renderActivityItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: isDark ? '#64748b' : colors.textSecondary }]}>
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
              tintColor={isDark ? '#10b981' : colors.tint}
              titleColor={isDark ? '#9ba6b8' : colors.textSecondary}
              colors={[isDark ? '#10b981' : colors.tint]}
              progressBackgroundColor={colors.background}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 6,
    gap: 4,
  },
  headerTitle: {
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    padding: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 120,
  },
  sectionHeader: {
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 4,
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
});
