import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

interface Props {
  message: string;
  onDismiss?: () => void;
  /** If true the banner auto-dismisses after `autoDismissMs` ms */
  autoDismiss?: boolean;
  autoDismissMs?: number;
}

/**
 * Animated inline error banner.
 * Slides down from above and optionally auto-dismisses.
 *
 * Usage:
 *   {!!error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
 */
export function ErrorBanner({ message, onDismiss, autoDismiss = false, autoDismissMs = 4000 }: Props) {
  const translateY = useRef(new Animated.Value(-8)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 6 }),
      Animated.timing(opacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    if (autoDismiss && onDismiss) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
  }, [message]);

  return (
    <Animated.View style={[s.wrap, { opacity, transform: [{ translateY }] }]}>
      <View style={s.iconWrap}>
        <Text style={s.icon}>!</Text>
      </View>
      <Text style={s.msg} numberOfLines={3}>{message}</Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={10} style={s.close}>
          <Text style={s.closeText}>×</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.30)',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    width: '100%',
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
  },
  msg: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  close: {
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  closeText: {
    color: '#FCA5A5',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '300',
  },
});
