import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Animated, Text, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

// ── Imperative API (works outside React tree) ────────────────────────────────

type ToastEntry = { id: number; message: string };

let _nextId = 0;
let _listener: ((entry: ToastEntry) => void) | null = null;

/** Call from anywhere — no hooks or context needed. */
export function showToast(message: string) {
  const entry: ToastEntry = { id: _nextId++, message };
  if (_listener) _listener(entry);
}

// ── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ message, onDone }: { message: string; onDone: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss after 3s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => onDone());
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY }], opacity }]}>
      <Text style={styles.text} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
}

// ── Provider (mount once at app root) ────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    _listener = (entry) => setToasts(prev => [...prev, entry]);
    return () => { _listener = null; };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <>
      {children}
      {toasts.length > 0 && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.container, { top: insets.top + 4 } as ViewStyle]}
        >
          {toasts.map(t => (
            <ToastItem key={t.id} message={t.message} onDone={() => remove(t.id)} />
          ))}
        </Animated.View>
      )}
    </>
  );
}

// ── Hook (optional, for components that prefer hooks) ────────────────────────

export function useToast() {
  return { showToast };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    left: 12,
    alignItems: 'flex-end',
    zIndex: 99999,
  },
  toast: {
    backgroundColor: 'rgba(30, 30, 39, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.xs,
    maxWidth: 300,
  },
  text: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
