import React, { useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Play'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

// ─── Atmospheric background bloom orbs ───────────────────────────────────────
function BackgroundAtmosphere() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 5500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.88, duration: 5500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[atm.centerBloom, { transform: [{ scale: pulse }] }]} />
      <View style={atm.topRightBloom} />
      <View style={atm.bottomLeftBloom} />
    </View>
  );
}

const atm = StyleSheet.create({
  centerBloom: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    top: '18%',
    alignSelf: 'center',
    backgroundColor: '#16083E',
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 110,
    shadowOpacity: 0.8,
    opacity: 0.38,
  },
  topRightBloom: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -50,
    right: -50,
    backgroundColor: '#100630',
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 70,
    shadowOpacity: 0.7,
    opacity: 0.22,
  },
  bottomLeftBloom: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    bottom: 80,
    left: -60,
    backgroundColor: '#200850',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 60,
    shadowOpacity: 0.6,
    opacity: 0.18,
  },
});

// ─── Lightning bolt hero ──────────────────────────────────────────────────────
function LightningHero() {
  const breathe = useRef(new Animated.Value(1)).current;
  const surge   = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(1)).current;
  const ring1   = useRef(new Animated.Value(0.5)).current;
  const ring2   = useRef(new Animated.Value(0.25)).current;
  const ring3   = useRef(new Animated.Value(0.12)).current;

  useEffect(() => {
    // Gentle breathe
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.07, duration: 3200, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0.97, duration: 3200, useNativeDriver: true }),
      ])
    ).start();

    // Surge every ~5s
    Animated.loop(
      Animated.sequence([
        Animated.delay(4800),
        Animated.timing(surge, { toValue: 1, duration: 190, useNativeDriver: false }),
        Animated.timing(surge, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ])
    ).start();

    // White core flicker
    Animated.loop(
      Animated.sequence([
        Animated.delay(2400),
        Animated.timing(flicker, { toValue: 0.3, duration: 55,  useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 1.0, duration: 75,  useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.5, duration: 45,  useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 1.0, duration: 95,  useNativeDriver: true }),
        Animated.delay(3200),
      ])
    ).start();

    // Concentric ring pulses — staggered
    const ringPulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 0.72, duration: 2600, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.08, duration: 2600, useNativeDriver: true }),
        ])
      );

    ringPulse(ring1, 0).start();
    ringPulse(ring2, 860).start();
    ringPulse(ring3, 1720).start();
  }, []);

  const glowOp = surge.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.30] });

  const BOLT = 'M 155,15 L 50,130 L 110,130 L 50,245 L 155,130 L 95,130 Z';

  return (
    <Animated.View style={[lh.container, { transform: [{ scale: breathe }] }]}>
      {/* Concentric pulsing rings */}
      <Animated.View style={[lh.ring, { width: 320, height: 320, borderRadius: 160, opacity: ring3, borderColor: '#3B0764' }]} />
      <Animated.View style={[lh.ring, { width: 235, height: 235, borderRadius: 118, opacity: ring2, borderColor: '#5B21B6' }]} />
      <Animated.View style={[lh.ring, { width: 168, height: 168, borderRadius: 84,  opacity: ring1, borderColor: '#7C3AED', borderWidth: 1 }]} />

      {/* Ambient glow bloom */}
      <Animated.View style={[lh.glowBloom, { opacity: glowOp }]} />

      {/* Bolt layers — wide glow to tight edge */}
      <Svg width={200} height={260} viewBox="0 0 200 260">
        <Path d={BOLT} fill="none" stroke="#6D28D9" strokeWidth={44} strokeOpacity={0.05} strokeLinejoin="miter" />
        <Path d={BOLT} fill="none" stroke="#7C3AED" strokeWidth={30} strokeOpacity={0.10} strokeLinejoin="miter" />
        <Path d={BOLT} fill="none" stroke="#8B5CF6" strokeWidth={17} strokeOpacity={0.22} strokeLinejoin="miter" />
        <Path d={BOLT} fill="none" stroke="#A78BFA" strokeWidth={7}  strokeOpacity={0.58} strokeLinejoin="miter" />
        <Path d={BOLT} fill="none" stroke="#DDD6FE" strokeWidth={2.5} strokeOpacity={0.88} strokeLinejoin="miter" />
        <Path d={BOLT} fill="#8B5CF6" fillOpacity={0.05} />
      </Svg>

      {/* White core — flickers independently */}
      <Animated.View style={[lh.coreOverlay, { opacity: flicker }]}>
        <Svg width={200} height={260} viewBox="0 0 200 260">
          <Path d={BOLT} fill="none" stroke="#FFFFFF" strokeWidth={1.1} strokeOpacity={0.95} strokeLinejoin="miter" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const lh = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 0.75,
  },
  glowBloom: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: 'transparent',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 85,
    shadowOpacity: 1,
  },
  coreOverlay: { position: 'absolute' },
});

