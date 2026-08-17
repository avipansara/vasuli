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
  const { isDark } = useThemeColors();
  const cardBg = isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff';

  return (
    <View style={styles.container}>
      {/* Top Summary Card Skeleton */}
      <View
        style={[
          styles.summaryCardSkeleton,
          {
            backgroundColor: cardBg,
            shadowColor: isDark ? '#000000' : '#64748B',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 12,
            elevation: 4,
          },
        ]}>
        <View style={styles.summaryTopRow}>
          <Skeleton width={40} height={40} borderRadius={11} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Skeleton width="55%" height={16} style={{ marginBottom: 6 }} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Skeleton width={6} height={6} borderRadius={3} style={{ marginRight: 6 }} />
          <Skeleton width={90} height={13} />
        </View>
        <Skeleton width={110} height={24} />
      </View>

      {/* Quick Action Button Skeleton */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Skeleton height={44} borderRadius={10} style={{ flex: 1 }} />
      </View>

      {/* Segmented Filter Bar Skeleton */}
      <View
        style={[
          styles.segmentedSkeleton,
          { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : 'rgba(0, 0, 0, 0.04)' },
        ]}>
        <Skeleton height={32} borderRadius={8} style={{ flex: 1 }} />
        <Skeleton height={32} borderRadius={8} style={{ flex: 1 }} />
        <Skeleton height={32} borderRadius={8} style={{ flex: 1 }} />
      </View>

      {/* Section Title Skeleton */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 10 }}>
        <Skeleton width={80} height={16} />
        <Skeleton width={50} height={12} />
      </View>

      {/* Activity / Member Card Rows Skeleton */}
      {Array.from({ length: 4 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.detailCardRowSkeleton,
            {
              backgroundColor: cardBg,
              shadowColor: isDark ? '#000000' : '#64748B',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.22 : 0.06,
              shadowRadius: 8,
              elevation: 2,
            },
          ]}>
          <Skeleton width={34} height={34} borderRadius={10} style={{ marginRight: 10 }} />
          <View style={{ flex: 1, marginRight: 10 }}>
            <Skeleton width="65%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="45%" height={11} />
          </View>
          <Skeleton width={55} height={15} />
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton Loader matching expense-detail/[id].tsx
 */
export function ExpenseDetailSkeleton() {
  const { isDark } = useThemeColors();
  const cardBg = isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff';

  const cardStyle = {
    backgroundColor: cardBg,
    borderRadius: 14,
    shadowColor: isDark ? '#000000' : '#475569',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.35 : 0.09,
    shadowRadius: 10,
    elevation: 3,
  };

  return (
    <View style={styles.container}>
      {/* Top Amount Card Skeleton */}
      <View style={[cardStyle, { padding: 14, marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Skeleton width="35%" height={11} style={{ marginBottom: 6 }} />
            <Skeleton width="75%" height={22} />
          </View>
          <Skeleton width={85} height={26} borderRadius={6} />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Skeleton width={90} height={24} borderRadius={12} />
          <Skeleton width={70} height={24} borderRadius={12} />
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)', paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Skeleton width="45%" height={11} style={{ marginBottom: 6 }} />
            <Skeleton width="65%" height={15} />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton width="45%" height={11} style={{ marginBottom: 6 }} />
            <Skeleton width="70%" height={15} />
          </View>
        </View>
      </View>

      {/* Split Section Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 }}>
        <Skeleton width={50} height={18} />
        <Skeleton width={60} height={14} />
      </View>

      {/* Split Card Skeleton */}
      <View style={[cardStyle, { paddingVertical: 4, marginBottom: 16 }]}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View
            key={index}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: index === 2 ? 0 : 1,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
            }}>
            <Skeleton width={34} height={34} borderRadius={10} style={{ marginRight: 12 }} />
            <Skeleton width={110} height={15} style={{ flex: 1, marginRight: 12 }} />
            <Skeleton width={45} height={13} style={{ marginRight: 12 }} />
            <Skeleton width={60} height={16} />
          </View>
        ))}
      </View>

      {/* Activity Section Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 }}>
        <Skeleton width={65} height={18} />
        <Skeleton width={60} height={14} />
      </View>

      {/* Activity Card Skeleton */}
      <View style={[cardStyle, { paddingVertical: 4 }]}>
        {Array.from({ length: 2 }).map((_, index) => (
          <View
            key={index}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: index === 1 ? 0 : 1,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
            }}>
            <Skeleton width={34} height={34} borderRadius={17} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Skeleton width="80%" height={14} style={{ marginBottom: 6 }} />
              <Skeleton width="45%" height={11} />
            </View>
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
  summaryCardSkeleton: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  segmentedSkeleton: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    gap: 3,
    marginBottom: 12,
  },
  detailCardRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
});
