import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import ScoreDisplay from '../components/ScoreDisplay';
import { COLORS, FONTS } from '../constants/theme';
import { GameType } from '../types';
import { fetchEnabledGames, toggleGame, checkIsAdmin } from '../storage/gameConfigStorage';
import { showToast } from '../components/Toast';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GameSelect'>;
};

type GameCategory = 'Strategy' | 'Trivia' | 'Creative' | 'Party';

const CATEGORIES: { label: GameCategory; color: string }[] = [
  { label: 'Strategy', color: '#F43F5E' },
  { label: 'Trivia',   color: '#06B6D4' },
  { label: 'Creative', color: '#F59E0B' },
  { label: 'Party',    color: '#10B981' },
];

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
  category: GameCategory;
  screen: keyof RootStackParamList;
  tag?: string;
}[] = [
  {
    id: 'lieDetector',
    title: 'Liar Liar',
    emoji: '🕵️',
    desc: 'Fool everyone into guessing wrong.',
    minPlayers: 3,
    accentColor: '#7C5CF6',
    gradientColors: ['#2A1F4E', '#1A1230', '#0F0F13'],
    glowColor: '#7C5CF6',
    category: 'Strategy',
    screen: 'LieDetector',
  },
  {
    id: 'talentShow',
    title: "Nobody's Got Talent",
    emoji: '🎭',
    desc: 'Perform. Survive the buzz. Win the crowd.',
    minPlayers: 4,
    accentColor: '#EC4899',
    gradientColors: ['#3D1A2E', '#231020', '#0F0F13'],
    glowColor: '#EC4899',
    category: 'Party',
    screen: 'TalentShow',
  },
  {
    id: 'standOut',
    title: 'Copycat',
    emoji: '⚡',
    desc: 'Unique answers only. First to 100 wins.',
    minPlayers: 3,
    accentColor: '#F59E0B',
    gradientColors: ['#3D2A10', '#241808', '#0F0F13'],
    glowColor: '#F59E0B',
    category: 'Creative',
    screen: 'StandOut',
  },
  {
    id: 'numberGuessor',
    title: '1 to 100',
    emoji: '🎯',
    desc: 'Set the number. Guess the number.',
    minPlayers: 2,
    accentColor: '#06B6D4',
    gradientColors: ['#0A2D35', '#061A20', '#0F0F13'],
    glowColor: '#06B6D4',
    category: 'Trivia',
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
    category: 'Party',
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
    category: 'Strategy',
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
    category: 'Strategy',
    screen: 'ShadowProtocol',
    tag: '6–10 players',
  },
  {
    id: 'potLuck',
    title: 'Smarty Pot',
    emoji: '🧠',
    desc: 'Risk the growing pot or pass it on. Harder questions pay more.',
    minPlayers: 3,
    accentColor: '#FBBF24',
    gradientColors: ['#3D2E08', '#221B04', '#0F0F13'],
    glowColor: '#FBBF24',
    category: 'Trivia',
    screen: 'PotLuck',
  },
  {
    id: 'chainLink',
    title: 'Link or Sink',
    emoji: '🔗',
    desc: 'Link words, explain the connection. Challenge bad links — AI referee decides.',
    minPlayers: 2,
    accentColor: '#C8642F',
    gradientColors: ['#3D1A08', '#220E04', '#0F0F13'],
    glowColor: '#C8642F',
    category: 'Strategy',
    screen: 'ChainLink',
  },
  {
    id: 'plotTwist',
    title: 'Plot Twist',
    emoji: '📜',
    desc: 'Co-write a story. Bait others into typing your secret words.',
    minPlayers: 2,
    maxPlayers: 6,
    accentColor: '#B5642A',
    gradientColors: ['#3D2210', '#221408', '#0F0F13'],
    glowColor: '#B5642A',
    category: 'Creative',
    screen: 'PlotTwist',
    tag: '2–6 players',
  },
];

