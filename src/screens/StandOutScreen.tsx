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
import { COLORS, RADIUS, FONTS } from '../constants/theme';
import {
  pickStandOutPrompt,
  normalizeAnswer,
  STAND_OUT_WIN_SCORE,
  Answer,
  ScoreDelta,
} from '../utils/promptUtils';
import { StandOutPrompt } from '../constants/gamePrompts';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import GameIntro from '../components/GameIntro';
import PromptCard from '../components/PromptCard';
import PhaseTransition from '../components/PhaseTransition';


type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StandOut'>;
};

// ─── Challenge types ──────────────────────────────────────────────────────────

interface SOChallenge {
  targetPlayerId: string;
  challengerId: string;
  /** All players except challenger and target — pre-computed when challenge is created */
  eligibleVoterIds: string[];
  votes: Record<string, 'approve' | 'reject'>;
  resolved: boolean;
  succeeded: boolean;
}

// penalty applied to the challenged player's score when a challenge succeeds
const CHALLENGE_PENALTY = -10;

// ─── Game state ───────────────────────────────────────────────────────────────

interface SOGameState {
  game: 'standOut';
  phase: 'intro' | 'prompt' | 'entering' | 'reveal' | 'game-over';
  roundNumber: number;
  currentPrompt: StandOutPrompt;
  targetScore?: number; // set once before round 1, carried through all rounds
  // Who has submitted this round (not their answer — kept secret until reveal)
  submittedPlayerIds: string[];
  // Populated at reveal
  answers?: Answer[];
  roundDeltas?: ScoreDelta[];
  winnerName?: string;
  // Challenges: keyed by targetPlayerId (one challenge per answer)
  challenges?: Record<string, SOChallenge>;
}

