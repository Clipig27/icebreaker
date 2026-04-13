import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
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
  {
    id: 'shadowProtocol',
    title: 'Shadow Protocol',
    emoji: '🕵️',
    desc: 'Social deduction. Find the Shadows before it\'s too late. 6–10 players.',
    accentColor: COLORS.danger,
    borderColor: COLORS.danger,
    screen: 'ShadowProtocol',
  },
];

export default function GameSelectScreen({ navigation }: Props) {
  const { players: contextPlayers, setSelectedGame, currentRound, startGame, room, isConnected, setHostScreen } = useGame();

  // When in a multiplayer room, use room.players as the authoritative source
  // so the host is always counted and the count is never stale.
  const players = room ? room.players : contextPlayers;

  // Broadcast to non-hosts whenever this screen is focused (host is choosing a game)
  useFocusEffect(
    React.useCallback(() => {
      if (room) setHostScreen('selecting');
    }, [room?.code])
  );

  // When host navigates back from this screen, restore lobby state for non-hosts
  React.useEffect(() => {
    if (!room) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (e.data.action.type === 'RESET') return; // game started — don't override
      setHostScreen('lobby');
    });
    return unsub;
  }, [room?.code]);

  // Diagnostic: confirm this screen mounted and what state it sees
  React.useEffect(() => {
    console.log('[GameSelect] mounted — room:', room?.code ?? 'none', 'connected:', isConnected, 'players:', players.length);
  }, []);

  const selectGame = (game: (typeof GAMES)[0]) => {
    console.log('[GameSelect] selected:', game.id, '— room:', room?.code ?? 'none');
    if (game.id === 'lieDetector' && players.length < 3) {
      Alert.alert('Lie Detector', `This game needs at least 3 players. You currently have ${players.length}.`);
      return;
    }
    if (game.id === 'talentShow' && players.length < 4) {
      Alert.alert('Talent Show', `This game needs at least 4 players. You currently have ${players.length}.`);
      return;
    }
    if (game.id === 'standOut' && players.length < 3) {
      Alert.alert('Stand Out', `This game needs at least 3 players. You currently have ${players.length}.`);
      return;
    }
    if (game.id === 'numberGuessor' && players.length < 2) {
      Alert.alert('Number Guessor', `This game needs at least 2 players. You currently have ${players.length}.`);
      return;
    }
    if (game.id === 'pieCharts' && players.length < 3) {
      Alert.alert('Pie Charts', `This game needs at least 3 players. You currently have ${players.length}.`);
      return;
    }
    if (game.id === 'dealOrSteal' && (players.length < 4 || players.length > 6)) {
      Alert.alert(
        'Deal or Steal',
        `This game requires 4–6 players. You currently have ${players.length}.`
      );
      return;
    }
    if (game.id === 'shadowProtocol' && (players.length < 6 || players.length > 10)) {
      Alert.alert(
        'Shadow Protocol',
        `This game requires 6–10 players. You currently have ${players.length}.`
      );
      return;
    }
    setSelectedGame(game.id);
    // Don't navigate immediately — GameContext's `gameStarted` handler navigates
    // all players (host included) once the server confirms the game has started.
    // This ensures `room` and `players` are fully populated before game screens mount.
    startGame(game.id);
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
              <View style={styles.gameRowWrapper}>
                {/* Main tap → start game */}
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
                {/* ? → open instructions for this game */}
                <TouchableOpacity
                  style={styles.helpBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => navigation.navigate('Instructions' as never, { game: game.id } as never)}
                >
                  <Text style={styles.helpBtnText}>?</Text>
                </TouchableOpacity>
              </View>
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
  gameRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  gameEmoji: { fontSize: 32 },
  gameInfo: { flex: 1, marginLeft: 14 },
  gameTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  gameDesc: { fontSize: 13, color: COLORS.text2, marginTop: 2 },
  gameArrow: { fontSize: 18, color: COLORS.text2, marginRight: 10 },
  helpBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: {
    color: COLORS.accentHi,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  scoreSection: { gap: 8 },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
