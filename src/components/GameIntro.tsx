import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';

interface Rule {
  emoji: string;
  text: string;
  bold?: string;
  boldColor?: string;
}

interface Props {
  emoji: string;
  title: string;
  tagline: string;
  rules: Rule[];
  isHost: boolean;
  onStart: () => void;
  buttonLabel?: string;
}

function StaggerIn({ delay, children, style }: {
  delay: number;
  children: React.ReactNode;
  style?: any;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 350 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 350 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}

export default function GameIntro({ emoji, title, tagline, rules, isHost, onStart, buttonLabel = 'START GAME' }: Props) {
  const [starting, setStarting] = useState(false);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <StaggerIn delay={0}>
          <Text style={s.emoji}>{emoji}</Text>
        </StaggerIn>

        <StaggerIn delay={80}>
          <Text style={s.title}>{title}</Text>
        </StaggerIn>

        <StaggerIn delay={160}>
          <Text style={s.tagline}>{tagline}</Text>
        </StaggerIn>

        <StaggerIn delay={240} style={{ width: '100%' }}>
          <View style={s.card}>
            {rules.map((rule, i) => (
              <View key={i} style={s.rule}>
                <Text style={s.bullet}>{rule.emoji}</Text>
                <Text style={s.ruleText}>{rule.text}</Text>
              </View>
            ))}
          </View>
        </StaggerIn>

        <StaggerIn delay={360} style={{ width: '100%' }}>
          {isHost ? (
            <TouchableOpacity
              style={[s.startBtn, starting && s.startBtnDisabled]}
              disabled={starting}
              onPress={() => { setStarting(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onStart(); }}
            >
              <Text style={s.startBtnText}>{starting ? 'Starting...' : buttonLabel}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.waiting}>Waiting for the host to start…</Text>
          )}
        </StaggerIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, alignItems: 'center', gap: 16, paddingBottom: 40 },
  emoji: { fontSize: 48, marginTop: 12 },
  title: { fontSize: 28, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: 1 },
  tagline: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.text2, textAlign: 'center', marginBottom: 4 },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    ...SHADOWS.card,
  },
  rule: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { fontSize: 16, width: 24 },
  ruleText: { flex: 1, fontSize: 14, fontFamily: FONTS.medium, color: COLORS.text, lineHeight: 20 },
  startBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold, letterSpacing: 1 },
  waiting: { color: COLORS.text2, fontSize: 14, fontFamily: FONTS.medium, fontStyle: 'italic', marginTop: 8 },
});
