import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Web keeps JS Tabs + floating bar. Native uses `unstable-native-tabs` in `_layout.tsx`
 * (system tab bar, SF Symbols, iOS 26 minimize behavior).
 */
export default function TabLayoutWeb() {
  const { colors, isDark } = useThemeColors();
  const { width } = useWindowDimensions();

  const isTablet = width > 768;
  const TAB_BAR_WIDTH = 500;

  return (
    <RouteErrorBoundary homeHref="/(tabs)">
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarShowLabel: true,
          tabBarStyle: {
            position: 'absolute',
            bottom: 24,
            ...(isTablet
              ? {
                  left: (width - TAB_BAR_WIDTH) / 2,
                  width: TAB_BAR_WIDTH,
                }
              : {
                  left: 16,
                  right: 16,
                }),
            height: 70,
            backgroundColor:
              Platform.OS === 'android'
                ? isDark
                  ? 'rgba(20, 30, 35, 0.95)'
                  : 'rgba(255, 255, 255, 0.95)'
                : isDark
                  ? 'rgba(20, 30, 35, 0.50)'
                  : 'rgba(255, 255, 255, 0.50)',
            borderRadius: 16,
            paddingHorizontal: 8,
            shadowColor: isDark ? '#000' : '#64748B',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.3 : 0.15,
            shadowRadius: 16,
            elevation: 10,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          },
          tabBarBackground: () => (
            <View style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}>
              {Platform.OS === 'ios' && (
                <BlurView
                  intensity={40}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </View>
          ),
          tabBarItemStyle: {
            borderRadius: 12,
            marginHorizontal: 4,
            paddingVertical: 6,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Friends',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: 'Groups',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.3.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="expenses"
          options={{
            title: 'Expenses',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="dollarsign.circle.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: 'Activity',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="person.circle.fill" color={color} />
            ),
          }}
        />
      </Tabs>
    </RouteErrorBoundary>
  );
}
