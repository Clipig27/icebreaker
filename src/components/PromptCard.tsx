import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SHADOWS, RADIUS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromptCardProps {
  text: string;
  size?: 'lg' | 'md';
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPRING_CONFIG = { damping: 18, stiffness: 140, mass: 1 };
const EXIT_DURATION = 220;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PromptCard({
  text,
  size = 'lg',
  accentColor = COLORS.accent,
}: PromptCardProps) {
  // Track the currently-displayed text so we can swap after the exit animation.
  const [displayedText, setDisplayedText] = useState(text);
  const prevTextRef = useRef(text);
  const hasAnimatedRef = useRef(false);

  // ── Shared values ────────────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  // ── Idle floating animation ──────────────────────────────────────────────
  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 1800 }),
        withTiming(3, { duration: 1800 }),
      ),
      -1, // infinite
      true, // reverse
    );
  }, []);

  // ── Entry / exit animation when `text` changes ──────────────────────────
  useEffect(() => {
    const textActuallyChanged = prevTextRef.current !== text;
    prevTextRef.current = text;

    // If remounting with the same text, just show it immediately — no animation.
    if (!textActuallyChanged && hasAnimatedRef.current) {
      setDisplayedText(text);
      opacity.value = 1;
      translateX.value = 0;
      rotate.value = 0;
      scale.value = 1;
      return;
    }

    if (!hasAnimatedRef.current) {
      // First time seeing this text — spring in without exit.
      hasAnimatedRef.current = true;
      translateX.value = 300;
      rotate.value = 8;
      scale.value = 0.9;
      opacity.value = 0;

      translateX.value = withSpring(0, SPRING_CONFIG);
      rotate.value = withSpring(0, SPRING_CONFIG);
      scale.value = withSpring(1, SPRING_CONFIG);
      opacity.value = withTiming(1, { duration: 250 });
      return;
    }

    // ── Text changed — exit the old card, then spring in the new one ─────
    translateX.value = withTiming(-300, { duration: EXIT_DURATION });
    rotate.value = withTiming(-8, { duration: EXIT_DURATION });
    opacity.value = withTiming(0, { duration: EXIT_DURATION });

    const timeout = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDisplayedText(text);

      translateX.value = 300;
      rotate.value = 8;
      scale.value = 0.9;
      opacity.value = 0;

      translateX.value = withSpring(0, SPRING_CONFIG);
      rotate.value = withSpring(0, SPRING_CONFIG);
      scale.value = withSpring(1, SPRING_CONFIG);
      opacity.value = withTiming(1, { duration: 250 });
    }, EXIT_DURATION);

    return () => clearTimeout(timeout);
  }, [text]);

  // ── Animated style ───────────────────────────────────────────────────────
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Ghost card 2 (furthest back) */}
      <View style={[styles.card, styles.ghost, styles.ghost2]} />

      {/* Ghost card 1 */}
      <View style={[styles.card, styles.ghost, styles.ghost1]} />

      {/* Active card */}
      <Animated.View style={[styles.card, styles.activeCard, animatedStyle]}>
        {/* Accent glow along the top edge */}
        <View
          style={[styles.topGlow, { backgroundColor: accentColor }]}
        />

        <Text
          style={[
            styles.textBase,
            size === 'lg' ? styles.textLg : styles.textMd,
          ]}
        >
          {displayedText}
        </Text>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shared card shape
  card: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    padding: 24,
    width: '100%',
    ...SHADOWS.card,
  },

  // Active card sits on top
  activeCard: {
    zIndex: 3,
    overflow: 'hidden',
  },

  // Ghost cards are decorative — positioned behind
  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0.45,
  },
  ghost1: {
    zIndex: 2,
    transform: [{ translateY: 6 }, { scale: 0.97 }],
  },
  ghost2: {
    zIndex: 1,
    transform: [{ translateY: 12 }, { scale: 0.94 }],
    opacity: 0.25,
  },

  // Accent glow bar at the top
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },

  // Text
  textBase: {
    color: COLORS.text,
    textAlign: 'center',
  },
  textLg: {
    fontSize: 26,
    fontFamily: FONTS.extrabold,
    lineHeight: 36,
  },
  textMd: {
    fontSize: 19,
    fontFamily: FONTS.bold,
    lineHeight: 27,
  },
});
