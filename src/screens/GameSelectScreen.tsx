import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import ScoreDisplay from '../components/ScoreDisplay';
import { COLORS } from '../constants/theme';
import { GameType } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GameSelect'>;
};

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const GAMES: {
  id: GameType;
  title: string;
  emoji: string;
  desc: string;
  minPlayers: number;
  maxPlayers?: number;
  accentColor: string;
  gradientColors: readonly [string, string, string];
  glowColor: string;
  screen: keyof RootStackParamList;
  tag?: string;
}[] = [
  {
    id: 'lieDetector',
    title: 'Lie Detector',
    emoji: '🕵️',
    desc: 'Fool everyone into guessing wrong.',
    minPlayers: 3,
    accentColor: '#7C5CF6',
    gradientColors: ['#2A1F4E', '#1A1230', '#0F0F13'],
    glowColor: '#7C5CF6',
    screen: 'LieDetector',
  },
  {
    id: 'talentShow',
    title: 'Talent Show',
    emoji: '🎭',
    desc: 'Perform. Survive the buzz. Win the crowd.',
    minPlayers: 4,
    accentColor: '#EC4899',
    gradientColors: ['#3D1A2E', '#231020', '#0F0F13'],
    glowColor: '#EC4899',
    screen: 'TalentShow',
  },
  {
    id: 'standOut',
    title: 'Stand Out',
    emoji: '⚡',
    desc: 'Unique answers only. First to 100 wins.',
    minPlayers: 3,
    accentColor: '#F59E0B',
    gradientColors: ['#3D2A10', '#241808', '#0F0F13'],
    glowColor: '#F59E0B',
    screen: 'StandOut',
  },
  {
    id: 'numberGuessor',
    title: 'Number Guessor',
    emoji: '🎯',
    desc: 'Set the number. Guess the number.',
    minPlayers: 2,
    accentColor: '#06B6D4',
    gradientColors: ['#0A2D35', '#061A20', '#0F0F13'],
    glowColor: '#06B6D4',
    screen: 'NumberGuessor',
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    emoji: '🥧',
    desc: "Vote on who's most likely to…",
    minPlayers: 3,
    accentColor: '#10B981',
    gradientColors: ['#0A2D20', '#061A13', '#0F0F13'],
    glowColor: '#10B981',
    screen: 'PieCharts',
  },
  {
    id: 'dealOrSteal',
    title: 'Deal or Steal',
    emoji: '🤝',
    desc: 'Deal for gains or steal from Dealers.',
    minPlayers: 4,
    maxPlayers: 6,
    accentColor: '#FBBF24',
    gradientColors: ['#3D2E08', '#221B04', '#0F0F13'],
    glowColor: '#FBBF24',
    screen: 'DealOrSteal',
    tag: '4–6 players',
  },
  {
    id: 'shadowProtocol',
    title: 'Shadow Protocol',
    emoji: '🌑',
    desc: "Find the Shadows before it's too late.",
    minPlayers: 6,
    maxPlayers: 10,
    accentColor: '#F43F5E',
    gradientColors: ['#3D0F18', '#22080E', '#0F0F13'],
    glowColor: '#F43F5E',
    screen: 'ShadowProtocol',
    tag: '6–10 players',
  },
];

