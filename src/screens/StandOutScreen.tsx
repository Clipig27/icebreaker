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
import ScoreDisplay from '../components/ScoreDisplay';
import CountdownTimer from '../components/CountdownTimer';
import { COLORS, RADIUS } from '../constants/theme';
import {
  pickStandOutPrompt,
  calculateStandOutScores,
  STAND_OUT_WIN_SCORE,
  Answer,
  ScoreDelta,
} from '../utils/promptUtils';
import { StandOutPrompt } from '../constants/gamePrompts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StandOut'>;
};

interface SOGameState {
  game: 'standOut';
  phase: 'prompt' | 'entering' | 'reveal' | 'game-over';
  roundNumber: number;
  currentPrompt: StandOutPrompt;
  // Who has submitted this round (not their answer — kept secret until reveal)
  submittedPlayerIds: string[];
  // Populated at reveal
  answers?: Answer[];
  roundDeltas?: ScoreDelta[];
  winnerName?: string;
}

export default function StandOutScreen({ navigation }: Props) {
  const { players, room, isHost, sendGameState, sendPlayerAction, setPlayers, updateRoomScores } = useGame();
  const myId = socket.id;

  const usedPromptIds = useRef(new Set<string>());
  const streaksRef = useRef<Record<string, number>>({});
  // Host collects answers before reveal
  const answersRef = useRef<Answer[]>([]);

  const gsRef = useRef<SOGameState | null>(null);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const gs = (room?.gameState?.game === 'standOut' ? room.gameState : null) as SOGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // Setup timeout — if no usable gameState within 8 s, socket is likely down
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gs?.currentPrompt) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  }, [!!gs?.currentPrompt]);

  // Local text input (not synced to server — private to each player)
  const [inputText, setInputText] = useState('');

  // ── Host: initialize refs — server owns the initial gameState ──────────────
  useEffect(() => {
    if (!isHost) return;
    answersRef.current = [];
    streaksRef.current = {};
    // Score reset is game-level, not tied to initial gameState
    const resetPlayers = players.map(p => ({ ...p, score: 0 }));
    setPlayers(resetPlayers);
    updateRoomScores(resetPlayers);
  }, []); // eslint-disable-line

  // Mark the server's initial prompt ID as used so round advances never repeat it
  useEffect(() => {
    if (!isHost || !gs?.currentPrompt?.id) return;
    usedPromptIds.current.add(gs.currentPrompt.id);
  }, [!!gs?.currentPrompt]); // eslint-disable-line

  // ── Host: handle player actions ────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      if (action === 'so-answer' && state.phase === 'entering') {
        if (state.submittedPlayerIds.includes(playerId)) return;
        const player = allPlayers.find(p => p.id === playerId);
        if (!player) return;

        answersRef.current = [
          ...answersRef.current,
          { playerId, playerName: player.name, text: data.text },
        ];
        const newSubmitted = [...state.submittedPlayerIds, playerId];

        if (newSubmitted.length >= allPlayers.length) {
          // All answered — score and reveal
          const { deltas, newStreaks } = calculateStandOutScores(answersRef.current, streaksRef.current);
          streaksRef.current = newStreaks;
          const updatedPlayers = allPlayers.map(p => {
            const d = deltas.find(d => d.playerId === p.id);
            return d ? { ...p, score: Math.max(0, p.score + d.delta) } : p;
          });
          setPlayers(updatedPlayers);
          updateRoomScores(updatedPlayers);

          const top = [...updatedPlayers].sort((a, b) => b.score - a.score)[0];
          if (top && top.score >= STAND_OUT_WIN_SCORE) {
            const next: SOGameState = {
              ...state,
              phase: 'game-over',
              submittedPlayerIds: newSubmitted,
              answers: answersRef.current,
              roundDeltas: deltas,
              winnerName: top.name,
            };
            gsRef.current = next;
            sendGameState(next);
          } else {
            const next: SOGameState = {
              ...state,
              phase: 'reveal',
              submittedPlayerIds: newSubmitted,
              answers: answersRef.current,
              roundDeltas: deltas,
            };
            gsRef.current = next;
            sendGameState(next);
          }
        } else {
          const next: SOGameState = { ...state, submittedPlayerIds: newSubmitted };
          gsRef.current = next;
          sendGameState(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]); // eslint-disable-line

  // ── Host: advance to next round ────────────────────────────────────────────
  const handleNextRound = () => {
    if (!isHost || !gs) return;
    const nextRound = gs.roundNumber + 1;
    const prompt = pickStandOutPrompt(nextRound, usedPromptIds.current);
    usedPromptIds.current.add(prompt.id);
    answersRef.current = [];
    const next: SOGameState = {
      game: 'standOut',
      phase: 'prompt',
      roundNumber: nextRound,
      currentPrompt: prompt,
      submittedPlayerIds: [],
    };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gs || !gs.currentPrompt) {
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

  const iHaveSubmitted = (gs.submittedPlayerIds ?? []).includes(myId ?? '');

  // ── Phase: game-over ───────────────────────────────────────────────────────
  if (gs.phase === 'game-over') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.gameOverEmoji}>🏆</Text>
          <Text style={styles.gameOverTitle}>{gs.winnerName} wins!</Text>
          <Text style={styles.gameOverSub}>First to {STAND_OUT_WIN_SCORE} points.</Text>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Final Scores</Text>
          <ScoreDisplay players={players} />
          <View style={styles.actions}>
            {isHost ? (
              <PrimaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
            ) : (
              <Text style={styles.waitSub}>Waiting for host to continue...</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: prompt ──────────────────────────────────────────────────────────
  if (gs.phase === 'prompt') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centeredContainer}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>ROUND {gs.roundNumber}</Text>
          </View>
          <Text style={styles.promptLabel}>Stand out from the crowd</Text>
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>{gs.currentPrompt?.text}</Text>
          </View>
          <Text style={styles.timerInstruction}>Think of a unique answer!</Text>
          <CountdownTimer
            seconds={7}
            onComplete={isHost ? () => {
              if (!gsRef.current) return;
              const next: SOGameState = { ...gsRef.current, phase: 'entering', submittedPlayerIds: [] };
              gsRef.current = next;
              sendGameState(next);
            } : () => {}}
          />
          <Text style={styles.difficultyTag}>{(gs.currentPrompt?.difficulty ?? '').toUpperCase()}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: entering ────────────────────────────────────────────────────────
  if (gs.phase === 'entering') {
    const answered = (gs.submittedPlayerIds ?? []).length;
    const total = players.length;

    if (iHaveSubmitted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centeredContainer}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Answer locked in!</Text>
            <Text style={styles.waitSub}>{answered} / {total} players answered</Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.centeredContainer}>
            <View style={styles.promptBox}>
              <Text style={styles.promptText}>{gs.currentPrompt?.text}</Text>
            </View>
            <Text style={styles.enterInstruction}>Your answer (keep it secret):</Text>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type here…"
              placeholderTextColor={COLORS.text3}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                const t = inputText.trim();
                if (!t) return;
                sendPlayerAction('so-answer', { text: t });
                setInputText('');
              }}
              maxLength={60}
            />
            <PrimaryButton
              title="Submit Answer →"
              onPress={() => {
                const t = inputText.trim();
                if (!t) return;
                sendPlayerAction('so-answer', { text: t });
                setInputText('');
              }}
              disabled={!inputText.trim()}
              style={{ marginTop: 8 }}
            />
            <Text style={styles.playerProgress}>{answered} / {total} answered</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Phase: reveal ──────────────────────────────────────────────────────────
  const answers = gs.answers ?? [];
  const roundDeltas = gs.roundDeltas ?? [];

  const answerGroups = new Map<string, Answer[]>();
  for (const ans of answers) {
    const key = ans.text.trim().toLowerCase();
    if (!answerGroups.has(key)) answerGroups.set(key, []);
    answerGroups.get(key)!.push(ans);
  }
  const isDuplicate = (ans: Answer) => (answerGroups.get(ans.text.trim().toLowerCase())?.length ?? 0) > 1;
  const topScore = Math.max(...players.map(p => p.score));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.revealTitle}>Round {gs.roundNumber} results</Text>
        <View style={styles.promptQuoteBox}>
          <Text style={styles.promptQuoteText}>"{gs.currentPrompt?.text}"</Text>
        </View>

        <View style={styles.answersBlock}>
          {answers.map(ans => {
            const delta = roundDeltas.find(d => d.playerId === ans.playerId);
            const dup = isDuplicate(ans);
            return (
              <View key={ans.playerId} style={[styles.answerRow, dup ? styles.answerRowDup : styles.answerRowUnique]}>
                <View style={styles.answerLeft}>
                  <Text style={styles.answerName}>{ans.playerName}</Text>
                  <Text style={[styles.answerText, { color: dup ? COLORS.danger : COLORS.success }]}>
                    {ans.text}
                  </Text>
                </View>
                {delta && (
                  <View style={styles.deltaCol}>
                    <Text style={[styles.deltaNum, { color: delta.delta >= 0 ? COLORS.success : COLORS.danger }]}>
                      {delta.delta >= 0 ? '+' : ''}{delta.delta}
                    </Text>
                    {delta.streakCount >= 2 && <Text style={styles.streakTag}>🔥 ×{delta.streakCount}</Text>}
                    {dup && <Text style={styles.dupTag}>duplicate</Text>}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.raceBox}>
          <Text style={styles.raceLabel}>RACE TO {STAND_OUT_WIN_SCORE}</Text>
          {[...players].sort((a, b) => b.score - a.score).map(p => (
            <View key={p.id} style={styles.raceRow}>
              <Text style={styles.raceName}>{p.name}</Text>
              <View style={styles.raceBarTrack}>
                <View
                  style={[
                    styles.raceBarFill,
                    {
                      width: `${Math.min(100, Math.max(0, (p.score / STAND_OUT_WIN_SCORE) * 100))}%`,
                      backgroundColor: p.score === topScore ? COLORS.accent : COLORS.surface2,
                    },
                  ]}
                />
              </View>
              <Text style={styles.raceScore}>{p.score}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {isHost ? (
            <>
              <PrimaryButton title="Next Round →" onPress={handleNextRound} />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
  },
  centeredContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 16,
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
  roundBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  roundBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.text2, letterSpacing: 1.5 },
  promptLabel: { fontSize: 14, color: COLORS.text2, marginTop: 4 },
  promptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%',
    alignItems: 'center',
  },
  promptText: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  timerInstruction: { fontSize: 14, color: COLORS.text2 },
  difficultyTag: { fontSize: 10, fontWeight: '700', color: COLORS.text3, letterSpacing: 2 },
  enterInstruction: { fontSize: 14, color: COLORS.text2, alignSelf: 'flex-start', width: '100%' },
  textInput: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  playerProgress: { fontSize: 13, color: COLORS.text3, marginTop: 8 },
  revealTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  promptQuoteBox: { borderLeftWidth: 2, borderLeftColor: COLORS.text3, paddingLeft: 12 },
  promptQuoteText: { fontSize: 15, fontWeight: '500', color: COLORS.text2, lineHeight: 22 },
  answersBlock: { gap: 8 },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  answerRowUnique: { backgroundColor: '#071d0f', borderColor: COLORS.success },
  answerRowDup: { backgroundColor: '#1d0710', borderColor: COLORS.danger },
  answerLeft: { flex: 1, gap: 2 },
  answerName: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },
  answerText: { fontSize: 18, fontWeight: '800' },
  deltaCol: { alignItems: 'flex-end', gap: 2 },
  deltaNum: { fontSize: 20, fontWeight: '900' },
  streakTag: { fontSize: 12, color: COLORS.warning },
  dupTag: { fontSize: 10, color: COLORS.danger, fontWeight: '600' },
  raceBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  raceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  raceName: { fontSize: 13, fontWeight: '600', color: COLORS.text, width: 70 },
  raceBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  raceBarFill: { height: '100%', borderRadius: RADIUS.full },
  raceScore: { fontSize: 13, fontWeight: '700', color: COLORS.text, width: 30, textAlign: 'right' },
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: { fontSize: 36, fontWeight: '900', color: COLORS.text, letterSpacing: -1, textAlign: 'center' },
  gameOverSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
});
