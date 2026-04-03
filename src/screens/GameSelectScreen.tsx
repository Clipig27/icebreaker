import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import ScoreDisplay from '../components/ScoreDisplay';
import { COLORS } from '../constants/theme';
import { GameType } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GameSelect'>;
};

const GAMES: {
  id: GameType;
  title: string;
  emoji: string;
  desc: string;
  accentColor: string;
  borderColor: string;
  screen: keyof RootStackParamList;
}[] = [
  {
    id: 'lieDetector',
    title: 'Lie Detector',
    emoji: '🕵️',
    desc: 'Answer a prompt — then fool everyone into guessing wrong.',
    accentColor: COLORS.accentHi,
    borderColor: COLORS.accent,
    screen: 'LieDetector',
  },
  {
    id: 'talentShow',
    title: 'Talent Show',
    emoji: '🎭',
    desc: 'Perform a challenge. Survive the buzz. Win the crowd.',
    accentColor: COLORS.accentHi,
    borderColor: COLORS.accent,
    screen: 'TalentShow',
  },
  {
    id: 'standOut',
    title: 'Stand Out',
    emoji: '⚡',
    desc: 'Give a unique answer or get penalised. First to 100 wins.',
    accentColor: COLORS.accentHi,
    borderColor: COLORS.accent,
    screen: 'StandOut',
  },
  {
    id: 'numberGuessor',
    title: 'Number Guessor',
    emoji: '🎯',
    desc: 'One player sets a number. Everyone else guesses it. Lowest penalty wins.',
    accentColor: COLORS.accentHi,
    borderColor: COLORS.accent,
    screen: 'NumberGuessor',
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    emoji: '🥧',
    desc: 'Vote on "who\'s most likely" questions. See who gets crowned.',
    accentColor: COLORS.accentHi,
    borderColor: COLORS.accent,
    screen: 'PieCharts',
  },
  {
    id: 'dealOrSteal',
    title: 'Deal or Steal',
    emoji: '🤝',
    desc: 'Deal for mutual gains or steal from exposed Dealers. 4–6 players.',
    accentColor: COLORS.warning,
    borderColor: COLORS.warning,
    screen: 'DealOrSteal',
  },
];

export default function GameSelectScreen({ navigation }: Props) {
  const { players, setSelectedGame, currentRound, startGame, room, isConnected } = useGame();

  // Diagnostic: confirm this screen mounted and what state it sees
  React.useEffect(() => {
    console.log('[GameSelect] mounted — room:', room?.code ?? 'none', 'connected:', isConnected, 'players:', players.length);
  }, []);

  const selectGame = (game: (typeof GAMES)[0]) => {
    console.log('[GameSelect] selected:', game.id, '— room:', room?.code ?? 'none');
    if (game.id === 'dealOrSteal' && (players.length < 4 || players.length > 6)) {
      Alert.alert(
        'Deal or Steal',
        `This game requires 4–6 players. You currently have ${players.length}.`
      );
      return;
    }
    setSelectedGame(game.id);
    startGame(game.id);
    navigation.navigate(game.screen as any);
  };

  const hasScores = players.some(p => p.score > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Pick a game.</Text>
        <Text style={styles.subtitle}>
          Round {currentRound}{'  ·  '}{players.length} players
        </Text>

        <View style={styles.gameList}>
          <View style={styles.topDivider} />
          {GAMES.map((game, idx) => (
            <React.Fragment key={game.id}>
              <TouchableOpacity
                style={styles.gameRow}
                onPress={() => selectGame(game)}
                activeOpacity={0.7}
              >
                <Text style={styles.gameEmoji}>{game.emoji}</Text>
                <View style={styles.gameInfo}>
                  <Text style={styles.gameTitle}>{game.title}</Text>
                  <Text style={styles.gameDesc}>{game.desc}</Text>
                </View>
                <Text style={styles.gameArrow}>→</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
            </React.Fragment>
          ))}
        </View>

        {hasScores && (
          <View style={styles.scoreSection}>
            <Text style={styles.scoreLabel}>SCORES</Text>
            <ScoreDisplay players={players} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
  },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  subtitle: {
    fontSize: 13,
    color: COLORS.text2,
    marginTop: 4,
    marginBottom: 28,
  },
  gameList: { marginBottom: 32 },
  topDivider: { height: 1, backgroundColor: COLORS.border },
  divider: { height: 1, backgroundColor: COLORS.border },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 0,
  },
  gameEmoji: { fontSize: 32 },
  gameInfo: { flex: 1, marginLeft: 14 },
  gameTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  gameDesc: { fontSize: 13, color: COLORS.text2, marginTop: 2 },
  gameArrow: { fontSize: 18, color: COLORS.text2 },
  scoreSection: { gap: 8 },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
