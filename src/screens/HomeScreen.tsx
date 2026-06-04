import React, { useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseError } from '../utils/errorUtils';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import { FONTS } from '../constants/theme';
import SkiaBackground from '../components/SkiaBackground';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Play'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

// ─── Ice particle that drifts upward from the wordmark ────────────────────────
type IceParticleProps = {
  ml: number; topOffset: number; dx: number; dy: number;
  color: string; size: number; dur: number; lag: number;
};
function IceParticle({ ml, topOffset, dx, dy, color, size, dur, lag }: IceParticleProps) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = () => {
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(lag),
        Animated.timing(anim, { toValue: 1, duration: dur, useNativeDriver: true }),
      ]).start(() => run());
    };
    run();
    return () => anim.stopAnimation();
  }, []);
  const opacity    = anim.interpolate({ inputRange: [0, 0.12, 0.65, 1], outputRange: [0, 1, 0.55, 0] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const scale      = anim.interpolate({ inputRange: [0, 0.18, 0.8, 1], outputRange: [0, 1, 0.5, 0] });
  return (
    <Animated.View style={{
      position: 'absolute', left: '50%', top: topOffset,
      marginLeft: ml - size / 2, width: size, height: size,
      borderRadius: size * 0.25, backgroundColor: color,
      opacity, transform: [{ translateX }, { translateY }, { scale }],
      shadowColor: color, shadowRadius: 5, shadowOpacity: 0.95,
      shadowOffset: { width: 0, height: 0 },
    }} />
  );
}
function IceParticles() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <IceParticle ml={-90}  topOffset={28} dx={-10} dy={-55} color="#7DF9FF" size={4} dur={2200} lag={0}    />
      <IceParticle ml={90}   topOffset={32} dx={8}   dy={-48} color="#A5F3FC" size={3} dur={1900} lag={400}  />
      <IceParticle ml={-52}  topOffset={24} dx={-25} dy={-62} color="#C4B5FD" size={5} dur={2500} lag={700}  />
      <IceParticle ml={56}   topOffset={30} dx={20}  dy={-52} color="#67E8F9" size={3} dur={1800} lag={1100} />
      <IceParticle ml={-8}   topOffset={22} dx={-6}  dy={-70} color="#E0F2FE" size={4} dur={2800} lag={300}  />
      <IceParticle ml={28}   topOffset={34} dx={15}  dy={-60} color="#BAE6FD" size={3} dur={2100} lag={900}  />
      <IceParticle ml={-72}  topOffset={26} dx={-18} dy={-45} color="#A78BFA" size={4} dur={2300} lag={600}  />
      <IceParticle ml={72}   topOffset={28} dx={12}  dy={-58} color="#7DD3FC" size={3} dur={1700} lag={1400} />
      <IceParticle ml={-32}  topOffset={32} dx={-28} dy={-68} color="#F0ABFC" size={3} dur={2600} lag={200}  />
      <IceParticle ml={44}   topOffset={24} dx={30}  dy={-52} color="#93C5FD" size={4} dur={2000} lag={1000} />
      <IceParticle ml={-112} topOffset={30} dx={-12} dy={-40} color="#BAE6FD" size={3} dur={2400} lag={500}  />
      <IceParticle ml={112}  topOffset={28} dx={15}  dy={-46} color="#7DF9FF" size={4} dur={2700} lag={1200} />
    </View>
  );
}

// ─── Sparkle accent for the wordmark ─────────────────────────────────────────
function TitleSparkle({ style, delay = 0 }: { style?: any; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    const run = () => {
      if (!active) return;
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 480, useNativeDriver: true }),
        Animated.delay(1600),
      ]).start(({ finished }) => { if (finished) run(); });
    };
    run();
    return () => { active = false; anim.stopAnimation(); };
  }, []);
  const scale = anim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.1, 1.5, 0.1] });
  return (
    <Animated.Text style={[{ color: '#5CE8F5', fontSize: 10, opacity: anim, transform: [{ scale }] }, style]}>
      ✦
    </Animated.Text>
  );
}

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

