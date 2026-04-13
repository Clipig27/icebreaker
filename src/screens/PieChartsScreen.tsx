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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { COLORS, RADIUS } from '../constants/theme';
import { buildPieChartSession, PIE_CHARTS_DEFAULT_COUNT } from '../utils/promptUtils';
import { PieChartPrompt } from '../constants/gamePrompts';
import { Player } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PieCharts'>;
};

const PLAYER_COLORS = [
  '#7C5CF6', '#22C55E', '#F43F5E', '#FBBF24',
  '#3B82F6', '#EC4899', '#10B981', '#F97316',
  '#A78BFA', '#34D399',
];

interface PCVote {
  questionIdx: number;
  voterId: string;
  voteeId: string;
}

interface PCGameState {
  game: 'pieCharts';
  phase: 'setup' | 'question-intro' | 'voting' | 'results' | 'final-results';
  questions: PieChartPrompt[];
  questionIdx: number;
  // Who has voted on the current question
  submittedVoterIds: string[];
  // All votes accumulated across all questions
  allVotes: PCVote[];
}

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

  const gsRef = useRef<PCGameState | null>(null);
  const allPlayers = room?.players ?? players;
  const playersRef = useRef(allPlayers);
  useEffect(() => { playersRef.current = room?.players ?? players; }, [room?.players, players]);

  const gs = (room?.gameState?.game === 'pieCharts' ? room.gameState : null) as PCGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // Block header back button for non-hosts
  useEffect(() => {
    navigation.setOptions({ headerBackVisible: isHost, gestureEnabled: isHost });
  }, [isHost]);

  // Setup timeout — if no usable gameState within 8 s, socket is likely down
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gs?.phase) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  }, [!!gs?.phase]);

  // Host-only setup state
  const [customInput, setCustomInput] = useState('');
  const [customPrompts, setCustomPrompts] = useState<PieChartPrompt[]>([]);

  // ── Host: handle player actions ────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      if (action === 'pc-vote' && state.phase === 'voting') {
        if (state.submittedVoterIds.includes(playerId)) return;
        const newVote: PCVote = {
          questionIdx: state.questionIdx,
          voterId: playerId,
          voteeId: data.voteeId,
        };
        const newAllVotes = [...state.allVotes, newVote];
        const newSubmitted = [...state.submittedVoterIds, playerId];

        if (newSubmitted.length >= allPlayers.length) {
          // All voted — show results for this question
          const next: PCGameState = {
            ...state,
            phase: 'results',
            submittedVoterIds: newSubmitted,
            allVotes: newAllVotes,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: PCGameState = {
            ...state,
            submittedVoterIds: newSubmitted,
            allVotes: newAllVotes,
          };
          gsRef.current = next;
          sendGameState(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]); // eslint-disable-line

  // ── Host: start game ───────────────────────────────────────────────────────
  const handleStartGame = () => {
    if (!isHost) return;
    const session = buildPieChartSession(customPrompts, PIE_CHARTS_DEFAULT_COUNT);
    const next: PCGameState = {
      game: 'pieCharts',
      phase: 'question-intro',
      questions: session,
      questionIdx: 0,
      submittedVoterIds: [],
      allVotes: [],
    };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Host: start voting for current question ────────────────────────────────
  const handleStartVoting = () => {
    if (!isHost || !gs) return;
    const next: PCGameState = { ...gs, phase: 'voting', submittedVoterIds: [] };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Host: next question ────────────────────────────────────────────────────
  const handleNextQuestion = () => {
    if (!isHost || !gs) return;
    const nextIdx = gs.questionIdx + 1;
    if (nextIdx >= gs.questions.length) {
      const next: PCGameState = { ...gs, phase: 'final-results' };
      gsRef.current = next;
      sendGameState(next);
    } else {
      const next: PCGameState = {
        ...gs,
        phase: 'question-intro',
        questionIdx: nextIdx,
        submittedVoterIds: [],
      };
      gsRef.current = next;
      sendGameState(next);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const colorFor = (player: Player) => PLAYER_COLORS[players.findIndex(p => p.id === player.id) % PLAYER_COLORS.length];

  const tallyVotes = (qIdx: number) => {
    const counts: Record<string, number> = {};
    for (const p of players) counts[p.id] = 0;
    for (const v of (gs?.allVotes ?? []).filter(v => v.questionIdx === qIdx)) {
      counts[v.voteeId] = (counts[v.voteeId] ?? 0) + 1;
    }
    return counts;
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gs || !gs.phase) {
    return (
      <SafeAreaView style={styles.safe}>
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
      </SafeAreaView>
    );
  }

  // ── Phase: setup (host only) ───────────────────────────────────────────────
  if (gs.phase === 'setup') {
    if (!isHost) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🥧</Text>
            <Text style={styles.waitTitle}>Pie Charts</Text>
            <Text style={styles.waitSub}>Host is setting up the game...</Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Pie Charts</Text>
            <Text style={styles.subtitle}>
              Vote on "who's most likely" questions.{'\n'}See the results as vote breakdowns.
            </Text>
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
                  : `${PIE_CHARTS_DEFAULT_COUNT} questions from the preset bank`}
              </Text>
              <Text style={styles.infoText}>👥  {players.length} players voting</Text>
            </View>
            <PrimaryButton title="Start Game →" onPress={handleStartGame} />
            <SecondaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const currentQuestion = (gs.questions ?? [])[gs.questionIdx ?? 0];

  // ── Phase: question-intro ──────────────────────────────────────────────────
  if (gs.phase === 'question-intro') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centeredContainer}>
          <View style={styles.questionBadge}>
            <Text style={styles.questionBadgeText}>
              QUESTION {(gs.questionIdx ?? 0) + 1} / {(gs.questions ?? []).length}
            </Text>
          </View>
          <View style={styles.questionBox}>
            <Text style={styles.questionText}>{currentQuestion?.text}</Text>
          </View>
          <Text style={styles.questionSub}>Everyone votes simultaneously on their own phone.</Text>
          {isHost ? (
            <PrimaryButton title="Start Voting →" onPress={handleStartVoting} style={{ marginTop: 8 }} />
          ) : (
            <Text style={styles.waitSub}>Waiting for host to open voting...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ──────────────────────────────────────────────────────────
  if (gs.phase === 'voting') {
    const iHaveVoted = (gs.submittedVoterIds ?? []).includes(myId ?? '');
    const votesIn = (gs.submittedVoterIds ?? []).length;

    if (iHaveVoted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>You voted!</Text>
            <Text style={styles.waitSub}>{votesIn} / {players.length} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🗳️  Vote now</Text>
          </View>
          <View style={styles.questionBox}>
            <Text style={styles.questionText}>{currentQuestion?.text}</Text>
          </View>
          <Text style={styles.sectionLabel}>Tap who you're voting for:</Text>
          {players.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.playerVoteBtn, { borderColor: colorFor(p) }, myId === p.id && styles.playerVoteSelf]}
              onPress={() => myId !== p.id && sendPlayerAction('pc-vote', { voteeId: p.id })}
              activeOpacity={0.75}
            >
              <View style={[styles.playerColorDot, { backgroundColor: colorFor(p) }]} />
              <Text style={styles.playerVoteName}>{p.name}</Text>
              {myId === p.id
                ? <Text style={styles.selfLabel}>you</Text>
                : <Text style={styles.playerVoteArrow}>→</Text>}
            </TouchableOpacity>
          ))}
          <Text style={styles.voteProgress}>{votesIn} / {players.length} voted</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: results (single question) ──────────────────────────────────────
  if (gs.phase === 'results') {
    const counts = tallyVotes(gs.questionIdx ?? 0);
    const totalVotes = (gs.allVotes ?? []).filter(v => v.questionIdx === (gs.questionIdx ?? 0)).length;

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.questionBadge}>
            <Text style={styles.questionBadgeText}>QUESTION {(gs.questionIdx ?? 0) + 1} RESULTS</Text>
          </View>
          <View style={styles.questionBox}>
            <Text style={styles.questionText}>{currentQuestion?.text}</Text>
          </View>
          <VoteChart players={players} counts={counts} totalVotes={totalVotes} colorFor={colorFor} />
          <View style={styles.actions}>
            {isHost ? (
              <>
                {(gs.questionIdx ?? 0) < (gs.questions ?? []).length - 1 ? (
                  <PrimaryButton title="Next Question →" onPress={handleNextQuestion} />
                ) : (
                  <PrimaryButton title="See Final Results →" onPress={handleNextQuestion} />
                )}
                <SecondaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
              </>
            ) : (
              <Text style={styles.waitSub}>Waiting for host to continue...</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: final-results ───────────────────────────────────────────────────
  if (gs.phase === 'final-results') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.finalTitle}>All Results</Text>
          <Text style={styles.finalSub}>{(gs.questions ?? []).length} questions · {players.length} voters</Text>
          {(gs.questions ?? []).map((q, qi) => {
            const counts = tallyVotes(qi);
            const totalVotes = (gs.allVotes ?? []).filter(v => v.questionIdx === qi).length;
            return (
              <View key={q.id} style={styles.finalQuestionBlock}>
                <Text style={styles.finalQuestionNum}>Q{qi + 1}</Text>
                <Text style={styles.finalQuestionText}>{q.text}</Text>
                <VoteChart players={players} counts={counts} totalVotes={totalVotes} colorFor={colorFor} compact />
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
              <Text style={styles.waitSub}>Waiting for host to continue...</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── VoteChart component ───────────────────────────────────────────────────────

interface VoteChartProps {
  players: Player[];
  counts: Record<string, number>;
  totalVotes: number;
  colorFor: (p: Player) => string;
  compact?: boolean;
}

function VoteChart({ players, counts, totalVotes, colorFor, compact = false }: VoteChartProps) {
  const sorted = [...players].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.stackedBar}>
        {sorted.filter(p => (counts[p.id] ?? 0) > 0).map(p => {
          const pct = totalVotes > 0 ? ((counts[p.id] ?? 0) / totalVotes) * 100 : 0;
          return (
            <View
              key={p.id}
              style={[chartStyles.stackedSegment, { width: `${pct}%`, backgroundColor: colorFor(p) }]}
            />
          );
        })}
      </View>
      {sorted.map((p, i) => {
        const count = counts[p.id] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        return (
          <View key={p.id} style={chartStyles.legendRow}>
            <View style={[chartStyles.colorDot, { backgroundColor: colorFor(p) }]} />
            <Text style={[chartStyles.legendName, compact && chartStyles.legendNameCompact]}>{p.name}</Text>
            <View style={chartStyles.barTrack}>
              <View style={[chartStyles.barFill, { width: `${pct}%`, backgroundColor: colorFor(p) }]} />
            </View>
            <Text style={chartStyles.pctText}>{pct}%</Text>
            <Text style={chartStyles.countText}>({count})</Text>
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { gap: 8 },
  stackedBar: {
    height: 14,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: COLORS.surface2,
    marginBottom: 4,
  },
  stackedSegment: { height: '100%' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  colorDot: { width: 10, height: 10, borderRadius: RADIUS.full },
  legendName: { fontSize: 14, fontWeight: '700', color: COLORS.text, width: 80 },
  legendNameCompact: { fontSize: 13, width: 70 },
  barTrack: { flex: 1, height: 6, backgroundColor: COLORS.surface2, borderRadius: RADIUS.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADIUS.full },
  pctText: { fontSize: 13, fontWeight: '700', color: COLORS.text, width: 36, textAlign: 'right' },
  countText: { fontSize: 12, color: COLORS.text2, width: 24, textAlign: 'right' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },
  centeredContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  waitEmoji: { fontSize: 52 },
  waitTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  waitSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  actions: { gap: 10, marginTop: 8, alignItems: 'center' },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.text2, lineHeight: 22 },
  customInputRow: { flexDirection: 'row', gap: 10 },
  customInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  addBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  customList: { gap: 8 },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  customChipText: { flex: 1, fontSize: 14, color: COLORS.text },
  removeChip: { fontSize: 14, color: COLORS.text2, fontWeight: '700' },
  infoBox: { gap: 6 },
  infoText: { fontSize: 14, color: COLORS.text2 },
  questionBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 5,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  questionBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.text2, letterSpacing: 1.5 },
  questionBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 22,
    paddingVertical: 24,
    width: '100%',
    alignItems: 'center',
  },
  questionText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  questionSub: { fontSize: 14, color: COLORS.text2 },
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  playerVoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  playerVoteSelf: { opacity: 0.4 },
  playerColorDot: { width: 12, height: 12, borderRadius: RADIUS.full },
  playerVoteName: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.text },
  playerVoteArrow: { fontSize: 16, color: COLORS.text2 },
  selfLabel: { fontSize: 12, color: COLORS.text3, fontStyle: 'italic' },
  voteProgress: { fontSize: 13, color: COLORS.text3, textAlign: 'center' },
  finalTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  finalSub: { fontSize: 14, color: COLORS.text2 },
  finalQuestionBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  finalQuestionNum: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  finalQuestionText: { fontSize: 16, fontWeight: '700', color: COLORS.text, lineHeight: 22 },
});
