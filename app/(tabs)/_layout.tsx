import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import React from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** `NativeTabs.Trigger` only reads direct `Icon` / `Label` children — no wrapper components. */
function iosPair(defaultSf: SFSymbol, selectedSf: SFSymbol) {
  return { default: defaultSf, selected: selectedSf };
}

export default function TabLayout() {
  const { colors, isDark } = useThemeColors();

  return (
    <RouteErrorBoundary homeHref="/(tabs)">
      <NativeTabs
        tintColor={colors.tint}
        blurEffect="systemChromeMaterial"
        minimizeBehavior="automatic"
        labelStyle={{
          default: { color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)' },
          selected: { color: colors.tint },
        }}
      >
        <NativeTabs.Trigger name="index">
          {process.env.EXPO_OS === 'ios' ? (
            <Icon sf={iosPair('person.2', 'person.2.fill')} />
          ) : (
            <Icon src={<VectorIcon family={MaterialIcons} name="people" />} />
          )}
          <Label>Friends</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="groups">
          {process.env.EXPO_OS === 'ios' ? (
            <Icon sf={iosPair('person.3', 'person.3.fill')} />
          ) : (
            <Icon src={<VectorIcon family={MaterialIcons} name="groups" />} />
          )}
          <Label>Groups</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="expenses">
          {process.env.EXPO_OS === 'ios' ? (
            <Icon sf={iosPair('dollarsign.circle', 'dollarsign.circle.fill')} />
          ) : (
            <Icon src={<VectorIcon family={MaterialIcons} name="attach-money" />} />
          )}
          <Label>Expenses</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="activity">
          {process.env.EXPO_OS === 'ios' ? (
            <Icon sf={iosPair('clock', 'clock.fill')} />
          ) : (
            <Icon src={<VectorIcon family={MaterialIcons} name="schedule" />} />
          )}
          <Label>Activity</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          {process.env.EXPO_OS === 'ios' ? (
            <Icon sf={iosPair('person.circle', 'person.circle.fill')} />
          ) : (
            <Icon src={<VectorIcon family={MaterialIcons} name="account-circle" />} />
          )}
          <Label>Profile</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </RouteErrorBoundary>
  );
}
