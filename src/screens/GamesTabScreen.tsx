import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated,
  ScrollView, Modal, Pressable, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { COLORS, FONTS } from '../constants/theme';
import { fetchEnabledGames, checkIsAdmin } from '../storage/gameConfigStorage';

type GameCategory = 'Strategy' | 'Trivia' | 'Creative' | 'Party';

const CATEGORIES: { label: GameCategory; color: string }[] = [
  { label: 'Strategy', color: '#F43F5E' },
  { label: 'Trivia',   color: '#06B6D4' },
  { label: 'Creative', color: '#F59E0B' },
  { label: 'Party',    color: '#10B981' },
];

type Game = {
  id: string;
  title: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  accentColor: string;
  desc: string;
  players: string;
  category: GameCategory;
  instructions: string[];
};

const GAMES: Game[] = [
  {
    id: 'lieDetector',
    title: 'Liar Liar',
    iconName: 'eye',
    accentColor: '#9D80FF',
    desc: 'Fool the group with your statements. Catch others\' lies.',
    players: '2+ players',
    category: 'Strategy',
    instructions: [
      'Each round, one player is the speaker.',
      'The speaker gets a prompt and writes two statements — one may be a lie.',
      'Choose a mode: Lie + Truth, Two Lies, or Two Truths.',
      'Everyone else votes on which statement they think is the lie.',
      'Score points for fooling others or correctly spotting lies.',
      'The player with the most points at the end wins.',
    ],
  },
  {
    id: 'talentShow',
    title: "Nobody's Got Talent",
    iconName: 'musical-notes',
    accentColor: '#EC4899',
    desc: 'Survive 3 rounds of performances and win the crowd.',
    players: '3+ players',
    category: 'Party',
    instructions: [
      'Round 1: Everyone performs a challenge. Audience votes Advance or Eliminate.',
      'Players who get enough Advance votes move on.',
      'Round 2: Remaining players perform again. Audience picks their top 2.',
      'Round 3: The finalists face off. Everyone votes for the winner.',
      'Tiebreakers may occur if votes are split.',
    ],
  },
  {
    id: 'standOut',
    title: 'Copycat',
    iconName: 'flash',
    accentColor: '#F59E0B',
    desc: 'Give unique answers. Duplicates lose points. First to the target score wins.',
    players: '3+ players',
    category: 'Creative',
    instructions: [
      'A prompt is shown to everyone.',
      'You have 10 seconds to type a unique answer.',
      'If your answer is unique, you score +10 points.',
      'If someone else has the same answer, you both lose -10 points.',
      'No answer? You lose -10 points.',
      'Challenge answers you think are invalid.',
      'First to the target score wins.',
    ],
  },
  {
    id: 'numberGuessor',
    title: '1 to 100',
    iconName: 'stats-chart',
    accentColor: '#06B6D4',
    desc: 'Guess closest to the correct answer. Lowest total penalty wins.',
    players: '2+ players',
    category: 'Trivia',
    instructions: [
      'A trivia-style question is shown with a numeric answer.',
      'Everyone has 20 seconds to guess.',
      'Your penalty = how far off you were + time taken.',
      'Running out of time gives a 20-point penalty.',
      'Lowest total penalty after all rounds wins.',
    ],
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    iconName: 'pie-chart',
    accentColor: '#10B981',
    desc: "Vote on 'who's most likely to...' questions. See results as pie charts.",
    players: '3+ players',
    category: 'Party',
    instructions: [
      'A question appears (e.g. "Who\'s most likely to...").',
      'Everyone votes for the player they think fits best.',
      'Results are shown as a colorful pie chart.',
      'See who the group really thinks of!',
    ],
  },
  {
    id: 'dealOrSteal',
    title: 'Deal or Steal',
    iconName: 'cash',
    accentColor: '#FBBF24',
    desc: 'Finish with the highest balance. Everyone starts at $100.',
    players: '4–6 players',
    category: 'Strategy',
    instructions: [
      'Each round has a Dealer and Stealers.',
      'The Dealer speaks to the group and proposes a deal.',
      'Each Stealer secretly chooses: Deal (cooperate) or Steal.',
      'Deal + Deal: both gain $20.',
      'Deal + Steal: stealer takes $30, dealer loses $30.',
      'Steal + Steal: both lose $10.',
      'Player with the highest balance at the end wins.',
    ],
  },
  {
    id: 'shadowProtocol',
    title: 'Shadow Protocol',
    iconName: 'moon',
    accentColor: '#F43F5E',
    desc: 'Agents: find the Shadows. Shadows: outlast the group.',
    players: '6–10 players',
    category: 'Strategy',
    instructions: [
      'Each player gets a secret role: Agent, Shadow, Investigator, or Guardian.',
      'Day phase: discuss and vote to eliminate a suspect.',
      'Night phase: Shadows eliminate, Investigators scan, Guardians protect.',
      'Agents win when all Shadows are eliminated.',
      'Shadows win when they equal or outnumber Agents.',
    ],
  },
  {
    id: 'potLuck',
    title: 'Smarty Pot',
    iconName: 'cash',
    accentColor: '#FBBF24',
    desc: 'Answer trivia to claim the pot. Risk it or pass it on.',
    players: '3+ players',
    category: 'Trivia',
    instructions: [
      'A pot starts small and grows each turn.',
      'On your turn: Risk (answer a question) or Skip (pass to next player).',
      'Correct answer: claim the pot! Harder questions = bigger pot.',
      'Wrong answer: pot resets, you get nothing.',
      'First to the target score wins.',
    ],
  },
  {
    id: 'chainLink',
    title: 'Link or Sink',
    iconName: 'link',
    accentColor: '#C8642F',
    desc: 'Empty your hand by linking words together. AI referee judges disputes.',
    players: '2–8 players',
    category: 'Strategy',
    instructions: [
      'Each player gets 7 word cards. An anchor word starts the chain.',
      'On your turn, play a card that links to the last word (15 seconds).',
      'After playing, the group discusses if the link is valid.',
      'Anyone can call the AI Referee to judge a link.',
      'The host can accept the link without a referee.',
      'Invalid link: your card comes back + you draw 1 penalty card.',
      'Valid challenge by you: the challenger draws a penalty card.',
      'Running out of time: you draw a penalty card.',
      'If nobody can play, the chain breaks and a new anchor appears.',
      'First player to empty their hand wins!',
    ],
  },
  {
    id: 'plotTwist',
    title: 'Plot Twist',
    iconName: 'document-text',
    accentColor: '#B5642A',
    desc: 'Co-write a story. Bait others into using your secret words.',
    players: '2–6 players',
    category: 'Creative',
    instructions: [
      'Everyone gets a hand of word cards.',
      'On your turn, add a sentence to the growing story.',
      'If your sentence contains another player\'s secret word, they score points.',
      'Try to bait others into using your words naturally.',
      'The story continues for several rounds.',
      'Player with the most points from "hit" words wins.',
    ],
  },
];

