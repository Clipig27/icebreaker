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
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LieDetector'>;
};

type StatementType = 'lietruth' | 'twolies' | 'twotruths';

interface LDVote {
  playerId: string;
  playerName: string;
  stmt1Vote: 'lie' | 'truth';
  stmt2Vote: 'lie' | 'truth';
}

interface LDPoints {
  playerId: string;
  playerName: string;
  points: number;
}

const ROUND_OPTIONS = [1, 2, 3] as const;

const STMT_TYPE_OPTIONS: { type: StatementType; label: string; emoji: string; sub: string }[] = [
  { type: 'lietruth',  label: 'Lie + Truth', emoji: '🎭', sub: 'one of each' },
  { type: 'twolies',   label: 'Two Lies',    emoji: '😈', sub: 'both are lies' },
  { type: 'twotruths', label: 'Two Truths',  emoji: '😇', sub: 'both are true' },
];

const STMT_TYPE_META: Record<StatementType, { label: string; emoji: string; color: string }> = {
  lietruth:  { label: 'Lie + Truth', emoji: '🎭', color: '#FBBF24' },
  twolies:   { label: 'Two Lies',    emoji: '😈', color: COLORS.danger },
  twotruths: { label: 'Two Truths',  emoji: '😇', color: COLORS.success },
};

interface LDGameState {
  game: 'lieDetector';
  phase: 'setup' | 'entering' | 'voting' | 'results' | 'game-over';
  prompt: string;
  speakerIndex: number;
  playerOrder?: string[];
  totalRounds?: number;
  currentRound?: number;
  statement1?: string;
  statement2?: string;
  votedPlayerIds: string[];
  expectedVoterCount?: number;
  // revealed in results
  statementType?: StatementType;
  stmt1IsLie?: boolean;
  stmt2IsLie?: boolean;
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
  const allPlayers = room?.players ?? players;

  const gsRef = useRef<LDGameState | null>(null);
  const sendGameStateRef = useRef(sendGameState);
  useEffect(() => { sendGameStateRef.current = sendGameState; }, [sendGameState]);

  const gs = (room?.gameState?.game === 'lieDetector' ? room.gameState : null) as LDGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  useEffect(() => {
    navigation.setOptions({ headerBackVisible: isHost, gestureEnabled: isHost });
  }, [isHost]);