// ─── Animated game card ────────────────────────────────────────────────────────
function GameCard({
  game,
  onPress,
  onHelp,
  delay,
  disabled,
}: {
  game: (typeof GAMES)[0];
  onPress: () => void;
  onHelp: () => void;
  delay: number;
  disabled: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: 0,
        duration: 380,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function onIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  }
  function onOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  }

  return (
    <Animated.View
      style={[
        card.wrapper,
        { opacity: entrance, transform: [{ scale }, { translateY: slideY }] },
        disabled && card.disabledWrapper,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        activeOpacity={1}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={game.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={card.gradient}
        >
          {/* Accent border */}
          <View
            style={[
              card.accentBorder,
              {
                borderColor: game.accentColor,
                shadowColor: game.glowColor,
                opacity: disabled ? 0.25 : 0.6,
              },
            ]}
          />

          {/* Top row: emoji + help */}
          <View style={card.topRow}>
            <Text style={card.emoji}>{game.emoji}</Text>
            <TouchableOpacity
              style={[card.helpBtn, { borderColor: game.accentColor + '55' }]}
              onPress={onHelp}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[card.helpText, { color: game.accentColor }]}>?</Text>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={[card.title, disabled && card.disabledText]}>{game.title}</Text>

          {/* Desc */}
          <Text style={[card.desc, disabled && card.disabledDesc]}>{game.desc}</Text>

          {/* Bottom: player tag */}
          <View style={card.bottomRow}>
            <View
              style={[
                card.tag,
                {
                  backgroundColor: game.accentColor + '22',
                  borderColor: game.accentColor + '44',
                },
              ]}
            >
              <Text style={[card.tagText, { color: game.accentColor }]}>
                {game.tag ?? `${game.minPlayers}+ players`}
              </Text>
            </View>
            {disabled && <Text style={card.needMore}>need more</Text>}
          </View>

          {/* Bottom accent bar */}
          <View
            style={[
              card.accentBar,
              { backgroundColor: game.accentColor, opacity: disabled ? 0.2 : 0.85 },
            ]}
          />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const card = StyleSheet.create({
  wrapper: {
    width: CARD_WIDTH,
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.5,
    elevation: 6,
  },
  disabledWrapper: {
    opacity: 0.5,
  },
  gradient: {
    borderRadius: 18,
    padding: 14,
    minHeight: 180,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  accentBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  emoji: { fontSize: 28 },
  helpBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  helpText: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F2F2F7',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  disabledText: { color: '#666680' },
  desc: {
    fontSize: 11,
    color: '#8585A0',
    lineHeight: 15,
    flex: 1,
  },
  disabledDesc: { color: '#44445A' },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  needMore: {
    fontSize: 9,
    fontWeight: '600',
    color: '#44445A',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  accentBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
});

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function GameSelectScreen({ navigation }: Props) {
  const {
    players: contextPlayers,
    setSelectedGame,
    currentRound,
    startGame,
    room,
    isConnected,
    setHostScreen,
  } = useGame();

  const players = room ? room.players : contextPlayers;

  useFocusEffect(
    React.useCallback(() => {
      if (room) setHostScreen('selecting');
    }, [room?.code])
  );

  React.useEffect(() => {
    if (!room) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (e.data.action.type === 'RESET') return;
      setHostScreen('lobby');
    });
    return unsub;
  }, [room?.code]);

  React.useEffect(() => {
    console.log(
      '[GameSelect] mounted — room:',
      room?.code ?? 'none',
      'connected:',
      isConnected,
      'players:',
      players.length
    );
  }, []);

  const selectGame = (game: (typeof GAMES)[0]) => {
    console.log('[GameSelect] selected:', game.id, '— room:', room?.code ?? 'none');
    if (game.id === 'lieDetector' && players.length < 3) {
      Alert.alert('Lie Detector', `Needs at least 3 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'talentShow' && players.length < 4) {
      Alert.alert('Talent Show', `Needs at least 4 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'standOut' && players.length < 3) {
      Alert.alert('Stand Out', `Needs at least 3 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'numberGuessor' && players.length < 2) {
      Alert.alert('Number Guessor', `Needs at least 2 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'pieCharts' && players.length < 3) {
      Alert.alert('Pie Charts', `Needs at least 3 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'dealOrSteal' && (players.length < 4 || players.length > 6)) {
      Alert.alert('Deal or Steal', `Requires 4–6 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'shadowProtocol' && (players.length < 6 || players.length > 10)) {
      Alert.alert('Shadow Protocol', `Requires 6–10 players. You have ${players.length}.`);
      return;
    }
    setSelectedGame(game.id);
    startGame(game.id);
  };

  function isDisabled(game: (typeof GAMES)[0]) {
    if (game.id === 'lieDetector' && players.length < 3) return true;
    if (game.id === 'talentShow' && players.length < 4) return true;
    if (game.id === 'standOut' && players.length < 3) return true;
    if (game.id === 'numberGuessor' && players.length < 2) return true;
    if (game.id === 'pieCharts' && players.length < 3) return true;
    if (game.id === 'dealOrSteal' && (players.length < 4 || players.length > 6)) return true;
    if (game.id === 'shadowProtocol' && (players.length < 6 || players.length > 10)) return true;
    return false;
  }

  const hasScores = players.some(p => p.score > 0);

  // Pair games into rows of 2
  const rows: (typeof GAMES)[] = [];
  for (let i = 0; i < GAMES.length; i += 2) {
    rows.push(GAMES.slice(i, i + 2));
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Pick a game.</Text>
          <View style={s.headerMeta}>
            <View style={s.metaPill}>
              <Text style={s.metaText}>Round {currentRound}</Text>
            </View>
            <View style={s.metaPill}>
              <Text style={s.metaText}>{players.length} players</Text>
            </View>
          </View>
        </View>

        {/* Game grid */}
        <View style={s.grid}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={s.row}>
              {row.map((game, colIdx) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onPress={() => selectGame(game)}
                  onHelp={() =>
                    (navigation as any).navigate('Instructions', { game: game.id })
                  }
                  delay={(rowIdx * 2 + colIdx) * 60}
                  disabled={isDisabled(game)}
                />
              ))}
              {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
            </View>
          ))}
        </View>

        {/* Scores */}
        {hasScores && (
          <View style={s.scoreSection}>
            <Text style={s.scoreLabel}>SCORES</Text>
            <ScoreDisplay players={players} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: COLORS.text,
    marginBottom: 10,
  },
  headerMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text2,
    letterSpacing: 0.2,
  },
  grid: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreSection: {
    gap: 8,
    marginTop: 8,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
