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

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'NumberGuessor'>;
};

type NGPhase = 'guessing' | 'reveal' | 'round-end' | 'game-over';

const ROUND_OPTIONS = [5, 10, 20] as const;

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
}

export default function NumberGuessorScreen({ navigation }: Props) {
  const { players, room, isHost, sendGameState, sendPlayerAction } = useGame();
  const myId = socket.id;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const usedPromptIds = useRef(new Set<string>());
  const gsRef = useRef<NGGameState | null>(null);
  const sendGameStateRef = useRef(sendGameState);

  useEffect(() => {
    sendGameStateRef.current = sendGameState;
  }, [sendGameState]);

  const gs = (room?.gameState?.game === 'numberGuessor' ? room.gameState : null) as NGGameState | null;

  useEffect(() => {
    gsRef.current = gs;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [gs?.phase, fadeAnim]);

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

  // Host initializes the first round only.
  useEffect(() => {
    if (!isHost) return;

    const prompt = pickNumberPrompt(usedPromptIds.current);
    usedPromptIds.current.add(prompt.id);

    const totalScores = Object.fromEntries(players.map((p) => [p.id, 0]));

    const init: NGGameState = {
      game: 'numberGuessor',
      phase: 'guessing',
      round: 1,
      currentPrompt: prompt,
      submittedGuesserIds: [],
      totalScores,
      // totalRounds intentionally omitted — triggers setup screen
    };

    gsRef.current = init;
    sendGameStateRef.current(init);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectRounds = (n: number) => {
    if (!gs) return;
    const next: NGGameState = { ...gs, totalRounds: n };
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
  const sortedStandings = [...players].sort(
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
          <Text style={styles.gameOverEmoji}>🎯</Text>
          <Text style={styles.gameOverTitle}>{winnerText} wins!</Text>
          <Text style={styles.gameOverSub}>Closest guesser after {totalRounds} rounds.</Text>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Final Standings · lower distance is better</Text>

          {sortedStandings.map((p, i) => (
            <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
              <Text style={styles.standingRank}>#{i + 1}</Text>
              <Text style={styles.standingName}>{p.name}</Text>
              <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
                {(gs.totalScores ?? {})[p.id] ?? 0} off
              </Text>
            </View>
          ))}

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

  // ── Guessing ──────────────────────────────────────────────────────────────
  if (gs.phase === 'guessing') {
    const parsedGuess = parseInt(inputText, 10);
    const guessValid = !Number.isNaN(parsedGuess) && parsedGuess >= 1 && parsedGuess <= 100;
    const guessesIn = (gs.submittedGuesserIds ?? []).length;

    if (iHaveGuessed) {
      return (
        <SafeAreaView style={styles.safe}>
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Guess locked in!</Text>
            <Text style={styles.waitSub}>
              {guessesIn} / {players.length} guessed
            </Text>
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
            <View style={styles.roundBadge}>
              <Text style={styles.roundBadgeText}>
                ROUND {gs.round} / {totalRounds}
              </Text>
            </View>

            <View style={styles.promptBox}>
              <Text style={styles.promptText}>{gs.currentPrompt.text}</Text>
            </View>

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
              onSubmitEditing={() => {
                if (!guessValid) return;
                sendPlayerAction('ng-guess', { value: parsedGuess });
                setInputText('');
              }}
            />

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
              {guessesIn} / {players.length} guessed
            </Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Reveal ────────────────────────────────────────────────────────────────
  if (gs.phase === 'reveal') {
    const results = gs.results ?? [];
    const minDist = results.length > 0 ? results[0].distance : null;
    const closestPlayers = results.filter((r) => r.distance === minDist);

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
              const isClosest = r.distance === minDist;
              return (
                <View key={r.playerId} style={[styles.guessRow, isClosest && styles.guessRowWinner]}>
                  <Text style={styles.guessRank}>{isClosest ? '🎯' : '·'}</Text>
                  <View style={styles.guessInfo}>
                    <Text style={styles.guessName}>{r.playerName}</Text>
                    <Text style={styles.guessValue}>guessed {r.guess}</Text>
                  </View>
                  <Text style={[styles.guessDist, { color: isClosest ? COLORS.success : COLORS.text2 }]}>
                    {r.distance === 0 ? 'exact!' : `off by ${r.distance}`}
                  </Text>
                </View>
              );
            })}

            {minDist !== null && (
              <View style={styles.closestBanner}>
                <Text style={styles.closestText}>
                  🏅 {closestPlayers.map((r) => r.playerName).join(' & ')}
                  {minDist === 0 ? ' got it exactly!' : ` closest (off by ${minDist})`}
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
          <Text style={styles.sectionLabel}>Standings · lower is better</Text>

          {sortedStandings.map((p, i) => (
            <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
              <Text style={styles.standingRank}>#{i + 1}</Text>
              <Text style={styles.standingName}>{p.name}</Text>
              <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
                {(gs.totalScores ?? {})[p.id] ?? 0} off
              </Text>
            </View>
          ))}

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
  guessName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
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
  standingRank: { fontSize: 13, fontWeight: '700', color: COLORS.text2, width: 28 },
  standingName: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  standingScore: { fontSize: 15, fontWeight: '700', color: COLORS.text2 },
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
