import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
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
import { COLORS } from '../constants/theme';
import { LIE_DETECTOR_PROMPTS } from '../constants/prompts';
import { Player } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LieDetector'>;
};

interface LDVote {
  playerId: string;
  playerName: string;
  lieVote: 1 | 2; // which statement they think is the LIE
}

interface LDPoints {
  playerId: string;
  playerName: string;
  points: number;
}

const ROUND_OPTIONS = [1, 2, 3] as const;

interface LDGameState {
  game: 'lieDetector';
  phase: 'setup' | 'entering' | 'voting' | 'results' | 'game-over';
  prompt: string;
  speakerIndex: number;
  playerOrder?: string[]; // shuffled player IDs for random turn order
  totalRounds?: number;
  currentRound?: number;
  statement1?: string;
  statement2?: string;
  votedPlayerIds: string[];
  // revealed only in results phase
  truthStatement?: 1 | 2;
  votes?: LDVote[];
  pointsAwarded?: LDPoints[];
}

function pickPrompt(used: Set<number>): { prompt: string; index: number } {
  const all = LIE_DETECTOR_PROMPTS.map((_, i) => i);
  const available = all.filter(i => !used.has(i));
  const pool = available.length > 0 ? available : all;
  if (available.length === 0) used.clear();
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { prompt: LIE_DETECTOR_PROMPTS[index], index };
}


