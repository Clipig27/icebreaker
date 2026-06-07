import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { COLORS, RADIUS, SPACING, FONTS } from '../constants/theme';
import PrimaryButton from '../components/PrimaryButton';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Instructions'>;
  route: RouteProp<RootStackParamList, 'Instructions'>;
};

interface GameInfo {
  id: string;
  title: string;
  emoji: string;
  players: string;
  goal: string;
  rules: string[];
  tip?: string;
}

const INSTRUCTIONS: GameInfo[] = [
  {
    id: 'lieDetector',
    title: 'Liar Liar',
    emoji: '🕵️',
    players: '2+ players',
    goal: 'Fool the group with your statements. Catch others\' lies.',
    rules: [
      'Each round, one player is the speaker.',
      'The speaker gets a prompt and writes two statements — one may be a lie.',
      'Choose a mode: Lie + Truth, Two Lies, or Two Truths.',
      'Everyone else votes on which statement they think is the lie.',
      'Score points for fooling others or correctly spotting lies.',
      'The player with the most points at the end wins.',
    ],
    tip: 'Make both answers believable. The truth can be just as surprising as the lie.',
  },
  {
    id: 'talentShow',
    title: "Nobody's Got Talent",
    emoji: '🎭',
    players: '3+ players',
    goal: 'Survive 3 rounds of performances and win the crowd.',
    rules: [
      'Round 1: Everyone performs a challenge. Audience votes Advance or Eliminate.',
      'Players who get enough Advance votes move on.',
      'Round 2: Remaining players perform again. Audience picks their top 2.',
      'Round 3: The finalists face off. Everyone votes for the winner.',
      'Tiebreakers may occur if votes are split.',
    ],
    tip: 'Commit fully — the more energy you bring, the harder it is for people to buzz you.',
  },
  {
    id: 'standOut',
    title: 'Copycat',
    emoji: '⚡',
    players: '3+ players',
    goal: 'Give unique answers. Duplicates lose points. First to the target score wins.',
    rules: [
      'A prompt is shown to everyone.',
      'You have 10 seconds to type a unique answer.',
      'If your answer is unique, you score +10 points.',
      'If someone else has the same answer, you both lose -10 points.',
      'No answer? You lose -10 points.',
      'Challenge answers you think are invalid.',
      'First to the target score wins.',
    ],
    tip: 'Think about what the obvious answer is — then avoid it.',
  },
  {
    id: 'numberGuessor',
    title: '1 to 100',
    emoji: '🎯',
    players: '2+ players',
    goal: 'Guess closest to the correct answer. Lowest total penalty wins.',
    rules: [
      'A trivia-style question is shown with a numeric answer.',
      'Everyone has 20 seconds to guess.',
      'Your penalty = how far off you were + time taken.',
      'Running out of time gives a 20-point penalty.',
      'Lowest total penalty after all rounds wins.',
    ],
    tip: 'Guess fast AND accurately — every second you wait adds to your penalty on top of how far off you are.',
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    emoji: '🥧',
    players: '3+ players',
    goal: 'Vote on \'who\'s most likely to...\' questions. See results as pie charts.',
    rules: [
      'A question appears (e.g. "Who\'s most likely to...").',
      'Everyone votes for the player they think fits best.',
      'Results are shown as a colorful pie chart.',
      'See who the group really thinks of!',
    ],
    tip: 'Vote honestly — the funniest moments come from brutal honesty.',
  },
  {
    id: 'dealOrSteal',
    title: 'Deal or Steal',
    emoji: '🤝',
    players: '4–6 players',
    goal: 'Finish with the highest balance. Everyone starts at $100.',
    rules: [
      'Each round has a Dealer and Stealers.',
      'The Dealer speaks to the group and proposes a deal.',
      'Each Stealer secretly chooses: Deal (cooperate) or Steal.',
      'Deal + Deal: both gain $20.',
      'Deal + Steal: stealer takes $30, dealer loses $30.',
      'Steal + Steal: both lose $10.',
      'Player with the highest balance at the end wins.',
    ],
    tip: 'Build trust early, but don\'t be afraid to steal once at the right moment.',
  },
  {
    id: 'shadowProtocol',
    title: 'Shadow Protocol',
    emoji: '🌑',
    players: '6–10 players',
    goal: 'Agents: find the Shadows. Shadows: outlast the group.',
    rules: [
      'Each player gets a secret role: Agent, Shadow, Investigator, or Guardian.',
      'Day phase: discuss and vote to eliminate a suspect.',
      'Night phase: Shadows eliminate, Investigators scan, Guardians protect.',
      'Agents win when all Shadows are eliminated.',
      'Shadows win when they equal or outnumber Agents.',
    ],
    tip: 'Shadows should blend in and cast suspicion elsewhere early.',
  },
  {
    id: 'potLuck',
    title: 'Smarty Pot',
    emoji: '🧠',
    players: '3+ players',
    goal: 'Answer trivia to claim the pot. Risk it or pass it on.',
    rules: [
      'A pot starts small and grows each turn.',
      'On your turn: Risk (answer a question) or Skip (pass to next player).',
      'Correct answer: claim the pot! Harder questions = bigger pot.',
      'Wrong answer: pot resets, you get nothing.',
      'First to the target score wins.',
    ],
    tip: 'Hard questions are riskier but pay out big when the pot is stacked. Plan your strategy while others are deciding.',
  },
  {
    id: 'chainLink',
    title: 'Link or Sink',
    emoji: '🔗',
    players: '2–8 players',
    goal: 'Empty your hand by linking words together.',
    rules: [
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
    tip: 'Think creatively — any real connection works. But make it strong enough to survive a challenge!',
  },
  {
    id: 'plotTwist',
    title: 'Plot Twist',
    emoji: '📜',
    players: '2–6 players',
    goal: 'Co-write a story. Bait others into using your secret words.',
    rules: [
      'Everyone gets a hand of word cards.',
      'On your turn, add a sentence to the growing story.',
      'If your sentence contains another player\'s secret word, they score points.',
      'Try to bait others into using your words naturally.',
      'The story continues for several rounds.',
      'Player with the most points from "hit" words wins.',
    ],
    tip: 'Write sentences that steer the story toward topics where others might naturally use your words — but be subtle about it.',
  },
  {
    id: 'blindRanking',
    title: 'Blind Ranking',
    emoji: '≣',
    players: '2–5 players',
    goal: 'Rank items blind as they appear — no take-backs. Compare the chaos.',
    rules: [
      'The host picks a category and list size (Top 5 or Top 10).',
      'Items from the category appear one at a time in random order.',
      'Lock each item into a rank slot as it appears — you can\'t move it later.',
      'You don\'t know what items are coming next.',
      'Once everyone finishes, all rankings are revealed side by side.',
      'See which picks were most divisive and where everyone agreed.',
    ],
    tip: 'Leave some wiggle room in your top and bottom slots — you never know what\'s coming next.',
  },
];

export default function InstructionsScreen({ navigation, route }: Props) {
  const targetGame = route.params?.game ?? null;
  const games = targetGame
    ? INSTRUCTIONS.filter(g => g.id === targetGame)
    : INSTRUCTIONS;

  const enterOpacity = useSharedValue(0);
  const enterSlide = useSharedValue(14);
  useEffect(() => {
    enterOpacity.value = withTiming(1, { duration: 350 });
    enterSlide.value = withTiming(0, { duration: 350 });
  }, []);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterSlide.value }],
  }));

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[{ flex: 1 }, enterStyle]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!targetGame && (
          <Text style={styles.pageSubtitle}>
            How every game works — in plain terms.
          </Text>
        )}

        {games.map((game, idx) => (
          <View key={game.id} style={[styles.card, idx > 0 && { marginTop: 16 }]}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>{game.emoji}</Text>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>{game.title}</Text>
                <Text style={styles.cardPlayers}>{game.players}</Text>
              </View>
            </View>

            {/* Goal */}
            <View style={styles.goalBox}>
              <Text style={styles.goalLabel}>GOAL</Text>
              <Text style={styles.goalText}>{game.goal}</Text>
            </View>

            {/* Rules */}
            <Text style={styles.sectionLabel}>HOW TO PLAY</Text>
            {game.rules.map((rule, i) => (
              <View key={i} style={styles.ruleRow}>
                <View style={styles.ruleDot} />
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}

            {/* Tip */}
            {game.tip && (
              <View style={styles.tipBox}>
                <Text style={styles.tipLabel}>TIP</Text>
                <Text style={styles.tipText}>{game.tip}</Text>
              </View>
            )}
          </View>
        ))}

        {targetGame && (
          <PrimaryButton
            title="Play Now"
            onPress={() => navigation.navigate('HostLobby')}
            style={{ marginTop: 24, paddingHorizontal: 20 }}
          />
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  pageSubtitle: {
    fontSize: 14,
    color: COLORS.text2,
    marginBottom: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardEmoji: { fontSize: 36 },
  cardHeaderText: { flex: 1, gap: 2 },
  cardTitle: {
    fontSize: 20,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  cardPlayers: {
    fontSize: 12,
    color: COLORS.accent,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  goalBox: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    padding: 14,
    gap: 4,
  },
  goalLabel: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  goalText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: -4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ruleDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginTop: 8,
    flexShrink: 0,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text2,
    lineHeight: 22,
  },
  tipBox: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.warning,
    paddingLeft: 12,
    gap: 2,
  },
  tipLabel: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  tipText: {
    fontSize: 13,
    color: COLORS.text2,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  backBtn: {
    marginTop: 28,
    alignSelf: 'center',
    padding: SPACING.sm,
  },
  backBtnText: {
    color: COLORS.text2,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