// ─── Animated game card ────────────────────────────────────────────────────────
function GameCard({
  game,
  onPress,
  onHelp,
  delay,
  disabled,
  isAdmin,
  isEnabled,
  onToggle,
}: {
  game: (typeof GAMES)[0];
  onPress: () => void;
  onHelp: () => void;
  delay: number;
  disabled: boolean;
  isAdmin?: boolean;
  isEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(40)).current;
  const scaleIn = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(slideY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(scaleIn, {
        toValue: 1,
        delay,
        useNativeDriver: true,
        friction: 7,
        tension: 50,
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
        { opacity: entrance, transform: [{ scale }, { translateY: slideY }, { scale: scaleIn }] },
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

          {/* Category label */}
          <Text style={[card.categoryLabel, { color: CATEGORIES.find(c => c.label === game.category)!.color }]}>
            {game.category}
          </Text>

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

          {/* Admin toggle */}
          {isAdmin && onToggle && (
            <TouchableOpacity
              style={{
                position: 'absolute', top: 6, left: 6,
                backgroundColor: isEnabled ? '#0d3d0d' : '#3d0d0d',
                borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                borderWidth: 1, borderColor: isEnabled ? '#1a6b1a' : '#6b1a1a',
              }}
              onPress={() => onToggle(!isEnabled)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={{ color: isEnabled ? '#4ade80' : '#f87171', fontSize: 9, fontFamily: FONTS.extrabold }}>
                {isEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          )}

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
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
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
  helpText: { fontSize: 12, fontFamily: FONTS.extrabold, lineHeight: 16 },
  categoryLabel: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.bold,
    letterSpacing: 0.3,
  },
  needMore: {
    fontSize: 9,
    fontFamily: FONTS.semibold,
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

  const [enabledGames, setEnabledGames] = useState<Set<string> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      if (room) setHostScreen('selecting');
      fetchEnabledGames().then(setEnabledGames);
      checkIsAdmin().then(setIsAdmin);
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

  const [activeFilter, setActiveFilter] = useState<GameCategory | null>(null);
  const [smartyPotConfig, setSmartyPotConfig] = useState<{ visible: boolean; potCap: number }>({ visible: false, potCap: 7 });

  const selectGame = (game: (typeof GAMES)[0]) => {
    console.log('[GameSelect] selected:', game.id, '— room:', room?.code ?? 'none');
    if (game.id === 'lieDetector' && players.length < 3) {
      Alert.alert('Liar Liar', `Needs at least 3 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'talentShow' && players.length < 4) {
      Alert.alert("Nobody's Got Talent", `Needs at least 4 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'standOut' && players.length < 3) {
      Alert.alert('Copycat', `Needs at least 3 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'numberGuessor' && players.length < 2) {
      Alert.alert('1 to 100', `Needs at least 2 players. You have ${players.length}.`);
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
    if (game.id === 'potLuck' && players.length < 3) {
      Alert.alert('Smarty Pot', `Needs at least 3 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'chainLink' && players.length < 2) {
      Alert.alert('Link or Sink', `Needs at least 2 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'plotTwist' && (players.length < 2 || players.length > 6)) {
      Alert.alert('Plot Twist', `Requires 2–6 players. You have ${players.length}.`);
      return;
    }
    if (game.id === 'potLuck') {
      setSmartyPotConfig(prev => ({ ...prev, visible: true }));
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
    if (game.id === 'potLuck' && players.length < 3) return true;
    if (game.id === 'chainLink' && players.length < 2) return true;
    if (game.id === 'plotTwist' && (players.length < 2 || players.length > 6)) return true;
    return false;
  }

  const hasScores = players.some(p => p.score > 0);

  // Filter games: admins see all, regular users only see enabled; then by category
  const visibleGames = (enabledGames
    ? GAMES.filter(g => isAdmin || enabledGames.has(g.id))
    : GAMES
  ).filter(g => !activeFilter || g.category === activeFilter);

  // Pair games into rows of 2
  const rows: (typeof GAMES)[] = [];
  for (let i = 0; i < visibleGames.length; i += 2) {
    rows.push(visibleGames.slice(i, i + 2));
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

        {/* Category filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity
            style={[s.filterChip, !activeFilter && s.filterChipActive]}
            onPress={() => setActiveFilter(null)}
            activeOpacity={0.7}
          >
            <Text style={[s.filterChipText, !activeFilter && s.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {CATEGORIES.map(cat => {
            const isActive = activeFilter === cat.label;
            return (
              <TouchableOpacity
                key={cat.label}
                style={[
                  s.filterChip,
                  isActive && { backgroundColor: cat.color + '22', borderColor: cat.color + '55' },
                ]}
                onPress={() => setActiveFilter(isActive ? null : cat.label)}
                activeOpacity={0.7}
              >
                <Text style={[s.filterChipText, isActive && { color: cat.color }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

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
                  delay={(rowIdx * 2 + colIdx) * 100}
                  disabled={isDisabled(game)}
                  isAdmin={isAdmin}
                  isEnabled={enabledGames?.has(game.id) ?? true}
                  onToggle={(enabled) => {
                    toggleGame(game.id, enabled).then(() => {
                      setEnabledGames(prev => {
                        const next = new Set(prev);
                        if (enabled) next.add(game.id); else next.delete(game.id);
                        return next;
                      });
                      showToast(`${game.title} ${enabled ? 'enabled' : 'disabled'}`);
                    }).catch(() => showToast('Failed to toggle game'));
                  }}
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

      {/* Smarty Pot config modal */}
      <Modal
        visible={smartyPotConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSmartyPotConfig(prev => ({ ...prev, visible: false }))}
      >
        <View style={cfg.overlay}>
          <View style={cfg.sheet}>
            <Text style={cfg.emoji}>🧠</Text>
            <Text style={cfg.title}>Smarty Pot</Text>
            <Text style={cfg.subtitle}>Set the max pot size</Text>

            <View style={cfg.row}>
              <Text style={cfg.label}>MAX POT</Text>
              <View style={cfg.stepper}>
                <TouchableOpacity
                  style={[cfg.stepBtn, smartyPotConfig.potCap <= 5 && cfg.stepBtnDisabled]}
                  onPress={() => setSmartyPotConfig(prev => ({ ...prev, potCap: Math.max(5, prev.potCap - 1) }))}
                  activeOpacity={0.7}
                >
                  <Text style={cfg.stepBtnText}>−</Text>
                </TouchableOpacity>
                <View style={cfg.stepVal}>
                  <Text style={cfg.stepValText}>{smartyPotConfig.potCap}</Text>
                </View>
                <TouchableOpacity
                  style={[cfg.stepBtn, smartyPotConfig.potCap >= 10 && cfg.stepBtnDisabled]}
                  onPress={() => setSmartyPotConfig(prev => ({ ...prev, potCap: Math.min(10, prev.potCap + 1) }))}
                  activeOpacity={0.7}
                >
                  <Text style={cfg.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={cfg.hint}>
              Max payout: {smartyPotConfig.potCap} pts · Hard questions start the pot higher
            </Text>

            <TouchableOpacity
              style={cfg.startBtn}
              onPress={() => {
                setSmartyPotConfig(prev => ({ ...prev, visible: false }));
                setSelectedGame('potLuck');
                startGame('potLuck', { potCap: smartyPotConfig.potCap });
              }}
              activeOpacity={0.8}
            >
              <Text style={cfg.startBtnText}>START GAME</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSmartyPotConfig(prev => ({ ...prev, visible: false }))}
              style={cfg.cancelBtn}
            >
              <Text style={cfg.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const cfg = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', backgroundColor: '#1A1A24', borderRadius: 20, padding: 24, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#FBBF2440' },
  emoji: { fontSize: 40 },
  title: { fontSize: 22, fontFamily: FONTS.extrabold, color: '#FBBF24', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: '#8585A0' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: '#12121A', borderRadius: 12, padding: 14, marginTop: 4 },
  label: { fontFamily: FONTS.bold, fontSize: 13, color: '#E0E0F0', letterSpacing: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FBBF2433', borderWidth: 1, borderColor: '#FBBF2466', alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { fontSize: 20, fontFamily: FONTS.bold, color: '#FBBF24', lineHeight: 24 },
  stepVal: { width: 48, alignItems: 'center' },
  stepValText: { fontSize: 28, fontFamily: FONTS.extrabold, color: '#FBBF24' },
  hint: { fontSize: 11, color: '#5A5A7A', textAlign: 'center' },
  startBtn: { backgroundColor: '#FBBF24', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginTop: 4 },
  startBtnText: { fontFamily: FONTS.extrabold, fontSize: 15, color: '#1A1300', letterSpacing: 1 },
  cancelBtn: { paddingVertical: 8 },
  cancelBtnText: { fontSize: 13, color: '#5A5A7A' },
});

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
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
    letterSpacing: 0.2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
  },
  filterChipActive: {
    backgroundColor: COLORS.accent + '22',
    borderColor: COLORS.accent + '55',
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
  },
  filterChipTextActive: {
    color: COLORS.accent,
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
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
