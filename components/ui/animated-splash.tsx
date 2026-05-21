import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export function AnimatedSplash() {
  const { isDark } = useThemeColors();

  // Avatar animations
  const [avatar1X] = useState(() => new Animated.Value(-width / 2));
  const [avatar2X] = useState(() => new Animated.Value(width / 2));
  const [avatar1Opacity] = useState(() => new Animated.Value(0));
  const [avatar2Opacity] = useState(() => new Animated.Value(0));
  const [avatar1Pulse] = useState(() => new Animated.Value(1));
  const [avatar2Pulse] = useState(() => new Animated.Value(1));

  // Central money icon
  const [moneyScale] = useState(() => new Animated.Value(0));
  const [moneyOpacity] = useState(() => new Animated.Value(0));
  const [moneyRotate] = useState(() => new Animated.Value(0));

  // Splitting coins
  const [coin1X] = useState(() => new Animated.Value(0));
  const [coin1Y] = useState(() => new Animated.Value(0));
  const [coin1Opacity] = useState(() => new Animated.Value(0));
  const [coin1Scale] = useState(() => new Animated.Value(1));

  const [coin2X] = useState(() => new Animated.Value(0));
  const [coin2Y] = useState(() => new Animated.Value(0));
  const [coin2Opacity] = useState(() => new Animated.Value(0));
  const [coin2Scale] = useState(() => new Animated.Value(1));

  // Text animations
  const [textOpacity] = useState(() => new Animated.Value(0));
  const [textSlide] = useState(() => new Animated.Value(30));

  // Background particles
  const [particle1Y] = useState(() => new Animated.Value(0));
  const [particle1Opacity] = useState(() => new Animated.Value(0));
  const [particle2Y] = useState(() => new Animated.Value(0));
  const [particle2Opacity] = useState(() => new Animated.Value(0));
  const [particle3Y] = useState(() => new Animated.Value(0));
  const [particle3Opacity] = useState(() => new Animated.Value(0));

  // Glow effect
  const [glowPulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Main animation sequence
    Animated.sequence([
      // Phase 1: Avatars slide in from sides
      Animated.parallel([
        Animated.timing(avatar1X, {
          toValue: -60,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(avatar2X, {
          toValue: 60,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(avatar1Opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(avatar2Opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),

      // Phase 2: Central money icon appears with spin
      Animated.parallel([
        Animated.spring(moneyScale, {
          toValue: 1,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(moneyOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(moneyRotate, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      // Phase 3: Coins split and fly to avatars
      Animated.parallel([
        // Coin 1 flies to left avatar
        Animated.timing(coin1Opacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(coin1X, {
          toValue: -80,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(coin1Y, {
          toValue: -20,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(coin1Opacity, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),

        // Coin 2 flies to right avatar
        Animated.timing(coin2Opacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(coin2X, {
          toValue: 80,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(coin2Y, {
          toValue: -20,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(coin2Opacity, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),

        // Avatars pulse when receiving coins
        Animated.sequence([
          Animated.delay(400),
          Animated.parallel([
            Animated.sequence([
              Animated.timing(avatar1Pulse, {
                toValue: 1.15,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(avatar1Pulse, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.timing(avatar2Pulse, {
                toValue: 1.15,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(avatar2Pulse, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]),
      ]),

      // Phase 4: Text appears
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

    // Looping glow animation
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

    // Floating particles
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
                toValue: 0.5,
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
                toValue: 0.4,
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
                toValue: 0.3,
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
      ])
    ).start();
  }, [
    avatar1Opacity,
    avatar1Pulse,
    avatar1X,
    avatar2Opacity,
    avatar2Pulse,
    avatar2X,
    coin1Opacity,
    coin1X,
    coin1Y,
    coin2Opacity,
    coin2X,
    coin2Y,
    glowPulse,
    moneyOpacity,
    moneyRotate,
    moneyScale,
    particle1Opacity,
    particle1Y,
    particle2Opacity,
    particle2Y,
    particle3Opacity,
    particle3Y,
    textOpacity,
    textSlide,
  ]);

  const moneyRotation = moneyRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
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
        <View style={[styles.particleCircle, { backgroundColor: isDark ? '#8B5CF6' : '#10B981' }]} />
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
        <View style={[styles.particleCircle, { backgroundColor: isDark ? '#22D3EE' : '#059669' }]} />
      </Animated.View>

      {/* Main Content */}
      <View style={styles.content}>
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

        {/* Avatars and Money Container */}
        <View style={styles.splitContainer}>
          {/* Left Avatar (Friend 1) */}
          <Animated.View
            style={[
              styles.avatarContainer,
              {
                opacity: avatar1Opacity,
                transform: [
                  { translateX: avatar1X },
                  { scale: avatar1Pulse },
                ],
              },
            ]}>
            <LinearGradient
              colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22C55E', '#16A34A']}
              style={styles.avatar}>
              {/* Person Icon */}
              <View style={styles.personIcon}>
                <View style={[styles.personHead, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]} />
                <View style={[styles.personBody, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Central Money Icon */}
          <Animated.View
            style={[
              styles.moneyContainer,
              {
                opacity: moneyOpacity,
                transform: [
                  { scale: moneyScale },
                  { rotate: moneyRotation },
                ],
              },
            ]}>
            <LinearGradient
              colors={isDark ? ['#F59E0B', '#D97706'] : ['#FBBF24', '#F59E0B']}
              style={styles.moneyIcon}>
              <View style={styles.dollarSign}>
                <View style={[styles.dollarLine, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]} />
                <View style={styles.sShape}>
                  <View style={[styles.sTop, { borderColor: isDark ? '#0A0A0F' : '#fff' }]} />
                  <View style={[styles.sBottom, { borderColor: isDark ? '#0A0A0F' : '#fff' }]} />
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Right Avatar (Friend 2) */}
          <Animated.View
            style={[
              styles.avatarContainer,
              {
                opacity: avatar2Opacity,
                transform: [
                  { translateX: avatar2X },
                  { scale: avatar2Pulse },
                ],
              },
            ]}>
            <LinearGradient
              colors={isDark ? ['#8B5CF6', '#7C3AED'] : ['#10B981', '#059669']}
              style={styles.avatar}>
              {/* Person Icon */}
              <View style={styles.personIcon}>
                <View style={[styles.personHead, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]} />
                <View style={[styles.personBody, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Flying Coin 1 (to left) */}
          <Animated.View
            style={[
              styles.flyingCoin,
              {
                opacity: coin1Opacity,
                transform: [
                  { translateX: coin1X },
                  { translateY: coin1Y },
                  { scale: coin1Scale },
                ],
              },
            ]}>
            <LinearGradient
              colors={['#FCD34D', '#F59E0B']}
              style={styles.coin}>
              <View style={[styles.coinInner, { backgroundColor: isDark ? '#0A0A0F' : '#78350F' }]} />
            </LinearGradient>
          </Animated.View>

          {/* Flying Coin 2 (to right) */}
          <Animated.View
            style={[
              styles.flyingCoin,
              {
                opacity: coin2Opacity,
                transform: [
                  { translateX: coin2X },
                  { translateY: coin2Y },
                  { scale: coin2Scale },
                ],
              },
            ]}>
            <LinearGradient
              colors={['#FCD34D', '#F59E0B']}
              style={styles.coin}>
              <View style={[styles.coinInner, { backgroundColor: isDark ? '#0A0A0F' : '#78350F' }]} />
            </LinearGradient>
          </Animated.View>
        </View>

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
  splitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    height: 120,
  },
  avatarContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  personIcon: {
    alignItems: 'center',
  },
  personHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginBottom: 2,
  },
  personBody: {
    width: 28,
    height: 16,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  moneyContainer: {
    marginHorizontal: 20,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  moneyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dollarSign: {
    width: 40,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dollarLine: {
    width: 3,
    height: 55,
    position: 'absolute',
  },
  sShape: {
    width: 28,
    height: 40,
  },
  sTop: {
    width: 28,
    height: 20,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
    marginBottom: -4,
  },
  sBottom: {
    width: 28,
    height: 20,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
    alignSelf: 'flex-end',
  },
  flyingCoin: {
    position: 'absolute',
  },
  coin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.3,
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
  glowContainer: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  glow: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  // Full body person styles
  personFull: {
    alignItems: 'center',
  },
  head: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 4,
  },
  bodyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  arm: {
    width: 8,
    height: 32,
    borderRadius: 4,
  },
  leftArm: {
    transform: [{ rotate: '20deg' }],
    marginRight: -2,
    marginTop: 4,
  },
  rightArm: {
    transform: [{ rotate: '-20deg' }],
    marginLeft: -2,
    marginTop: 4,
  },
  torso: {
    width: 24,
    height: 36,
    borderRadius: 6,
  },
  legsContainer: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -2,
  },
  leg: {
    width: 10,
    height: 28,
    borderRadius: 5,
  },
});
