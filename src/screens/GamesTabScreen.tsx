/**
 * GamesTabScreen
 *
 * Browse-only game catalog for the Games tab.
 * Does NOT assume an active session — always funnels through PlayerSetup.
 * GameSelectScreen remains in the root stack for the in-session flow.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { COLORS, SPACING } from '../constants/theme';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Games'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const GAMES = [
  {
    id: 'lieDetector',
    title: 'Lie Detector',
    emoji: '🕵️',
    desc: 'Answer a prompt — then fool everyone into guessing wrong.',
  },
  {
    id: 'talentShow',
    title: 'Talent Show',
    emoji: '🎭',
    desc: 'Perform a challenge. Survive the buzz. Win the crowd.',
  },
  {
    id: 'standOut',
    title: 'Stand Out',
    emoji: '⚡',
    desc: 'Give a unique answer or get penalised. First to 100 wins.',
  },
  {
    id: 'numberGuessor',
    title: 'Number Guessor',
    emoji: '🎯',
    desc: 'One player sets a number. Everyone else guesses it.',
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    emoji: '🥧',
    desc: "Vote on 'who's most likely' questions. See who gets crowned.",
  },
];

export default function GamesTabScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.title}>Games</Text>
        <Text style={s.subtitle}>Pick a game and set up your players.</Text>

        <View style={s.topDivider} />
        {GAMES.map(game => (
          <React.Fragment key={game.id}>
            <TouchableOpacity
              style={s.row}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('PlayerSetup')}
            >
              <Text style={s.emoji}>{game.emoji}</Text>
              <View style={s.info}>
                <Text style={s.gameTitle}>{game.title}</Text>
                <Text style={s.gameDesc}>{game.desc}</Text>
              </View>
              <Text style={s.arrow}>→</Text>
            </TouchableOpacity>
            <View style={s.divider} />
          </React.Fragment>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.bg },
  container:   { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20 },
  title:       { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  subtitle:    { fontSize: 13, color: COLORS.text2, marginTop: 4, marginBottom: 28 },
  topDivider:  { height: 1, backgroundColor: COLORS.border },
  divider:     { height: 1, backgroundColor: COLORS.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  emoji:     { fontSize: 32 },
  info:      { flex: 1, marginLeft: 14 },
  gameTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  gameDesc:  { fontSize: 13, color: COLORS.text2, marginTop: 2 },
  arrow:     { fontSize: 18, color: COLORS.text2 },
});