// ─── Cosmic background — stars, glass cracks, floating geometry ──────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Star colors — white, ice-blue, lavender, cyan
const SC = ['#FFFFFF', '#DDF4FF', '#EDE9FE', '#A5F3FC', '#C4B5FD', '#E0E7FF'] as const;

// 65 dim background stars [xFrac, yFrac, radius, colorIdx]
const BG_STARS: [number, number, number, number][] = [
  [0.08,0.03,1.2,0],[0.22,0.06,0.9,2],[0.35,0.02,1.0,1],[0.50,0.05,1.3,3],
  [0.64,0.03,0.8,0],[0.78,0.07,1.1,4],[0.91,0.04,1.2,1],[0.15,0.09,0.7,5],
  [0.44,0.11,1.0,2],[0.70,0.09,0.9,0],[0.56,0.13,0.8,3],
  [0.03,0.18,1.4,1],[0.12,0.22,0.8,3],[0.25,0.16,1.1,0],[0.38,0.20,0.9,2],
  [0.52,0.17,1.3,4],[0.66,0.21,0.7,1],[0.80,0.15,1.0,5],[0.92,0.22,1.2,0],
  [0.97,0.14,0.8,2],[0.06,0.28,1.0,4],[0.18,0.31,0.7,0],[0.30,0.28,1.2,3],
  [0.02,0.38,1.1,2],[0.97,0.36,1.3,5],[0.01,0.50,0.9,0],[0.98,0.52,1.0,3],
  [0.03,0.64,1.2,4],[0.97,0.67,0.8,1],[0.02,0.78,1.0,5],[0.96,0.75,1.1,2],
  [0.04,0.90,0.9,0],[0.95,0.88,1.3,4],
  [0.14,0.35,0.8,3],[0.28,0.40,1.0,1],[0.42,0.37,0.7,0],[0.58,0.35,1.1,4],
  [0.72,0.38,0.9,2],[0.85,0.42,1.0,5],[0.20,0.55,0.8,0],[0.35,0.52,1.2,3],
  [0.48,0.48,0.7,1],[0.62,0.56,1.0,2],[0.76,0.50,0.9,4],[0.88,0.57,0.8,0],
  [0.10,0.65,1.1,5],[0.24,0.70,0.8,0],[0.38,0.67,1.3,2],[0.54,0.72,0.9,3],
  [0.68,0.66,1.1,1],[0.82,0.71,0.7,4],[0.90,0.64,1.0,5],
  [0.06,0.80,0.9,0],[0.18,0.84,1.2,3],[0.32,0.81,0.8,1],[0.46,0.86,1.0,2],
  [0.60,0.80,0.9,5],[0.74,0.85,1.3,0],[0.88,0.82,0.8,4],
  [0.14,0.93,0.7,1],[0.28,0.96,1.1,3],[0.44,0.91,0.9,0],[0.58,0.95,1.0,2],
  [0.72,0.92,0.8,5],[0.84,0.97,1.2,4],
];

// 12 bright twinkling stars [xFrac, yFrac, radius, colorIdx, delayMs]
const BRIGHT_STARS: [number, number, number, number, number][] = [
  [0.10,0.05,2.5,0,   0],[0.80,0.07,2.8,3, 400],
  [0.04,0.40,2.2,4, 800],[0.95,0.28,2.5,1, 200],
  [0.20,0.24,3.0,2,1100],[0.87,0.55,2.3,5, 600],
  [0.33,0.74,2.8,0, 300],[0.72,0.79,2.2,3, 900],
  [0.52,0.14,2.5,1, 500],[0.07,0.88,2.8,4,1300],
  [0.93,0.86,2.3,2, 700],[0.62,0.97,2.5,5, 100],
];

