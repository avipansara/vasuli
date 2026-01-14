import { useNetworkStatus } from '@/hooks/use-network-status';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from './icon-symbol';

export function NetworkBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const { isDark } = useThemeColors();
  const slideAnim = useRef(new Animated.Value(-60)).current;
  
  const isOffline = !isConnected || isInternetReachable === false;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -60,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  if (!isOffline) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#ef4444' : '#dc2626',
          transform: [{ translateY: slideAnim }],
        },
      ]}>
      <View style={styles.content}>
        <IconSymbol name="wifi.slash" size={16} color="#fff" />
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