function GameRow({ game, index, onPress }: { game: Game; index: number; onPress: () => void }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
      delay: index * 55,
    } as any).start();
  }, []);

  const opacity     = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateX  = entrance.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }, { scale: pressScale }] }}>
      <Pressable
        style={s.row}
        onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
        onPress={onPress}
      >
        <View style={[s.iconBox, { backgroundColor: CATEGORIES.find(c => c.label === game.category)!.color + '1A', borderColor: CATEGORIES.find(c => c.label === game.category)!.color + '40' }]}>
          <Ionicons name={game.iconName} size={22} color={CATEGORIES.find(c => c.label === game.category)!.color} />
        </View>
        <View style={s.info}>
          <View style={s.titleRow}>
            <Text style={s.gameTitle}>{game.title}</Text>
            <View style={[s.categoryBadge, { backgroundColor: CATEGORIES.find(c => c.label === game.category)!.color + '1A', borderColor: CATEGORIES.find(c => c.label === game.category)!.color + '44' }]}>
              <Text style={[s.categoryBadgeText, { color: CATEGORIES.find(c => c.label === game.category)!.color }]}>{game.category}</Text>
            </View>
          </View>
          <Text style={s.gameDesc}>{game.desc}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.text3} />
      </Pressable>
    </Animated.View>
  );
}

