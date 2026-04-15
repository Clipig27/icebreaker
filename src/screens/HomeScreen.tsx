import React, { useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
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

const { width, height } = Dimensions.get('window');

// ─── Radial purple glow ────────────────────────────────────────────────────────
function RadialGlow() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 3000, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 3000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const op1 = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });
  const op2 = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] });
  const op3 = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.18] });
  const sc1 = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1.07] });

  return (
    <View style={glow.wrap} pointerEvents="none">
      <Animated.View style={[glow.outer, { opacity: op3 }]} />
      <Animated.View style={[glow.mid, { opacity: op2 }]} />
      <Animated.View style={[glow.inner, { opacity: op1, transform: [{ scale: sc1 }] }]} />
    </View>
  );
}

const glow = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 360,
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outer: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'transparent',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 100,
    shadowOpacity: 1,
  },
  mid: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'transparent',
    shadowColor: '#7C5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 70,
    shadowOpacity: 1,
  },
  inner: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'transparent',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 50,
    shadowOpacity: 1,
  },
});

// ─── Crystal / lightning hero ──────────────────────────────────────────────────
function CrystalHero() {
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const innerPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 10000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(innerPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(innerPulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const outerGlowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.65] });
  const outerGlowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const innerOpacity = innerPulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  const innerScale = innerPulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] });

  return (
    <View style={crystal.container}>
      <Animated.View
        style={[crystal.glowRing, { opacity: outerGlowOpacity, transform: [{ scale: outerGlowScale }] }]}
      />
      <Animated.View style={[crystal.midRing, { opacity: outerGlowOpacity }]} />

      {/* Outer shard ring */}
      <Animated.View style={[crystal.shardRing, { transform: [{ rotate: spin }] }]}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
          <View
            key={i}
            style={[
              crystal.shard,
              {
                transform: [{ rotate: `${deg}deg` }, { translateY: -78 }],
                opacity: i % 2 === 0 ? 0.95 : 0.55,
                height: i % 2 === 0 ? 30 : 20,
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Counter-rotating inner shards */}
      <Animated.View
        style={[crystal.shardRing, { transform: [{ rotate: spin }, { scaleX: -1 }], opacity: 0.65 }]}
      >
        {[22, 67, 112, 157, 202, 247, 292, 337].map((deg, i) => (
          <View
            key={i}
            style={[
              crystal.shardInner,
              { transform: [{ rotate: `${deg}deg` }, { translateY: -52 }] },
            ]}
          />
        ))}
      </Animated.View>

      {/* Core gem */}
      <Animated.View style={[crystal.core, { opacity: innerOpacity, transform: [{ scale: innerScale }] }]}>
        <View style={crystal.facetTop} />
        <View style={crystal.facetLeft} />
        <View style={crystal.facetRight} />
        <View style={crystal.facetBottomLeft} />
        <View style={crystal.facetBottomRight} />
        <View style={crystal.sparkle} />
      </Animated.View>

      {/* Lightning bolt */}
      <View style={crystal.boltContainer} pointerEvents="none">
        <View style={crystal.boltTop} />
        <View style={crystal.boltBottom} />
      </View>
    </View>
  );
}

const crystal = StyleSheet.create({
  container: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  glowRing: {
    position: 'absolute', width: 230, height: 230, borderRadius: 115,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#7C5CF6',
    shadowColor: '#7C5CF6', shadowOffset: { width: 0, height: 0 }, shadowRadius: 44, shadowOpacity: 1,
  },
  midRing: {
    position: 'absolute', width: 168, height: 168, borderRadius: 84,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#A78BFA',
    shadowColor: '#A78BFA', shadowOffset: { width: 0, height: 0 }, shadowRadius: 22, shadowOpacity: 1,
  },
  shardRing: { position: 'absolute', width: 156, height: 156, alignItems: 'center', justifyContent: 'center' },
  shard: {
    position: 'absolute', width: 6, height: 28, borderRadius: 3, backgroundColor: '#9D80FF',
    shadowColor: '#9D80FF', shadowOffset: { width: 0, height: 0 }, shadowRadius: 10, shadowOpacity: 1,
  },
  shardInner: {
    position: 'absolute', width: 4, height: 16, borderRadius: 2, backgroundColor: '#C4AAFF',
    shadowColor: '#C4AAFF', shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 0.9,
  },
  core: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  facetTop: {
    position: 'absolute', top: 0,
    width: 0, height: 0,
    borderLeftWidth: 19, borderRightWidth: 19, borderBottomWidth: 30,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#C4AAFF',
    shadowColor: '#A78BFA', shadowOffset: { width: 0, height: 0 }, shadowRadius: 14, shadowOpacity: 1,
  },
  facetLeft: {
    position: 'absolute', left: 0, top: 20,
    width: 0, height: 0,
    borderTopWidth: 15, borderBottomWidth: 21, borderRightWidth: 38,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#7C5CF6',
  },
  facetRight: {
    position: 'absolute', right: 0, top: 20,
    width: 0, height: 0,
    borderTopWidth: 15, borderBottomWidth: 21, borderLeftWidth: 38,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#5B3EC8',
  },
  facetBottomLeft: {
    position: 'absolute', bottom: 0, left: 10,
    width: 0, height: 0,
    borderTopWidth: 28, borderRightWidth: 17, borderLeftWidth: 7,
    borderTopColor: '#9D80FF', borderRightColor: 'transparent', borderLeftColor: 'transparent',
  },
  facetBottomRight: {
    position: 'absolute', bottom: 0, right: 10,
    width: 0, height: 0,
    borderTopWidth: 28, borderLeftWidth: 17, borderRightWidth: 7,
    borderTopColor: '#8A6EE8', borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  sparkle: {
    position: 'absolute', top: 17, left: 23,
    width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#F0EAFF',
    shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 1,
  },
  boltContainer: {
    position: 'absolute', width: 32, height: 56,
    top: '50%', left: '50%', marginLeft: -16, marginTop: -28,
  },
  boltTop: {
    position: 'absolute', top: 0, right: 2,
    width: 0, height: 0,
    borderBottomWidth: 32, borderRightWidth: 19, borderLeftWidth: 11,
    borderBottomColor: 'rgba(255,255,255,0.22)',
    borderRightColor: 'transparent', borderLeftColor: 'transparent',
  },
  boltBottom: {
    position: 'absolute', bottom: 0, left: 2,
    width: 0, height: 0,
    borderTopWidth: 32, borderLeftWidth: 19, borderRightWidth: 11,
    borderTopColor: 'rgba(255,255,255,0.14)',
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
});

// ─── Floating particles ────────────────────────────────────────────────────────
function Particles() {
  const count = 28;
  const refs = Array.from({ length: count }, () => useRef(new Animated.Value(Math.random())).current);

  const meta = refs.map((_, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * 3.5 + 0.8,
    color: i % 5 === 0 ? '#C4AAFF' : i % 3 === 0 ? '#5B3EC8' : '#9D80FF',
    delay: Math.random() * 4000,
  }));

  useEffect(() => {
    refs.forEach((ref, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(meta[i].delay),
          Animated.timing(ref, { toValue: Math.random() * 0.75 + 0.1, duration: 2000 + Math.random() * 2000, useNativeDriver: true }),
          Animated.timing(ref, { toValue: 0.04, duration: 2000 + Math.random() * 2000, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {refs.map((ref, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: meta[i].x,
            top: meta[i].y,
            width: meta[i].size,
            height: meta[i].size,
            borderRadius: meta[i].size / 2,
            backgroundColor: meta[i].color,
            opacity: ref,
            shadowColor: meta[i].color,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 5,
            shadowOpacity: 1,
          }}
        />
      ))}
    </View>
  );
}

// ─── Gradient multi button ────────────────────────────────────────────────────
function MultiButton({
  label, icon, colors, glowColor, onPress,
}: {
  label: string;
  icon: string;
  colors: [string, string];
  glowColor: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[mb.outer, { transform: [{ scale }] }]}>
        {/* Glow ring */}
        <Animated.View style={[mb.glow, { shadowColor: glowColor, opacity: glowOpacity }]} />
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[mb.face, { borderColor: glowColor + '55' }]}>
          <Text style={mb.icon}>{icon}</Text>
          <Text style={mb.label}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const mb = StyleSheet.create({
  outer: { width: '100%' },
  glow: {
    position: 'absolute', inset: 0,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    shadowOpacity: 1,
    backgroundColor: 'transparent',
  },
  face: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  icon:  { fontSize: 20 },
  label: { color: '#E8E8FF', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textAlign: 'center' },
});

// ─── Animated shimmer button ───────────────────────────────────────────────────
function StartButton({ onPress }: { onPress: () => void }) {
  const btnScale = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(-1)).current;
  const btnGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Looping shimmer sweep
    Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: -1, duration: 0, useNativeDriver: true }),
      ])
    ).start();

    // Button glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(btnGlow, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(btnGlow, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const shimmerX = shimmer.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width * 0.8, width * 0.8],
  });
  const glowOpacity = btnGlow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });

  function onIn() {
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  }
  function onOut() {
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[btn.outer, { transform: [{ scale: btnScale }] }]}>
        {/* Pulsing shadow ring underneath */}
        <Animated.View style={[btn.glowRing, { opacity: glowOpacity }]} />
        {/* Button face */}
        <View style={btn.face}>
          {/* Top sheen */}
          <View style={btn.sheen} />
          {/* Shimmer sweep */}
          <Animated.View style={[btn.shimmer, { transform: [{ translateX: shimmerX }] }]} />
          <Text style={btn.label}>START GAME</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const btn = StyleSheet.create({
  outer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: '104%',
    height: 72,
    borderRadius: 18,
    backgroundColor: 'transparent',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 28,
    shadowOpacity: 1,
  },
  face: {
    width: '100%',
    height: 64,
    borderRadius: 16,
    backgroundColor: '#7C5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#A78BFA',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ skewX: '-20deg' }],
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 5,
  },
});

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: Props) {
  const { userLoaded, currentUser, authError } = useGame();

  // ── All hooks must come before any conditional returns ────────────────────
  const titleFade   = useRef(new Animated.Value(0)).current;
  const titleSlide  = useRef(new Animated.Value(-20)).current;
  const heroFade    = useRef(new Animated.Value(0)).current;
  const heroScale   = useRef(new Animated.Value(0.88)).current;
  const bottomFade  = useRef(new Animated.Value(0)).current;
  const bottomSlide = useRef(new Animated.Value(24)).current;
  const titleGlow   = useRef(new Animated.Value(0)).current;

  // Redirect to onboarding if loaded but no profile / no username
  useEffect(() => {
    if (userLoaded && !authError && !currentUser) {
      navigation.replace('UsernameSetup');
    }
  }, [userLoaded, currentUser, authError]);

  // Start entrance animations only once we know the user has a profile
  useEffect(() => {
    if (!currentUser) return;

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(titleFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(heroFade,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }),
      ]),
      Animated.parallel([
        Animated.timing(bottomFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(bottomSlide, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(titleGlow, { toValue: 1, duration: 2800, useNativeDriver: false }),
        Animated.timing(titleGlow, { toValue: 0, duration: 2800, useNativeDriver: false }),
      ])
    ).start();
  }, [currentUser]);

  const titleShadowR = titleGlow.interpolate({ inputRange: [0, 1], outputRange: [14, 36] });

  // ── Conditional renders (after all hooks) ─────────────────────────────────

  // Auth / profile still loading
  if (!userLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7C5CF6" />
      </View>
    );
  }

  // Auth or network failure
  if (authError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0F0F13', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#F43F5E', fontSize: 16, textAlign: 'center', fontWeight: '600' }}>
          Could not connect
        </Text>
        <Text style={{ color: '#8585A0', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
          {authError}{'\n'}Check your connection and restart the app.
        </Text>
      </SafeAreaView>
    );
  }

  // No profile — navigation.replace('UsernameSetup') is in flight
  if (!currentUser) return null;

  return (
    <SafeAreaView style={s.safe}>
      {/* Scan lines */}
      <View style={s.scanLines} pointerEvents="none">
        {Array.from({ length: 50 }).map((_, i) => <View key={i} style={s.scanLine} />)}
      </View>

      {/* Floating particles */}
      <Particles />

      <View style={s.container}>
        {/* ── Title ── */}
        <Animated.View
          style={[s.titleWrap, { opacity: titleFade, transform: [{ translateY: titleSlide }] }]}
        >
          <Animated.Text
            style={[s.wordmark, { textShadowRadius: titleShadowR } as any]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            ICEBREAKER
          </Animated.Text>
          <View style={s.titleUnderline} />
        </Animated.View>

        {/* ── Hero ── */}
        <Animated.View
          style={[s.heroWrap, { opacity: heroFade, transform: [{ scale: heroScale }] }]}
        >
          <RadialGlow />
          <CrystalHero />
        </Animated.View>

        {/* ── Bottom block ── */}
        <Animated.View
          style={[s.bottom, { opacity: bottomFade, transform: [{ translateY: bottomSlide }] }]}
        >
          <Text style={s.fixTheVibe}>FIX THE VIBE</Text>
          <Text style={s.subtitle}>Pass the phone. Play the game. Break the ice.</Text>
          <View style={s.btnWrap}>
            <StartButton onPress={() => navigation.navigate('PlayerSetup')} />
          </View>
          <View style={s.multiWrap}>
            <MultiButton
              label="Host a Game"
              icon="🎮"
              colors={['#2A1F4E', '#1A1230']}
              glowColor="#7C5CF6"
              onPress={() => navigation.navigate('HostLobby')}
            />
            <MultiButton
              label="Join a Game"
              icon="🔗"
              colors={['#0A2D35', '#061A20']}
              glowColor="#06B6D4"
              onPress={() => navigation.navigate('JoinRoom')}
            />
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scanLines: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'column',
    overflow: 'hidden',
    opacity: 0.03,
  },
  scanLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#9D80FF',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 20,
  },

  // Title
  titleWrap: {
    width: '100%',
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 5,
    color: '#EDE9FE',
    textShadowColor: '#8B5CF6',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
    width: '100%',
    textAlign: 'center',
  },
  titleUnderline: {
    marginTop: 10,
    width: 48,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#7C5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
    opacity: 0.7,
  },

  // Hero
  heroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },

  // Bottom block
  bottom: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  fixTheVibe: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 7,
    color: '#A78BFA',
    textShadowColor: '#7C5CF6',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A4A6A',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 4,
  },
  btnWrap: {
    width: '100%',
    marginTop: 8,
  },
  multiWrap: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 4,
  },
});