// ─── Host button (primary CTA) ────────────────────────────────────────────────
function HostButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 12 }).start()}
      onPress={onPress}
      style={{ width: '100%' }}
    >
      <Animated.View style={[hb.shadow, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={['#4F1D96', '#7C3AED', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={hb.face}
        >
          <Ionicons name="game-controller" size={20} color="rgba(255,255,255,0.9)" />
          <Text style={hb.label}>Host a Game</Text>
          <Ionicons name="arrow-forward" size={15} color="rgba(255,255,255,0.55)" />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const hb = StyleSheet.create({
  shadow: {
    width: '100%',
    borderRadius: 18,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 22,
    shadowOpacity: 0.55,
    elevation: 10,
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 18,
    gap: 10,
  },
  label: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
});

// ─── Join button (glass outline) ──────────────────────────────────────────────
function JoinButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 12 }).start()}
      onPress={onPress}
      style={{ width: '100%' }}
    >
      <Animated.View style={[jb.outer, { transform: [{ scale }] }]}>
        <View style={jb.face}>
          <Ionicons name="enter" size={20} color="rgba(167,139,250,0.85)" />
          <Text style={jb.label}>Join a Game</Text>
          <Ionicons name="arrow-forward" size={15} color="rgba(167,139,250,0.38)" />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const jb = StyleSheet.create({
  outer: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 246, 0.28)',
    backgroundColor: 'rgba(124, 92, 246, 0.06)',
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    gap: 10,
  },
  label: { color: '#A78BFA', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: Props) {
  const { userLoaded, currentUser, authError } = useGame();

  const titleFade   = useRef(new Animated.Value(0)).current;
  const titleSlide  = useRef(new Animated.Value(-22)).current;
  const heroFade    = useRef(new Animated.Value(0)).current;
  const heroScale   = useRef(new Animated.Value(0.86)).current;
  const bottomFade  = useRef(new Animated.Value(0)).current;
  const bottomSlide = useRef(new Animated.Value(26)).current;
  const glowPulse   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (userLoaded && !authError && !currentUser) {
      navigation.replace('UsernameSetup');
    }
  }, [userLoaded, currentUser, authError]);

  useEffect(() => {
    if (!currentUser) return;

    Animated.stagger(130, [
      Animated.parallel([
        Animated.timing(titleFade,  { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(heroFade,  { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 55 }),
      ]),
      Animated.parallel([
        Animated.timing(bottomFade,  { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(bottomSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 3000, useNativeDriver: false }),
        Animated.timing(glowPulse, { toValue: 0, duration: 3000, useNativeDriver: false }),
      ])
    ).start();
  }, [currentUser]);

  const wordmarkGlow = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [6, 18] });

  if (!userLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050408', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (authError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#050408', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#F43F5E', fontSize: 16, textAlign: 'center', fontWeight: '600' }}>
          Could not connect
        </Text>
        <Text style={{ color: '#6B6B8A', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
          {authError}{'\n'}Check your connection and restart the app.
        </Text>
      </SafeAreaView>
    );
  }

  if (!currentUser) return null;

  return (
    <SafeAreaView style={s.safe}>
      <BackgroundAtmosphere />

      <View style={s.container}>

        {/* ── Title block ── */}
        <Animated.View style={[s.titleBlock, { opacity: titleFade, transform: [{ translateY: titleSlide }] }]}>
          <Text style={s.greeting}>Hey, {currentUser.username}</Text>

          <View style={s.wordmarkRow}>
            <View style={s.ruleLine} />
            <Animated.Text
              style={[s.wordmark, { textShadowRadius: wordmarkGlow } as any]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              ICEBREAKER
            </Animated.Text>
            <View style={s.ruleLine} />
          </View>

          <View style={s.tagPill}>
            <Text style={s.tagText}>7 GAMES</Text>
          </View>
        </Animated.View>

        {/* ── Hero ── */}
        <Animated.View style={[s.heroWrap, { opacity: heroFade, transform: [{ scale: heroScale }] }]}>
          <LightningHero />
        </Animated.View>

        {/* ── Bottom CTA block ── */}
        <Animated.View style={[s.bottom, { opacity: bottomFade, transform: [{ translateY: bottomSlide }] }]}>
          <Text style={s.subtitle}>Play the game. Break the ice.</Text>
          <View style={s.buttonStack}>
            <HostButton onPress={() => navigation.navigate('HostLobby')} />
            <JoinButton onPress={() => navigation.navigate('JoinRoom')} />
          </View>
        </Animated.View>

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#050408',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },

  // Title block
  titleBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5A5A7A',
    letterSpacing: 0.4,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  ruleLine: {
    flex: 1,
    height: 0.75,
    backgroundColor: 'rgba(124, 92, 246, 0.22)',
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 9,
    color: '#EDE9FE',
    textShadowColor: '#8B5CF6',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
    textAlign: 'center',
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(109, 40, 217, 0.25)',
    backgroundColor: 'rgba(109, 40, 217, 0.07)',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5B21B6',
    letterSpacing: 2.5,
  },

  // Hero
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom block
  bottom: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#55556A',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  buttonStack: {
    width: '100%',
    gap: 10,
  },
});
