import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export function AnimatedSplash() {
  const { isDark } = useThemeColors();
  
  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const circleScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(30)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  
  // Floating particles (more particles for richer effect)
  const particle1Y = useRef(new Animated.Value(0)).current;
  const particle2Y = useRef(new Animated.Value(0)).current;
  const particle3Y = useRef(new Animated.Value(0)).current;
  const particle4Y = useRef(new Animated.Value(0)).current;
  const particle5Y = useRef(new Animated.Value(0)).current;
  const particle1Opacity = useRef(new Animated.Value(0)).current;
  const particle2Opacity = useRef(new Animated.Value(0)).current;
  const particle3Opacity = useRef(new Animated.Value(0)).current;
  const particle4Opacity = useRef(new Animated.Value(0)).current;
  const particle5Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequence of animations
    Animated.sequence([
      // 1. Circle expands
      Animated.timing(circleScale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 2. Logo appears with bounce
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]),
      // 3. Text slides up
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Pulsing glow effect (loop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer effect (loop)
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Floating particles animation (loop)
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.parallel([
            Animated.timing(particle1Y, {
              toValue: -100,
              duration: 3000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle1Opacity, {
                toValue: 0.6,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(particle1Opacity, {
                toValue: 0,
                duration: 2500,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.timing(particle1Y, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(1000),
          Animated.parallel([
            Animated.timing(particle2Y, {
              toValue: -120,
              duration: 3500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle2Opacity, {
                toValue: 0.5,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(particle2Opacity, {
                toValue: 0,
                duration: 3000,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.timing(particle2Y, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(particle3Y, {
              toValue: -90,
              duration: 2800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle3Opacity, {
                toValue: 0.4,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(particle3Opacity, {
                toValue: 0,
                duration: 2300,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.timing(particle3Y, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        // Additional particles
        Animated.sequence([
          Animated.delay(1500),
          Animated.parallel([
            Animated.timing(particle4Y, {
              toValue: -110,
              duration: 3200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle4Opacity, {
                toValue: 0.5,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(particle4Opacity, {
                toValue: 0,
                duration: 2700,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.timing(particle4Y, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(700),
          Animated.parallel([
            Animated.timing(particle5Y, {
              toValue: -95,
              duration: 2900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle5Opacity, {
                toValue: 0.45,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(particle5Opacity, {
                toValue: 0,
                duration: 2400,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.timing(particle5Y, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  const rotation = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={isDark ? ['#0A0A0F', '#0F172A', '#1E293B'] : ['#F0FDF4', '#ECFDF5', '#D1FAE5']}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating Particles */}
      <Animated.View
        style={[
          styles.particle,
          {
            left: width * 0.2,
            bottom: height * 0.3,
            opacity: particle1Opacity,
            transform: [{ translateY: particle1Y }],
          },
        ]}>
        <View style={[styles.particleCircle, { backgroundColor: isDark ? '#2DD4BF' : '#22C55E' }]} />
      </Animated.View>
      
      <Animated.View
        style={[
          styles.particle,
          {
            right: width * 0.25,
            bottom: height * 0.4,
            opacity: particle2Opacity,
            transform: [{ translateY: particle2Y }],
          },
        ]}>
        <View style={[styles.particleCircle, { backgroundColor: isDark ? '#22D3EE' : '#10B981' }]} />
      </Animated.View>
      
      <Animated.View
        style={[
          styles.particle,
          {
            left: width * 0.7,
            bottom: height * 0.25,
            opacity: particle3Opacity,
            transform: [{ translateY: particle3Y }],
          },
        ]}>
        <View style={[styles.particleCircle, { backgroundColor: isDark ? '#2DD4BF' : '#22C55E' }]} />
      </Animated.View>

      <Animated.View
        style={[
          styles.particle,
          {
            left: width * 0.15,
            bottom: height * 0.5,
            opacity: particle4Opacity,
            transform: [{ translateY: particle4Y }],
          },
        ]}>
        <View style={[styles.particleLarge, { backgroundColor: isDark ? '#8B5CF6' : '#059669' }]} />
      </Animated.View>

      <Animated.View
        style={[
          styles.particle,
          {
            right: width * 0.15,
            bottom: height * 0.35,
            opacity: particle5Opacity,
            transform: [{ translateY: particle5Y }],
          },
        ]}>
        <View style={[styles.particleSmall, { backgroundColor: isDark ? '#22D3EE' : '#10B981' }]} />
      </Animated.View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Expanding Circle Background */}
        <Animated.View
          style={[
            styles.circle,
            {
              transform: [{ scale: circleScale }],
            },
          ]}>
          <LinearGradient
            colors={isDark ? ['rgba(45, 212, 191, 0.15)', 'rgba(34, 211, 238, 0.05)'] : ['rgba(34, 197, 94, 0.15)', 'rgba(16, 185, 129, 0.05)']}
            style={styles.circleGradient}
          />
        </Animated.View>

        {/* Pulsing Glow Effect */}
        <Animated.View
          style={[
            styles.glowContainer,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}>
          <LinearGradient
            colors={isDark ? ['rgba(45, 212, 191, 0.4)', 'transparent'] : ['rgba(34, 197, 94, 0.4)', 'transparent']}
            style={styles.glow}
          />
        </Animated.View>

        {/* Logo Container */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [
                { scale: logoScale },
                { rotate: rotation },
              ],
            },
          ]}>
          {/* Shimmer overlay */}
          <Animated.View
            style={[
              styles.shimmerContainer,
              {
                transform: [{ translateX: shimmerTranslate }],
              },
            ]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.3)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmer}
            />
          </Animated.View>

          <LinearGradient
            colors={isDark ? ['#2DD4BF', '#22D3EE'] : ['#22C55E', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoGradient}>
            {/* Dollar Sign Icon */}
            <View style={styles.dollarSign}>
              <View style={[styles.dollarLine, { backgroundColor: '#fff' }]} />
              <View style={styles.sShape}>
                <View style={[styles.sTop, { borderColor: '#fff' }]} />
                <View style={[styles.sBottom, { borderColor: '#fff' }]} />
              </View>
              <View style={[styles.dollarLine, { backgroundColor: '#fff' }]} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* App Name */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textSlide }],
            },
          ]}>
          <Animated.Text
            style={[
              styles.appName,
              { color: isDark ? '#fff' : '#1F2937' },
            ]}>
            Vasuli
          </Animated.Text>
          <Animated.Text
            style={[
              styles.tagline,
              { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(31, 41, 55, 0.6)' },
            ]}>
            Split expenses, not friendships
          </Animated.Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    overflow: 'hidden',
  },
  circleGradient: {
    width: '100%',
    height: '100%',
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoGradient: {
    width: 120,
    height: 120,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  dollarSign: {
    width: 60,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dollarLine: {
    width: 3,
    height: 90,
    position: 'absolute',
  },
  sShape: {
    width: 40,
    height: 60,
  },
  sTop: {
    width: 40,
    height: 30,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 20,
    borderColor: '#fff',
    marginBottom: -5,
  },
  sBottom: {
    width: 40,
    height: 30,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 20,
    borderColor: '#fff',
    alignSelf: 'flex-end',
  },
  textContainer: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  particle: {
    position: 'absolute',
  },
  particleCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  particleLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  particleSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  glowContainer: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  glow: {
    width: '100%',
    height: '100%',
    borderRadius: 90,
  },
  shimmerContainer: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 30,
    overflow: 'hidden',
  },
  shimmer: {
    width: 60,
    height: 120,
  },
});
