import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import CountdownTimer from '../components/CountdownTimer';
import ScoreDisplay from '../components/ScoreDisplay';
import { COLORS } from '../constants/theme';
import { TALENT_SHOW_PROMPTS } from '../constants/prompts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TalentShow'>;
};

interface PerformResult {
  id: string;
  name: string;
  eliminated: boolean;
}

interface TSGameState {
  game: 'talentShow';
  phase: 'prep' | 'performance' | 'between' | 'voting' | 'results';
  currentPerformerIdx: number;
  currentPrompt: string;
  buzzCount: number;
  performResults: PerformResult[];
  // voting phase: who has voted
  submittedVoterIds: string[];
  // results phase:
  votes?: { voterId: string; voteeId: string }[];
  winnerId?: string | null;
}

function pickPrompt(used: Set<number>): { prompt: string; index: number } {
  const all = TALENT_SHOW_PROMPTS.map((_, i) => i);
  const available = all.filter(i => !used.has(i));
  const pool = available.length > 0 ? available : all;
  if (available.length === 0) used.clear();
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { prompt: TALENT_SHOW_PROMPTS[index], index };
}

function tallyWinner(votes: { voterId: string; voteeId: string }[]): string | null {
  if (votes.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const v of votes) counts[v.voteeId] = (counts[v.voteeId] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export default function TalentShowScreen({ navigation }: Props) {
  const { players, room, isHost, sendGameState, sendPlayerAction, setPlayers, updateRoomScores } = useGame();
  const myId = socket.id;

  const usedPromptsRef = useRef(new Set<number>());
  const votesRef = useRef<{ voterId: string; voteeId: string }[]>([]);

  const gsRef = useRef<TSGameState | null>(null);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const gs = (room?.gameState?.game === 'talentShow' ? room.gameState : null) as TSGameState | null;
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

  // ── Host: initialize secrets — server owns the initial gameState ──────────
  useEffect(() => {
    if (!isHost) return;
    votesRef.current = [];
  }, []);

  // Mark the server's initial prompt as used so subsequent performers never repeat it
  useEffect(() => {
    if (!isHost || !gs?.currentPrompt) return;
    const idx = TALENT_SHOW_PROMPTS.indexOf(gs.currentPrompt);
    if (idx >= 0) usedPromptsRef.current.add(idx);
  }, [!!gs?.currentPrompt]); // eslint-disable-line

  // ── Host: handle player actions ────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      // Audience member buzzed the performer
      if (action === 'ts-buzz' && state.phase === 'performance') {
        const newCount = state.buzzCount + 1;
        const next: TSGameState = { ...state, buzzCount: newCount };
        gsRef.current = next;
        sendGameState(next);
      }

      // Performer is done
      if (action === 'ts-done' && state.phase === 'performance') {
        const performer = allPlayers[state.currentPerformerIdx];
        const eliminated = state.buzzCount >= 2;
        const result: PerformResult = { id: performer.id, name: performer.name, eliminated };
        const newResults = [...state.performResults, result];
        const next: TSGameState = { ...state, phase: 'between', performResults: newResults };
        gsRef.current = next;
        sendGameState(next);
      }

      // A player voted for the best performer
      if (action === 'ts-vote' && state.phase === 'voting') {
        if (state.submittedVoterIds.includes(playerId)) return;
        votesRef.current = [...votesRef.current, { voterId: playerId, voteeId: data.voteeId }];
        const newVoterIds = [...state.submittedVoterIds, playerId];

        if (newVoterIds.length >= allPlayers.length) {
          // All voted — find winner
          const winnerId = tallyWinner(votesRef.current);
          if (winnerId) {
            const updatedPlayers = allPlayers.map(p =>
              p.id === winnerId ? { ...p, score: p.score + 1 } : p
            );
            setPlayers(updatedPlayers);
            updateRoomScores(updatedPlayers);
          }
          const next: TSGameState = {
            ...state,
            phase: 'results',
            submittedVoterIds: newVoterIds,
            votes: votesRef.current,
            winnerId,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: TSGameState = { ...state, submittedVoterIds: newVoterIds };
          gsRef.current = next;
          sendGameState(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]); // eslint-disable-line

  // ── Host: advance from between → next performer or voting/results ──────────
  const handleNextPerformer = () => {
    if (!isHost || !gs) return;
    const nextIdx = gs.currentPerformerIdx + 1;

    if (nextIdx >= players.length) {
      // All performed
      const survivors = gs.performResults.filter(r => !r.eliminated);
      if (survivors.length === 0) {
        const next: TSGameState = { ...gs, phase: 'results', winnerId: null };
        gsRef.current = next;
        sendGameState(next);
      } else if (survivors.length === 1) {
        const winner = survivors[0];
        const updatedPlayers = players.map(p =>
          p.id === winner.id ? { ...p, score: p.score + 1 } : p
        );
        setPlayers(updatedPlayers);
        updateRoomScores(updatedPlayers);
        const next: TSGameState = { ...gs, phase: 'results', winnerId: winner.id };
        gsRef.current = next;
        sendGameState(next);
      } else {
        // Multiple survivors — go to voting
        votesRef.current = [];
        const next: TSGameState = { ...gs, phase: 'voting', submittedVoterIds: [] };
        gsRef.current = next;
        sendGameState(next);
      }
    } else {
      const { prompt, index } = pickPrompt(usedPromptsRef.current);
      usedPromptsRef.current.add(index);
      const next: TSGameState = {
        ...gs,
        phase: 'prep',
        currentPerformerIdx: nextIdx,
        currentPrompt: prompt,
        buzzCount: 0,
      };
      gsRef.current = next;
      sendGameState(next);
    }
  };

  // ── Host: play again ───────────────────────────────────────────────────────
  const handlePlayAgain = () => {
    if (!isHost) return;
    const { prompt, index } = pickPrompt(usedPromptsRef.current);
    usedPromptsRef.current.add(index);
    votesRef.current = [];
    const next: TSGameState = {
      game: 'talentShow',
      phase: 'prep',
      currentPerformerIdx: 0,
      currentPrompt: prompt,
      buzzCount: 0,
      performResults: [],
      submittedVoterIds: [],
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

  const performer = players[gs.currentPerformerIdx ?? 0];
  const iAmPerformer = myId === performer?.id;
  const performResults = gs.performResults ?? [];
  const lastResult = performResults[performResults.length - 1];

  // ── Phase: prep ────────────────────────────────────────────────────────────
  if (gs.phase === 'prep') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎭 {performer?.name}'s turn</Text>
          </View>
          <Text style={styles.sectionLabel}>Your challenge</Text>
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>{gs.currentPrompt}</Text>
          </View>
          <View style={styles.timerArea}>
            {/* Host advances after countdown; others just watch */}
            <CountdownTimer
              seconds={10}
              onComplete={isHost ? () => {
                if (!gsRef.current) return;
                const next: TSGameState = { ...gsRef.current, phase: 'performance', buzzCount: 0 };
                gsRef.current = next;
                sendGameState(next);
              } : () => {}}
            />
          </View>
          <Text style={styles.hint}>
            {iAmPerformer ? 'Get ready — you\'re up!' : `${performer?.name} is preparing...`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: performance ─────────────────────────────────────────────────────
  if (gs.phase === 'performance') {
    if (iAmPerformer) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={[styles.screen, styles.performScreen]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎤 You're performing</Text>
            </View>
            <Text style={styles.performPrompt}>{gs.currentPrompt}</Text>
            <View style={styles.buzzArea}>
              <Text style={styles.buzzCount}>{gs.buzzCount ?? 0}</Text>
              <Text style={styles.buzzSubtext}>buzz{(gs.buzzCount ?? 0) !== 1 ? 'es' : ''}{'  ·  '}2 = out</Text>
            </View>
            <SecondaryButton title="Done →" onPress={() => sendPlayerAction('ts-done', {})} />
          </View>
        </SafeAreaView>
      );
    }
    // Audience — show buzz button
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.screen, styles.performScreen]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎤 {performer?.name} is performing</Text>
          </View>
          <Text style={styles.performPrompt}>{gs.currentPrompt}</Text>
          <View style={styles.buzzArea}>
            <Text style={styles.buzzCount}>{gs.buzzCount ?? 0}</Text>
            <Text style={styles.buzzSubtext}>buzz{(gs.buzzCount ?? 0) !== 1 ? 'es' : ''}{'  ·  '}2 = out</Text>
            <TouchableOpacity
              style={[styles.buzzBtn, (gs.buzzCount ?? 0) >= 2 && styles.buzzBtnDisabled]}
              onPress={() => (gs.buzzCount ?? 0) < 2 && sendPlayerAction('ts-buzz', {})}
              activeOpacity={0.8}
            >
              <Text style={styles.buzzBtnText}>BUZZ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: between ─────────────────────────────────────────────────────────
  if (gs.phase === 'between' && lastResult) {
    const isElim = lastResult.eliminated;
    const nextName = players[gs.currentPerformerIdx + 1]?.name;
    const isLastPerformer = gs.currentPerformerIdx + 1 >= players.length;

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.betweenScreen}>
          <Text style={styles.bigEmoji}>{isElim ? '💀' : '🌟'}</Text>
          <Text style={styles.betweenName}>{lastResult.name}</Text>
          <Text style={[styles.betweenStatus, { color: isElim ? COLORS.danger : COLORS.success }]}>
            {isElim ? 'ELIMINATED' : 'SURVIVED'}
          </Text>
          <Text style={styles.betweenSub}>
            {isElim ? 'Too many buzzes. Tough crowd.' : 'The crowd stayed quiet. Impressive!'}
          </Text>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {gs.currentPerformerIdx + 1} of {players.length} performed
            </Text>
          </View>
          {isHost ? (
            <PrimaryButton
              title={isLastPerformer ? 'See Voting →' : `Next: ${nextName} →`}
              onPress={handleNextPerformer}
              style={styles.betweenBtn}
            />
          ) : (
            <Text style={styles.waitSub}>Waiting for host to continue...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ──────────────────────────────────────────────────────────
  if (gs.phase === 'voting') {
    const candidates = (gs.performResults ?? []).filter(r => !r.eliminated);
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
            <Text style={styles.badgeText}>🗳️ Your vote</Text>
          </View>
          <Text style={styles.votingTitle}>Who performed best?</Text>
          <Text style={styles.votingSubtitle}>{votesIn} / {players.length} voted</Text>
          <View style={styles.candidateList}>
            {candidates.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.candidateRow, myId === c.id && styles.candidateSelf]}
                onPress={() => myId !== c.id && sendPlayerAction('ts-vote', { voteeId: c.id })}
                activeOpacity={0.78}
              >
                <Text style={styles.candidateName}>{c.name}</Text>
                {myId === c.id
                  ? <Text style={styles.candidateSelfLabel}>that's you</Text>
                  : <Text style={styles.candidateArrow}>→</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: results ─────────────────────────────────────────────────────────
  const winner = gs.winnerId ? players.find(p => p.id === gs.winnerId) : null;
  const voteCounts: Record<string, number> = {};
  for (const v of (gs.votes ?? [])) {
    voteCounts[v.voteeId] = (voteCounts[v.voteeId] ?? 0) + 1;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.resultsTitle}>Round over.</Text>
        <View style={styles.winnerBlock}>
          {winner ? (
            <>
              <Text style={styles.winnerEmoji}>🏆</Text>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerSub}>+1 point</Text>
            </>
          ) : (
            <>
              <Text style={styles.winnerEmoji}>💀</Text>
              <Text style={styles.noWinnerName}>No winner</Text>
              <Text style={styles.noWinnerSub}>Everyone got buzzed.</Text>
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>Performances</Text>
        <View style={styles.perfTable}>
          {(gs.performResults ?? []).map(r => (
            <View key={r.id} style={styles.perfRow}>
              <Text style={styles.perfName}>{r.name}</Text>
              {voteCounts[r.id] != null && (
                <Text style={styles.perfVotes}>{voteCounts[r.id]} vote{voteCounts[r.id] !== 1 ? 's' : ''}</Text>
              )}
              <Text style={[styles.perfStatus, { color: r.eliminated ? COLORS.danger : COLORS.success }]}>
                {r.eliminated ? 'ELIM' : 'SAFE'}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Scores</Text>
        <ScoreDisplay players={players} highlightId={gs.winnerId ?? undefined} />

        <View style={styles.actions}>
          {isHost ? (
            <>
              <PrimaryButton title="Play Another Round" onPress={handlePlayAgain} />
              <SecondaryButton title="Choose Different Game" onPress={() => navigation.goBack()} />
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
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16,
  },
  performScreen: { alignItems: 'center' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 20,
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
    paddingVertical: 24,
  },
  promptText: { fontSize: 22, fontWeight: '800', color: COLORS.text, lineHeight: 30, letterSpacing: -0.3 },
  timerArea: { marginTop: 'auto', alignItems: 'center', marginBottom: 8 },
  hint: { fontSize: 13, color: COLORS.text3, textAlign: 'center' },
  performPrompt: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text2,
    textAlign: 'center',
    maxWidth: 280,
  },
  buzzArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  buzzCount: { fontSize: 64, fontWeight: '900', color: COLORS.text },
  buzzSubtext: { fontSize: 13, color: COLORS.text3 },
  buzzBtn: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 30,
    shadowOpacity: 0.35,
  },
  buzzBtnDisabled: { opacity: 0.3 },
  buzzBtnText: { fontSize: 36, fontWeight: '900', color: '#FFFFFF', letterSpacing: 3 },
  betweenScreen: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bigEmoji: { fontSize: 60, textAlign: 'center' },
  betweenName: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginTop: 12 },
  betweenStatus: { fontSize: 22, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  betweenSub: { fontSize: 14, color: COLORS.text2, marginTop: 8 },
  progressPill: {
    marginTop: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  progressText: { fontSize: 12, color: COLORS.text3 },
  betweenBtn: { marginTop: 32, width: '100%' },
  votingTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  votingSubtitle: { fontSize: 13, color: COLORS.text2 },
  candidateList: { gap: 10, marginTop: 8 },
  candidateRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  candidateSelf: { opacity: 0.4 },
  candidateName: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.text },
  candidateArrow: { fontSize: 18, color: COLORS.text2 },
  candidateSelfLabel: { fontSize: 12, color: COLORS.text3, fontStyle: 'italic' },
  resultsTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  winnerBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 4,
  },
  winnerEmoji: { fontSize: 48 },
  winnerName: { fontSize: 24, fontWeight: '800', color: COLORS.accentHi, marginTop: 8 },
  winnerSub: { fontSize: 13, color: COLORS.text2, marginTop: 4 },
  noWinnerName: { fontSize: 24, fontWeight: '800', color: COLORS.text2, marginTop: 8 },
  noWinnerSub: { fontSize: 13, color: COLORS.text3, marginTop: 4 },
  perfTable: { backgroundColor: COLORS.surface, borderRadius: 8, gap: 6, overflow: 'hidden' },
  perfRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  perfName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  perfVotes: { fontSize: 12, color: COLORS.text3, marginRight: 8 },
  perfStatus: { fontSize: 12, fontWeight: '700' },
  actions: { gap: 10, alignItems: 'center' },
});
