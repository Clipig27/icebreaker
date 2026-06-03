import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { COLORS, RADIUS, FONTS } from '../constants/theme';
import { buildPieChartSession, PIE_CHARTS_DEFAULT_COUNT } from '../utils/promptUtils';
import { PieChartPrompt } from '../constants/gamePrompts';
import { Player } from '../types';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import GameIntro from '../components/GameIntro';
import PromptCard from '../components/PromptCard';
import PhaseTransition from '../components/PhaseTransition';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PieCharts'>;
};

const { width: SW } = Dimensions.get('window');

const PLAYER_COLORS = [
  '#7C5CF6', '#22C55E', '#F43F5E', '#FBBF24',
  '#3B82F6', '#EC4899', '#10B981', '#F97316',
  '#A78BFA', '#34D399',
];

interface PCVote {
  questionIdx: number;
  voterId:  string;
  voteeId:  string;
}

interface PCGameState {
  game: 'pieCharts';
  phase: 'intro' | 'setup' | 'question-intro' | 'voting' | 'reveal' | 'final-results';
  questions: PieChartPrompt[];
  questionIdx: number;
  submittedVoterIds: string[];
  allVotes: PCVote[];
  revealIdx:   number;
  revealStage: 'suspense' | 'revealed';
}

// ─── SVG Pie / Donut chart ────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegmentPath(
  cx: number, cy: number,
  or: number, ir: number,
  startDeg: number, endDeg: number,
): string {
  const sweep = endDeg - startDeg;
  if (sweep >= 359.9) {
    // Full donut — two semicircle arcs
    const o1 = polarToCartesian(cx, cy, or, 0);
    const o2 = polarToCartesian(cx, cy, or, 180);
    const i1 = polarToCartesian(cx, cy, ir, 0);
    const i2 = polarToCartesian(cx, cy, ir, 180);
    return (
      `M ${o1.x} ${o1.y} A ${or} ${or} 0 1 1 ${o2.x} ${o2.y} ` +
      `A ${or} ${or} 0 1 1 ${o1.x} ${o1.y} ` +
      `M ${i1.x} ${i1.y} A ${ir} ${ir} 0 1 0 ${i2.x} ${i2.y} ` +
      `A ${ir} ${ir} 0 1 0 ${i1.x} ${i1.y} Z`
    );
  }
  const large = sweep > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, or, startDeg);
  const p2 = polarToCartesian(cx, cy, or, endDeg);
  const p3 = polarToCartesian(cx, cy, ir, endDeg);
  const p4 = polarToCartesian(cx, cy, ir, startDeg);
  return `M ${p1.x} ${p1.y} A ${or} ${or} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${ir} ${ir} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

interface PieChartProps {
  players:  Player[];
  counts:   Record<string, number>;
  colorFor: (p: Player) => string;
  size?:    number;
}

function DonutChart({ players, counts, colorFor, size = 220 }: PieChartProps) {
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const or = size * 0.44;
  const ir = size * 0.26;

  let angle = 0;
  const segments = players
    .filter(p => (counts[p.id] ?? 0) > 0)
    .map(p => {
      const pct   = (counts[p.id] ?? 0) / total;
      const sweep = pct * 360;
      const start = angle;
      angle += sweep;
      return { player: p, pct, start, end: angle };
    });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {segments.map(({ player, start, end }) => (
          <Path
            key={player.id}
            d={donutSegmentPath(cx, cy, or, ir, start, end)}
            fill={colorFor(player)}
            stroke={COLORS.bg}
            strokeWidth={2}
          />
        ))}
        {/* Inner hole */}
        <Circle cx={cx} cy={cy} r={ir - 1} fill={COLORS.bg} />
      </Svg>
    </View>
  );
}

// ─── Reveal screen ────────────────────────────────────────────────────────────

function RevealScreen({
  question,
  players,
  counts,
  colorFor,
  stage,
  totalVotes,
  questionNum,
  totalQuestions,
  isHost,
  onReveal,
  onNext,
  isLast,
}: {
  question:       PieChartPrompt;
  players:        Player[];
  counts:         Record<string, number>;
  colorFor:       (p: Player) => string;
  stage:          'suspense' | 'revealed';
  totalVotes:     number;
  questionNum:    number;
  totalQuestions: number;
  isHost:         boolean;
  onReveal:       () => void;
  onNext:         () => void;
  isLast:         boolean;
}) {
  const winnerOpacity = useRef(new Animated.Value(0)).current;
  const winnerScale   = useRef(new Animated.Value(0.6)).current;
  const chartOpacity  = useRef(new Animated.Value(0)).current;
  const suspenseDots  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (stage === 'suspense') {
      winnerOpacity.setValue(0);
      winnerScale.setValue(0.6);
      chartOpacity.setValue(0);
      // Pulsing dots
      Animated.loop(
        Animated.sequence([
          Animated.timing(suspenseDots, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(suspenseDots, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      suspenseDots.stopAnimation();
      Animated.parallel([
        Animated.spring(winnerScale,   { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
        Animated.timing(winnerOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(chartOpacity,  { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [stage]);

  // Find winner(s) — could be a tie
  const maxVotes = players.length > 0 ? Math.max(...players.map(p => counts[p.id] ?? 0)) : 0;
  const winners  = maxVotes > 0 ? players.filter(p => (counts[p.id] ?? 0) === maxVotes) : [];
  const isTie    = winners.length > 1;

  const dotOpacity = suspenseDots.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <SafeAreaView style={r.safe}>
      <ScrollView contentContainerStyle={r.scroll} showsVerticalScrollIndicator={false}>
        {/* Badge */}
        <View style={r.badge}>
          <Text style={r.badgeText}>REVEAL  {questionNum} / {totalQuestions}</Text>
        </View>

        {/* Question setup line */}
        <View style={r.questionWrap}>
          <Text style={r.setupLine}>The person most likely to...</Text>
          <Text style={r.questionText}>"{question.text}"</Text>
          {stage === 'suspense' && (
            <View style={r.dotsRow}>
              {[0, 1, 2].map(i => (
                <Animated.View
                  key={i}
                  style={[
                    r.dot,
                    { opacity: dotOpacity, transform: [{ scale: dotOpacity }] },
                    { marginHorizontal: 4 },
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Winner reveal */}
        {stage === 'revealed' && (
          <>
            <Animated.View
              style={[r.winnerWrap, { opacity: winnerOpacity, transform: [{ scale: winnerScale }] }]}
            >
              {isTie && <Text style={r.tieLabel}>IT'S A TIE!</Text>}
              {winners.map(w => (
                <Text key={w.id} style={[r.winnerName, { color: colorFor(w) }]}>
                  {w.name}
                </Text>
              ))}
              <Text style={r.votesSub}>
                {maxVotes} of {totalVotes} vote{maxVotes !== 1 ? 's' : ''}
                {isTie ? ' each' : ''}
              </Text>
            </Animated.View>

            {/* Pie chart + legend */}
            <Animated.View style={[r.chartWrap, { opacity: chartOpacity }]}>
              <DonutChart players={players} counts={counts} colorFor={colorFor} size={SW * 0.55} />
              {/* Legend */}
              <View style={r.legend}>
                {[...players]
                  .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
                  .map(p => {
                    const c   = counts[p.id] ?? 0;
                    const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0;
                    return (
                      <View key={p.id} style={r.legendRow}>
                        <View style={[r.legendDot, { backgroundColor: colorFor(p) }]} />
                        <Text style={r.legendName} numberOfLines={1}>{p.name}</Text>
                        <Text style={r.legendPct}>{pct}%</Text>
                        <Text style={r.legendCount}>({c})</Text>
                      </View>
                    );
                  })}
              </View>
            </Animated.View>
          </>
        )}

        {/* Controls */}
        <View style={r.controls}>
          {isHost ? (
            stage === 'suspense' ? (
              <PrimaryButton title="Reveal →" onPress={onReveal} />
            ) : (
              <PrimaryButton
                title={isLast ? 'See Final Results →' : 'Next Question →'}
                onPress={onNext}
              />
            )
          ) : (
            <Text style={r.waitText}>
              {stage === 'suspense' ? 'Waiting for the reveal...' : 'Waiting for host to continue...'}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const r = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 20 },
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 5,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontFamily: FONTS.extrabold, color: COLORS.accentHi, letterSpacing: 2 },
  questionWrap: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  setupLine:    { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.text2, textAlign: 'center' },
  questionText: { fontSize: 20, fontFamily: FONTS.extrabold, color: COLORS.text,  textAlign: 'center', lineHeight: 28, letterSpacing: -0.3 },
  dotsRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.accentHi,
  },
  winnerWrap: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  tieLabel: {
    fontSize: 13, fontFamily: FONTS.extrabold, color: COLORS.warning,
    letterSpacing: 3, marginBottom: 4,
  },
  winnerName: {
    fontSize: 42, fontFamily: FONTS.extrabold,
    letterSpacing: -1,
    textShadowColor: 'rgba(124,92,246,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  votesSub: { fontSize: 14, color: COLORS.text2, fontFamily: FONTS.medium },
  chartWrap: { alignItems: 'center', gap: 20 },
  legend: { width: '100%', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendName:  { flex: 1, fontSize: 14, fontFamily: FONTS.bold, color: COLORS.text },
  legendPct:   { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text, width: 38, textAlign: 'right' },
  legendCount: { fontSize: 12, color: COLORS.text2, width: 28, textAlign: 'right' },
  controls:  { gap: 10, marginTop: 4, alignItems: 'center' },
  waitText:  { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PieChartsScreen({ navigation }: Props) {
  const { players, room, isHost, currentUser, sendGameState, sendPlayerAction, startGame } = useGame();

  const myId = (() => {
    if (currentUser?.id) {
      const byPersistent = players.find(
        p => p.persistentId === currentUser.id || p.id === currentUser.id,
      );
      if (byPersistent) return byPersistent.id;
    }
    const bySocket = players.find(p => p.id === socket.id);
    if (bySocket) return bySocket.id;
    return currentUser?.id ?? socket.id ?? '';
  })();

  const gsRef      = useRef<PCGameState | null>(null);
  const allPlayers = room?.players ?? players;
  const playersRef = useRef(allPlayers);
  useEffect(() => { playersRef.current = room?.players ?? players; }, [room?.players, players]);

  const gs = (room?.gameState?.game === 'pieCharts' ? room.gameState : null) as PCGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // headerLeft (Leave button) is set globally in App.tsx screenOptions

  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gs?.phase) { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); return; }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  }, [!!gs?.phase]);

  const [customInput,   setCustomInput]   = useState('');
  const [customPrompts, setCustomPrompts] = useState<PieChartPrompt[]>([]);

  // ── Host: handle player votes ─────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;
    const handler = ({ playerId, action, data }: any) => {
      const state      = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state || action !== 'pc-vote' || state.phase !== 'voting') return;
      if (state.submittedVoterIds.includes(playerId)) return;

      const newAllVotes  = [...state.allVotes, { questionIdx: state.questionIdx, voterId: playerId, voteeId: data.voteeId }];
      const newSubmitted = [...state.submittedVoterIds, playerId];
      const allVoted     = newSubmitted.length >= allPlayers.length;
      const isLastQ      = state.questionIdx >= state.questions.length - 1;

      let next: PCGameState;
      if (allVoted && isLastQ) {
        // All questions done → go to reveal
        next = { ...state, phase: 'reveal', revealIdx: 0, revealStage: 'suspense', submittedVoterIds: newSubmitted, allVotes: newAllVotes };
      } else if (allVoted) {
        // More questions → skip results, straight to next question
        next = { ...state, phase: 'question-intro', questionIdx: state.questionIdx + 1, submittedVoterIds: [], allVotes: newAllVotes };
      } else {
        next = { ...state, submittedVoterIds: newSubmitted, allVotes: newAllVotes };
      }
      gsRef.current = next;
      sendGameState(next);
    };
    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]);

  // ── Host actions ──────────────────────────────────────────────────────────
  const handleStartGame = () => {
    if (!isHost) return;
    const session = buildPieChartSession(customPrompts, PIE_CHARTS_DEFAULT_COUNT);
    const next: PCGameState = {
      game: 'pieCharts', phase: 'question-intro',
      questions: session, questionIdx: 0,
      submittedVoterIds: [], allVotes: [],
      revealIdx: 0, revealStage: 'suspense',
    };
    gsRef.current = next;
    sendGameState(next);
  };

  const handleStartVoting = () => {
    if (!isHost || !gs) return;
    const next: PCGameState = { ...gs, phase: 'voting', submittedVoterIds: [] };
    gsRef.current = next;
    sendGameState(next);
  };

  const handleReveal = () => {
    if (!isHost || !gs) return;
    const next: PCGameState = { ...gs, revealStage: 'revealed' };
    gsRef.current = next;
    sendGameState(next);
  };

  const handleNextReveal = () => {
    if (!isHost || !gs) return;
    const isLast = (gs.revealIdx ?? 0) >= (gs.questions?.length ?? 1) - 1;
    const next: PCGameState = isLast
      ? { ...gs, phase: 'final-results' }
      : { ...gs, revealIdx: (gs.revealIdx ?? 0) + 1, revealStage: 'suspense' };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const colorFor = (player: Player) =>
    PLAYER_COLORS[allPlayers.findIndex(p => p.id === player.id) % PLAYER_COLORS.length];

  const tallyVotes = (qIdx: number) => {
    const counts: Record<string, number> = {};
    for (const p of allPlayers) counts[p.id] = 0;
    for (const v of (gs?.allVotes ?? []).filter(v => v.questionIdx === qIdx)) {
      counts[v.voteeId] = (counts[v.voteeId] ?? 0) + 1;
    }
    return counts;
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (gs?.phase === 'intro' || (!gs?.phase)) {
    return (
      <GameIntro
        emoji="🥧"
        title="Pie Charts"
        tagline="See who the group thinks fits each question."
        rules={[
          { emoji: '❓', text: 'A "who is most likely to..." question appears.' },
          { emoji: '🗳️', text: 'Everyone votes for a player — you can vote for yourself.' },
          { emoji: '📊', text: 'Results are revealed as a live pie chart showing the vote split.' },
          { emoji: '📋', text: 'After all questions, scroll through the full results.' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!gs?.phase) {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey="loading">
        <View style={styles.centered}>
          {setupTimedOut ? (
            <>
              <Text style={styles.waitTitle}>Could not load game</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
                <Text style={{ color: COLORS.text2, textDecorationLine: 'underline', fontSize: 14 }}>← Go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.waitTitle}>Setting up...</Text>
          )}
        </View>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: setup ──────────────────────────────────────────────────────────
  if (gs.phase === 'setup') {
    if (!isHost) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🥧</Text>
            <Text style={styles.waitTitle}>Pie Charts</Text>
            <Text style={styles.waitSub}>Host is setting up...</Text>
          </View>
          </PhaseTransition>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Pie Charts</Text>
            <Text style={styles.subtitle}>Vote on "who's most likely" questions. Results revealed at the end.</Text>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Add custom questions (optional)</Text>
            <View style={styles.customInputRow}>
              <TextInput
                style={styles.customInput}
                value={customInput}
                onChangeText={setCustomInput}
                placeholder="Who is most likely to…"
                placeholderTextColor={COLORS.text3}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const text = customInput.trim();
                  if (!text) return;
                  setCustomPrompts(prev => [...prev, { id: `custom_${Date.now()}`, text, isCustom: true }]);
                  setCustomInput('');
                }}
                keyboardAppearance="dark"
                inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
              />
              <TouchableOpacity
                style={[styles.addBtn, !customInput.trim() && styles.addBtnDisabled]}
                onPress={() => {
                  const text = customInput.trim();
                  if (!text) return;
                  setCustomPrompts(prev => [...prev, { id: `custom_${Date.now()}`, text, isCustom: true }]);
                  setCustomInput('');
                }}
                disabled={!customInput.trim()}
              >
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            {customPrompts.length > 0 && (
              <View style={styles.customList}>
                {customPrompts.map(p => (
                  <View key={p.id} style={styles.customChip}>
                    <Text style={styles.customChipText} numberOfLines={1}>{p.text}</Text>
                    <TouchableOpacity
                      onPress={() => setCustomPrompts(prev => prev.filter(x => x.id !== p.id))}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                      <Text style={styles.removeChip}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                📋  {customPrompts.length > 0
                  ? `${customPrompts.length} custom + ${Math.max(0, PIE_CHARTS_DEFAULT_COUNT - customPrompts.length)} preset questions`
                  : `${PIE_CHARTS_DEFAULT_COUNT} questions from preset bank`}
              </Text>
              <Text style={styles.infoText}>👥  {players.length} players voting</Text>
            </View>
            <PrimaryButton title="Start Game →" onPress={handleStartGame} />
            <SecondaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
          </ScrollView>
        </KeyboardAvoidingView>
        <KeyboardDoneBar />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  const currentQuestion = (gs.questions ?? [])[gs.questionIdx ?? 0];

  // ── Phase: question-intro ─────────────────────────────────────────────────
  if (gs.phase === 'question-intro') {
    const qNum   = (gs.questionIdx ?? 0) + 1;
    const qTotal = (gs.questions ?? []).length;
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
        <View style={styles.centeredContainer}>
          <View style={styles.questionBadge}>
            <Text style={styles.questionBadgeText}>QUESTION {qNum} / {qTotal}</Text>
          </View>
          <PromptCard text={currentQuestion?.text ?? ''} size="md" accentColor="#10B981" />
          <Text style={styles.questionSub}>Everyone votes on their own phone — including yourself!</Text>
          {isHost ? (
            <PrimaryButton title="Start Voting →" onPress={handleStartVoting} style={{ marginTop: 8 }} />
          ) : (
            <Text style={styles.waitSub}>Waiting for host to open voting...</Text>
          )}
        </View>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ─────────────────────────────────────────────────────────
  if (gs.phase === 'voting') {
    const iHaveVoted = (gs.submittedVoterIds ?? []).includes(myId ?? '');
    const votesIn    = (gs.submittedVoterIds ?? []).length;

    if (iHaveVoted) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>You voted!</Text>
            <Text style={styles.waitSub}>{votesIn} / {allPlayers.length} players have voted</Text>
          </View>
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🗳️  Vote now</Text>
          </View>
          <PromptCard text={currentQuestion?.text ?? ''} size="md" accentColor="#10B981" />
          <Text style={styles.sectionLabel}>Who are you voting for?</Text>
          {allPlayers.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.playerVoteBtn, { borderColor: colorFor(p) }]}
              onPress={() => sendPlayerAction('pc-vote', { voteeId: p.id })}
              activeOpacity={0.75}
            >
              <View style={[styles.playerColorDot, { backgroundColor: colorFor(p) }]} />
              <Text style={styles.playerVoteName} numberOfLines={1}>{p.name}</Text>
              {myId === p.id && <Text style={styles.selfLabel}>you</Text>}
              <Text style={styles.playerVoteArrow}>→</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.voteProgress}>{votesIn} / {allPlayers.length} voted</Text>
        </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: reveal ─────────────────────────────────────────────────────────
  if (gs.phase === 'reveal') {
    const rIdx     = gs.revealIdx ?? 0;
    const rStage   = gs.revealStage ?? 'suspense';
    const revQ     = (gs.questions ?? [])[rIdx];
    const counts   = tallyVotes(rIdx);
    const total    = (gs.allVotes ?? []).filter(v => v.questionIdx === rIdx).length;
    const isLast   = rIdx >= (gs.questions?.length ?? 1) - 1;

    return (
      <PhaseTransition phaseKey={gs.phase}>
        <RevealScreen
          question={revQ}
          players={allPlayers}
          counts={counts}
          colorFor={colorFor}
          stage={rStage}
          totalVotes={total}
          questionNum={rIdx + 1}
          totalQuestions={(gs.questions ?? []).length}
          isHost={isHost}
          onReveal={handleReveal}
          onNext={handleNextReveal}
          isLast={isLast}
        />
      </PhaseTransition>
    );
  }

  // ── Phase: final-results ──────────────────────────────────────────────────
  if (gs.phase === 'final-results') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.finalTitle}>All Done!</Text>
          <Text style={styles.finalSub}>{(gs.questions ?? []).length} questions · {allPlayers.length} voters</Text>
          {(gs.questions ?? []).map((q, qi) => {
            const counts    = tallyVotes(qi);
            const total     = (gs.allVotes ?? []).filter(v => v.questionIdx === qi).length;
            const maxV      = Math.max(...allPlayers.map(p => counts[p.id] ?? 0));
            const winners   = allPlayers.filter(p => (counts[p.id] ?? 0) === maxV && maxV > 0);
            return (
              <View key={q.id} style={styles.finalBlock}>
                <Text style={styles.finalQNum}>Q{qi + 1}</Text>
                <Text style={styles.finalQText}>{q.text}</Text>
                <View style={styles.finalWinnersRow}>
                  {winners.map(w => (
                    <Text key={w.id} style={[styles.finalWinner, { color: colorFor(w) }]}>{w.name}</Text>
                  ))}
                  {winners.length > 1 && <Text style={styles.finalTie}>(tie)</Text>}
                </View>
                <DonutChart players={allPlayers} counts={counts} colorFor={colorFor} size={SW * 0.45} />
              </View>
            );
          })}
          <View style={styles.actions}>
            {isHost ? (
              <>
                <PrimaryButton title="Play Again" onPress={() => startGame('pieCharts')} />
                <SecondaryButton title="Choose New Game" onPress={() => navigation.navigate('GameSelect')} />
              </>
            ) : (
              <Text style={styles.waitSub}>Waiting for host...</Text>
            )}
          </View>
        </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 16 },
  centeredContainer: {
    flex: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40,
    alignItems: 'center', gap: 14,
  },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, gap: 12,
  },
  waitEmoji: { fontSize: 52 },
  waitTitle: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.text, textAlign: 'center' },
  waitSub:   { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  sectionLabel: {
    fontSize: 12, fontFamily: FONTS.bold, color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  actions: { gap: 10, marginTop: 8, alignItems: 'center' },
  title:   { fontSize: 30, fontFamily: FONTS.extrabold, letterSpacing: -0.5, color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.text2, lineHeight: 22 },
  customInputRow: { flexDirection: 'row', gap: 10 },
  customInput: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text,
  },
  addBtn:         { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText:     { color: COLORS.text, fontFamily: FONTS.bold, fontSize: 14 },
  customList:     { gap: 8 },
  customChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface2, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderHi,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  customChipText: { flex: 1, fontSize: 14, color: COLORS.text },
  removeChip:     { fontSize: 14, color: COLORS.text2, fontFamily: FONTS.bold },
  infoBox:        { gap: 6 },
  infoText:       { fontSize: 14, color: COLORS.text2 },
  questionBadge: {
    backgroundColor: COLORS.surface2, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.borderHi,
    paddingVertical: 5, paddingHorizontal: 14, alignSelf: 'flex-start',
  },
  questionBadgeText: { fontSize: 12, fontFamily: FONTS.bold, color: COLORS.text2, letterSpacing: 1.5 },
  questionBox: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.borderHi,
    paddingHorizontal: 22, paddingVertical: 24,
    width: '100%', alignItems: 'center',
  },
  questionText: {
    fontSize: 22, fontFamily: FONTS.extrabold, color: COLORS.text,
    textAlign: 'center', letterSpacing: -0.3, lineHeight: 30,
  },
  questionSub: { fontSize: 13, color: COLORS.text2, textAlign: 'center' },
  badge: {
    backgroundColor: COLORS.surface2, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.borderHi,
    paddingVertical: 6, paddingHorizontal: 14, alignSelf: 'flex-start',
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.bold },
  playerVoteBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  playerColorDot: { width: 12, height: 12, borderRadius: RADIUS.full },
  playerVoteName: { flex: 1, fontSize: 17, fontFamily: FONTS.bold, color: COLORS.text },
  playerVoteArrow: { fontSize: 16, color: COLORS.text2 },
  selfLabel: { fontSize: 11, color: COLORS.accentHi, fontFamily: FONTS.bold, letterSpacing: 0.5 },
  voteProgress: { fontSize: 13, color: COLORS.text3, textAlign: 'center' },
  finalTitle: { fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5, color: COLORS.text },
  finalSub:   { fontSize: 14, color: COLORS.text2 },
  finalBlock: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 10, alignItems: 'center',
  },
  finalQNum:  { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text3, textTransform: 'uppercase', letterSpacing: 1.5, alignSelf: 'flex-start' },
  finalQText: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.text, lineHeight: 22, alignSelf: 'flex-start' },
  finalWinnersRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start' },
  finalWinner: { fontSize: 18, fontFamily: FONTS.extrabold },
  finalTie:   { fontSize: 12, color: COLORS.text2 },
});
