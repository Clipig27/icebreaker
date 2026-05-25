import React from 'react';
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
import { COLORS, RADIUS, SPACING } from '../constants/theme';

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
    title: 'Lie Detector',
    emoji: '🕵️',
    players: '2+ players',
    goal: 'Fool the group as the speaker. Catch lies as a listener.',
    rules: [
      'The active speaker reads a prompt and writes two answers — one true, one a lie.',
      'They say both answers out loud to the group.',
      'Listeners may ask one clarifying question before voting.',
      'Each listener votes on which statement they think is the LIE.',
      'Listeners who identify the lie correctly earn 1 point.',
      'The speaker earns 1 point if the majority guesses wrong.',
    ],
    tip: 'Make both answers believable. The truth can be just as surprising as the lie.',
  },
  {
    id: 'talentShow',
    title: 'Talent Show',
    emoji: '🎭',
    players: '3+ players',
    goal: 'Survive the buzz, impress the crowd, and win the ultimate showdown.',
    rules: [
      '── ROUND 1 ──',
      'Everyone takes turns performing a 30-second act (after a 5-second get-ready countdown).',
      'Audience members each have one BUZZ (red) and one GOLDEN BUZZ (gold) — they can use only one.',
      'If half or more of the audience BUZZes you before 30 seconds, you are ELIMINATED.',
      'If half or more give you a GOLDEN BUZZ, you advance instantly with a golden pass.',
      'Surviving the full 30 seconds also advances you to Round 2.',
      'Eliminated players can still vote in later rounds.',
      '── ROUND 2 ──',
      'All Round 1 survivors perform their acts (no buzz system — just watch).',
      'Performers can tap "Done Early" if they finish before 30 seconds.',
      'After all acts, everyone votes for their 2 favourites to advance to the Final — performers cannot vote for themselves.',
      'If there is a tie, tied players do a quick 10-second tiebreaker act and the group votes again.',
      '── FINAL (ROUND 3) ──',
      'Only 2 players remain. Both finalists get the SAME extreme prompt.',
      'Both perform their 30-second acts back-to-back, then everyone (except the finalists) votes for the winner.',
      'If the vote is tied, a quick 10-second tiebreaker decides it — repeated until there is a clear winner.',
      'The player with the most votes wins the whole show!',
    ],
    tip: 'Commit fully — the more energy you bring, the harder it is for people to buzz you.',
  },
  {
    id: 'standOut',
    title: 'Stand Out',
    emoji: '⚡',
    players: '3+ players',
    goal: 'Give unique answers nobody else gives. First to the target score wins.',
    rules: [
      'A question is read aloud to all players.',
      'Everyone has 10 seconds to submit an answer.',
      'Unique answer (nobody else said it): earn +10 points.',
      'Matching answer (someone else said the same): everyone who matched loses 10 points.',
      'Chain unique answers back-to-back for streak bonuses: +15, +20, +25.',
      'The host picks a target score (50, 100, or 200) — first to reach it wins.',
    ],
    tip: 'Think about what the obvious answer is — then avoid it.',
  },
  {
    id: 'numberGuessor',
    title: 'Number Guessor',
    emoji: '🎯',
    players: '2+ players',
    goal: 'Guess closest to the correct number. Lowest penalty wins.',
    rules: [
      'Each round shows a prompt with a hidden number answer between 1 and 100.',
      'You have 20 seconds to submit your guess.',
      'All players submit a guess at the same time.',
      'Your penalty = how far off your guess is + the seconds you took to submit.',
      'If you don\'t guess in time, you get the maximum penalty: 100 (distance) + 20 (time) = 120.',
      'After the chosen number of rounds, the player with the lowest total penalty wins.',
    ],
    tip: 'Guess fast AND accurately — every second you wait adds to your penalty on top of how far off you are.',
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    emoji: '🥧',
    players: '3+ players',
    goal: 'See who the group thinks fits each question the most.',
    rules: [
      'A "who in this group is most likely to..." question appears.',
      'Everyone votes for a player — you can vote for yourself.',
      'Results are revealed as a live pie chart showing the vote split.',
      'After all questions, you can scroll through the full results.',
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
      'Each round, one player leads a discussion — then everyone secretly submits their action.',
      'Choose DEAL (target a player to cooperate), STEAL (target a player to betray), or NEUTRAL (sit out).',
      'Both DEAL: both players gain money.',
      'One DEAL, one STEAL: the stealer takes from the dealer, who loses their share.',
      'Both STEAL: neither player gains anything.',
      'Standings are shown anonymously — you only know your own balance.',
      'The player with the highest balance at the end wins.',
    ],
    tip: 'Build trust early, but don\'t be afraid to steal once at the right moment.',
  },
  {
    id: 'shadowProtocol',
    title: 'Shadow Protocol',
    emoji: '🕵️',
    players: '6–10 players',
    goal: 'Innocents: eliminate all Shadows. Shadows: outlast the group.',
    rules: [
      'Players are secretly assigned roles: Innocents or Shadows.',
      'Each round, all players discuss who they suspect might be a Shadow.',
      'Players then vote to eliminate one person from the game.',
      'The eliminated player\'s role is revealed.',
      'Shadows win if they match or outnumber the remaining Innocents.',
      'Innocents win if all Shadows are eliminated.',
    ],
    tip: 'Shadows should blend in and cast suspicion elsewhere early.',
  },
  {
    id: 'potLuck',
    title: 'Smarty Pot',
    emoji: '🧠',
    players: '3+ players',
    goal: 'Answer trivia correctly to claim the pot. First to the target score wins.',
    rules: [
      '── DIFFICULTY & POT ──',
      'Each question has a difficulty: Easy (🟢), Medium (🟡), or Hard (🔴).',
      'Easy questions start the pot at 1. Medium at 2. Hard at 3 — so Hard pays out more by default.',
      'The pot grows by 1 each time a player skips or answers wrong, up to the max cap.',
      'The host sets a max pot cap (5–10) before the game — no question can ever exceed this.',
      '── TAKING TURNS ──',
      'Players answer in a randomly shuffled order.',
      'On your turn you have 15 seconds — answer one of the 4 choices or SKIP.',
      'Answer correctly: you win the full pot and the question ends.',
      'Answer wrong: you lose points equal to the pot, and it passes to the next player.',
      'Skip: the pot grows by 1 and passes to the next player.',
      '── WINNING ──',
      'If every player skips the entire round, the pot is voided and no one scores.',
      'Scores floor at 0 — you can never go negative.',
      'First player to reach the target score (players × max pot) wins!',
    ],
    tip: 'Hard questions are riskier but pay out big when the pot is stacked. Plan your strategy while others are deciding.',
  },
  {
    id: 'chainLink',
    title: 'ChainLink',
    emoji: '🔗',
    players: '2–8 players',
    goal: 'Be the first to empty your hand by linking words together.',
    rules: [
      'Each player gets 7 word cards. An anchor word starts the chain.',
      'On your turn you have 20 seconds to play a card or skip.',
      'Play a card by selecting it and optionally explaining how it links to the last word in the chain.',
      'After you play, other players have 3 seconds to CHALLENGE your link.',
      'If challenged, an AI referee rules VALID or INVALID.',
      'VALID: your card is accepted and the challenger draws a penalty card.',
      'INVALID: you keep your card and draw a penalty card.',
      'If no one challenges within 5 seconds, your link is automatically accepted.',
      'Skip your turn at any time — no penalty.',
      'If you run out of time, your turn is automatically skipped.',
      'First player to empty their hand wins!',
    ],
    tip: 'Think creatively — any real connection works. But make it strong enough to survive a challenge!',
  },
];

export default function InstructionsScreen({ navigation, route }: Props) {
  const targetGame = route.params?.game ?? null;
  const games = targetGame
    ? INSTRUCTIONS.filter(g => g.id === targetGame)
    : INSTRUCTIONS;

  return (
    <SafeAreaView style={styles.safe}>
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

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
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
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  cardPlayers: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '600',
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
    fontWeight: '700',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  goalText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
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
    fontWeight: '700',
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