// Glass crack lines radiating from focal point (center of hero area)
const _FX = (SCREEN_W * 0.50).toFixed(1);
const _FY = (SCREEN_H * 0.44).toFixed(1);
const _p  = (xf: number, yf: number) =>
  `${(SCREEN_W * xf).toFixed(1)},${(SCREEN_H * yf).toFixed(1)}`;
const CRACKS = [
  `M${_FX},${_FY} L${_p(0.08,0.04)} L${_p(0.02,0.01)}`,
  `M${_FX},${_FY} L${_p(0.30,0.02)}`,
  `M${_FX},${_FY} L${_p(0.68,0.03)} L${_p(0.76,0.00)}`,
  `M${_FX},${_FY} L${_p(0.96,0.16)}`,
  `M${_FX},${_FY} L${_p(0.98,0.52)}`,
  `M${_FX},${_FY} L${_p(0.92,0.84)}`,
  `M${_FX},${_FY} L${_p(0.56,0.99)}`,
  `M${_FX},${_FY} L${_p(0.22,0.97)} L${_p(0.16,0.99)}`,
  `M${_FX},${_FY} L${_p(0.03,0.76)}`,
  `M${_FX},${_FY} L${_p(0.02,0.30)}`,
  // Secondary short fractures not from focal point
  `M${_p(0.56,0.40)} L${_p(0.72,0.28)}`,
  `M${_p(0.44,0.48)} L${_p(0.30,0.36)}`,
  `M${_p(0.52,0.46)} L${_p(0.60,0.64)}`,
  `M${_p(0.38,0.52)} L${_p(0.26,0.60)}`,
];

// Floating geometric outlines [xFrac, yFrac, size, angleDeg, type(0=diamond,1=tri,2=hex)]
function makeGeo(cx: number, cy: number, sz: number, a: number, t: number): string {
  const r = (a * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const xf = (x: number, y: number) =>
    `${(cx + (x * cos - y * sin) * sz).toFixed(1)},${(cy + (x * sin + y * cos) * sz).toFixed(1)}`;
  if (t === 0) return `M ${xf(0,-1)} L ${xf(0.65,0)} L ${xf(0,1)} L ${xf(-0.65,0)} Z`;
  if (t === 1) return `M ${xf(0,-1)} L ${xf(0.87,0.5)} L ${xf(-0.87,0.5)} Z`;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const ai = (i * 60 * Math.PI) / 180;
    return xf(Math.cos(ai), Math.sin(ai));
  });
  return `M ${pts.join(' L ')} Z`;
}
const GEO_PATHS = ([
  [0.08,0.12, 9, 20,0],[0.88,0.10, 7,-15,1],[0.05,0.55, 8, 35,2],
  [0.94,0.62, 9,-30,0],[0.18,0.82, 7, 50,1],[0.82,0.78,10, -5,2],
  [0.40,0.08, 6, 60,0],[0.66,0.90, 8,-45,1],[0.75,0.25, 7, 15,2],
  [0.25,0.45, 6,-25,0],[0.55,0.68, 8, 40,1],[0.12,0.50, 7,-10,2],
] as [number,number,number,number,number][]).map(([xf,yf,sz,a,t]) =>
  makeGeo(SCREEN_W * xf, SCREEN_H * yf, sz, a, t)
);

// Individual twinkling bright star
function BrightStar({ xf, yf, r, ci, delay }: {
  xf: number; yf: number; r: number; ci: number; delay: number;
}) {
  const anim = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1.0,  duration:  700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.15, duration: 1100, useNativeDriver: true }),
      Animated.delay(400 + (delay % 600)),
    ])).start();
  }, []);
  const col = SC[ci];
  return (
    <Animated.View style={{
      position: 'absolute',
      left:   SCREEN_W * xf - r,
      top:    SCREEN_H * yf - r,
      width:  r * 2,
      height: r * 2,
      borderRadius: r,
      backgroundColor: col,
      opacity: anim,
      shadowColor: col,
      shadowRadius: r * 3.5,
      shadowOpacity: 0.9,
      shadowOffset: { width: 0, height: 0 },
    }} />
  );
}

