import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import { useGame } from '../context/GameContext';

/**
 * Floating toast shown to non-host players when the host does something.
 * Renders as an absolutely-positioned banner — place it inside a
 * full-screen View with pointerEvents="box-none".
 */
export default function HostStatusBanner() {
  const { hostMessage, isHost } = useGame();

  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isHost || !hostMessage) return;

    // Slide in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0,   useNativeDriver: true, speed: 28, bounciness: 6 }),
      Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Slide out slightly before the timer in GameContext clears hostMessage
    const out = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -40, duration: 260, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 220, useNativeDriver: true }),
      ]).start();
    }, 2800);

    return () => clearTimeout(out);
  }, [hostMessage, isHost]);

  if (isHost || !hostMessage) return null;

  return (
    <View style={s.wrapper} pointerEvents="none">
      <Animated.View style={[s.banner, { opacity, transform: [{ translateY }] }]}>
        <Text style={s.dot}>●</Text>
        <Text style={s.text}>{hostMessage}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.5,
  },
  dot: {
    fontSize: 7,
    color: COLORS.accentHi,
  },
  text: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
});
