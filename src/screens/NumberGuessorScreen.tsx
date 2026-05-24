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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { COLORS, RADIUS } from '../constants/theme';
import { pickNumberPrompt, GuessResult } from '../utils/promptUtils';
import { NumberPrompt } from '../constants/gamePrompts';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'NumberGuessor'>;
};

type NGPhase = 'guessing' | 'reveal' | 'round-end' | 'game-over';

const ROUND_OPTIONS = [5, 10, 20] as const;
const GUESS_TIMER_SECS = 20;

interface NGGameState {
  game: 'numberGuessor';
  phase: NGPhase;
  round: number;
  totalRounds?: number;
  currentPrompt: NumberPrompt;
  submittedGuesserIds: string[];
  totalScores: Record<string, number>;
  roundScores?: Record<string, number>;
  targetNumber?: number;
  results?: GuessResult[];
  streaks?: Record<string, number>;
  timerStartedAt?: number | null;
}

// ── Local reveal computation (mirrors server resolveNGRound) ─────────────────

function computeNGReveal(gs: NGGameState, players: { id: string; name: string }[]): NGGameState {
  const correctAnswer = gs.currentPrompt.correctAnswer;
  const guesses = gs.guesses ?? [];

  const results: GuessResult[] = players.map(player => {
    const guessObj = guesses.find(g => g.playerId === player.id);
    const timedOut = !guessObj || guessObj.timedOut;
    const guess    = timedOut ? null : (guessObj!.value ?? null);
    const distance = guess !== null ? Math.abs(guess - correctAnswer) : 100;
    const timeTaken = timedOut ? 20 : Math.max(1, (guessObj as any)?.timeTaken ?? 20);
    return { playerId: player.id, playerName: player.name, guess, distance, timeTaken, timedOut };
  });

  results.sort((a, b) => a.distance - b.distance);

  const totalScores = { ...(gs.totalScores ?? {}) };
  const roundScores: Record<string, number> = {};
  for (const r of results) {
    const penalty = r.distance + r.timeTaken;
    roundScores[r.playerId] = penalty;
    totalScores[r.playerId] = (totalScores[r.playerId] ?? 0) + penalty;
  }

  return { ...gs, phase: 'reveal', targetNumber: correctAnswer, results, roundScores, totalScores };
}

// ── Timer hook ────────────────────────────────────────────────────────────────

function useNGTimer(timerStartedAt: number | null | undefined) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!timerStartedAt) return;
    const interval = setInterval(() => forceUpdate(n => n + 1), 200);
    return () => clearInterval(interval);
  }, [timerStartedAt]);
  if (!timerStartedAt) return { secondsLeft: GUESS_TIMER_SECS, isExpired: false };
  const msLeft = Math.min(GUESS_TIMER_SECS * 1000, Math.max(0, GUESS_TIMER_SECS * 1000 - (Date.now() - timerStartedAt)));
  return { secondsLeft: Math.ceil(msLeft / 1000), isExpired: msLeft === 0 };
}