// ── Cosmic background component ───────────────────────────────────────────────
function CosmicBackground() {
  const breathe = useRef(new Animated.Value(0.65)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.0,  duration: 6000, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0.55, duration: 7000, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Static SVG layer: dim stars + glass cracks + geometry */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: breathe }]}>
        <Svg width={SCREEN_W} height={SCREEN_H}>
          {BG_STARS.map(([xf, yf, r, ci], i) => (
            <Circle
              key={`st${i}`}
              cx={(SCREEN_W * xf).toFixed(1)}
              cy={(SCREEN_H * yf).toFixed(1)}
              r={r}
              fill={SC[ci]}
              opacity={0.30 + r * 0.08}
            />
          ))}
          {CRACKS.map((d, i) => (
            <Path key={`cr${i}`} d={d}
              stroke="rgba(190,220,255,0.11)"
              strokeWidth={0.55}
              fill="none"
            />
          ))}
          {GEO_PATHS.map((d, i) => (
            <Path key={`gp${i}`} d={d}
              fill="none"
              stroke="rgba(175,210,255,0.18)"
              strokeWidth={0.65}
            />
          ))}
        </Svg>
      </Animated.View>
      {/* Individually twinkling bright stars */}
      {BRIGHT_STARS.map(([xf, yf, r, ci, delay], i) => (
        <BrightStar key={`bs${i}`} xf={xf} yf={yf} r={r} ci={ci} delay={delay} />
      ))}
    </View>
  );
}

function LightningHero() {
  const breathe      = useRef(new Animated.Value(1)).current;
  const surge        = useRef(new Animated.Value(0)).current;
  const flicker      = useRef(new Animated.Value(1)).current;
  const ring1        = useRef(new Animated.Value(0.5)).current;
  const ring2        = useRef(new Animated.Value(0.25)).current;
  const ring3        = useRef(new Animated.Value(0.12)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.07, duration: 3200, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0.97, duration: 3200, useNativeDriver: true }),
    ])).start();

    // Non-native: drives shadowOpacity on glowBloom
    Animated.loop(Animated.sequence([
      Animated.delay(4800),
      Animated.timing(surge, { toValue: 1, duration: 190,  useNativeDriver: false }),
      Animated.timing(surge, { toValue: 0, duration: 1100, useNativeDriver: false }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.delay(2400),
      Animated.timing(flicker, { toValue: 0.3, duration: 55,  useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 1.0, duration: 75,  useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 0.5, duration: 45,  useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 1.0, duration: 95,  useNativeDriver: true }),
      Animated.delay(3200),
    ])).start();

    const ringPulse = (val: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 0.72, duration: 2600, useNativeDriver: true }),
        Animated.timing(val, { toValue: 0.08, duration: 2600, useNativeDriver: true }),
      ]));
    ringPulse(ring1, 0).start();
    ringPulse(ring2, 860).start();
    ringPulse(ring3, 1720).start();

  }, []);

  const glowOp = surge.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.30] });
  const BOLT   = 'M 155,15 L 50,130 L 110,130 L 50,245 L 155,130 L 95,130 Z';

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
  ring: { position: 'absolute', borderWidth: 0.75 },
  glowBloom: {
    position: 'absolute',
    width: 270, height: 270, borderRadius: 135,
    backgroundColor: 'transparent',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 85, shadowOpacity: 1,
  },
  coreOverlay: { position: 'absolute' },
});

// ─── Host button (primary CTA) ────────────────────────────────────────────────
function HostButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 60, bounciness: 0 }).start(); }}
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
  label: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold, flex: 1, textAlign: 'center' },
});