  // Per-statement vote state for listeners
  const [stmt1Vote, setStmt1Vote] = useState<'lie' | 'truth' | null>(null);
  const [stmt2Vote, setStmt2Vote] = useState<'lie' | 'truth' | null>(null);
  const [instructionSeen, setInstructionSeen] = useState(false);
  useEffect(() => {
    setInstructionSeen(false);
    setStmt1Vote(null);
    setStmt2Vote(null);
  }, [gs?.phase]);

  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gs) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  }, [!!gs]);

  useEffect(() => {
    if (!isHost) return;
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
      playerOrder: gs.playerOrder,
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

  const handleNextPlayer = () => {
    if (!isHost || !gs) return;
    const order = gs.playerOrder ?? allPlayers.map(p => p.id);
    const nextIdx = (gs.speakerIndex + 1) % order.length;
    const totalRounds = gs.totalRounds ?? 1;
    const currentRound = gs.currentRound ?? 1;
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
      statement1: undefined,
      statement2: undefined,
      statementType: undefined,
      stmt1IsLie: undefined,
      stmt2IsLie: undefined,
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

  // ── Phase: setup ──────────────────────────────────────────────────────────
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

  // ── Phase: entering ───────────────────────────────────────────────────────
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
            They're crafting two answers — could be{'\n'}Lie + Truth, Two Lies, or Two Truths.{'\n'}You'll vote on each one.
          </Text>
          <View style={styles.promptQuote}>
            <Text style={styles.promptQuoteText}>"{gs.prompt}"</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase guard ────────────────────────────────────────────────────────────
  if (gs.phase !== 'voting' && gs.phase !== 'results') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}><Text style={styles.waitTitle}>Setting up...</Text></View>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ──────────────────────────────────────────────────────────
  if (gs.phase === 'voting') {
    const iHaveVoted = (gs.votedPlayerIds ?? []).includes(myId ?? '');
    const votesIn = (gs.votedPlayerIds ?? []).length;
    const totalVoters = nonSpeakers.length;

    if (iAmSpeaker) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🔒</Text>
            <Text style={styles.waitTitle}>Players are reading you...{'\n'}stay poker-faced.</Text>
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
            <Text style={styles.waitTitle}>Votes locked in!</Text>
            <Text style={styles.waitSub}>{votesIn} / {totalVoters} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (!instructionSeen) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>💬</Text>
            <Text style={styles.waitTitle}>Ask a question first</Text>
            <Text style={styles.waitSub}>
              Challenge{' '}
              <Text style={{ color: COLORS.text, fontWeight: '700' }}>@{speaker?.name}</Text>
              {' '}on their answers before you decide. Then vote on each statement — LIE or TRUTH.
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

    const canSubmit = stmt1Vote !== null && stmt2Vote !== null;
    const handleSubmitVote = () => {
      if (!canSubmit) return;
      sendPlayerAction('ld-vote', { stmt1Vote, stmt2Vote });
    };

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🗳️ Label each statement</Text>
          </View>

          <View style={styles.promptQuote}>
            <Text style={styles.promptQuoteText}>"{gs.prompt}"</Text>
          </View>

          <Text style={styles.votingQuestion}>
            Is each statement a LIE or the TRUTH?
          </Text>

          {([1, 2] as const).map(n => {
            const currentVote = n === 1 ? stmt1Vote : stmt2Vote;
            const setVote = n === 1 ? setStmt1Vote : setStmt2Vote;
            const stmtText = n === 1 ? gs.statement1 : gs.statement2;
            return (
              <View key={n} style={[styles.voteCard, currentVote === 'lie' && styles.voteCardLie, currentVote === 'truth' && styles.voteCardTruth]}>
                <View style={styles.voteCardHeader}>
                  <Text style={styles.voteCardNum}>STATEMENT {n}</Text>
                  {currentVote && (
                    <Text style={[styles.voteCardBadge, { color: currentVote === 'lie' ? COLORS.danger : COLORS.success }]}>
                      {currentVote === 'lie' ? '✗ LIE' : '✓ TRUTH'}
                    </Text>
                  )}
                </View>
                <Text style={styles.voteCardText}>{stmtText}</Text>
                <View style={styles.voteBtnRow}>
                  <TouchableOpacity
                    style={[styles.voteBtn, currentVote === 'lie' && styles.voteBtnLieActive]}
                    onPress={() => setVote(currentVote === 'lie' ? null : 'lie')}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.voteBtnText, currentVote === 'lie' && { color: COLORS.danger, fontWeight: '900' }]}>
                      ✗ LIE
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voteBtn, currentVote === 'truth' && styles.voteBtnTruthActive]}
                    onPress={() => setVote(currentVote === 'truth' ? null : 'truth')}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.voteBtnText, currentVote === 'truth' && { color: COLORS.success, fontWeight: '900' }]}>
                      ✓ TRUTH
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <PrimaryButton
            title="Lock In Votes →"
            onPress={handleSubmitVote}
            disabled={!canSubmit}
            style={{ marginTop: 4 }}
          />

          <Text style={styles.voterProgress}>{votesIn} / {totalVoters} voted</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: results ─────────────────────────────────────────────────────────
  if (gs.stmt1IsLie === undefined || gs.stmt2IsLie === undefined) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}><Text style={styles.waitTitle}>Loading results...</Text></View>
      </SafeAreaView>
    );
  }

  const myVote = (gs.votes ?? []).find(v => v.playerId === myId);
  const myPoints = (gs.pointsAwarded ?? []).find(r => r.playerId === myId);

  let correctCount = 0;
  if (!iAmSpeaker && myVote) {
    if ((myVote.stmt1Vote === 'lie') === gs.stmt1IsLie) correctCount++;
    if ((myVote.stmt2Vote === 'lie') === gs.stmt2IsLie) correctCount++;
  }

  const resultBannerColor = iAmSpeaker
    ? ((myPoints?.points ?? 0) > 0 ? COLORS.success : COLORS.danger)
    : (correctCount === 2 ? COLORS.success : correctCount === 1 ? '#FBBF24' : COLORS.danger);

  const resultBannerText = iAmSpeaker
    ? ((myPoints?.points ?? 0) > 0 ? '🎉 You fooled them!' : '😬 They all caught you!')
    : (correctCount === 2 ? '🎯 Perfect read — both correct!' : correctCount === 1 ? '🤔 You got one right' : '✗ They played you');

  const typeMeta = gs.statementType ? STMT_TYPE_META[gs.statementType] : null;
  const pointWinners = (gs.pointsAwarded ?? []).filter(r => r.points > 0);

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

        <View style={[styles.resultBanner, { borderColor: resultBannerColor, backgroundColor: resultBannerColor === COLORS.success ? '#071d0f' : resultBannerColor === COLORS.danger ? '#1d0710' : '#2a1a00' }]}>
          <Text style={[styles.resultBannerText, { color: resultBannerColor }]}>{resultBannerText}</Text>
        </View>

        {typeMeta && (
          <View style={[styles.typeRevealPill, { borderColor: typeMeta.color + '55', backgroundColor: typeMeta.color + '14' }]}>
            <Text style={styles.typeRevealEmoji}>{typeMeta.emoji}</Text>
            <Text style={[styles.typeRevealLabel, { color: typeMeta.color }]}>
              {speaker?.name} chose: {typeMeta.label}
            </Text>
          </View>
        )}

        <Text style={styles.resultsTitle}>The verdict.</Text>

        <View style={styles.statementReveal}>
          {([1, 2] as const).map(n => {
            const isLie = n === 1 ? gs.stmt1IsLie : gs.stmt2IsLie;
            const stmtText = n === 1 ? gs.statement1 : gs.statement2;
            const barColor = isLie ? COLORS.danger : COLORS.success;
            const myGuess = myVote ? (n === 1 ? myVote.stmt1Vote : myVote.stmt2Vote) : null;
            const myGuessCorrect = myGuess ? (myGuess === 'lie') === isLie : null;

            // Vote breakdown for this statement
            const lieVotes = (gs.votes ?? []).filter(v => (n === 1 ? v.stmt1Vote : v.stmt2Vote) === 'lie').length;
            const truthVotes = (gs.votes ?? []).filter(v => (n === 1 ? v.stmt1Vote : v.stmt2Vote) === 'truth').length;
            const total = lieVotes + truthVotes;

            return (
              <View key={n} style={[styles.revealCard, isLie ? styles.revealLie : styles.revealTruth]}>
                <View style={styles.revealHeader}>
                  <Text style={styles.revealNum}>Statement {n}</Text>
                  <View style={styles.revealTagRow}>
                    {!iAmSpeaker && myGuess && (
                      <Text style={[styles.myPickBadge, { color: myGuessCorrect ? COLORS.success : COLORS.danger }]}>
                        {myGuessCorrect ? '✓ YOU GOT IT' : '✗ YOU MISSED'}
                      </Text>
                    )}
                    <Text style={[styles.revealTag, { color: barColor }]}>
                      {isLie ? '✗ LIE' : '✓ TRUTH'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.revealStatementText}>{stmtText}</Text>
                <View style={styles.voteBreakdown}>
                  <View style={styles.voteBreakdownItem}>
                    <Text style={[styles.voteBreakdownNum, { color: COLORS.danger }]}>{lieVotes}</Text>
                    <Text style={styles.voteBreakdownLabel}>said LIE</Text>
                  </View>
                  <View style={styles.voteBreakdownDivider} />
                  <View style={styles.voteBreakdownItem}>
                    <Text style={[styles.voteBreakdownNum, { color: COLORS.success }]}>{truthVotes}</Text>
                    <Text style={styles.voteBreakdownLabel}>said TRUTH</Text>
                  </View>
                </View>
                <View style={styles.voteBarTrack}>
                  <View style={[styles.voteBarFill, {
                    width: total > 0 ? `${Math.round((lieVotes / total) * 100)}%` as any : '0%',
                    backgroundColor: COLORS.danger,
                  }]} />
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.pointsBlock}>
          <Text style={styles.sectionLabel}>Points this round</Text>
          {pointWinners.length > 0 ? (
            pointWinners.map(r => {
              const isSpeakerRow = r.playerId === speaker?.id;
              return (
                <View key={r.playerId} style={styles.pointRow}>
                  <Text style={styles.pointPlus}>+{r.points}</Text>
                  <Text style={styles.pointName}>{r.playerName}</Text>
                  <Text style={styles.pointTag}>
                    {isSpeakerRow
                      ? `fooled ${r.points} guess${r.points !== 1 ? 'es' : ''}`
                      : r.points === 2 ? 'perfect read' : 'half right'}
                  </Text>
                </View>
              );
            })
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
  const [stmtType, setStmtType] = useState<StatementType | null>(null);
  const [whichLie, setWhichLie] = useState<1 | 2 | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const needsLiePick = stmtType === 'lietruth';
  const canSubmit =
    s1.trim().length > 0 &&
    s2.trim().length > 0 &&
    stmtType !== null &&
    (stmtType !== 'lietruth' || whichLie !== null);

  const handleSubmit = () => {
    if (!canSubmit || submitted || !stmtType) return;
    setSubmitted(true);
    let stmt1IsLie: boolean;
    let stmt2IsLie: boolean;
    if (stmtType === 'twolies') {
      stmt1IsLie = true; stmt2IsLie = true;
    } else if (stmtType === 'twotruths') {
      stmt1IsLie = false; stmt2IsLie = false;
    } else {
      // lietruth — whichLie tells us
      stmt1IsLie = whichLie === 1;
      stmt2IsLie = whichLie === 2;
    }
    sendPlayerAction('ld-submit', {
      statement1: s1.trim(),
      statement2: s2.trim(),
      statementType: stmtType,
      stmt1IsLie,
      stmt2IsLie,
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
            Write two answers to the prompt and read them aloud. You choose the mix — nobody else knows your secret.
          </Text>

          <Text style={styles.inputLabel}>Statement 1</Text>
          <TextInput
            style={styles.stmtInput}
            placeholder="Your first answer..."
            placeholderTextColor={COLORS.text3}
            value={s1}
            onChangeText={setS1}
            maxLength={100}
            multiline
            keyboardAppearance="dark"
            inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
          />

          <Text style={styles.inputLabel}>Statement 2</Text>
          <TextInput
            style={styles.stmtInput}
            placeholder="Your second answer..."
            placeholderTextColor={COLORS.text3}
            value={s2}
            onChangeText={setS2}
            maxLength={100}
            multiline
            keyboardAppearance="dark"
            inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
          />

          <Text style={[styles.instruction, { marginTop: 4, fontWeight: '700', color: COLORS.text2 }]}>
            Choose your combination:
          </Text>

          <View style={styles.typeRow}>
            {STMT_TYPE_OPTIONS.map(opt => {
              const selected = stmtType === opt.type;
              return (
                <TouchableOpacity
                  key={opt.type}
                  style={[styles.typeBtn, selected && styles.typeBtnSelected]}
                  onPress={() => {
                    setStmtType(opt.type);
                    if (opt.type !== 'lietruth') setWhichLie(null);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.typeBtnEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.typeBtnLabel, selected && styles.typeBtnLabelSelected]}>{opt.label}</Text>
                  <Text style={styles.typeBtnSub}>{opt.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {needsLiePick && (
            <View style={styles.liePicker}>
              <Text style={styles.liePickerLabel}>Which one is the LIE?</Text>
              <View style={styles.liePickerRow}>
                {([1, 2] as const).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.liePickBtn, whichLie === n && styles.liePickBtnSelected]}
                    onPress={() => setWhichLie(n)}
                    activeOpacity={0.78}
                  >
                    <Text style={styles.liePickNum}>{n} is the</Text>
                    <Text style={[styles.liePickTag, whichLie === n && { color: COLORS.danger }]}>LIE</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <PrimaryButton
            title="Submit →"
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{ marginTop: 16 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <KeyboardDoneBar />
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
  // Statement type selector
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  typeBtnSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(124,92,246,0.12)',
  },
  typeBtnEmoji: { fontSize: 22 },
  typeBtnLabel: { fontSize: 13, fontWeight: '800', color: COLORS.text2, textAlign: 'center' },
  typeBtnLabelSelected: { color: COLORS.text },
  typeBtnSub: { fontSize: 10, color: COLORS.text3, textAlign: 'center' },
  // Lie picker (shown when lietruth is selected)
  liePicker: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    padding: 16,
    gap: 12,
  },
  liePickerLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text2 },
  liePickerRow: { flexDirection: 'row', gap: 12 },
  liePickBtn: {
    flex: 1,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  liePickBtnSelected: {
    borderColor: COLORS.danger,
    backgroundColor: '#1d0710',
  },
  liePickNum: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  liePickTag: { fontSize: 18, fontWeight: '900', color: COLORS.text3 },
  // Voting cards
  promptQuote: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.text3,
    paddingLeft: 12,
  },
  promptQuoteText: { fontSize: 15, fontWeight: '500', color: COLORS.text2, lineHeight: 22 },
  votingQuestion: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  voteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    padding: 16,
    gap: 10,
  },
  voteCardLie: { borderColor: COLORS.danger, backgroundColor: '#1d0710' },
  voteCardTruth: { borderColor: COLORS.success, backgroundColor: '#071d0f' },
  voteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voteCardNum: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  voteCardBadge: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  voteCardText: { fontSize: 17, fontWeight: '600', color: COLORS.text, lineHeight: 24 },
  voteBtnRow: { flexDirection: 'row', gap: 10 },
  voteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
  },
  voteBtnLieActive: {
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  voteBtnTruthActive: {
    borderColor: COLORS.success,
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  voteBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.text2 },
  voterProgress: { fontSize: 13, color: COLORS.text3, textAlign: 'center' },
  // Results
  typeRevealPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  typeRevealEmoji: { fontSize: 16 },
  typeRevealLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  statementReveal: { gap: 12 },
  revealCard: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    gap: 8,
  },
  revealTruth: { borderColor: COLORS.success, backgroundColor: '#071d0f' },
  revealLie: { borderColor: COLORS.danger, backgroundColor: '#1d0710' },
  revealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revealTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myPickBadge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  revealNum: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  revealTag: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  revealStatementText: { fontSize: 18, fontWeight: '700', color: COLORS.text, lineHeight: 26 },
  voteBreakdown: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  voteBreakdownItem: { flex: 1, alignItems: 'center', gap: 2 },
  voteBreakdownNum: { fontSize: 28, fontWeight: '900', lineHeight: 32 },
  voteBreakdownLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  voteBreakdownDivider: { width: 1, height: 40, backgroundColor: COLORS.border },
  voteBarTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  voteBarFill: { height: 5, borderRadius: 3 },
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
