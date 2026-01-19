import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  const { gradients, colors, isDark } = useThemeColors();
  
  // Skateboard character animation values
  const skateX = useRef(new Animated.Value(0)).current;
  const bounceY = useRef(new Animated.Value(0)).current;
  const bodyRotate = useRef(new Animated.Value(12)).current;
  const boardRotate = useRef(new Animated.Value(0)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;
  const orb1Anim = useRef(new Animated.Value(0)).current;
  const orb2Anim = useRef(new Animated.Value(0)).current;
  const orb3Anim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Skateboard trick animation sequence
    Animated.loop(
      Animated.sequence([
        // Normal riding
        Animated.parallel([
          Animated.timing(skateX, {
            toValue: -12,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bounceY, {
            toValue: -4,
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(bounceY, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        // Jump trick
        Animated.parallel([
          Animated.sequence([
            Animated.timing(bounceY, {
              toValue: -32,
              duration: 600,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(bounceY, {
              toValue: 0,
              duration: 400,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(bodyRotate, {
              toValue: 7,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(bodyRotate, {
              toValue: 34,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(bodyRotate, {
              toValue: 12,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(boardRotate, {
              toValue: -40,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(boardRotate, {
              toValue: 3,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(boardRotate, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
        ]),
        // Return to normal
        Animated.parallel([
          Animated.timing(skateX, {
            toValue: 12,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bounceY, {
            toValue: -4,
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bounceY, {
            toValue: 0,
            duration: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(skateX, {
            toValue: 0,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    // Motion lines animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(lineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Floating orbs with different timings
    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Anim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orb1Anim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Anim, {
          toValue: 1,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orb2Anim, {
          toValue: 0,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb3Anim, {
          toValue: 1,
          duration: 3500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orb3Anim, {
          toValue: 0,
          duration: 3500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Cleanup function to stop all animations when component unmounts
    return () => {
      skateX.stopAnimation();
      bounceY.stopAnimation();
      bodyRotate.stopAnimation();
      boardRotate.stopAnimation();
      lineAnim.stopAnimation();
      orb1Anim.stopAnimation();
      orb2Anim.stopAnimation();
      orb3Anim.stopAnimation();
      fadeAnim.stopAnimation();
    };
  }, []);

  const lineX = lineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '-100%'],
  });

  const bodyRotateDeg = bodyRotate.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const boardRotateDeg = boardRotate.interpolate({
    inputRange: [-180, 180],
    outputRange: ['-180deg', '180deg'],
  });

  const orb1Y = orb1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -30],
  });

  const orb2Y = orb2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 30],
  });

  const orb3Y = orb3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      {/* Animated background orbs */}
      <View style={styles.orbContainer}>
        <Animated.View
          style={[
            styles.orb,
            styles.orb1,
            {
              transform: [{ translateY: orb1Y }],
              opacity: orb1Anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 0.6, 0.3],
              }),
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            styles.orb2,
            {
              transform: [{ translateY: orb2Y }],
              opacity: orb2Anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 0.6, 0.3],
              }),
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            styles.orb3,
            {
              transform: [{ translateY: orb3Y }],
              opacity: orb3Anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 0.6, 0.3],
              }),
            },
          ]}
        />
      </View>

      {/* Main loading content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Skateboard character */}
        <View style={styles.skateContainer}>
          {/* Motion lines */}
          <View style={styles.motionLines}>
            <Animated.View
              style={[
                styles.motionLine,
                {
                  backgroundColor: isDark ? 'rgba(45, 212, 191, 0.4)' : 'rgba(34, 197, 94, 0.4)',
                  transform: [{ translateX: lineX }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.motionLine,
                styles.motionLine2,
                {
                  backgroundColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                  transform: [{ translateX: lineX }],
                },
              ]}
            />
          </View>

          {/* Character and board */}
          <Animated.View
            style={[
              styles.skateWrapper,
              {
                transform: [{ translateX: skateX }, { translateY: bounceY }],
              },
            ]}>
            {/* Skateboard */}
            <Animated.View
              style={[
                styles.board,
                {
                  transform: [{ rotate: boardRotateDeg }],
                },
              ]}>
              <LinearGradient
                colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.boardDeck}>
                <View style={styles.boardStripe} />
              </LinearGradient>
              {/* Wheels */}
              <View style={styles.wheel} />
              <View style={[styles.wheel, styles.wheelBack]} />
            </Animated.View>

            {/* Character body */}
            <Animated.View
              style={[
                styles.body,
                {
                  backgroundColor: isDark ? '#f9a28e' : '#f97066',
                  transform: [{ rotate: bodyRotateDeg }],
                },
              ]}>
              {/* Head */}
              <View style={[styles.head, { backgroundColor: isDark ? '#f9a28e' : '#f97066' }]} />
              {/* Arms */}
              <View style={[styles.arm, styles.armFront, { backgroundColor: isDark ? '#f9a28e' : '#f97066' }]} />
              <View style={[styles.arm, styles.armBack, { backgroundColor: isDark ? '#f9a28e' : '#f97066' }]} />
              {/* Legs */}
              <View style={[styles.leg, styles.legFront, { backgroundColor: isDark ? '#f9a28e' : '#f97066' }]} />
              <View style={[styles.leg, styles.legBack, { backgroundColor: isDark ? '#f9a28e' : '#f97066' }]} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Loading text */}
        <ThemedText style={[styles.loadingText, !isDark && { color: colors.text }]}>
          {message}
        </ThemedText>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 9999,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 250,
    height: 250,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    bottom: -50,
    left: -50,
  },
  orb3: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    top: '40%',
    left: '50%',
    marginLeft: -100,
    marginTop: -100,
  },
  content: {
    alignItems: 'center',
    gap: 24,
  },
  skateContainer: {
    width: 120,
    height: 80,
    position: 'relative',
  },
  motionLines: {
    position: 'absolute',
    left: -20,
    top: 32,
    width: 60,
    gap: 6,
  },
  motionLine: {
    height: 3,
    width: 40,
    borderRadius: 1.5,
  },
  motionLine2: {
    width: 30,
  },
  skateWrapper: {
    width: 80,
    height: 80,
    position: 'relative',
    marginLeft: 20,
  },
  board: {
    position: 'absolute',
    bottom: 8,
    left: 20,
    width: 40,
    height: 10,
  },
  boardDeck: {
    width: 40,
    height: 10,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  boardStripe: {
    position: 'absolute',
    top: 3,
    left: 5,
    right: 5,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
  },
  wheel: {
    position: 'absolute',
    bottom: -4,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  wheelBack: {
    left: 26,
  },
  body: {
    position: 'absolute',
    left: 26,
    bottom: 18,
    width: 8,
    height: 18,
    borderRadius: 4,
  },
  head: {
    position: 'absolute',
    top: -10,
    left: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  arm: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 12,
    height: 4,
    borderRadius: 2,
  },
  armFront: {
    transform: [{ rotate: '24deg' }],
  },
  armBack: {
    transform: [{ rotate: '164deg' }],
  },
  leg: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    width: 12,
    height: 4,
    borderRadius: 2,
  },
  legFront: {
    transform: [{ rotate: '40deg' }],
  },
  legBack: {
    left: 1,
    transform: [{ rotate: '120deg' }],
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.8,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.6,
    marginTop: 8,
  },
});