// ─── Join button (glass outline) ──────────────────────────────────────────────
function JoinButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start(); }}
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
  label: { color: '#A78BFA', fontSize: 16, fontFamily: FONTS.semibold, flex: 1, textAlign: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: Props) {
  const { userLoaded, currentUser, authError } = useGame();

  const titleFade   = useRef(new Animated.Value(0)).current;
  const titleSlide  = useRef(new Animated.Value(-40)).current;
  const heroFade    = useRef(new Animated.Value(0)).current;
  const heroScale   = useRef(new Animated.Value(0.6)).current;
  const bottomFade  = useRef(new Animated.Value(0)).current;
  const bottomSlide = useRef(new Animated.Value(50)).current;
  const glowPulse   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (userLoaded && !authError && !currentUser) {
      navigation.replace('UsernameSetup');
    }
  }, [userLoaded, currentUser, authError]);

  useEffect(() => {
    if (!currentUser) return;

    Animated.stagger(250, [
      Animated.parallel([
        Animated.timing(titleFade,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(titleSlide, { toValue: 0, useNativeDriver: true, friction: 8, tension: 40 }),
      ]),
      Animated.parallel([
        Animated.timing(heroFade,  { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 35 }),
      ]),
      Animated.parallel([
        Animated.timing(bottomFade,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(bottomSlide, { toValue: 0, useNativeDriver: true, friction: 8, tension: 40 }),
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
        <View style={{
          width: '100%',
          backgroundColor: 'rgba(244, 63, 94, 0.10)',
          borderWidth: 1,
          borderColor: 'rgba(244, 63, 94, 0.28)',
          borderRadius: 18,
          padding: 28,
          alignItems: 'center',
          gap: 12,
        }}>
          <View style={{
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            borderWidth: 1, borderColor: 'rgba(244, 63, 94, 0.30)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="wifi-outline" size={26} color="#F43F5E" />
          </View>
          <Text style={{ color: '#F2F2F7', fontSize: 17, fontFamily: FONTS.bold, textAlign: 'center' }}>
            Connection Failed
          </Text>
          <Text style={{ color: '#8585A0', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            {parseError(authError)}
          </Text>
          <Text style={{ color: '#3A3A50', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            Close and reopen the app to try again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentUser) return null;

  return (
    <SafeAreaView style={s.safe}>
      <SkiaBackground />
      <CosmicBackground />
      <BackgroundAtmosphere />

      <View style={s.container}>

        {/* ── Title block ── */}
        <Animated.View style={[s.titleBlock, { opacity: titleFade, transform: [{ translateY: titleSlide }] }]}>
          <IceParticles />
          <Text style={s.greeting}>Hey, {currentUser.username}</Text>

          <View style={s.wordmarkWrap}>
            <TitleSparkle style={{ position: 'absolute', left: 2,  top: 8  }} delay={0}    />
            <TitleSparkle style={{ position: 'absolute', right: 2, top: 5  }} delay={900}  />
            <TitleSparkle style={{ position: 'absolute', left: 26, top: -7 }} delay={400}  />
            <TitleSparkle style={{ position: 'absolute', right: 20, bottom: -3 }} delay={1300} />
            <Animated.Text
              style={[s.wordmark, { textShadowRadius: wordmarkGlow } as any]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              ICEBREAKER
            </Animated.Text>
          </View>

          {/* wordmark accent + tag pill removed */}
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
    fontFamily: FONTS.medium,
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
  wordmarkWrap: {
    width: '100%',
    alignItems: 'center',
  },
  wordmark: {
    width: '100%',
    fontSize: 46,
    fontFamily: FONTS.extrabold,
    letterSpacing: 7,
    color: '#FFFFFF',
    textShadowColor: '#9B6FFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 28,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  wordmarkAccent: {
    width: 56,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(124, 92, 246, 0.35)',
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
    fontFamily: FONTS.bold,
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
    fontFamily: FONTS.medium,
    color: '#55556A',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  buttonStack: {
    width: '100%',
    gap: 10,
  },
});
