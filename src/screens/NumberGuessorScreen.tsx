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
import {
  pickNumberPrompt,
  calculateGuessResults,
  NUMBER_GUESSOR_ROUNDS,
  GuessResult,
} from '../utils/promptUtils';
import { NumberPrompt } from '../constants/gamePrompts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'NumberGuessor'>;
};

type NGPhase = 'setter-entry' | 'guessing' | 'reveal' | 'round-end' | 'game-over';

interface PendingGuess {
  playerId: string;
  playerName: string;
  guess: number;
}

interface NGGameState {
  game: 'numberGuessor';
  phase: NGPhase;
  round: number;
  setterIndex: number;
  currentPrompt: NumberPrompt;
  // Who has submitted a guess (not their value — kept secret until reveal)
  submittedGuesserIds: string[];
  penalties: Record<string, number>;
  // Populated at reveal:
  targetNumber?: number;
  results?: GuessResult[];
}

function displayNum(n: number): string {
  return n > 100 ? '100+' : String(n);
}

export default function NumberGuessorScreen({ navigation }: Props) {
  const { players, room, isHost, sendGameState, sendPlayerAction } = useGame();
  const myId = socket.id;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const usedPromptIds = useRef(new Set<string>());
  // Host stores target and guesses secretly until reveal
  const targetRef = useRef<number | null>(null);
  const guessesRef = useRef<PendingGuess[]>([]);

  const gsRef = useRef<NGGameState | null>(null);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const gs = (room?.gameState?.game === 'numberGuessor' ? room.gameState : null) as NGGameState | null;

  useEffect(() => {
    gsRef.current = gs;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [gs?.phase]); // eslint-disable-line

  // Keep sendGameState latest in a ref so the init useEffect (empty deps) never uses a stale closure
  const sendGameStateRef = useRef(sendGameState);
  useEffect(() => { sendGameStateRef.current = sendGameState; }, [sendGameState]);

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

  // Local inputs
  const [inputText, setInputText] = useState('');

  // ── Host: initialize ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;
    const prompt = pickNumberPrompt(usedPromptIds.current);
    usedPromptIds.current.add(prompt.id);
    targetRef.current = null;
    guessesRef.current = [];
    const penalties = Object.fromEntries(players.map(p => [p.id, 0]));
    const init: NGGameState = {
      game: 'numberGuessor',
      phase: 'setter-entry',
      round: 1,
      setterIndex: 0,
      currentPrompt: prompt,
      submittedGuesserIds: [],
      penalties,
    };
    gsRef.current = init;
    sendGameStateRef.current(init);
  }, []); // eslint-disable-line

  // ── Host: handle player actions ────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return undefined

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      // Setter locked in their secret number
      if (action === 'ng-set' && state.phase === 'setter-entry') {
        const setter = allPlayers[state.setterIndex];
        if (playerId !== setter?.id) return;
        targetRef.current = data.number;
        guessesRef.current = [];
        const next: NGGameState = { ...state, phase: 'guessing', submittedGuesserIds: [] };
        gsRef.current = next;
        sendGameState(next);
      }

      // A guesser submitted their guess
      if (action === 'ng-guess' && state.phase === 'guessing') {
        if (state.submittedGuesserIds.includes(playerId)) return;
        const player = allPlayers.find(p => p.id === playerId);
        if (!player) return;
        guessesRef.current = [...guessesRef.current, { playerId, playerName: player.name, guess: data.guess }];
        const newSubmitted = [...state.submittedGuesserIds, playerId];
        const guessers = allPlayers.filter((_, i) => i !== state.setterIndex);

        if (newSubmitted.length >= guessers.length) {
          // All guessed — reveal
          const results = calculateGuessResults(guessesRef.current, targetRef.current!);
          const next: NGGameState = {
            ...state,
            phase: 'reveal',
            submittedGuesserIds: newSubmitted,
            targetNumber: targetRef.current!,
            results,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: NGGameState = { ...state, submittedGuesserIds: newSubmitted };
          gsRef.current = next;
          sendGameState(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]);

  // ── Host: apply penalties and advance to round-end ─────────────────────────
  const handleApplyPenalties = () => {
    if (!isHost || !gs || !gs.results) return;
    const newPenalties = { ...gs.penalties };
    for (const r of gs.results) {
      newPenalties[r.playerId] = (newPenalties[r.playerId] ?? 0) + r.distance;
    }
    const next: NGGameState = { ...gs, phase: 'round-end', penalties: newPenalties };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Host: next round ───────────────────────────────────────────────────────
  const handleNextRound = () => {
    if (!isHost || !gs) return;
    if (gs.round >= NUMBER_GUESSOR_ROUNDS) {
      const next: NGGameState = { ...gs, phase: 'game-over' };
      gsRef.current = next;
      sendGameState(next);
      return;
    }
    const nextRound = gs.round + 1;
    const prompt = pickNumberPrompt(usedPromptIds.current);
    usedPromptIds.current.add(prompt.id);
    targetRef.current = null;
    guessesRef.current = [];
    const next: NGGameState = {
      ...gs,
      phase: 'setter-entry',
      round: nextRound,
      setterIndex: (gs.setterIndex + 1) % players.length,
      currentPrompt: prompt,
      submittedGuesserIds: [],
      targetNumber: undefined,
      results: undefined,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
    setInputText('');
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

const setter = players[gs.setterIndex ?? 0];
const guessers = players.filter((_, i) => i !== (gs.setterIndex ?? 0));
const iAmSetter = myId === setter?.id;
const iHaveGuessed = (gs.submittedGuesserIds ?? []).includes(myId ?? '');
const sortedStandings = [...players].sort((a, b) => ((gs.penalties ?? {})[a.id] ?? 0) - ((gs.penalties ?? {})[b.id] ?? 0));
const isOpenRange = gs.currentPrompt?.openRange ?? false;

  // ── Phase: game-over ───────────────────────────────────────────────────────
  if (gs.phase === 'game-over') {
    const winner = sortedStandings[0];
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.gameOverEmoji}>🎯</Text>
          <Text style={styles.gameOverTitle}>{winner?.name} wins!</Text>
          <Text style={styles.gameOverSub}>Lowest penalty after {NUMBER_GUESSOR_ROUNDS} rounds.</Text>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Final Standings  ·  lower is better</Text>
          {sortedStandings.map((p, i) => (
            <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
              <Text style={styles.standingRank}>#{i + 1}</Text>
              <Text style={styles.standingName}>{p.name}</Text>
              <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
                {(gs.penalties ?? {})[p.id] ?? 0} pts
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

  // ── Phase: setter-entry ────────────────────────────────────────────────────
  if (gs.phase === 'setter-entry') {
    const parsedNum = parseInt(inputText, 10);
    const valid = !isNaN(parsedNum) && parsedNum >= 1 && (isOpenRange || parsedNum <= 100);

    if (iAmSetter) {
      return (
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
              <View style={styles.roundBadge}>
                <Text style={styles.roundBadgeText}>ROUND {gs.round} / {NUMBER_GUESSOR_ROUNDS}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🔒  You — Answer Setter</Text>
              </View>
              {isOpenRange && (
                <View style={styles.openRangeBadge}>
                  <Text style={styles.openRangeBadgeText}>💬 Answer can be over 100</Text>
                </View>
              )}
              <View style={styles.promptBox}>
                <Text style={styles.promptText}>{gs.currentPrompt?.text}</Text>
              </View>
              <Text style={styles.enterInstruction}>
                Your answer {isOpenRange ? '(any number)' : '(1 – 100)'}:
              </Text>
              <TextInput
                style={styles.numberInput}
                value={inputText}
                onChangeText={t => setInputText(t.replace(/[^0-9]/g, ''))}
                placeholder="?"
                placeholderTextColor={COLORS.text3}
                keyboardType="number-pad"
                autoFocus
                maxLength={isOpenRange ? 6 : 3}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!valid) return;
                  sendPlayerAction('ng-set', { number: parsedNum });
                  setInputText('');
                }}
              />
              <Text style={styles.rangeTip}>{isOpenRange ? 'Any number ≥ 1' : '1 to 100'}</Text>
              <PrimaryButton
                title="Lock It In →"
                onPress={() => {
                  if (!valid) return;
                  sendPlayerAction('ng-set', { number: parsedNum });
                  setInputText('');
                }}
                disabled={!valid}
                style={{ marginTop: 8 }}
              />
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
          <Text style={styles.handoffEmoji}>🔒</Text>
          <Text style={styles.handoffTitle}>{setter?.name} is setting the number...</Text>
          <Text style={styles.handoffSub}>Get ready to guess!</Text>
          {isOpenRange && (
            <View style={styles.openRangeBadge}>
              <Text style={styles.openRangeBadgeText}>💬 The answer might be over 100</Text>
            </View>
          )}
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>{gs.currentPrompt?.text}</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ── Phase: guessing ────────────────────────────────────────────────────────
  if (gs.phase === 'guessing') {
    const parsedGuess = parseInt(inputText, 10);
    const guessValid = !isNaN(parsedGuess) && parsedGuess >= 1 && (isOpenRange || parsedGuess <= 100);
    const guessesIn = (gs.submittedGuesserIds ?? []).length;

    if (iAmSetter) {
      return (
        <SafeAreaView style={styles.safe}>
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <Text style={styles.handoffEmoji}>🎯</Text>
            <Text style={styles.handoffTitle}>Others are guessing...</Text>
            <Text style={styles.handoffSub}>{guessesIn} / {guessers.length} guessed</Text>
          </Animated.View>
        </SafeAreaView>
      );
    }

    if (iHaveGuessed) {
      return (
        <SafeAreaView style={styles.safe}>
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Guess locked in!</Text>
            <Text style={styles.waitSub}>{guessesIn} / {guessers.length} guessed</Text>
          </Animated.View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎯  Guess {setter?.name}'s number</Text>
            </View>
            <View style={styles.promptBox}>
              <Text style={styles.promptText}>{gs.currentPrompt?.text}</Text>
            </View>
            <Text style={styles.enterInstruction}>
              Your guess {isOpenRange ? '(any number)' : '(1 – 100)'}:
            </Text>
            <TextInput
              style={styles.numberInput}
              value={inputText}
              onChangeText={t => setInputText(t.replace(/[^0-9]/g, ''))}
              placeholder="?"
              placeholderTextColor={COLORS.text3}
              keyboardType="number-pad"
              autoFocus
              maxLength={isOpenRange ? 6 : 3}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!guessValid) return;
                sendPlayerAction('ng-guess', { guess: parsedGuess });
                setInputText('');
              }}
            />
            <Text style={styles.rangeTip}>{isOpenRange ? 'Any number ≥ 1' : '1 to 100'}</Text>
            <PrimaryButton
              title="Submit Guess →"
              onPress={() => {
                if (!guessValid) return;
                sendPlayerAction('ng-guess', { guess: parsedGuess });
                setInputText('');
              }}
              disabled={!guessValid}
              style={{ marginTop: 8 }}
            />
            <Text style={styles.guesserProgress}>{guessesIn} / {guessers.length} guessed</Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Phase: reveal ──────────────────────────────────────────────────────────
  if (gs.phase === 'reveal') {
    const results = gs.results ?? [];
    const closest = results[0];
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View style={{ opacity: fadeAnim, gap: 16 }}>
            <Text style={styles.revealTitle}>Round {gs.round} reveal</Text>
            <View style={styles.promptQuoteBox}>
              <Text style={styles.promptQuoteText}>"{gs.currentPrompt?.text}"</Text>
            </View>
            <View style={styles.answerRevealBox}>
              <Text style={styles.answerRevealLabel}>{setter?.name}'s answer</Text>
              <Text style={styles.answerRevealNum}>{displayNum(gs.targetNumber ?? 0)}</Text>
              {(gs.targetNumber ?? 0) > 100 && (
                <Text style={styles.actualValueNote}>actual: {gs.targetNumber}</Text>
              )}
            </View>
            <Text style={styles.sectionLabel}>Guesses — closest first</Text>
            {results.map((r, i) => (
              <View key={r.playerId} style={[styles.guessRow, i === 0 && styles.guessRowWinner]}>
                <Text style={styles.guessRank}>{i === 0 ? '🎯' : `#${i + 1}`}</Text>
                <View style={styles.guessInfo}>
                  <Text style={styles.guessName}>{r.playerName}</Text>
                  <Text style={styles.guessValue}>guessed {displayNum(r.guess)}</Text>
                </View>
                <Text style={[styles.guessDist, { color: i === 0 ? COLORS.success : COLORS.text2 }]}>
                  off by {r.distance}
                </Text>
              </View>
            ))}
            {closest && (
              <View style={styles.closestBanner}>
                <Text style={styles.closestText}>🏅 {closest.playerName} is closest!</Text>
              </View>
            )}
            <View style={styles.actions}>
              {isHost ? (
                <PrimaryButton title="Apply Penalties →" onPress={handleApplyPenalties} />
              ) : (
                <Text style={styles.waitSub}>Waiting for host to continue...</Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: round-end ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={{ opacity: fadeAnim, gap: 16 }}>
          <Text style={styles.revealTitle}>After round {gs.round}</Text>
          <Text style={styles.sectionLabel}>Standings  ·  lower is better</Text>
          {sortedStandings.map((p, i) => (
            <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
              <Text style={styles.standingRank}>#{i + 1}</Text>
              <Text style={styles.standingName}>{p.name}</Text>
              <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
                {(gs.penalties ?? {})[p.id] ?? 0} pts
              </Text>
            </View>
          ))}
          <View style={styles.actions}>
            {isHost ? (
              <>
                {gs.round < NUMBER_GUESSOR_ROUNDS ? (
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
  roundBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  roundBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.text2, letterSpacing: 1.5 },
  handoffEmoji: { fontSize: 44, marginBottom: 4 },
  handoffTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  handoffSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 22 },
  guesserProgress: { fontSize: 12, color: COLORS.text3, letterSpacing: 1 },
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
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
  enterInstruction: { fontSize: 14, color: COLORS.text2, alignSelf: 'flex-start', width: '100%' },
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
  openRangeBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  openRangeBadgeText: { fontSize: 12, fontWeight: '600', color: '#818cf8' },
  revealTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  promptQuoteBox: { borderLeftWidth: 2, borderLeftColor: COLORS.text3, paddingLeft: 12 },
  promptQuoteText: { fontSize: 15, fontWeight: '500', color: COLORS.text2, lineHeight: 22 },
  answerRevealBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  answerRevealLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5 },
  answerRevealNum: { fontSize: 72, fontWeight: '900', color: COLORS.accentHi, letterSpacing: -2 },
  actualValueNote: { fontSize: 12, color: COLORS.text3 },
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
  guessRowWinner: { borderColor: COLORS.success, backgroundColor: '#071d0f' },
  guessRank: { fontSize: 18, width: 30, textAlign: 'center' },
  guessInfo: { flex: 1, gap: 2 },
  guessName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  guessValue: { fontSize: 13, color: COLORS.text2 },
  guessDist: { fontSize: 14, fontWeight: '700' },
  closestBanner: { backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
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
  standingRowFirst: { borderColor: COLORS.success, backgroundColor: '#071d0f' },
  standingRank: { fontSize: 13, fontWeight: '700', color: COLORS.text2, width: 28 },
  standingName: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  standingScore: { fontSize: 15, fontWeight: '700', color: COLORS.text2 },
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: { fontSize: 36, fontWeight: '900', color: COLORS.text, letterSpacing: -1, textAlign: 'center' },
  gameOverSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
});
