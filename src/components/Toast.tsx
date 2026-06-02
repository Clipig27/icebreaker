import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Animated, Text, StyleSheet, ViewStyle, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme';

// ── Imperative API (works outside React tree) ────────────────────────────────

type ToastAction = { label: string; onPress: () => void };
type ToastEntry = { id: number; message: string; action?: ToastAction; durationMs?: number };

let _nextId = 0;
let _listener: ((entry: ToastEntry) => void) | null = null;

/** Call from anywhere — no hooks or context needed. */
export function showToast(message: string, options?: { action?: ToastAction; durationMs?: number }) {
  const entry: ToastEntry = { id: _nextId++, message, action: options?.action, durationMs: options?.durationMs };
  if (_listener) _listener(entry);
}

// ── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ entry, onDone }: { entry: ToastEntry; onDone: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -80, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDone());
  }, []);

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss (longer if has action button)
    const duration = entry.durationMs ?? (entry.action ? 6000 : 3000);
    const timer = setTimeout(dismiss, duration);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.toast, entry.action && styles.toastWithAction, { transform: [{ translateY }], opacity }]}>
      <Text style={styles.text} numberOfLines={2}>{entry.message}</Text>
      {entry.action && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            entry.action!.onPress();
            dismiss();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.actionText}>{entry.action.label}</Text>
        </TouchableOpacity>
      )}
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
            <ToastItem key={t.id} entry={t} onDone={() => remove(t.id)} />
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
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.xs,
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  toastWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 340,
  },
  text: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: FONTS.semibold,
    flexShrink: 1,
  },
  actionBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONTS.bold,
  },
});