export default function LieDetectorScreen({ navigation }: Props) {
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

  const usedPromptsRef = useRef(new Set<number>());
  // Authoritative player list — room.players is always up-to-date from the server
  const allPlayers = room?.players ?? players;

  const gsRef = useRef<LDGameState | null>(null);
  const sendGameStateRef = useRef(sendGameState);
  useEffect(() => { sendGameStateRef.current = sendGameState; }, [sendGameState]);

  const gs = (room?.gameState?.game === 'lieDetector' ? room.gameState : null) as LDGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // Block header back button for non-hosts
  useEffect(() => {
    navigation.setOptions({ headerBackVisible: isHost, gestureEnabled: isHost });
  }, [isHost]);

  // ── Listener voting UI state ───────────────────────────────────────────────
  // Reset both when phase changes so each round starts fresh
  const [instructionSeen, setInstructionSeen] = useState(false);
  const [selectedLieVote, setSelectedLieVote] = useState<1 | 2 | null>(null);
  useEffect(() => {
    setInstructionSeen(false);
    setSelectedLieVote(null);
  }, [gs?.phase]);

  // ── Setup timeout ──────────────────────────────────────────────────────────
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Only time out if we're stuck before receiving any game state at all
    if (gs) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    };
  }, [!!gs]);

  // ── Host: send initial setup state with shuffled player order ───────────────
  useEffect(() => {
    if (!isHost) return;
    // Shuffle players so turn order is random each game
    const shuffled = [...(room?.players ?? players)].sort(() => Math.random() - 0.5).map(p => p.id);
    const init: LDGameState = {
      game: 'lieDetector',
      phase: 'setup',
      prompt: '',
      speakerIndex: 0,
      playerOrder: shuffled,
      votedPlayerIds: [],
    };
    gsRef.current = init;
    sendGameStateRef.current(init);
  }, []); // eslint-disable-line

  // ── Host: pick number of rounds (setup phase) ─────────────────────────────
  const handleSelectRounds = (n: number) => {
    if (!isHost || !gs) return;
    const { prompt, index } = pickPrompt(usedPromptsRef.current);
    usedPromptsRef.current.add(index);
    const next: LDGameState = {
      ...gs,
      phase: 'entering',
      prompt,
      totalRounds: n,
      currentRound: 1,
      speakerIndex: 0,
      playerOrder: gs.playerOrder, // keep the shuffled order set at init
      votedPlayerIds: [],
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  useEffect(() => {
    if (!isHost || !gs?.prompt) return;
    const idx = LIE_DETECTOR_PROMPTS.indexOf(gs.prompt);
    if (idx >= 0) usedPromptsRef.current.add(idx);
  }, [!!gs?.prompt]); // eslint-disable-line

  // ── Host: advance to next player ──────────────────────────────────────────
  const handleNextPlayer = () => {
    if (!isHost || !gs) return;
    const order = gs.playerOrder ?? allPlayers.map(p => p.id);
    const nextIdx = (gs.speakerIndex + 1) % order.length;
    const totalRounds = gs.totalRounds ?? 1;
    const currentRound = gs.currentRound ?? 1;

    // Completing a full round when speaker wraps back to 0
    const completingRound = nextIdx === 0;
    const nextRound = completingRound ? currentRound + 1 : currentRound;

    if (completingRound && nextRound > totalRounds) {
      const next: LDGameState = { ...gs, phase: 'game-over' };
      gsRef.current = next;
      sendGameStateRef.current(next);
      return;
    }

    const { prompt, index } = pickPrompt(usedPromptsRef.current);
    usedPromptsRef.current.add(index);
    const next: LDGameState = {
      ...gs,
      phase: 'entering',
      prompt,
      speakerIndex: nextIdx,
      totalRounds,
      currentRound: nextRound,
      playerOrder: order,
      votedPlayerIds: [],
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gs) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          {setupTimedOut ? (
            <>
              <Text style={styles.waitTitle}>Could not load game</Text>
              <Text style={styles.waitSub}>Lost connection to the server.</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
                <Text style={[styles.waitSub, { textDecorationLine: 'underline' }]}>← Go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.waitTitle}>Setting up...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: setup (host picks rounds) ──────────────────────────────────────
  if (gs.phase === 'setup') {
    if (isHost) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🕵️</Text>
            <Text style={styles.setupTitle}>How many rounds?</Text>
            <Text style={styles.setupSub}>
              Each round every player gets one turn as the speaker.
            </Text>
            <View style={styles.setupOptions}>
              {ROUND_OPTIONS.map(n => (
                <TouchableOpacity key={n} style={styles.setupOption} onPress={() => handleSelectRounds(n)}>
                  <Text style={styles.setupOptionNum}>{n}</Text>
                  <Text style={styles.setupOptionLabel}>{n === 1 ? 'round' : 'rounds'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitEmoji}>🕵️</Text>
          <Text style={styles.waitTitle}>Waiting for host...</Text>
          <Text style={styles.waitSub}>Host is choosing the number of rounds.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: game-over ──────────────────────────────────────────────────────
  if (gs.phase === 'game-over') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const topScore = sorted[0]?.score ?? 0;
    const winners = sorted.filter(p => p.score === topScore);
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.waitEmoji, { textAlign: 'center' }]}>🏆</Text>
          <Text style={styles.gameOverTitle}>
            {winners.map(p => p.name).join(' & ')} wins!
          </Text>
          <Text style={styles.setupSub}>After {gs.totalRounds} round{(gs.totalRounds ?? 1) > 1 ? 's' : ''}.</Text>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Final Scores</Text>
          <ScoreDisplay players={players} highlightId={myId} />
          <View style={styles.actions}>
            {isHost ? (
              <>
                <PrimaryButton title="Play Again" onPress={() => startGame('lieDetector')} />
                <SecondaryButton title="Choose New Game" onPress={() => navigation.navigate('GameSelect')} />
              </>
            ) : (
              <Text style={styles.waitSub}>Waiting for host...</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const playerOrder = gs.playerOrder ?? allPlayers.map(p => p.id);
  const speakerId = playerOrder[gs.speakerIndex ?? 0];
  const speaker = allPlayers.find(p => p.id === speakerId) ?? allPlayers[0];
  const nonSpeakers = allPlayers.filter(p => p.id !== speakerId);
  const iAmSpeaker = myId === speaker?.id;

  // ── Phase: entering (also handles legacy 'speaker-choice' from old backend) ─
  if (gs.phase === 'entering' || (gs.phase as string) === 'speaker-choice') {
    if (iAmSpeaker) {
      return <SpeakerEntering speaker={speaker} prompt={gs.prompt} sendPlayerAction={sendPlayerAction} />;
    }
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitEmoji}>✍️</Text>
          <Text style={styles.waitTitle}>{speaker?.name} is writing their statements...</Text>
          <Text style={styles.waitSub}>
            They'll give two answers to the prompt.{'\n'}One is the truth, one is a lie.
          </Text>
          <View style={styles.promptQuote}>
            <Text style={styles.promptQuoteText}>"{gs.prompt}"</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ──────────────────────────────────────────────────────────
  // Guard: unrecognised phase — wait for the real state to arrive
  if (gs.phase !== 'voting' && gs.phase !== 'results') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitTitle}>Setting up...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (gs.phase === 'voting') {
    const iHaveVoted = (gs.votedPlayerIds ?? []).includes(myId ?? '');
    const votesIn = (gs.votedPlayerIds ?? []).length;
    const totalVoters = nonSpeakers.length;

    // [Issue 3] Speaker sees a distinct waiting message
    if (iAmSpeaker) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🔒</Text>
            <Text style={styles.waitTitle}>
              Users are currently deciding{'\n'}which one is the lie.
            </Text>
            <Text style={styles.waitSub}>{votesIn} / {totalVoters} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (iHaveVoted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Vote locked in!</Text>
            <Text style={styles.waitSub}>{votesIn} / {totalVoters} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    // [Issue 2] Instruction screen before showing the voting UI
    if (!instructionSeen) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>💬</Text>
            <Text style={styles.waitTitle}>Before you vote...</Text>
            <Text style={styles.waitSub}>
              Ask{' '}
              <Text style={{ color: COLORS.text, fontWeight: '700' }}>@{speaker?.name}</Text>
              {' '}a clarifying question about their answers before deciding.
            </Text>
            <View style={styles.promptQuote}>
              <Text style={styles.promptQuoteText}>"{gs.prompt}"</Text>
            </View>
            <PrimaryButton
              title="I'm Ready to Vote →"
              onPress={() => setInstructionSeen(true)}
              style={{ marginTop: 8, width: '100%' }}
            />
          </View>
        </SafeAreaView>
      );
    }

    // [Issue 4] Selection state — tap to highlight, then tap Submit to send
    const handleSubmitVote = () => {
      if (!selectedLieVote) return;
      sendPlayerAction('ld-vote', { lieVote: selectedLieVote });
    };

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🗳️ Which one is the lie?</Text>
          </View>

          <View style={styles.promptQuote}>
            <Text style={styles.promptQuoteText}>"{gs.prompt}"</Text>
          </View>

          <Text style={styles.votingQuestion}>
            {speaker?.name} gave two answers. Tap the one you think is the LIE:
          </Text>

          {([1, 2] as const).map(n => {
            const isSelected = selectedLieVote === n;
            const isDimmed = selectedLieVote !== null && !isSelected;
            return (
              <TouchableOpacity
                key={n}
                style={[styles.statementBtn, isSelected && styles.statementBtnSelected, isDimmed && styles.statementBtnDimmed]}
                onPress={() => setSelectedLieVote(isSelected ? null : n)}
                activeOpacity={0.75}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.statementNum, isSelected && styles.statementNumSelected]}>
                    STATEMENT {n}
                  </Text>
                  {isSelected && <Text style={styles.selectedBadge}>✓ YOUR PICK</Text>}
                </View>
                <Text style={[styles.statementText, isDimmed && { opacity: 0.45 }]}>
                  {n === 1 ? gs.statement1 : gs.statement2}
                </Text>
              </TouchableOpacity>
            );
          })}

          <PrimaryButton
            title="Submit Vote →"
            onPress={handleSubmitVote}
            disabled={selectedLieVote === null}
            style={{ marginTop: 8 }}
          />

          <Text style={styles.voterProgress}>{votesIn} / {totalVoters} voted</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: results ─────────────────────────────────────────────────────────
  // Guard: if we're in results but truthStatement isn't set yet, the game
  // state is from a previous session or hasn't fully propagated — show loading.
  if (!gs.truthStatement) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitTitle}>Loading results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const truthStatement = gs.truthStatement;
  const voteFor1 = (gs.votes ?? []).filter(v => v.lieVote === 1).length;
  const voteFor2 = (gs.votes ?? []).filter(v => v.lieVote === 2).length;
  const pointWinners = (gs.pointsAwarded ?? []).filter(r => r.points > 0);
  const correctLieNum: 1 | 2 = truthStatement === 1 ? 2 : 1;
  const myVote = (gs.votes ?? []).find(v => v.playerId === myId);
  const myPoints = (gs.pointsAwarded ?? []).find(r => r.playerId === myId);
  const iGotItRight = iAmSpeaker
    ? (myPoints?.points ?? 0) > 0
    : myVote?.lieVote === correctLieNum;

  const resultBannerColor = iGotItRight ? COLORS.success : COLORS.danger;
  const resultBannerText = iAmSpeaker
    ? (iGotItRight ? '🎉 You fooled them!' : '😬 They caught you!')
    : (iGotItRight ? '✓ You got it right!' : '✗ You got it wrong!');

  const isLastSpeaker = (gs.speakerIndex + 1) % allPlayers.length === 0;
  const isLastRound = (gs.currentRound ?? 1) >= (gs.totalRounds ?? 1);
  const nextBtnLabel = isLastSpeaker && isLastRound
    ? 'See Final Results →'
    : isLastSpeaker
    ? `Start Round ${(gs.currentRound ?? 1) + 1} →`
    : 'Next Player →';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {gs.totalRounds && gs.totalRounds > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              Round {gs.currentRound} / {gs.totalRounds} · Speaker {gs.speakerIndex + 1} / {allPlayers.length}
            </Text>
          </View>
        )}
        <View style={[styles.resultBanner, { borderColor: resultBannerColor, backgroundColor: iGotItRight ? '#071d0f' : '#1d0710' }]}>
          <Text style={[styles.resultBannerText, { color: resultBannerColor }]}>{resultBannerText}</Text>
        </View>
        <Text style={styles.resultsTitle}>The verdict.</Text>

        {(() => {
          const totalVotes = voteFor1 + voteFor2;
          return (
            <View style={styles.statementReveal}>
              {([1, 2] as const).map(n => {
                const isTrue = truthStatement === n;
                const votes = n === 1 ? voteFor1 : voteFor2;
                const pct = totalVotes > 0 ? votes / totalVotes : 0;
                const barColor = isTrue ? COLORS.success : COLORS.danger;
                const iMyPick = !iAmSpeaker && myVote?.lieVote === n;
                return (
                  <View key={n} style={[styles.revealCard, isTrue ? styles.revealTruth : styles.revealLie, iMyPick && styles.revealMyPick]}>
                    <View style={styles.revealHeader}>
                      <Text style={styles.revealNum}>Statement {n}</Text>
                      <View style={styles.revealTagRow}>
                        {iMyPick && (
                          <Text style={styles.myPickBadge}>👆 YOUR PICK</Text>
                        )}
                        <Text style={[styles.revealTag, { color: barColor }]}>
                          {isTrue ? '✓ TRUTH' : '✗ LIE'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.revealStatementText}>{n === 1 ? gs.statement1 : gs.statement2}</Text>
                    {/* Vote count row */}
                    <View style={styles.voteRow}>
                      <Text style={[styles.voteBigNum, { color: barColor }]}>{votes}</Text>
                      <Text style={styles.voteLabel}>
                        {votes === 1 ? 'person voted this was the lie' : 'people voted this was the lie'}
                      </Text>
                    </View>
                    {/* Vote bar */}
                    <View style={styles.voteBarTrack}>
                      <View style={[styles.voteBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        <View style={styles.pointsBlock}>
          <Text style={styles.sectionLabel}>Points this round</Text>
          {pointWinners.length > 0 ? (
            pointWinners.map(r => (
              <View key={r.playerId} style={styles.pointRow}>
                <Text style={styles.pointPlus}>+{r.points}</Text>
                <Text style={styles.pointName}>{r.playerName}</Text>
                {r.playerId === speaker?.id && (
                  <Text style={styles.pointTag}>fooled the crowd</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.noPoints}>No points this round.</Text>
          )}
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Scores</Text>
        <ScoreDisplay players={players} highlightId={myId} />

        <View style={styles.actions}>
          {isHost ? (
            <>
              <PrimaryButton title={nextBtnLabel} onPress={handleNextPlayer} />
              <SecondaryButton title="Back to Games" onPress={() => navigation.goBack()} />
            </>
          ) : (
            <Text style={styles.waitSub}>Waiting for host to continue...</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Speaker entering sub-component ────────────────────────────────────────────
function SpeakerEntering({
  speaker,
  prompt,
  sendPlayerAction,
}: {
  speaker: Player;
  prompt: string;
  sendPlayerAction: (action: string, data: any) => void;
}) {
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [truthPick, setTruthPick] = useState<1 | 2 | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = s1.trim().length > 0 && s2.trim().length > 0 && truthPick !== null;

  const handleSubmit = () => {
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    // truthPick here means "which is the LIE" — invert to get truthStatement
    sendPlayerAction('ld-submit', {
      statement1: s1.trim(),
      statement2: s2.trim(),
      truthStatement: truthPick === 1 ? 2 : 1,
    });
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitEmoji}>✅</Text>
          <Text style={styles.waitTitle}>Statements submitted!</Text>
          <Text style={styles.waitSub}>Waiting for everyone to vote...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎤 Your turn, {speaker.name}</Text>
          </View>

          <Text style={styles.sectionLabel}>Your prompt</Text>
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>{prompt}</Text>
          </View>

          <Text style={styles.instruction}>
            Write two answers and say both out loud to the group. One must be the truth, one must be a lie — only you know which.
          </Text>

          <Text style={styles.inputLabel}>Statement 1</Text>
          <TextInput
            style={styles.stmtInput}
            placeholder="Your first answer..."
            placeholderTextColor={COLORS.text3}
            value={s1}
            onChangeText={setS1}
            maxLength={80}
            multiline
          />

          <Text style={styles.inputLabel}>Statement 2</Text>
          <TextInput
            style={styles.stmtInput}
            placeholder="Your second answer..."
            placeholderTextColor={COLORS.text3}
            value={s2}
            onChangeText={setS2}
            maxLength={80}
            multiline
          />

          <Text style={[styles.instruction, { marginTop: 4 }]}>
            Secretly pick which one is the LIE (only you see this):
          </Text>

          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceBtn, truthPick === 1 && styles.choiceBtnLieSelected]}
              onPress={() => setTruthPick(1)}
              activeOpacity={0.78}
            >
              <Text style={styles.choiceNumLabel}>1 is the</Text>
              <Text style={[styles.choiceBtnText, { color: COLORS.danger }]}>LIE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceBtn, truthPick === 2 && styles.choiceBtnLieSelected]}
              onPress={() => setTruthPick(2)}
              activeOpacity={0.78}
            >
              <Text style={styles.choiceNumLabel}>2 is the</Text>
              <Text style={[styles.choiceBtnText, { color: COLORS.danger }]}>LIE</Text>
            </TouchableOpacity>
          </View>

          <PrimaryButton
            title="Submit →"
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{ marginTop: 16 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  waitEmoji: { fontSize: 52 },
  waitTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  waitSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  promptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  promptText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  instruction: { fontSize: 14, color: COLORS.text2, lineHeight: 22 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text2, marginBottom: -8 },
  stmtInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    color: COLORS.text,
    fontSize: 16,
    padding: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  choiceRow: { flexDirection: 'row', gap: 12 },
  choiceBtn: {
    flex: 1,
    height: 90,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 4,
  },
  choiceBtnSelected: {
    borderColor: COLORS.success,
    backgroundColor: '#071d0f',
  },
  choiceBtnLieSelected: {
    borderColor: COLORS.danger,
    backgroundColor: '#1d0710',
  },
  choiceNumLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  choiceBtnText: { fontSize: 18, fontWeight: '900' },
  promptQuote: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.text3,
    paddingLeft: 12,
  },
  promptQuoteText: { fontSize: 15, fontWeight: '500', color: COLORS.text2, lineHeight: 22 },
  votingQuestion: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  // Statement selection buttons
  statementBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    padding: 16,
    gap: 6,
  },
  statementBtnSelected: {
    borderColor: COLORS.danger,
    borderWidth: 3,
    backgroundColor: '#3a0a18',
  },
  statementBtnDimmed: {
    opacity: 0.4,
  },
  statementNum: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statementNumSelected: {
    color: COLORS.danger,
  },
  statementText: { fontSize: 17, fontWeight: '600', color: COLORS.text, lineHeight: 24 },
  selectedBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.danger,
    letterSpacing: 0.5,
  },
  voterProgress: { fontSize: 13, color: COLORS.text3, textAlign: 'center' },
  // Results
  statementReveal: { gap: 12 },
  revealCard: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    gap: 8,
  },
  revealTruth: { borderColor: COLORS.success, backgroundColor: '#071d0f' },
  revealLie: { borderColor: COLORS.danger, backgroundColor: '#1d0710' },
  revealMyPick: { borderWidth: 3, shadowColor: '#FBBF24', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  revealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revealTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myPickBadge: { fontSize: 11, fontWeight: '800', color: '#FBBF24', letterSpacing: 0.3 },
  revealNum: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  revealTag: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  revealStatementText: { fontSize: 18, fontWeight: '700', color: COLORS.text, lineHeight: 26 },
  voteRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  voteBigNum: { fontSize: 32, fontWeight: '900', lineHeight: 36 },
  voteLabel: { fontSize: 13, color: COLORS.text2, flex: 1 },
  voteBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  voteBarFill: { height: 6, borderRadius: 3, minWidth: 4 },
  resultBanner: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  resultBannerText: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  resultsTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  pointsBlock: { gap: 8 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointPlus: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  pointName: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  pointTag: { fontSize: 12, color: COLORS.text3, fontStyle: 'italic' },
  noPoints: { fontSize: 14, color: COLORS.text2, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: COLORS.border },
  actions: { gap: 10, marginTop: 8, alignItems: 'center' },
  setupTitle: {
    fontSize: 28,
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
  setupOptions: { flexDirection: 'row', gap: 14, marginTop: 8 },
  setupOption: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
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
  gameOverTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
});