export default function StandOutScreen({ navigation }: Props) {
  const { players, room, isHost, currentUser, sendGameState, sendPlayerAction, setPlayers, updateRoomScores, startGame } = useGame();
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

  const usedPromptIds = useRef(new Set<string>());

  const gsRef = useRef<SOGameState | null>(null);
  const allPlayers = room?.players ?? players;
  const playersRef = useRef(allPlayers);
  useEffect(() => { playersRef.current = room?.players ?? players; }, [room?.players, players]);

  const gs = (room?.gameState?.game === 'standOut' ? room.gameState : null) as SOGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // headerLeft (Leave button) is set globally in App.tsx screenOptions


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
  // Optimistic submitted flag — set immediately on submit so the UI transitions
  // to "locked in" without waiting for the backend roundtrip.
  const [hasSubmittedLocally, setHasSubmittedLocally] = useState(false);
  // Reset optimistic flag + clear stale input whenever the round/phase changes
  useEffect(() => {
    setHasSubmittedLocally(false);
    setInputText('');
  }, [gs?.roundNumber, gs?.phase]);

  // Entering-phase countdown (10 s). Resets each time the phase becomes 'entering'.
  const [enteringSecondsLeft, setEnteringSecondsLeft] = useState(10);
  const timerExpiredSentRef = useRef(false);

  useEffect(() => {
    if (gs?.phase !== 'entering') {
      setEnteringSecondsLeft(10);
      timerExpiredSentRef.current = false;
      return;
    }
    const interval = setInterval(() => {
      setEnteringSecondsLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [gs?.phase]); // eslint-disable-line

  // Host fires so-timer-expired when the entering countdown hits 0
  useEffect(() => {
    if (
      enteringSecondsLeft === 0 &&
      gs?.phase === 'entering' &&
      isHost &&
      !timerExpiredSentRef.current
    ) {
      timerExpiredSentRef.current = true;
      sendPlayerAction('so-timer-expired', {});
    }
  }, [enteringSecondsLeft]); // eslint-disable-line

  // ── Host: reset scores at game start ─────────────────────────────────────────
  // Answer collection and scoring are now handled by the backend.
  useEffect(() => {
    if (!isHost) return;
    const resetPlayers = players.map(p => ({ ...p, score: 0 }));
    setPlayers(resetPlayers);
    updateRoomScores(resetPlayers);
  }, []); // eslint-disable-line

  // Mark the server's initial prompt ID as used so round advances never repeat it
  useEffect(() => {
    if (!isHost || !gs?.currentPrompt?.id) return;
    usedPromptIds.current.add(gs.currentPrompt.id);
  }, [!!gs?.currentPrompt]); // eslint-disable-line


  // ── Host: handle challenge actions (server relays so-challenge / so-challenge-vote)
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      // ── Challenge initiation ──────────────────────────────────────────────
      if (action === 'so-challenge' && state.phase === 'reveal') {
        const { targetPlayerId } = data as { targetPlayerId: string };

        if (playerId === targetPlayerId) return;
        if (state.challenges?.[targetPlayerId]) return;
        const answers = state.answers ?? [];
        if (!answers.find(a => a.playerId === targetPlayerId)) return;

        const eligibleVoterIds = allPlayers
          .map(p => p.id)
          .filter(id => id !== playerId && id !== targetPlayerId);

        if (eligibleVoterIds.length === 0) return;

        const challenge: SOChallenge = {
          targetPlayerId,
          challengerId: playerId,
          eligibleVoterIds,
          votes: {},
          resolved: false,
          succeeded: false,
        };

        const next: SOGameState = {
          ...state,
          challenges: { ...(state.challenges ?? {}), [targetPlayerId]: challenge },
        };
        gsRef.current = next;
        sendGameState(next);
      }

      // ── Challenge vote ────────────────────────────────────────────────────
      if (action === 'so-challenge-vote' && state.phase === 'reveal') {
        const { targetPlayerId, vote } = data as { targetPlayerId: string; vote: 'approve' | 'reject' };
        const challenge = state.challenges?.[targetPlayerId];
        if (!challenge || challenge.resolved) return;
        if (!challenge.eligibleVoterIds.includes(playerId)) return;
        if (challenge.votes[playerId]) return;

        const updatedVotes: Record<string, 'approve' | 'reject'> = { ...challenge.votes, [playerId]: vote };
        const allVoted = challenge.eligibleVoterIds.every(id => updatedVotes[id]);

        if (!allVoted) {
          const next: SOGameState = {
            ...state,
            challenges: {
              ...state.challenges,
              [targetPlayerId]: { ...challenge, votes: updatedVotes },
            },
          };
          gsRef.current = next;
          sendGameState(next);
          return;
        }

        const approveCount = Object.values(updatedVotes).filter(v => v === 'approve').length;
        const rejectCount = Object.values(updatedVotes).filter(v => v === 'reject').length;
        const succeeded = approveCount > rejectCount;

        if (succeeded) {
          const nextPlayers = playersRef.current.map(p =>
            p.id === targetPlayerId
              ? { ...p, score: Math.max(0, p.score + CHALLENGE_PENALTY) }
              : p
          );
          setPlayers(nextPlayers);
          updateRoomScores(nextPlayers);
        }

        const resolvedChallenge: SOChallenge = {
          ...challenge,
          votes: updatedVotes,
          resolved: true,
          succeeded,
        };

        const next: SOGameState = {
          ...state,
          challenges: { ...state.challenges, [targetPlayerId]: resolvedChallenge },
        };
        gsRef.current = next;
        sendGameState(next);
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
    const next: SOGameState = {
      game: 'standOut',
      phase: 'prompt',
      roundNumber: nextRound,
      currentPrompt: prompt,
      targetScore: gs.targetScore,
      submittedPlayerIds: [],
    };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (gs?.phase === 'intro' || (!gs)) {
    return (
      <GameIntro
        emoji="⚡"
        title="Stand Out"
        tagline="Unique answers only. Think different to win."
        rules={[
          { emoji: '❓', text: 'A question appears. Everyone has 10 seconds to submit an answer.' },
          { emoji: '✨', text: 'Unique answer = +10 points. Streak bonuses: +15, +20, +25.' },
          { emoji: '💥', text: 'If someone else said the same thing, everyone who matched loses 10 points.' },
          { emoji: '🏆', text: 'First to the target score wins!' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  // ── Loading (no game state yet) ────────────────────────────────────────────
  if (!gs || !gs.currentPrompt) {
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

  // ── Target score setup — shown to all players before round 1 starts ─────────
  // Host picks 100 / 200 / 500. Non-hosts wait. Once host picks, targetScore
  // is broadcast in game state and every client advances past this screen.
  if (!gs.targetScore) {
    const handleSelectTarget = (target: number) => {
      if (!isHost) return;
      const next = { ...gs, targetScore: target };
      gsRef.current = next;
      sendGameState(next);
    };
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.waitTitle}>Stand Out</Text>
          <Text style={styles.waitSub}>
            {isHost ? 'Choose a target score to win:' : 'Waiting for host to choose a target score...'}
          </Text>
          {isHost && ([50, 100, 200] as const).map(t => (
            <PrimaryButton key={t} title={`Race to ${t}`} onPress={() => handleSelectTarget(t)} />
          ))}
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  const iHaveSubmitted = hasSubmittedLocally || (gs.submittedPlayerIds ?? []).includes(myId ?? '');

  // ── Phase: game-over ───────────────────────────────────────────────────────
  if (gs.phase === 'game-over') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.gameOverEmoji}>🏆</Text>
          <Text style={styles.gameOverTitle}>{gs.winnerName} wins!</Text>
          <Text style={styles.gameOverSub}>First to {gs.targetScore ?? STAND_OUT_WIN_SCORE} points.</Text>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Final Scores</Text>
          <ScoreDisplay players={players} />
          <View style={styles.actions}>
            {isHost ? (
              <>
                <PrimaryButton title="Play Again" onPress={() => startGame('standOut')} />
                <SecondaryButton title="Choose New Game" onPress={() => navigation.navigate('GameSelect')} />
              </>
            ) : (
              <Text style={styles.waitSub}>Waiting for host to continue...</Text>
            )}
          </View>
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: prompt ──────────────────────────────────────────────────────────
  if (gs.phase === 'prompt') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.centeredContainer}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>ROUND {gs.roundNumber}</Text>
          </View>
          <Text style={styles.promptLabel}>Stand out from the crowd</Text>
          <PromptCard text={gs.currentPrompt.text} accentColor="#F59E0B" />
          <Text style={styles.timerInstruction}>Think of a unique answer!</Text>
          <CountdownTimer
            seconds={5}
            onComplete={isHost ? () => {
              console.log('[SO] [host] 5s prompt timer fired — transitioning to entering');
              if (!gsRef.current) return;
              const next: SOGameState = { ...gsRef.current, phase: 'entering', submittedPlayerIds: [] };
              gsRef.current = next;
              sendGameState(next);
            } : () => {}}
          />
          <Text style={styles.difficultyTag}>{(gs.currentPrompt?.difficulty ?? '').toUpperCase()}</Text>
        </View>

        </PhaseTransition>
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
          <PhaseTransition phaseKey={gs.phase}>
  
          <View style={styles.centeredContainer}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Answer locked in!</Text>
            <Text style={styles.waitSub}>{answered} / {total} players answered</Text>
            <EnteringTimer secondsLeft={enteringSecondsLeft} />
          </View>
  
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.centeredContainer}>
            <PromptCard text={gs.currentPrompt.text} accentColor="#F59E0B" />
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
                setHasSubmittedLocally(true);
              }}
              maxLength={60}
              keyboardAppearance="dark"
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
            />
            <PrimaryButton
              title="Submit Answer →"
              onPress={() => {
                const t = inputText.trim();
                if (!t) return;
                sendPlayerAction('so-answer', { text: t });
                setInputText('');
                setHasSubmittedLocally(true);
              }}
              disabled={!inputText.trim()}
              style={{ marginTop: 8 }}
            />
            <EnteringTimer secondsLeft={enteringSecondsLeft} />
            <Text style={styles.playerProgress}>{answered} / {total} answered</Text>
          </View>
        </KeyboardAvoidingView>
        <KeyboardDoneBar />

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: reveal ──────────────────────────────────────────────────────────
  const answers = gs.answers ?? [];
  const roundDeltas = gs.roundDeltas ?? [];
  const challenges: Record<string, SOChallenge> = gs.challenges ?? {};

  const answerGroups = new Map<string, Answer[]>();
  for (const ans of answers) {
    const key = normalizeAnswer(ans.text);
    if (!answerGroups.has(key)) answerGroups.set(key, []);
    answerGroups.get(key)!.push(ans);
  }
  const isDuplicate = (ans: Answer) => (answerGroups.get(normalizeAnswer(ans.text))?.length ?? 0) > 1;
  const topScore = players.length > 0 ? Math.max(...players.map(p => p.score)) : 0;

  // Challenge helpers
  const isInvalidated = (playerId: string) => {
    const c = challenges[playerId];
    return c?.resolved && c.succeeded;
  };
  const canChallenge = (targetPlayerId: string) =>
    targetPlayerId !== myId &&
    !challenges[targetPlayerId] &&
    players.length >= 3; // need at least 1 eligible voter

  return (
    <SafeAreaView style={styles.safe}>
      <PhaseTransition phaseKey={gs.phase}>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.revealTitle}>Round {gs.roundNumber} results</Text>
        <View style={styles.promptQuoteBox}>
          <Text style={styles.promptQuoteText}>"{gs.currentPrompt?.text}"</Text>
        </View>

        <View style={styles.answersBlock}>
          {answers.map(ans => {
            const delta = roundDeltas.find(d => d.playerId === ans.playerId);
            const dup = isDuplicate(ans);
            const invalidated = isInvalidated(ans.playerId);
            const challenge = challenges[ans.playerId];

            return (
              <View key={ans.playerId}>
                {/* Answer row */}
                <View style={[
                  styles.answerRow,
                  invalidated ? styles.answerRowInvalidated : dup ? styles.answerRowDup : styles.answerRowUnique,
                ]}>
                  <View style={styles.answerLeft}>
                    <Text style={styles.answerName}>{ans.playerName}</Text>
                    <Text style={[
                      styles.answerText,
                      { color: invalidated ? COLORS.text3 : dup ? COLORS.danger : COLORS.success },
                      invalidated && styles.strikethrough,
                    ]}>
                      {ans.text}
                    </Text>
                  </View>
                  <View style={styles.deltaCol}>
                    {delta && !invalidated && (
                      <>
                        <Text style={[styles.deltaNum, { color: delta.delta >= 0 ? COLORS.success : COLORS.danger }]}>
                          {delta.delta >= 0 ? '+' : ''}{delta.delta}
                        </Text>
                        {dup && <Text style={styles.dupTag}>duplicate</Text>}
                      </>
                    )}
                    {invalidated && (
                      <Text style={styles.invalidatedTag}>−{Math.abs(CHALLENGE_PENALTY)} challenged</Text>
                    )}
                  </View>
                </View>

                {/* Challenge section */}
                <ChallengeSection
                  challenge={challenge}
                  myId={myId ?? ''}
                  canChallenge={canChallenge(ans.playerId)}
                  onChallenge={() => sendPlayerAction('so-challenge', { targetPlayerId: ans.playerId })}
                  onVote={(vote) => sendPlayerAction('so-challenge-vote', { targetPlayerId: ans.playerId, vote })}
                  players={players}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.raceBox}>
          <Text style={styles.raceLabel}>RACE TO {gs.targetScore ?? STAND_OUT_WIN_SCORE}</Text>
          {[...players].sort((a, b) => b.score - a.score).map(p => {
            // Width: proportional to score, minimum 3% for nonzero scores so a
            // small score is still visibly non-zero against the track.
            const winTarget = gs.targetScore ?? STAND_OUT_WIN_SCORE;
            const pct = (p.score / winTarget) * 100;
            const barWidth = (p.score > 0
              ? `${Math.min(100, Math.max(3, pct))}%`
              : '0%') as `${number}%`;
            // Leader bar gets accent purple; all others get a visible-but-dimmer
            // colour. Previously non-leaders used COLORS.surface2 which is the
            // same colour as the track background — making those bars invisible.
            const barColor = p.score > 0 && p.score === topScore
              ? COLORS.accent
              : COLORS.borderHi;
            return (
              <View key={p.id} style={styles.raceRow}>
                <Text style={styles.raceName}>{p.name}</Text>
                <View style={styles.raceBarTrack}>
                  <View style={[styles.raceBarFill, { width: barWidth, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.raceScore}>{p.score}</Text>
              </View>
            );
          })}
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

      </PhaseTransition>
    </SafeAreaView>
  );
}

// ─── EnteringTimer sub-component ─────────────────────────────────────────────
// Displays the seconds left during the entering phase. Rendered at component
// level via enteringSecondsLeft so it never resets when the view switches.

function EnteringTimer({ secondsLeft }: { secondsLeft: number }) {
  const ratio = secondsLeft / 10;
  const color = ratio > 0.6 ? COLORS.success : ratio > 0.3 ? COLORS.warning : COLORS.danger;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.enteringTimerNum, { color }]}>{secondsLeft}</Text>
      <Text style={styles.enteringTimerLabel}>sec</Text>
    </View>
  );
}

// ─── ChallengeSection sub-component ──────────────────────────────────────────

interface ChallengeSectionProps {
  challenge: SOChallenge | undefined;
  myId: string;
  canChallenge: boolean;
  onChallenge: () => void;
  onVote: (vote: 'approve' | 'reject') => void;
  players: { id: string; name: string }[];
}

function ChallengeSection({ challenge, myId, canChallenge, onChallenge, onVote, players }: ChallengeSectionProps) {
  if (!challenge && !canChallenge) return null;

  if (!challenge) {
    // No challenge yet — show button
    return (
      <TouchableOpacity style={styles.challengeBtn} onPress={onChallenge}>
        <Text style={styles.challengeBtnText}>Challenge</Text>
      </TouchableOpacity>
    );
  }

  const iAmEligibleVoter = challenge.eligibleVoterIds.includes(myId);
  const myVote = challenge.votes[myId];

  if (challenge.resolved) {
    return (
      <View style={styles.challengeResolved}>
        <Text style={styles.challengeResolvedText}>
          {challenge.succeeded ? 'Challenge succeeded — answer invalidated' : 'Challenge failed'}
        </Text>
      </View>
    );
  }

  // Pending challenge
  const voteCount = Object.keys(challenge.votes).length;
  const totalEligible = challenge.eligibleVoterIds.length;
  const challengerName = players.find(p => p.id === challenge.challengerId)?.name ?? 'Someone';

  return (
    <View style={styles.challengePending}>
      <Text style={styles.challengePendingLabel}>
        {challengerName} challenged this answer · {voteCount}/{totalEligible} voted
      </Text>
      {iAmEligibleVoter && !myVote && (
        <View style={styles.voteRow}>
          <TouchableOpacity
            style={[styles.voteBtn, styles.voteBtnApprove]}
            onPress={() => onVote('approve')}
          >
            <Text style={styles.voteBtnText}>Uphold</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voteBtn, styles.voteBtnReject]}
            onPress={() => onVote('reject')}
          >
            <Text style={styles.voteBtnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
      {iAmEligibleVoter && myVote && (
        <Text style={styles.votedLabel}>You voted · waiting for others…</Text>
      )}
      {!iAmEligibleVoter && (
        <Text style={styles.votedLabel}>Waiting for vote…</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  waitTitle: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.text, textAlign: 'center' },
  waitSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: FONTS.bold,
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
  roundBadgeText: { fontSize: 12, fontFamily: FONTS.bold, color: COLORS.text2, letterSpacing: 1.5 },
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
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  timerInstruction: { fontSize: 14, color: COLORS.text2 },
  difficultyTag: { fontSize: 10, fontFamily: FONTS.bold, color: COLORS.text3, letterSpacing: 2 },
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
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  playerProgress: { fontSize: 13, color: COLORS.text3, marginTop: 8 },
  enteringTimerNum: { fontSize: 80, fontFamily: FONTS.extrabold, letterSpacing: -3 },
  enteringTimerLabel: { fontSize: 12, color: COLORS.text3, fontFamily: FONTS.medium, marginTop: -8 },
  revealTitle: { fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5, color: COLORS.text },
  promptQuoteBox: { borderLeftWidth: 2, borderLeftColor: COLORS.text3, paddingLeft: 12 },
  promptQuoteText: { fontSize: 15, fontFamily: FONTS.medium, color: COLORS.text2, lineHeight: 22 },
  answersBlock: { gap: 4 },
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
  answerRowInvalidated: { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
  answerLeft: { flex: 1, gap: 2 },
  answerName: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.text2 },
  answerText: { fontSize: 18, fontFamily: FONTS.extrabold },
  strikethrough: { textDecorationLine: 'line-through' },
  deltaCol: { alignItems: 'flex-end', gap: 2 },
  deltaNum: { fontSize: 20, fontFamily: FONTS.extrabold },
  dupTag: { fontSize: 10, color: COLORS.danger, fontFamily: FONTS.semibold },
  invalidatedTag: { fontSize: 11, color: COLORS.text3, fontFamily: FONTS.semibold },
  // Challenge UI
  challengeBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  challengeBtnText: { fontSize: 12, color: COLORS.text3, fontFamily: FONTS.semibold },
  challengePending: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 8,
    gap: 8,
  },
  challengePendingLabel: { fontSize: 13, color: COLORS.text2, fontFamily: FONTS.medium },
  voteRow: { flexDirection: 'row', gap: 8 },
  voteBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  voteBtnApprove: { backgroundColor: '#071d0f', borderWidth: 1, borderColor: COLORS.success },
  voteBtnReject: { backgroundColor: '#1d0710', borderWidth: 1, borderColor: COLORS.danger },
  voteBtnText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text },
  votedLabel: { fontSize: 12, color: COLORS.text3 },
  challengeResolved: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  challengeResolvedText: { fontSize: 12, color: COLORS.text3, fontStyle: 'italic' },
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
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  raceName: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.text, width: 70 },
  raceBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  raceBarFill: { height: '100%', borderRadius: RADIUS.full },
  raceScore: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text, width: 30, textAlign: 'right' },
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: { fontSize: 36, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -1, textAlign: 'center' },
  gameOverSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
});