export default function GamesTabScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selected, setSelected] = useState<Game | null>(null);
  const [enabledGames, setEnabledGames] = useState<Set<string> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<GameCategory | null>(null);

  useEffect(() => {
    Promise.all([
      fetchEnabledGames().then(setEnabledGames),
      checkIsAdmin().then(setIsAdmin),
    ]).finally(() => setLoading(false));
  }, []);

  const visibleGames = (enabledGames
    ? GAMES.filter(g => isAdmin || enabledGames.has(g.id))
    : GAMES
  ).filter(g => !activeFilter || g.category === activeFilter);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Category filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filterRow}>
        <Pressable
          style={[s.filterChip, !activeFilter && s.filterChipActive]}
          onPress={() => setActiveFilter(null)}
        >
          <Text style={[s.filterChipText, !activeFilter && s.filterChipTextActive]}>All</Text>
        </Pressable>
        {CATEGORIES.map(cat => {
          const isActive = activeFilter === cat.label;
          return (
            <Pressable
              key={cat.label}
              style={[
                s.filterChip,
                isActive && { backgroundColor: cat.color + '22', borderColor: cat.color + '55' },
              ]}
              onPress={() => setActiveFilter(isActive ? null : cat.label)}
            >
              <Text style={[s.filterChipText, isActive && { color: cat.color }]}>{cat.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={s.list}>
        {visibleGames.map((game, i) => (
          <React.Fragment key={game.id}>
            {i === 0 && <View style={s.divider} />}
            <GameRow game={game} index={i} onPress={() => setSelected(game)} />
            <View style={s.divider} />
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Detail modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={s.modalSafe}>
          {selected && (
            <>
              <View style={s.modalHeader}>
                <View style={[s.modalIcon, { backgroundColor: selected.accentColor + '22', borderColor: selected.accentColor + '55' }]}>
                  <Ionicons name={selected.iconName} size={28} color={selected.accentColor} />
                </View>
                <View style={s.modalTitleBlock}>
                  <Text style={s.modalTitle}>{selected.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Text style={[s.modalPlayers, { color: selected.accentColor }]}>{selected.players}</Text>
                    <View style={[s.categoryBadge, { backgroundColor: CATEGORIES.find(c => c.label === selected.category)!.color + '1A', borderColor: CATEGORIES.find(c => c.label === selected.category)!.color + '44' }]}>
                      <Text style={[s.categoryBadgeText, { color: CATEGORIES.find(c => c.label === selected.category)!.color }]}>{selected.category}</Text>
                    </View>
                  </View>
                </View>
                <Pressable style={s.closeBtn} onPress={() => setSelected(null)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={COLORS.text2} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={s.modalBody}>
                <Text style={s.modalDesc}>{selected.desc}</Text>
                <Text style={s.howToPlay}>How to Play</Text>
                {selected.instructions.map((step, i) => (
                  <View key={i} style={s.step}>
                    <View style={[s.stepNum, { backgroundColor: selected.accentColor + '22' }]}>
                      <Text style={[s.stepNumText, { color: selected.accentColor }]}>{i + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={s.playNowBtn}
                  activeOpacity={0.8}
                  onPress={() => { setSelected(null); navigation.navigate('HostLobby'); }}
                >
                  <Text style={s.playNowText}>Play Now →</Text>
                </TouchableOpacity>
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.bg },
  filterRow: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 8 },
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
  list:    { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  divider: { height: 1, backgroundColor: COLORS.border },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info:      { flex: 1 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameTitle: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.text },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.3,
  },
  gameDesc:  { fontSize: 13, color: COLORS.text2, marginTop: 2 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: '#1C1C1E' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleBlock: { flex: 1 },
  modalTitle:   { fontSize: 22, fontFamily: FONTS.extrabold, color: COLORS.text },
  modalPlayers: { fontSize: 13, fontFamily: FONTS.semibold, marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalBody:  { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 20 },
  modalDesc:  { fontSize: 15, color: COLORS.text2, lineHeight: 22 },

  howToPlay: {
    fontSize: 18,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    marginTop: 4,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: { fontSize: 13, fontFamily: FONTS.extrabold },
  stepText:    { flex: 1, fontSize: 15, color: COLORS.text2, lineHeight: 22 },

  playNowBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  playNowText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: FONTS.bold,
  },
});
