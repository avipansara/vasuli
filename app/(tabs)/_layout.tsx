import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** `NativeTabs.Trigger` only reads direct `Icon` / `Label` children. */
function iosPair(defaultSf: SFSymbol, selectedSf: SFSymbol) {
  return { default: defaultSf, selected: selectedSf };
}

export default function TabLayout() {
  const { colorScheme, colors, isDark } = useThemeColors();
  const defaultTabColor = isDark ? 'rgba(244,244,245,0.62)' : 'rgba(26,26,26,0.56)';
  const tabBarBackground = isDark ? '#0A0A0F' : '#FFFFFF';

  return (
    <RouteErrorBoundary homeHref="/(tabs)">
      <NativeTabs
        key={colorScheme}
        tintColor={colors.tint}
        iconColor={{
          default: defaultTabColor,
          selected: colors.tint,
        }}
        backgroundColor={tabBarBackground}
        blurEffect="none"
        shadowColor={isDark ? 'rgba(45,212,191,0.18)' : 'rgba(0,0,0,0.12)'}
        disableTransparentOnScrollEdge
        minimizeBehavior="automatic"
        labelStyle={{
          default: { color: defaultTabColor },
          selected: { color: colors.tint },
        }}
      >
        <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: colors.background }}>
          {process.env.EXPO_OS === 'ios' ? (
            <NativeTabs.Trigger.Icon sf={iosPair('person.2', 'person.2.fill')} />
          ) : (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="people" />}
            />
          )}
          <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="groups" contentStyle={{ backgroundColor: colors.background }}>
          {process.env.EXPO_OS === 'ios' ? (
            <NativeTabs.Trigger.Icon sf={iosPair('person.3', 'person.3.fill')} />
          ) : (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="groups" />}
            />
          )}
          <NativeTabs.Trigger.Label>Groups</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="expenses" contentStyle={{ backgroundColor: colors.background }}>
          {process.env.EXPO_OS === 'ios' ? (
            <NativeTabs.Trigger.Icon sf={iosPair('dollarsign.circle', 'dollarsign.circle.fill')} />
          ) : (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="attach-money" />}
            />
          )}
          <NativeTabs.Trigger.Label>Expenses</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="activity" contentStyle={{ backgroundColor: colors.background }}>
          {process.env.EXPO_OS === 'ios' ? (
            <NativeTabs.Trigger.Icon sf={iosPair('clock', 'clock.fill')} />
          ) : (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="schedule" />}
            />
          )}
          <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile" contentStyle={{ backgroundColor: colors.background }}>
          {process.env.EXPO_OS === 'ios' ? (
            <NativeTabs.Trigger.Icon sf={iosPair('person.circle', 'person.circle.fill')} />
          ) : (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="account-circle" />}
            />
          )}
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </RouteErrorBoundary>
  );
}
