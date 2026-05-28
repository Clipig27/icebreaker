import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

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

export default function GameIntro({ emoji, title, tagline, rules, isHost, onStart, buttonLabel = 'START GAME' }: Props) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.emoji}>{emoji}</Text>
        <Text style={s.title}>{title}</Text>
        <Text style={s.tagline}>{tagline}</Text>

        <View style={s.card}>
          {rules.map((rule, i) => (
            <View key={i} style={s.rule}>
              <Text style={s.bullet}>{rule.emoji}</Text>
              <Text style={s.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>

        {isHost ? (
          <TouchableOpacity style={s.startBtn} onPress={onStart}>
            <Text style={s.startBtnText}>{buttonLabel}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.waiting}>Waiting for the host to start…</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, alignItems: 'center', gap: 16, paddingBottom: 40 },
  emoji: { fontSize: 48, marginTop: 12 },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: 1 },
  tagline: { fontSize: 14, fontWeight: '500', color: COLORS.text2, textAlign: 'center', marginBottom: 4 },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rule: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { fontSize: 16, width: 24 },
  ruleText: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text, lineHeight: 20 },
  startBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  waiting: { color: COLORS.text2, fontSize: 14, fontWeight: '500', fontStyle: 'italic', marginTop: 8 },
});