export default function NumberGuessorScreen({ navigation }: Props) {
  const { players: contextPlayers, room, isHost, currentUser, sendGameState, sendPlayerAction, startGame } = useGame();
  // Use room.players as the authoritative source — always includes all players
  const allPlayers = room?.players ?? contextPlayers;

  const myId = (() => {
    if (currentUser?.id) {
      const byPersistent = allPlayers.find(
        p => p.persistentId === currentUser.id || p.id === currentUser.id,
      );
      if (byPersistent) return byPersistent.id;
    }
    const bySocket = allPlayers.find(p => p.id === socket.id);
    if (bySocket) return bySocket.id;
    return currentUser?.id ?? socket.id ?? '';
  })();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const usedPromptIds = useRef(new Set<string>());
  const gsRef = useRef<NGGameState | null>(null);
  const allPlayersRef = useRef(allPlayers);
  const sendGameStateRef = useRef(sendGameState);
  const timerFiredRef = useRef(false);

  useEffect(() => { allPlayersRef.current = allPlayers; }, [allPlayers]);
  useEffect(() => {
    sendGameStateRef.current = sendGameState;
  }, [sendGameState]);

  const gs = (room?.gameState?.game === 'numberGuessor' ? room.gameState : null) as NGGameState | null;

  // Block header back button for non-hosts
  useEffect(() => {
    navigation.setOptions({ headerBackVisible: isHost, gestureEnabled: isHost });
  }, [isHost]);

  // Keep ref fresh on every gs change so computeNGReveal sees the latest guesses
  useEffect(() => {
    gsRef.current = gs;
  }, [gs]);

  // Fade animation on phase transitions only
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [gs?.phase, fadeAnim]);

  // Reset timer-fired guard whenever a new guessing phase starts
  useEffect(() => {
    if (gs?.phase === 'guessing') {
      timerFiredRef.current = false;
    }
  }, [gs?.phase, gs?.round]);

  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (gs?.currentPrompt) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8000);
    return () => {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    };
  }, [gs?.currentPrompt]);

  const [inputText, setInputText] = useState('');

  const { secondsLeft, isExpired } = useNGTimer(gs?.timerStartedAt);

  // When timer hits 0, host computes reveal locally and broadcasts — no server roundtrip
  useEffect(() => {
    if (!isExpired) return;
    if (!isHost) return;
    if (gsRef.current?.phase !== 'guessing') return;
    if (timerFiredRef.current) return;
    timerFiredRef.current = true;
    const next = computeNGReveal(gsRef.current, allPlayersRef.current);
    gsRef.current = next;
    sendGameStateRef.current(next);
  }, [isExpired, isHost]); // eslint-disable-line

  // Track the server's initial prompt so it isn't repeated in later rounds
  useEffect(() => {
    if (gs?.currentPrompt?.id) {
      usedPromptIds.current.add(gs.currentPrompt.id);
    }
  }, [gs?.currentPrompt?.id]);

  // When host picks number of rounds, fully initialize the game state.
  // The server's buildInitialGameState already set the first prompt — we just
  // add totalRounds, seed totalScores for all players, and start the timer.
  const handleSelectRounds = (n: number) => {
    if (!isHost || !gs) return;
    const totalScores = Object.fromEntries(allPlayersRef.current.map((p) => [p.id, 0]));
    const next: NGGameState = {
      ...gs,
      totalRounds: n,
      totalScores,
      timerStartedAt: Date.now(),
      submittedGuesserIds: [],
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleApplyScores = () => {
    if (!isHost || !gs) return;
    const next: NGGameState = { ...gs, phase: 'round-end' };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleNextRound = () => {
    if (!isHost || !gs) return;
    const totalRounds = gs.totalRounds ?? 5;

    if (gs.round >= totalRounds) {
      const next: NGGameState = { ...gs, phase: 'game-over' };
      gsRef.current = next;
      sendGameStateRef.current(next);
      return;
    }

    const nextRound = gs.round + 1;
    const prompt = pickNumberPrompt(usedPromptIds.current);
    usedPromptIds.current.add(prompt.id);

    const next: NGGameState = {
      ...gs,
      phase: 'guessing',
      round: nextRound,
      currentPrompt: prompt,
      submittedGuesserIds: [],
      targetNumber: undefined,
      results: undefined,
      roundScores: undefined,
      timerStartedAt: Date.now(),
    };

    gsRef.current = next;
    sendGameStateRef.current(next);
    setInputText('');
  };

  if (!gs || !gs.currentPrompt) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          {setupTimedOut ? (
            <>
              <Text style={styles.waitTitle}>Could not load game</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
                <Text style={{ color: COLORS.text2, textDecorationLine: 'underline', fontSize: 14 }}>
                  ← Go back
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.waitTitle}>Setting up...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Setup: pick number of rounds ──────────────────────────────────────────
  if (!gs.totalRounds) {
    if (isHost) {
      return (
        <SafeAreaView style={styles.safe}>
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <Text style={styles.setupTitle}>How many rounds?</Text>
            <Text style={styles.setupSub}>Closest guess each round wins. Lower total distance wins.</Text>
            <View style={styles.setupOptions}>
              {ROUND_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={styles.setupOption}
                  onPress={() => handleSelectRounds(n)}
                >
                  <Text style={styles.setupOptionNum}>{n}</Text>
                  <Text style={styles.setupOptionLabel}>rounds</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitTitle}>Waiting for host...</Text>
          <Text style={styles.waitSub}>Host is choosing the number of rounds.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalRounds = gs.totalRounds;
  const iHaveGuessed = (gs.submittedGuesserIds ?? []).includes(myId ?? '');

  // Sort ascending by totalScores (lower = better)
  const sortedStandings = [...allPlayers].sort(
    (a, b) => ((gs.totalScores ?? {})[a.id] ?? 0) - ((gs.totalScores ?? {})[b.id] ?? 0)
  );

  // ── Game over ─────────────────────────────────────────────────────────────
  if (gs.phase === 'game-over') {
    const bestScore = (gs.totalScores ?? {})[sortedStandings[0]?.id] ?? 0;
    const winners = sortedStandings.filter((p) => ((gs.totalScores ?? {})[p.id] ?? 0) === bestScore);
    const winnerText = winners.map((p) => p.name).join(' & ');

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.gameOverEmoji}>🏆</Text>
          <Text style={styles.gameOverTitle}>{winnerText} wins!</Text>
          <Text style={styles.gameOverSub}>Lowest penalty (distance + time) after {totalRounds} rounds.</Text>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Final Standings · lower = better (distance + seconds)</Text>

          {sortedStandings.map((p, i) => {
            const isMe = p.id === myId;
            const scoreColor = i === 0 ? COLORS.success : isMe ? COLORS.warning : COLORS.text2;
            return (
              <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst, isMe && styles.standingRowMe]}>
                <Text style={[styles.standingRank, isMe && styles.standingRankMe]}>#{i + 1}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Text style={[styles.standingName, isMe && styles.standingNameMe]}>{p.name}</Text>
                  {isMe && <Text style={styles.standingYouBadge}>YOU</Text>}
                </View>
                <Text style={[styles.standingScore, { color: scoreColor }]}>
                  {(gs.totalScores ?? {})[p.id] ?? 0} pts
                </Text>
              </View>
            );
          })}

          <View style={styles.actions}>
            {isHost ? (
              <>
                <PrimaryButton title="Play Again" onPress={() => startGame('numberGuessor')} />
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

  // ── Guessing ──────────────────────────────────────────────────────────────
  if (gs.phase === 'guessing') {
    const parsedGuess = parseInt(inputText, 10);
    const guessValid = !Number.isNaN(parsedGuess) && parsedGuess >= 1 && parsedGuess <= 100;
    const guessesIn = (gs.submittedGuesserIds ?? []).length;

    // Timer colour: green → yellow → red
    const timerColor = secondsLeft <= 5 ? COLORS.danger : secondsLeft <= 10 ? COLORS.warning : COLORS.success;

    if (isExpired) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>⏰</Text>
            <Text style={styles.waitTitle}>Time's up!</Text>
            <Text style={styles.waitSub}>Loading results...</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (iHaveGuessed) {
      return (
        <SafeAreaView style={styles.safe}>
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Guess locked in!</Text>
            <Text style={styles.waitSub}>
              {guessesIn} / {allPlayers.length} guessed
            </Text>
            {/* Still show the countdown */}
            <View style={[styles.timerBadge, { borderColor: timerColor }]}>
              <Text style={[styles.timerText, { color: timerColor }]}>{secondsLeft}s</Text>
            </View>
          </Animated.View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <View style={styles.topRow}>
              <View style={styles.roundBadge}>
                <Text style={styles.roundBadgeText}>
                  ROUND {gs.round} / {totalRounds}
                </Text>
              </View>
              <View style={[styles.timerBadge, { borderColor: timerColor }]}>
                <Text style={[styles.timerText, { color: timerColor }]}>{secondsLeft}s</Text>
              </View>
            </View>

            <View style={styles.promptBox}>
              <Text style={styles.promptText}>{gs.currentPrompt.text}</Text>
            </View>

            <Text style={styles.timerHint}>Score = how far off + seconds taken</Text>

            <Text style={styles.enterInstruction}>Your guess (1 – 100):</Text>

            <TextInput
              style={styles.numberInput}
              value={inputText}
              onChangeText={(t) => setInputText(t.replace(/[^0-9]/g, ''))}
              placeholder="?"
              placeholderTextColor={COLORS.text3}
              keyboardType="number-pad"
              autoFocus
              maxLength={3}
              returnKeyType="done"
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
              onSubmitEditing={() => {
                if (!guessValid) return;
                sendPlayerAction('ng-guess', { value: parsedGuess });
                setInputText('');
              }}
            />
            <KeyboardDoneBar />

            <Text style={styles.rangeTip}>1 to 100</Text>

            <PrimaryButton
              title="Submit Guess →"
              onPress={() => {
                if (!guessValid) return;
                sendPlayerAction('ng-guess', { value: parsedGuess });
                setInputText('');
              }}
              disabled={!guessValid}
              style={{ marginTop: 8 }}
            />

            <Text style={styles.guesserProgress}>
              {guessesIn} / {allPlayers.length} guessed
            </Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Reveal ────────────────────────────────────────────────────────────────
  if (gs.phase === 'reveal') {
    const results = gs.results ?? [];
    const minDistance = results.length > 0 ? Math.min(...results.map(r => r.distance ?? 100)) : null;
    const bestPlayers = minDistance !== null ? results.filter(r => (r.distance ?? 100) === minDistance) : [];

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View style={{ opacity: fadeAnim, gap: 16 }}>
            <Text style={styles.revealTitle}>Round {gs.round} reveal</Text>

            <View style={styles.promptQuoteBox}>
              <Text style={styles.promptQuoteText}>"{gs.currentPrompt.text}"</Text>
            </View>

            <View style={styles.answerRevealBox}>
              <Text style={styles.answerRevealLabel}>Correct answer</Text>
              <Text style={styles.answerRevealNum}>{gs.targetNumber}</Text>
            </View>

            <Text style={styles.sectionLabel}>Guesses · off by</Text>

            {results.map((r) => {
              const isBest = minDistance !== null && (r.distance ?? 100) === minDistance;
              const isMe = r.playerId === myId;
              return (
                <View key={r.playerId} style={[styles.guessRow, isBest && styles.guessRowWinner, isMe && styles.guessRowMe]}>
                  <Text style={styles.guessRank}>{r.timedOut ? '⏰' : isBest ? '🎯' : '·'}</Text>
                  <View style={styles.guessInfo}>
                    <View style={styles.guessNameRow}>
                      <Text style={[styles.guessName, isMe && styles.guessNameMe]}>{r.playerName}</Text>
                      <View style={styles.timeBadge}>
                        <Text style={styles.timeBadgeText}>⏱ {r.timeTaken}s</Text>
                      </View>
                    </View>
                    <Text style={styles.guessValue}>
                      {r.timedOut ? 'timed out' : `guessed ${r.guess}`}
                    </Text>
                  </View>
                  <Text style={[styles.guessDist, { color: isBest ? COLORS.success : COLORS.text2 }]}>
                    {r.distance === 0 ? 'exact!' : `off by ${r.distance}`}
                  </Text>
                </View>
              );
            })}

            {bestPlayers.length > 0 && (
              <View style={styles.closestBanner}>
                <Text style={styles.closestText}>
                  🎯 {bestPlayers.map((r) => r.playerName).join(' & ')}
                  {minDistance === 0 ? ' — exact answer!' : ' — closest guess'}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              {isHost ? (
                <PrimaryButton title="Apply Scores →" onPress={handleApplyScores} />
              ) : (
                <Text style={styles.waitSub}>Waiting for host to continue...</Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Round end standings ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={{ opacity: fadeAnim, gap: 16 }}>
          <Text style={styles.revealTitle}>After round {gs.round}</Text>
          <Text style={styles.sectionLabel}>Standings · lower = better</Text>

          {sortedStandings.map((p, i) => {
            const isMe = p.id === myId;
            const result = (gs.results ?? []).find(r => r.playerId === p.id);
            const roundPenalty = (gs.roundScores ?? {})[p.id] ?? 0;
            const totalScore = (gs.totalScores ?? {})[p.id] ?? 0;
            const scoreColor = i === 0 ? COLORS.success : isMe ? COLORS.warning : COLORS.text2;
            return (
              <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst, isMe && styles.standingRowMe]}>
                <Text style={[styles.standingRank, isMe && styles.standingRankMe]}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.standingName, isMe && styles.standingNameMe]}>{p.name}</Text>
                    {isMe && <Text style={styles.standingYouBadge}>YOU</Text>}
                  </View>
                  {result && (
                    <Text style={styles.roundBreakdown}>
                      {result.timedOut
                        ? '⏰ timed out · +20'
                        : `${result.distance} off + ${result.timeTaken}s = +${roundPenalty}`}
                    </Text>
                  )}
                </View>
                <Text style={[styles.standingScore, { color: scoreColor }]}>
                  {totalScore} pts
                </Text>
              </View>
            );
          })}

          <View style={styles.actions}>
            {isHost ? (
              <>
                {gs.round < totalRounds ? (
                  <PrimaryButton title={`Round ${gs.round + 1} →`} onPress={handleNextRound} />
                ) : (
                  <PrimaryButton title="See Final Results →" onPress={handleNextRound} />
                )}
                <SecondaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
              </>
            ) : (
              <Text style={styles.waitSub}>Waiting for host to continue...</Text>
            )}
          </View>
        </Animated.View>
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
  setupTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  setupSub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  setupOptions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  setupOption: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    minWidth: 80,
  },
  setupOptionNum: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -1,
  },
  setupOptionLabel: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: '600',
    marginTop: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roundBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  roundBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text2,
    letterSpacing: 1.5,
  },
  timerBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerHint: {
    fontSize: 12,
    color: COLORS.text3,
    letterSpacing: 0.5,
    alignSelf: 'flex-start',
    width: '100%',
  },
  guesserProgress: { fontSize: 12, color: COLORS.text3, letterSpacing: 1 },
  promptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 24,
    paddingVertical: 24,
    width: '100%',
    alignItems: 'center',
  },
  promptText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  enterInstruction: {
    fontSize: 14,
    color: COLORS.text2,
    alignSelf: 'flex-start',
    width: '100%',
  },
  numberInput: {
    width: 130,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    fontSize: 44,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  rangeTip: { fontSize: 12, color: COLORS.text3 },
  revealTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.text,
  },
  promptQuoteBox: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.text3,
    paddingLeft: 12,
  },
  promptQuoteText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text2,
    lineHeight: 22,
  },
  answerRevealBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  answerRevealLabel: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  answerRevealNum: {
    fontSize: 72,
    fontWeight: '900',
    color: COLORS.accentHi,
    letterSpacing: -2,
  },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  guessRowWinner: {
    borderColor: COLORS.success,
    backgroundColor: '#071d0f',
  },
  guessRank: { fontSize: 18, width: 30, textAlign: 'center' },
  guessInfo: { flex: 1, gap: 2 },
  guessNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  guessName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  guessNameMe: { color: COLORS.warning },
  guessRowMe: { borderColor: COLORS.warning, borderWidth: 1.5, backgroundColor: '#2a2000' },
  timeBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.text3,
  },
  timeBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.text2 },
  guessValue: { fontSize: 13, color: COLORS.text2 },
  guessDist: { fontSize: 14, fontWeight: '700' },
  closestBanner: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: 'center',
  },
  closestText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  standingRowFirst: {
    borderColor: COLORS.success,
    backgroundColor: '#071d0f',
  },
  roundBreakdown: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  standingRank: { fontSize: 13, fontWeight: '700', color: COLORS.text2, width: 28 },
  standingRankMe: { color: COLORS.warning },
  standingName: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  standingNameMe: { color: COLORS.warning, fontWeight: '800' },
  standingScore: { fontSize: 15, fontWeight: '700', color: COLORS.text2 },
  standingScoreMe: { color: COLORS.warning },
  standingYouBadge: {
    fontSize: 10, fontWeight: '800', color: COLORS.warning,
    backgroundColor: COLORS.warning + '22', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 0.5,
  },
  standingRowMe: {
    borderColor: COLORS.warning,
    borderWidth: 1.5,
    backgroundColor: '#2a2000',
  },
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -1,
    textAlign: 'center',
  },
  gameOverSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
});
