import { useThemeColors } from '@/hooks/use-theme-colors';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle, type DimensionValue } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 4, style }: SkeletonProps) {
  const { isDark } = useThemeColors();
  const [pulseAnim] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const skeletonBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: skeletonBg,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

/**
 * Skeleton Loader matching index.tsx / FriendCard layout
 */
export function FriendsListSkeleton() {
  const { friends: friendsTheme } = useThemeColors();

  return (
    <View style={styles.container}>
      {/* Friends list skeleton items */}
      {Array.from({ length: 5 }).map((_, itemIndex) => (
        <View
          key={itemIndex}
          style={[
            styles.card,
            { backgroundColor: friendsTheme.cardSurface, borderColor: friendsTheme.cardBorder },
          ]}>
          <View style={styles.topSection}>
            <Skeleton width={44} height={44} borderRadius={14} style={{ marginRight: 12 }} />
            <View style={styles.headerInfoContainer}>
              <View style={styles.mainInfo}>
                <Skeleton width={110} height={16} style={{ marginBottom: 6 }} />
                <Skeleton width={150} height={12} />
              </View>
              <View style={styles.balanceContainer}>
                <Skeleton width={70} height={16} style={{ marginBottom: 6 }} />
                <Skeleton width={50} height={12} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton Loader matching groups.tsx / GroupCard layout
 */
export function GroupsListSkeleton() {
  const { colors, isDark } = useThemeColors();
  const cardBorderColor = isDark ? 'rgba(45, 212, 191, 0.14)' : colors.border;

  return (
    <View style={styles.container}>
      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card,
              borderColor: cardBorderColor,
              paddingVertical: 16,
            },
          ]}>
          <View style={styles.topSection}>
            {/* Group icon circle */}
            <Skeleton width={50} height={50} borderRadius={25} style={{ marginRight: 14 }} />
            <View style={{ flex: 1 }}>
              <Skeleton width={140} height={18} style={{ marginBottom: 8 }} />
              <Skeleton width={200} height={14} />
            </View>
          </View>
          <View
            style={[
              styles.balanceSection,
              { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.2)' : colors.border },
            ]}>
            <Skeleton width={90} height={14} />
            <Skeleton width={60} height={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton Loader matching activity.tsx / ActivityCard layout
 */
export function ActivityListSkeleton() {
  const { isDark } = useThemeColors();

  return (
    <View style={styles.container}>
      {/* Search bar placeholder */}
      <Skeleton height={42} borderRadius={10} style={{ marginBottom: 18 }} />

      {/* Date headers & rows */}
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <View key={sectionIndex} style={{ marginBottom: 16 }}>
          <Skeleton width={80} height={16} style={{ marginBottom: 12 }} />
          {Array.from({ length: sectionIndex === 0 ? 3 : 2 }).map((_, rowIndex) => (
            <View
              key={rowIndex}
              style={[
                styles.activityRow,
                { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
              ]}>
              {/* Activity icon circular placeholder */}
              <Skeleton width={38} height={38} borderRadius={19} style={{ marginRight: 12 }} />
              <View style={{ flex: 1, marginRight: 12 }}>
                <Skeleton width="90%" height={14} style={{ marginBottom: 6 }} />
                <Skeleton width={130} height={11} style={{ marginBottom: 6 }} />
                {rowIndex === 0 && (
                  <Skeleton width={70} height={18} borderRadius={9} />
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Skeleton width={50} height={15} style={{ marginBottom: 6 }} />
                <Skeleton width={10} height={15} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton Loader matching Friend and Group detail pages
 */
export function DetailSkeleton() {
  const { colors } = useThemeColors();

  return (
    <View style={styles.container}>
      {/* Header section with big circular avatar */}
      <View style={styles.detailHeader}>
        <Skeleton width={72} height={72} borderRadius={36} style={{ marginBottom: 12 }} />
        <Skeleton width={180} height={22} style={{ marginBottom: 6 }} />
        <Skeleton width={120} height={14} style={{ marginBottom: 16 }} />
        {/* Actions row */}
        <View style={styles.detailActions}>
          <Skeleton width={100} height={36} borderRadius={18} style={{ marginRight: 10 }} />
          <Skeleton width={100} height={36} borderRadius={18} />
        </View>
      </View>

      {/* Transactions list title */}
      <Skeleton width={110} height={18} style={{ marginTop: 24, marginBottom: 12 }} />

      {/* Transaction row items */}
      {Array.from({ length: 4 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.activityRow,
            { borderBottomColor: colors.border },
          ]}>
          <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: 12 }} />
          <View style={{ flex: 1, marginRight: 12 }}>
            <Skeleton width="80%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width={100} height={11} />
          </View>
          <Skeleton width={60} height={16} />
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton Loader matching expense-detail/[id].tsx
 */
export function ExpenseDetailSkeleton() {
  const { colors } = useThemeColors();

  return (
    <View style={styles.container}>
      {/* Category Icon and Overview */}
      <View style={styles.detailHeader}>
        <Skeleton width={64} height={64} borderRadius={32} style={{ marginBottom: 12 }} />
        <Skeleton width={120} height={26} style={{ marginBottom: 8 }} />
        <Skeleton width={180} height={16} style={{ marginBottom: 6 }} />
        <Skeleton width={100} height={12} style={{ marginBottom: 20 }} />
      </View>

      {/* Main card skeleton */}
      <View style={[styles.card, { borderColor: colors.border, padding: 16 }]}>
        <Skeleton width={90} height={14} style={{ marginBottom: 12 }} />
        <View style={styles.activityRow}>
          <Skeleton width={32} height={32} borderRadius={16} style={{ marginRight: 12 }} />
          <Skeleton width={140} height={14} />
        </View>
      </View>

      {/* Splits section skeleton */}
      <Skeleton width={100} height={16} style={{ marginTop: 18, marginBottom: 12 }} />
      <View style={[styles.card, { borderColor: colors.border, padding: 8 }]}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.activityRow,
              {
                borderBottomColor: colors.border,
                borderBottomWidth: index === 2 ? 0 : 1,
                paddingVertical: 10,
                paddingHorizontal: 8,
              },
            ]}>
            <Skeleton width={28} height={28} borderRadius={14} style={{ marginRight: 12 }} />
            <Skeleton width={100} height={14} style={{ flex: 1 }} />
            <Skeleton width={55} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Generic Fallback List Skeleton (For settle, stats, invitations, etc.)
 */
export function GenericSkeleton() {
  const { colors } = useThemeColors();

  return (
    <View style={styles.container}>
      {Array.from({ length: 5 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.card,
            { borderColor: colors.border, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
          ]}>
          <Skeleton width={32} height={32} borderRadius={16} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Skeleton width="70%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  card: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderRadius: 16,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mainInfo: {
    flex: 1,
    marginRight: 8,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  bottomSection: {
    flexDirection: 'row',
    marginTop: 6,
  },
  branchSpacer: {
    width: 56, // avatar width (44) + avatar marginRight (12)
  },
  branchContainer: {
    flex: 1,
  },
  expenseBranchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
  },
  branchGraphics: {
    width: 20,
    height: '100%',
    marginRight: 4,
  },
  vLine: {
    position: 'absolute',
    width: 1.5,
    left: 8,
    top: 0,
  },
  hLine: {
    position: 'absolute',
    height: 1.5,
    width: 10,
    left: 8,
    top: 11,
  },
  balanceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailHeader: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  detailActions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
