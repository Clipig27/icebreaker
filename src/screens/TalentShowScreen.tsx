import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { COLORS, FONTS } from '../constants/theme';
import GameIntro from '../components/GameIntro';
import PhaseTransition from '../components/PhaseTransition';

import {
  TALENT_SHOW_PROMPTS,
  TALENT_SHOW_TIEBREAK_PROMPTS,
  TALENT_SHOW_FINAL_PROMPTS,
} from '../prompts/talentShow';

// ─── Types ────────────────────────────────────────────────────────────────────

type TSPhase =
  | 'intro'
  | 'round-intro'
  | 'prep'
  | 'get-ready'
  | 'performing'
  | 'r1-neutral-vote'
  | 'r1-result'
  | 'r2-voting'
  | 'tiebreak-prep'
  | 'tiebreak-vote'
  | 'r3-voting'
  | 'winner';

interface TSPerformResult {
  playerId: string;
  playerName: string;
  outcome: 'advanced' | 'eliminated' | 'golden';
  buzzCount: number;
  goldenCount: number;
}

interface TSGameState {
  game: 'talentShow';
  round: 1 | 2 | 3;
  phase: TSPhase;
  prompt: string;
  timerStartedAt: number | null;
  timerDuration: number;
  nextActDuration: number;

  performerQueue: string[];
  currentPerformerIdx: number;

  buzzedPlayerIds: string[];
  goldenPlayerIds: string[];
  totalVoters: number;

  r1Results: TSPerformResult[];
  eliminatedPlayerIds: string[];

  r2Results: Array<{ playerId: string; playerName: string }>;
  r2VoterIds: string[];
  r2Votes: Array<{ voterId: string; voteFor: string }>;
  r2SubmittedVoterIds: string[];

  tiebreakerCandidates: string[];
  tiebreakerSpotsNeeded: number;
  tiebreakerAlreadyAdvanced: string[];
  tbVotes: Array<{ voterId: string; voteFor: string }>;
  tbSubmittedVoterIds: string[];

  tbVoterIds: string[];

  r1NeutralVoterIds: string[];
  r1NeutralVotes: Array<{ voterId: string; decision: 'advance' | 'eliminate' }>;
  r1NeutralSubmittedIds: string[];

  r3VoterIds: string[];

  r3FinalistIds: string[];
  r3Results: Array<{ playerId: string; playerName: string }>;
  r3Votes: Array<{ voterId: string; voteFor: string }>;
  r3SubmittedVoterIds: string[];

  winnerId: string | null;
  runnerUpId: string | null;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TalentShow'>;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], exclude: Set<number>): { item: T; index: number } {
  const available = arr.map((_, i) => i).filter(i => !exclude.has(i));
  const pool = available.length > 0 ? available : arr.map((_, i) => i);
  if (available.length === 0) exclude.clear();
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { item: arr[index], index };
}

function tallyVotes(
  votes: Array<{ voterId: string; voteFor: string }>
): Array<{ id: string; count: number }> {
  const map: Record<string, number> = {};
  for (const v of votes) map[v.voteFor] = (map[v.voteFor] ?? 0) + 1;
  return Object.entries(map)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

function computeR2Advancement(
  votes: Array<{ voterId: string; voteFor: string }>,
  performerIds: string[]
): { advanced: string[]; tied: string[]; spotsLeft: number } {
  const tally = tallyVotes(votes);
  const allCounts = performerIds
    .map(id => ({
      id,
      count: tally.find(t => t.id === id)?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const advanced: string[] = [];
  const spots = 2;
  let needed = spots;

  while (needed > 0) {
    const nextEntry = allCounts[spots - needed];
    if (!nextEntry) break;
    const nextCount = nextEntry.count;
    const atCount = allCounts.filter(p => p.count === nextCount);
    const spotsRemaining = needed;
    if (atCount.length <= spotsRemaining) {
      advanced.push(...atCount.map(p => p.id));
      needed -= atCount.length;
    } else {
      return { advanced, tied: atCount.map(p => p.id), spotsLeft: spotsRemaining };
    }
  }
  return { advanced, tied: [], spotsLeft: 0 };
}

// ─── useServerTimer ───────────────────────────────────────────────────────────

function useServerTimer(startedAt: number | null, durationMs: number) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => forceUpdate(n => n + 1), 200);
    return () => clearInterval(interval);
  }, [startedAt]); // eslint-disable-line

  const msLeft = startedAt
    ? Math.min(durationMs, Math.max(0, durationMs - (Date.now() - startedAt)))
    : durationMs;
  return { secondsLeft: Math.ceil(msLeft / 1000), isExpired: msLeft === 0 };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TalentShowScreen({ navigation }: Props) {
  const {
    players,
    room,
    isHost,
    sendGameState,
    sendPlayerAction,
    setPlayers,
    updateRoomScores,
    currentUser,
  } = useGame();
  // Stable player ID — match by persistentId first (handles race where currentUser
  // loads after room join), then fall back to socket.id match, then best-guess.
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


  // Host-only refs
  const gsRef = useRef<TSGameState | null>(null);
  const playersRef = useRef(room?.players ?? players);
  useEffect(() => {
    playersRef.current = room?.players ?? players;
  }, [room?.players, players]);
  const usedR1R2Ref = useRef(new Set<number>());
  const usedTBRef = useRef(new Set<number>());
  const usedFinalRef = useRef(new Set<number>());
  const r2VotesRef = useRef<Array<{ voterId: string; voteFor: string }>>([]);
  const tbVotesRef = useRef<Array<{ voterId: string; voteFor: string }>>([]);
  const r3VotesRef = useRef<Array<{ voterId: string; voteFor: string }>>([]);
  const r1NeutralVotesRef = useRef<Array<{ voterId: string; decision: 'advance' | 'eliminate' }>>([]);

  const gs = (
    room?.gameState?.game === 'talentShow' ? room.gameState : null
  ) as TSGameState | null;

  useEffect(() => {
    gsRef.current = gs;
  }, [gs]);

  // headerLeft (Leave button) is set globally in App.tsx screenOptions

  // Setup timeout
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  useEffect(() => {
    if (gs?.phase) return;
    const t = setTimeout(() => setSetupTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [!!gs?.phase]); // eslint-disable-line

  // Server-synced timer (called at top level always)
  const { secondsLeft, isExpired } = useServerTimer(
    gs?.timerStartedAt ?? null,
    gs?.timerDuration ?? 30000
  );

  // R2 multi-select vote state
  const [r2Selected, setR2Selected] = useState<string[]>([]);
  // Reset when entering r2-voting
  useEffect(() => {
    if (gs?.phase === 'r2-voting') setR2Selected([]);
  }, [gs?.phase]);

  // ── Host: set up R1 performerQueue on first render ─────────────────────────
  useEffect(() => {
    if (!isHost || !gs) return;
    if (gs.phase === 'prep' && gs.performerQueue.length === 0) {
      const allIds = playersRef.current.map(p => p.id);
      const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
      usedR1R2Ref.current.add(index);
      const next: TSGameState = {
        ...gs,
        phase: 'round-intro',
        performerQueue: allIds,
        currentPerformerIdx: 0,
        totalVoters: allIds.length - 1,
        prompt,
      };
      gsRef.current = next;
      sendGameState(next);
    }
  }, [isHost, !!gs]); // eslint-disable-line

  // ── Host: handle player actions ────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      // Performer presses Start (prep or tiebreak-prep)
      if (
        action === 'ts-start' &&
        (state.phase === 'prep' || state.phase === 'tiebreak-prep')
      ) {
        const performer = allPlayers.find(
          p => p.id === state.performerQueue[state.currentPerformerIdx]
        );
        if (playerId !== performer?.id) return;
        const next: TSGameState = {
          ...state,
          phase: 'get-ready',
          timerStartedAt: Date.now(),
          timerDuration: 3000,
        };
        gsRef.current = next;
        sendGameState(next);
      }

      // R1: audience buzzes the performer
      if (action === 'ts-buzz' && state.phase === 'performing' && state.round === 1) {
        const alreadyUsed = [...state.buzzedPlayerIds, ...state.goldenPlayerIds];
        if (alreadyUsed.includes(playerId)) return;
        const newBuzzed = [...state.buzzedPlayerIds, playerId];
        const performerPlayer = allPlayers.find(
          p => p.id === state.performerQueue[state.currentPerformerIdx]
        );
        // Recompute voter count live so mid-game joins are reflected
        const liveVoters = allPlayers.filter(p => p.id !== performerPlayer?.id).length;
        const threshold = Math.ceil(liveVoters / 2);
        if (newBuzzed.length >= threshold) {
          const result: TSPerformResult = {
            playerId: performerPlayer?.id ?? '',
            playerName: performerPlayer?.name ?? '',
            outcome: 'eliminated',
            buzzCount: newBuzzed.length,
            goldenCount: state.goldenPlayerIds.length,
          };
          const next: TSGameState = {
            ...state,
            totalVoters: liveVoters,
            buzzedPlayerIds: newBuzzed,
            r1Results: [...state.r1Results, result],
            eliminatedPlayerIds: [...state.eliminatedPlayerIds, performerPlayer?.id ?? ''],
            phase: 'r1-result',
            timerStartedAt: null,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: TSGameState = { ...state, totalVoters: liveVoters, buzzedPlayerIds: newBuzzed };
          gsRef.current = next;
          sendGameState(next);
        }
      }

      // R1: audience gives golden buzzer
      if (action === 'ts-golden' && state.phase === 'performing' && state.round === 1) {
        const alreadyUsed = [...state.buzzedPlayerIds, ...state.goldenPlayerIds];
        if (alreadyUsed.includes(playerId)) return;
        const newGolden = [...state.goldenPlayerIds, playerId];
        const performerPlayer = allPlayers.find(
          p => p.id === state.performerQueue[state.currentPerformerIdx]
        );
        // Recompute voter count live so mid-game joins are reflected
        const liveVoters = allPlayers.filter(p => p.id !== performerPlayer?.id).length;
        const threshold = Math.ceil(liveVoters / 2);
        if (newGolden.length >= threshold) {
          const result: TSPerformResult = {
            playerId: performerPlayer?.id ?? '',
            playerName: performerPlayer?.name ?? '',
            outcome: 'golden',
            buzzCount: state.buzzedPlayerIds.length,
            goldenCount: newGolden.length,
          };
          const next: TSGameState = {
            ...state,
            totalVoters: liveVoters,
            goldenPlayerIds: newGolden,
            r1Results: [...state.r1Results, result],
            phase: 'r1-result',
            timerStartedAt: null,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: TSGameState = { ...state, totalVoters: liveVoters, goldenPlayerIds: newGolden };
          gsRef.current = next;
          sendGameState(next);
        }
      }

      // R2/R3 or tiebreak: performer done early
      if (action === 'ts-done-early' && state.phase === 'performing') {
        const performerPlayer = allPlayers.find(
          p => p.id === state.performerQueue[state.currentPerformerIdx]
        );
        if (playerId !== performerPlayer?.id) return;
        const next: TSGameState = {
          ...state,
          timerStartedAt: Date.now() - state.timerDuration,
        };
        gsRef.current = next;
        sendGameState(next);
      }

      // R1 neutral vote: jury votes advance/eliminate
      if (action === 'ts-vote-r1-neutral' && state.phase === 'r1-neutral-vote') {
        if (!state.r1NeutralVoterIds.includes(playerId)) return;
        if (state.r1NeutralSubmittedIds.includes(playerId)) return;
        const decision: 'advance' | 'eliminate' = data.decision;
        const newVotes = [...r1NeutralVotesRef.current, { voterId: playerId, decision }];
        r1NeutralVotesRef.current = newVotes;
        const newSubmitted = [...state.r1NeutralSubmittedIds, playerId];
        const performerPlayer = allPlayers.find(
          p => p.id === state.performerQueue[state.currentPerformerIdx]
        );
        if (newSubmitted.length >= state.r1NeutralVoterIds.length) {
          const advanceVotes =
            state.goldenPlayerIds.length +
            newVotes.filter(v => v.decision === 'advance').length;
          const eliminateVotes =
            state.buzzedPlayerIds.length +
            newVotes.filter(v => v.decision === 'eliminate').length;
          const outcome: 'advanced' | 'eliminated' =
            advanceVotes >= eliminateVotes ? 'advanced' : 'eliminated';
          const result: TSPerformResult = {
            playerId: performerPlayer?.id ?? '',
            playerName: performerPlayer?.name ?? '',
            outcome,
            buzzCount: state.buzzedPlayerIds.length,
            goldenCount: state.goldenPlayerIds.length,
          };
          const next: TSGameState = {
            ...state,
            r1NeutralVotes: newVotes,
            r1NeutralSubmittedIds: newSubmitted,
            r1Results: [...state.r1Results, result],
            eliminatedPlayerIds:
              outcome === 'eliminated'
                ? [...state.eliminatedPlayerIds, performerPlayer?.id ?? '']
                : state.eliminatedPlayerIds,
            phase: 'r1-result',
            timerStartedAt: null,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: TSGameState = {
            ...state,
            r1NeutralVotes: newVotes,
            r1NeutralSubmittedIds: newSubmitted,
          };
          gsRef.current = next;
          sendGameState(next);
        }
      }

      // R2 voting: voter submits 2 choices
      if (action === 'ts-vote-r2' && state.phase === 'r2-voting') {
        if (state.r2SubmittedVoterIds.includes(playerId)) return;
        const choices: string[] = (data.voteFor ?? []).slice(0, 2);
        const newVotes = [
          ...r2VotesRef.current,
          ...choices.map((id: string) => ({ voterId: playerId, voteFor: id })),
        ];
        r2VotesRef.current = newVotes;
        const newSubmitted = [...state.r2SubmittedVoterIds, playerId];
        const totalVoters = state.r2VoterIds.length;

        if (newSubmitted.length >= totalVoters) {
          const performerIds = state.r2Results.map(r => r.playerId);
          const { advanced, tied, spotsLeft } = computeR2Advancement(newVotes, performerIds);
          if (tied.length === 0) {
            // No tie — go to R3
            const r3FinalistIds = advanced.slice(0, 2);
            const { item: prompt, index } = pickRandom(TALENT_SHOW_FINAL_PROMPTS, usedFinalRef.current);
            usedFinalRef.current.add(index);
            const next: TSGameState = {
              ...state,
              phase: 'round-intro',
              round: 3,
              r2Votes: newVotes,
              r2SubmittedVoterIds: newSubmitted,
              r3FinalistIds,
              performerQueue: r3FinalistIds,
              currentPerformerIdx: 0,
              prompt,
              nextActDuration: 30000,
              timerStartedAt: null,
              buzzedPlayerIds: [],
              goldenPlayerIds: [],
              tbVoterIds: state.tbVoterIds,
              r3VoterIds: [],
            };
            gsRef.current = next;
            sendGameState(next);
          } else {
            // Tiebreaker needed
            const { item: tbPrompt, index: tbIdx } = pickRandom(
              TALENT_SHOW_TIEBREAK_PROMPTS,
              usedTBRef.current
            );
            usedTBRef.current.add(tbIdx);
            tbVotesRef.current = [];
            const next: TSGameState = {
              ...state,
              phase: 'tiebreak-prep',
              r2Votes: newVotes,
              r2SubmittedVoterIds: newSubmitted,
              tiebreakerCandidates: tied,
              tiebreakerSpotsNeeded: spotsLeft,
              tiebreakerAlreadyAdvanced: advanced,
              tbVotes: [],
              tbSubmittedVoterIds: [],
              tbVoterIds: allPlayers.map(p => p.id), // everyone votes; candidates can't vote for themselves
              performerQueue: tied,
              currentPerformerIdx: 0,
              prompt: tbPrompt,
              nextActDuration: 10000,
              timerStartedAt: null,
            };
            gsRef.current = next;
            sendGameState(next);
          }
        } else {
          const next: TSGameState = {
            ...state,
            r2Votes: newVotes,
            r2SubmittedVoterIds: newSubmitted,
          };
          r2VotesRef.current = newVotes;
          gsRef.current = next;
          sendGameState(next);
        }
      }

      // Tiebreak vote: voter submits 1 choice
      if (action === 'ts-vote-tb' && state.phase === 'tiebreak-vote') {
        if (state.tbSubmittedVoterIds.includes(playerId)) return;
        const newVotes = [
          ...tbVotesRef.current,
          { voterId: playerId, voteFor: data.voteFor },
        ];
        tbVotesRef.current = newVotes;
        const newSubmitted = [...state.tbSubmittedVoterIds, playerId];

        if (newSubmitted.length >= state.tbVoterIds.length) {
          const tally = tallyVotes(newVotes).filter(t =>
            state.tiebreakerCandidates.includes(t.id)
          );
          const sorted = state.tiebreakerCandidates
            .map(id => ({
              id,
              count: tally.find(t => t.id === id)?.count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);

          const needed = state.tiebreakerSpotsNeeded;
          const cutoff = sorted[needed - 1]?.count ?? 0;
          const clearWinners = sorted.filter(p => p.count > cutoff);
          const atCutoff = sorted.filter(p => p.count === cutoff);
          const spotsAtCutoff = needed - clearWinners.length;

          if (atCutoff.length === spotsAtCutoff) {
            // Resolved — advance top 'needed'
            const newAdvanced = [
              ...state.tiebreakerAlreadyAdvanced,
              ...sorted.slice(0, needed).map(p => p.id),
            ];

            if (state.round === 3) {
              // R3 tiebreaker resolved — declare winner
              const winnerId = newAdvanced[0] ?? state.r3FinalistIds[0];
              const runnerUpId = state.r3FinalistIds.find(id => id !== winnerId) ?? null;
              const updatedPlayers = allPlayers.map(p =>
                p.id === winnerId ? { ...p, score: (p.score ?? 0) + 1 } : p
              );
              setPlayers(updatedPlayers);
              updateRoomScores(updatedPlayers);
              const next: TSGameState = {
                ...state,
                phase: 'winner',
                tbVotes: newVotes,
                tbSubmittedVoterIds: newSubmitted,
                winnerId,
                runnerUpId,
              };
              gsRef.current = next;
              sendGameState(next);
            } else {
              // R2 tiebreaker resolved — advance to R3
              const r3FinalistIds = newAdvanced.slice(0, 2);
              const { item: prompt, index } = pickRandom(
                TALENT_SHOW_FINAL_PROMPTS,
                usedFinalRef.current
              );
              usedFinalRef.current.add(index);
              const next: TSGameState = {
                ...state,
                phase: 'round-intro',
                round: 3,
                r3FinalistIds,
                performerQueue: r3FinalistIds,
                currentPerformerIdx: 0,
                prompt,
                nextActDuration: 30000,
                timerStartedAt: null,
                tbVotes: newVotes,
                tbSubmittedVoterIds: newSubmitted,
                buzzedPlayerIds: [],
                goldenPlayerIds: [],
                r3VoterIds: [],
              };
              gsRef.current = next;
              sendGameState(next);
            }
          } else {
            // Still tied — another tiebreak
            const stillTied = atCutoff.map(p => p.id);
            const { item: tbPrompt, index: tbIdx } = pickRandom(
              TALENT_SHOW_TIEBREAK_PROMPTS,
              usedTBRef.current
            );
            usedTBRef.current.add(tbIdx);
            tbVotesRef.current = [];
            const next: TSGameState = {
              ...state,
              phase: 'tiebreak-prep',
              tiebreakerCandidates: stillTied,
              tiebreakerSpotsNeeded: spotsAtCutoff,
              tiebreakerAlreadyAdvanced: [
                ...state.tiebreakerAlreadyAdvanced,
                ...clearWinners.map(p => p.id),
              ],
              tbVotes: [],
              tbSubmittedVoterIds: [],
              tbVoterIds: state.round === 3
                ? state.r3VoterIds
                : allPlayers.map(p => p.id), // everyone votes; candidates can't vote for themselves
              performerQueue: stillTied,
              currentPerformerIdx: 0,
              prompt: tbPrompt,
              nextActDuration: 10000,
              timerStartedAt: null,
            };
            gsRef.current = next;
            sendGameState(next);
          }
        } else {
          const next: TSGameState = {
            ...state,
            tbVotes: newVotes,
            tbSubmittedVoterIds: newSubmitted,
          };
          tbVotesRef.current = newVotes;
          gsRef.current = next;
          sendGameState(next);
        }
      }

      // R3 vote: everyone picks 1 finalist
      if (action === 'ts-vote-r3' && state.phase === 'r3-voting') {
        if (state.r3SubmittedVoterIds.includes(playerId)) return;
        const newVotes = [
          ...r3VotesRef.current,
          { voterId: playerId, voteFor: data.voteFor },
        ];
        r3VotesRef.current = newVotes;
        const newSubmitted = [...state.r3SubmittedVoterIds, playerId];

        if (newSubmitted.length >= state.r3VoterIds.length) {
          const tally = tallyVotes(newVotes);
          const topCount = tally.filter(t => state.r3FinalistIds.includes(t.id))[0]?.count ?? 0;
          const tiedFinalists = state.r3FinalistIds.filter(
            id => (tally.find(t => t.id === id)?.count ?? 0) === topCount
          );
          if (tiedFinalists.length > 1) {
            // Tie — run a quick tiebreaker round
            const { item: tbPrompt, index: tbIdx } = pickRandom(TALENT_SHOW_TIEBREAK_PROMPTS, usedTBRef.current);
            usedTBRef.current.add(tbIdx);
            tbVotesRef.current = [];
            const next: TSGameState = {
              ...state,
              phase: 'tiebreak-prep',
              r3Votes: newVotes,
              r3SubmittedVoterIds: newSubmitted,
              tiebreakerCandidates: tiedFinalists,
              tiebreakerSpotsNeeded: 1,
              tiebreakerAlreadyAdvanced: [],
              tbVotes: [],
              tbSubmittedVoterIds: [],
              tbVoterIds: state.r3VoterIds,
              performerQueue: tiedFinalists,
              currentPerformerIdx: 0,
              prompt: tbPrompt,
              nextActDuration: 10000,
              timerStartedAt: null,
            };
            gsRef.current = next;
            sendGameState(next);
            return;
          }
          // No tie — determine winner
          const finalistTally = tally.filter(t => state.r3FinalistIds.includes(t.id));
          const winnerId = finalistTally.length > 0 ? finalistTally[0].id : (state.r3FinalistIds[0] ?? null);
          const runnerUpId = state.r3FinalistIds.find(id => id !== winnerId) ?? null;

          // Award score to winner
          const updatedPlayers = allPlayers.map(p =>
            p.id === winnerId ? { ...p, score: (p.score ?? 0) + 1 } : p
          );
          setPlayers(updatedPlayers);
          updateRoomScores(updatedPlayers);

          const next: TSGameState = {
            ...state,
            phase: 'winner',
            r3Votes: newVotes,
            r3SubmittedVoterIds: newSubmitted,
            winnerId,
            runnerUpId,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: TSGameState = {
            ...state,
            r3Votes: newVotes,
            r3SubmittedVoterIds: newSubmitted,
          };
          r3VotesRef.current = newVotes;
          gsRef.current = next;
          sendGameState(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => {
      socket.off('playerActionReceived', handler);
    };
  }, [isHost]); // eslint-disable-line

  // ── Host: manage phase timers ──────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !gs) return;

    // get-ready → performing
    if (gs.phase === 'get-ready' && gs.timerStartedAt) {
      const remaining = Math.max(0, gs.timerDuration - (Date.now() - gs.timerStartedAt));
      const t = setTimeout(() => {
        const state = gsRef.current;
        if (!state || state.phase !== 'get-ready') return;
        const next: TSGameState = {
          ...state,
          phase: 'performing',
          timerStartedAt: Date.now(),
          timerDuration: state.nextActDuration,
        };
        gsRef.current = next;
        sendGameState(next);
      }, remaining);
      return () => clearTimeout(t);
    }

    // performing → result (timer expired or done-early)
    if (gs.phase === 'performing' && gs.timerStartedAt) {
      const remaining = Math.max(0, gs.timerDuration - (Date.now() - gs.timerStartedAt));
      const t = setTimeout(() => {
        handleTimerExpired();
      }, remaining);
      return () => clearTimeout(t);
    }
  }, [isHost, gs?.phase, gs?.timerStartedAt, gs?.timerDuration]); // eslint-disable-line

  function handleTimerExpired() {
    const state = gsRef.current;
    const allPlayers = playersRef.current;
    if (!state || state.phase !== 'performing') return;

    const performerPlayer = allPlayers.find(
      p => p.id === state.performerQueue[state.currentPerformerIdx]
    );

    if (state.round === 1) {
      // Check for neutral voters (audience who haven't used buzz or golden)
      const neutralVoterIds = allPlayers
        .filter(p => p.id !== performerPlayer?.id)
        .filter(p => !state.buzzedPlayerIds.includes(p.id) && !state.goldenPlayerIds.includes(p.id))
        .map(p => p.id);

      if (neutralVoterIds.length === 0) {
        // No neutral voters — use golden vs red tally
        const advanceVotes = state.goldenPlayerIds.length;
        const eliminateVotes = state.buzzedPlayerIds.length;
        const outcome: 'advanced' | 'eliminated' = advanceVotes >= eliminateVotes ? 'advanced' : 'eliminated';
        const result: TSPerformResult = {
          playerId: performerPlayer?.id ?? '',
          playerName: performerPlayer?.name ?? '',
          outcome,
          buzzCount: state.buzzedPlayerIds.length,
          goldenCount: state.goldenPlayerIds.length,
        };
        const next: TSGameState = {
          ...state,
          r1Results: [...state.r1Results, result],
          eliminatedPlayerIds:
            outcome === 'eliminated'
              ? [...state.eliminatedPlayerIds, performerPlayer?.id ?? '']
              : state.eliminatedPlayerIds,
          phase: 'r1-result',
          timerStartedAt: null,
        };
        gsRef.current = next;
        sendGameState(next);
      } else {
        // Neutral voters must cast judgment
        r1NeutralVotesRef.current = [];
        const next: TSGameState = {
          ...state,
          phase: 'r1-neutral-vote',
          r1NeutralVoterIds: neutralVoterIds,
          r1NeutralVotes: [],
          r1NeutralSubmittedIds: [],
          timerStartedAt: null,
        };
        gsRef.current = next;
        sendGameState(next);
      }
    } else if (state.tiebreakerCandidates.length > 0) {
      // Tiebreak performer done
      const nextIdx = state.currentPerformerIdx + 1;
      if (nextIdx >= state.performerQueue.length) {
        // All tiebreakers done → vote
        tbVotesRef.current = [];
        const next: TSGameState = {
          ...state,
          phase: 'tiebreak-vote',
          tbVotes: [],
          tbSubmittedVoterIds: [],
          timerStartedAt: null,
        };
        gsRef.current = next;
        sendGameState(next);
      } else {
        // Next tiebreaker performer
        const next: TSGameState = {
          ...state,
          phase: 'tiebreak-prep',
          currentPerformerIdx: nextIdx,
          timerStartedAt: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
        };
        gsRef.current = next;
        sendGameState(next);
      }
    } else if (state.round === 2) {
      // R2 act done
      const newR2Results = [
        ...state.r2Results,
        {
          playerId: performerPlayer?.id ?? '',
          playerName: performerPlayer?.name ?? '',
        },
      ];
      const nextIdx = state.currentPerformerIdx + 1;
      if (nextIdx >= state.performerQueue.length) {
        // All R2 acts done → everyone votes (performers just can't vote for themselves)
        const r2VoterIds = allPlayers.map(p => p.id);
        r2VotesRef.current = [];
        const next: TSGameState = {
          ...state,
          r2Results: newR2Results,
          phase: 'r2-voting',
          r2VoterIds,
          r2Votes: [],
          r2SubmittedVoterIds: [],
          timerStartedAt: null,
        };
        gsRef.current = next;
        sendGameState(next);
      } else {
        // Next R2 performer
        const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
        usedR1R2Ref.current.add(index);
        const next: TSGameState = {
          ...state,
          r2Results: newR2Results,
          phase: 'prep',
          currentPerformerIdx: nextIdx,
          prompt,
          nextActDuration: 30000,
          timerStartedAt: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
        };
        gsRef.current = next;
        sendGameState(next);
      }
    } else if (state.round === 3) {
      // R3 act done
      const newR3Results = [
        ...state.r3Results,
        {
          playerId: performerPlayer?.id ?? '',
          playerName: performerPlayer?.name ?? '',
        },
      ];
      const nextIdx = state.currentPerformerIdx + 1;
      if (nextIdx >= state.performerQueue.length) {
        // Both R3 acts done → voting
        r3VotesRef.current = [];
        const r3VoterIds = allPlayers
          .filter(p => !state.r3FinalistIds.includes(p.id))
          .map(p => p.id);
        const next: TSGameState = {
          ...state,
          r3Results: newR3Results,
          phase: 'r3-voting',
          r3VoterIds,
          r3Votes: [],
          r3SubmittedVoterIds: [],
          timerStartedAt: null,
        };
        gsRef.current = next;
        sendGameState(next);
      } else {
        // Next R3 performer — keep the SAME prompt so both finalists perform the same act
        const next: TSGameState = {
          ...state,
          r3Results: newR3Results,
          phase: 'prep',
          currentPerformerIdx: nextIdx,
          // prompt intentionally not changed
          nextActDuration: 30000,
          timerStartedAt: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
        };
        gsRef.current = next;
        sendGameState(next);
      }
    }
  }

  // ── Host: advance R1 result → next ────────────────────────────────────────
  const handleAdvanceR1 = () => {
    if (!isHost || !gs) return;
    const allPlayers = playersRef.current;
    const nextIdx = gs.currentPerformerIdx + 1;

    if (nextIdx >= gs.performerQueue.length) {
      // All R1 done — determine next round
      const survivors = gs.performerQueue.filter(
        id => !gs.eliminatedPlayerIds.includes(id)
      );
      if (survivors.length <= 1) {
        const winnerId = survivors[0] ?? null;
        const next: TSGameState = { ...gs, phase: 'winner', winnerId, runnerUpId: null };
        gsRef.current = next;
        sendGameState(next);
      } else if (survivors.length === 2) {
        // Skip R2 — go straight to R3
        const { item: prompt, index } = pickRandom(
          TALENT_SHOW_FINAL_PROMPTS,
          usedFinalRef.current
        );
        usedFinalRef.current.add(index);
        const next: TSGameState = {
          ...gs,
          phase: 'round-intro',
          round: 3,
          r3FinalistIds: survivors,
          performerQueue: survivors,
          currentPerformerIdx: 0,
          prompt,
          nextActDuration: 30000,
          timerStartedAt: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
          r3VoterIds: [],
        };
        gsRef.current = next;
        sendGameState(next);
      } else {
        // 3+ survivors → R2
        const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
        usedR1R2Ref.current.add(index);
        r2VotesRef.current = [];
        const next: TSGameState = {
          ...gs,
          phase: 'round-intro',
          round: 2,
          performerQueue: survivors,
          currentPerformerIdx: 0,
          r2Results: [],
          r2Votes: [],
          r2SubmittedVoterIds: [],
          prompt,
          nextActDuration: 30000,
          timerStartedAt: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
          tbVoterIds: [],
        };
        gsRef.current = next;
        sendGameState(next);
      }
    } else {
      // More R1 performers
      const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
      usedR1R2Ref.current.add(index);
      const nextPerformerId = gs.performerQueue[nextIdx];
      const next: TSGameState = {
        ...gs,
        phase: 'prep',
        currentPerformerIdx: nextIdx,
        totalVoters: allPlayers.filter(p => p.id !== nextPerformerId).length,
        prompt,
        nextActDuration: 30000,
        timerStartedAt: null,
        buzzedPlayerIds: [],
        goldenPlayerIds: [],
      };
      gsRef.current = next;
      sendGameState(next);
    }
  };

  // ── Host: start round from intro screen ────────────────────────────────────
  const handleStartRound = () => {
    if (!isHost) return;
    const state = gsRef.current;
    if (!state || state.phase !== 'round-intro') return;
    const next: TSGameState = { ...state, phase: 'prep' };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Play Again ────────────────────────────────────────────────────────────
  const handlePlayAgain = () => {
    if (!isHost) return;
    const allIds = playersRef.current.map(p => p.id);
    const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
    usedR1R2Ref.current.add(index);
    r2VotesRef.current = [];
    tbVotesRef.current = [];
    r3VotesRef.current = [];
    r1NeutralVotesRef.current = [];
    const next: TSGameState = {
      game: 'talentShow',
      round: 1,
      phase: 'round-intro',
      prompt,
      timerStartedAt: null,
      timerDuration: 3000,
      nextActDuration: 30000,
      performerQueue: allIds,
      currentPerformerIdx: 0,
      buzzedPlayerIds: [],
      goldenPlayerIds: [],
      totalVoters: allIds.length - 1,
      r1Results: [],
      eliminatedPlayerIds: [],
      r2Results: [],
      r2VoterIds: [],
      r2Votes: [],
      r2SubmittedVoterIds: [],
      tiebreakerCandidates: [],
      tiebreakerSpotsNeeded: 1,
      tiebreakerAlreadyAdvanced: [],
      tbVotes: [],
      tbSubmittedVoterIds: [],
      tbVoterIds: [],
      r1NeutralVoterIds: [],
      r1NeutralVotes: [],
      r1NeutralSubmittedIds: [],
      r3VoterIds: [],
      r3FinalistIds: [],
      r3Results: [],
      r3Votes: [],
      r3SubmittedVoterIds: [],
      winnerId: null,
      runnerUpId: null,
    };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gs || !gs.phase || gs.phase === 'intro') {
    return (
      <GameIntro
        emoji="🎭"
        title="Talent Show"
        tagline="Perform. Survive the buzz. Win the crowd."
        rules={[
          { emoji: '🎤', text: 'Round 1: Perform a 30-second act. Audience can BUZZ or GOLDEN BUZZ you.' },
          { emoji: '❌', text: 'Half or more buzzes = eliminated. Half or more golden buzzes = instant advance.' },
          { emoji: '🗳️', text: 'Round 2: Survivors perform again. Everyone votes for 2 favorites to advance.' },
          { emoji: '🏆', text: 'Final: 2 finalists get the same prompt. Everyone votes for the winner.' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  // Derived state helpers
  const currentPerformerId = (gs.performerQueue ?? [])[gs.currentPerformerIdx] ?? null;
  const currentPerformer = players.find(p => p.id === currentPerformerId) ?? null;
  const iAmPerformer = myId === currentPerformerId;

  const roundLabel =
    gs.round === 1
      ? 'ROUND 1'
      : gs.round === 2
      ? 'ROUND 2'
      : 'FINALS ⭐';

  const iAmBuzzed = gs.buzzedPlayerIds?.includes(myId ?? '');
  const iAmGolden = gs.goldenPlayerIds?.includes(myId ?? '');
  const iHaveReacted = iAmBuzzed || iAmGolden;

  // ── Phase: round-intro ─────────────────────────────────────────────────────
  if (gs.phase === 'round-intro') {
    const isR3 = gs.round === 3;
    const roundTitle = gs.round === 1 ? 'Round 1' : gs.round === 2 ? 'Round 2' : 'Finals';
    const roundEmoji = gs.round === 1 ? '🎭' : gs.round === 2 ? '🔥' : '⭐';
    const desc =
      gs.round === 1
        ? 'Everyone performs for 30 seconds. Audience members each get one BUZZ or one GOLDEN buzzer — use it wisely!'
        : gs.round === 2
        ? 'Survivors perform again. Everyone votes for their top 2 to advance to the Final — you cannot vote for yourself.'
        : 'Both finalists get the SAME extreme prompt and perform back-to-back. Then everyone votes for the winner.';
    const r1Tip = gs.round === 1
      ? 'Majority RED buzzes = instant elimination · Majority GOLDEN buzzes = instant advance'
      : null;

    // R3: look up finalist names
    const finalistNames = isR3
      ? gs.r3FinalistIds.map(id => players.find(p => p.id === id)?.name ?? id)
      : [];

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.roundIntroContainer}>
          <View style={styles.roundIntroTop}>
            <Text style={styles.roundIntroEmoji}>{roundEmoji}</Text>
            <View style={[styles.roundIntroBadge, isR3 && styles.roundIntroBadgeFinals]}>
              <Text style={styles.roundIntroBadgeText}>{roundTitle.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.roundIntroBody}>
            {isR3 && finalistNames.length === 2 ? (
              <>
                <Text style={styles.finalistsVsLabel}>YOUR FINALISTS</Text>
                <View style={styles.finalistsRow}>
                  <Text style={styles.finalistName}>{finalistNames[0]}</Text>
                  <Text style={styles.finalistsVs}>VS</Text>
                  <Text style={styles.finalistName}>{finalistNames[1]}</Text>
                </View>
                <Text style={styles.roundIntroDescLarge}>{desc}</Text>
              </>
            ) : (
              <>
                <Text style={styles.roundIntroDescLarge}>{desc}</Text>
                {r1Tip && (
                  <View style={styles.roundIntroTip}>
                    <Text style={styles.roundIntroTipText}>{r1Tip}</Text>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={styles.roundIntroBottom}>
            {isHost ? (
              <PrimaryButton
                title={`Start ${isR3 ? 'Finals' : roundTitle} →`}
                onPress={handleStartRound}
              />
            ) : (
              <View style={styles.waitingBox}>
                <Text style={styles.waitingText}>Waiting for host to start the round...</Text>
              </View>
            )}
          </View>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: prep ────────────────────────────────────────────────────────────
  if (gs.phase === 'prep') {
    const isFinals = gs.round === 3;
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>{roundLabel}</Text>
          </View>

          <View style={styles.performerBadge}>
            <Text style={styles.performerBadgeText}>
              🎤 {currentPerformer?.name ?? '???'}'s turn
            </Text>
          </View>

          {isFinals && (
            <View style={styles.extremeLabel}>
              <Text style={styles.extremeLabelText}>⚠️ EXTREME ROUND</Text>
            </View>
          )}

          <View style={[styles.promptBox, isFinals && styles.promptBoxFinals]}>
            <Text style={styles.promptText}>{gs.prompt}</Text>
          </View>

          <View style={styles.prepInfo}>
            <Text style={styles.prepInfoText}>
              {gs.round === 1
                ? 'Perform for 30 seconds. Audience can BUZZ you out or give you a GOLDEN buzzer.'
                : gs.round === 2
                ? 'Perform for 30 seconds. Eliminated players will vote for their top 2.'
                : 'Give it everything! Perform for 30 seconds. Everyone votes for the winner.'}
            </Text>
          </View>

          {iAmPerformer ? (
            <PrimaryButton
              title="Start →"
              onPress={() => sendPlayerAction('ts-start', {})}
            />
          ) : (
            <View style={styles.waitingBox}>
              <Text style={styles.waitingText}>
                {currentPerformer?.name ?? '...'} is getting ready to perform...
              </Text>
            </View>
          )}
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: get-ready ───────────────────────────────────────────────────────
  if (gs.phase === 'get-ready') {
    const ratio = secondsLeft / 3;
    const countColor =
      ratio > 0.6 ? COLORS.success : ratio > 0.3 ? COLORS.warning : COLORS.danger;
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.centeredFull}>
          <Text style={styles.getReadyLabel}>Get ready!</Text>
          <Text style={[styles.bigCountdown, { color: countColor }]}>{secondsLeft}</Text>
          <Text style={styles.getReadyPerformer}>
            {currentPerformer?.name ?? '...'} is about to perform
          </Text>
          <View style={styles.promptBoxSmall}>
            <Text style={styles.promptTextSmall}>{gs.prompt}</Text>
          </View>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: performing ──────────────────────────────────────────────────────
  if (gs.phase === 'performing') {
    const totalSecs = Math.round((gs.timerDuration ?? 30000) / 1000);
    const ratio = secondsLeft / totalSecs;
    const timerColor =
      ratio > 0.5 ? COLORS.success : ratio > 0.25 ? COLORS.warning : COLORS.danger;

    const isTiebreak = gs.tiebreakerCandidates?.length > 0 && gs.round === 2;
    const buzzCount = gs.buzzedPlayerIds?.length ?? 0;
    const goldenCount = gs.goldenPlayerIds?.length ?? 0;

    if (iAmPerformer) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
  
          <View style={styles.centeredFull}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎤 You're performing!</Text>
            </View>
            <View style={styles.promptBoxSmall}>
              <Text style={styles.promptTextSmall}>{gs.prompt}</Text>
            </View>
            <Text style={[styles.performTimer, { color: timerColor }]}>{secondsLeft}</Text>
            <Text style={styles.performTimerLabel}>seconds left</Text>

            {gs.round === 1 && (
              <View style={styles.buzzStats}>
                <View style={styles.buzzStatItem}>
                  <Text style={styles.buzzStatCount}>{buzzCount}</Text>
                  <Text style={styles.buzzStatLabel}>buzzed</Text>
                </View>
                <View style={styles.buzzStatDivider} />
                <View style={styles.buzzStatItem}>
                  <Text style={[styles.buzzStatCount, { color: COLORS.warning }]}>
                    {goldenCount}
                  </Text>
                  <Text style={styles.buzzStatLabel}>golden</Text>
                </View>
              </View>
            )}

            {gs.round !== 1 && (
              <SecondaryButton
                title="Done Early →"
                onPress={() => sendPlayerAction('ts-done-early', {})}
                style={{ marginTop: 24 }}
              />
            )}
          </View>
  
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    // Audience view
    if (gs.round === 1) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
  
          <ScrollView contentContainerStyle={styles.centeredScroll}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎤 {currentPerformer?.name} is performing</Text>
            </View>
            <View style={styles.promptBoxSmall}>
              <Text style={styles.promptTextSmall}>{gs.prompt}</Text>
            </View>
            <Text style={[styles.performTimer, { color: timerColor }]}>{secondsLeft}</Text>

            <View style={styles.reactionRow}>
              {/* BUZZ button */}
              <TouchableOpacity
                style={[
                  styles.buzzBtn,
                  (iHaveReacted) && styles.buzzBtnUsed,
                ]}
                onPress={() => {
                  if (!iAmPerformer && !iHaveReacted) {
                    sendPlayerAction('ts-buzz', {});
                  }
                }}
                activeOpacity={0.8}
                disabled={iAmPerformer || iHaveReacted}
              >
                <Text style={styles.buzzBtnEmoji}>🔴</Text>
                <Text style={styles.buzzBtnText}>BUZZ</Text>
                <Text style={styles.buzzBtnCount}>{buzzCount} / {gs.totalVoters}</Text>
              </TouchableOpacity>

              {/* GOLDEN button */}
              <TouchableOpacity
                style={[
                  styles.goldenBtn,
                  (iHaveReacted) && styles.goldenBtnUsed,
                ]}
                onPress={() => {
                  if (!iAmPerformer && !iHaveReacted) {
                    sendPlayerAction('ts-golden', {});
                  }
                }}
                activeOpacity={0.8}
                disabled={iAmPerformer || iHaveReacted}
              >
                <Text style={styles.goldenBtnEmoji}>⭐</Text>
                <Text style={styles.goldenBtnText}>GOLDEN</Text>
                <Text style={styles.goldenBtnCount}>{goldenCount} / {gs.totalVoters}</Text>
              </TouchableOpacity>
            </View>

            {iHaveReacted && (
              <View style={styles.reactedNotice}>
                <Text style={styles.reactedNoticeText}>
                  {iAmBuzzed ? "You buzzed!" : "You gave a golden buzzer!"}
                </Text>
              </View>
            )}

            <View style={styles.buzzThresholdNote}>
              <Text style={styles.buzzThresholdText}>
                {Math.ceil(gs.totalVoters / 2)} buzzes = eliminated · {Math.ceil(gs.totalVoters / 2)} golden = instant advance
              </Text>
            </View>
          </ScrollView>
  
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    // R2, R3, or tiebreak audience — just watch
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.centeredFull}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {isTiebreak ? '⚡ TIEBREAKER' : '🎤'} {currentPerformer?.name} is performing
            </Text>
          </View>
          <View style={styles.promptBoxSmall}>
            <Text style={styles.promptTextSmall}>{gs.prompt}</Text>
          </View>
          <Text style={[styles.performTimer, { color: timerColor }]}>{secondsLeft}</Text>
          <Text style={styles.performTimerLabel}>seconds left</Text>
          <Text style={styles.watchText}>Sit back and watch!</Text>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: r1-result ───────────────────────────────────────────────────────
  if (gs.phase === 'r1-result') {
    const lastResult = (gs.r1Results ?? [])[((gs.r1Results ?? []).length) - 1];
    const outcome = lastResult?.outcome;
    const emoji =
      outcome === 'eliminated' ? '❌' : outcome === 'golden' ? '⭐' : '✅';
    const outcomeLabel =
      outcome === 'eliminated' ? 'ELIMINATED' : outcome === 'golden' ? 'GOLDEN BUZZER!' : 'ADVANCED';
    const outcomeColor =
      outcome === 'eliminated'
        ? COLORS.danger
        : outcome === 'golden'
        ? COLORS.warning
        : COLORS.success;
    const totalPerformed = (gs.r1Results ?? []).length;
    const totalPerformers = gs.performerQueue.length;
    const nextPerformerIdx = gs.currentPerformerIdx + 1;
    const nextPerformer = players.find(p => p.id === gs.performerQueue[nextPerformerIdx]);

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.centeredFull}>
          <Text style={styles.resultEmoji}>{emoji}</Text>
          <Text style={styles.resultName}>{lastResult?.playerName ?? '???'}</Text>
          <Text style={[styles.resultOutcome, { color: outcomeColor }]}>{outcomeLabel}</Text>

          <View style={styles.resultStats}>
            <Text style={styles.resultStatText}>
              🔴 {lastResult?.buzzCount ?? 0} buzzed
            </Text>
            <Text style={styles.resultStatText}>
              ⭐ {lastResult?.goldenCount ?? 0} golden
            </Text>
          </View>

          {outcome === 'eliminated' && (
            <Text style={styles.resultSub}>Too many buzzes. Tough crowd.</Text>
          )}
          {outcome === 'golden' && (
            <Text style={styles.resultSub}>The crowd loves it! Instant advance!</Text>
          )}
          {outcome === 'advanced' && (
            <Text style={styles.resultSub}>Survived the buzzes! Moving on.</Text>
          )}

          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {totalPerformed} of {totalPerformers} performed
            </Text>
          </View>

          {isHost ? (
            <PrimaryButton
              title={
                nextPerformerIdx >= totalPerformers
                  ? 'See Results →'
                  : `Next: ${nextPerformer?.name ?? '...'} →`
              }
              onPress={handleAdvanceR1}
              style={styles.advanceBtn}
            />
          ) : (
            <Text style={styles.waitSub}>Waiting for host to continue...</Text>
          )}
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: r1-neutral-vote ─────────────────────────────────────────────────
  if (gs.phase === 'r1-neutral-vote') {
    const performer = players.find(p => p.id === gs.performerQueue[gs.currentPerformerIdx]);
    const amINeutralVoter = (gs.r1NeutralVoterIds ?? []).includes(myId ?? '');
    const iHaveVotedNeutral = (gs.r1NeutralSubmittedIds ?? []).includes(myId ?? '');
    const votesIn = (gs.r1NeutralSubmittedIds ?? []).length;
    const totalNeutral = (gs.r1NeutralVoterIds ?? []).length;

    if (iAmPerformer || !amINeutralVoter || iHaveVotedNeutral) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
  
          <View style={styles.centered}>
            {iHaveVotedNeutral ? (
              <>
                <Text style={styles.waitEmoji}>✅</Text>
                <Text style={styles.waitTitle}>Vote cast!</Text>
              </>
            ) : iAmPerformer ? (
              <>
                <Text style={styles.waitEmoji}>😬</Text>
                <Text style={styles.waitTitle}>Jury's still out...</Text>
              </>
            ) : (
              <>
                <Text style={styles.waitEmoji}>⏳</Text>
                <Text style={styles.waitTitle}>Jury is voting</Text>
              </>
            )}
            <Text style={styles.waitSub}>{votesIn} / {totalNeutral} voted</Text>
          </View>
  
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.centeredFull}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⚖️ Jury Vote</Text>
          </View>
          <Text style={styles.votingTitle}>Does {performer?.name ?? '...'} advance?</Text>
          <Text style={styles.neutralVoteContext}>
            🔴 {gs.buzzedPlayerIds.length} buzzed · ⭐ {gs.goldenPlayerIds.length} golden
          </Text>
          <Text style={styles.votingSubtitle}>{votesIn} / {totalNeutral} voted</Text>

          <View style={styles.neutralBtnRow}>
            <TouchableOpacity
              style={styles.neutralAdvanceBtn}
              onPress={() => sendPlayerAction('ts-vote-r1-neutral', { decision: 'advance' })}
              activeOpacity={0.8}
            >
              <Text style={styles.neutralBtnEmoji}>✅</Text>
              <Text style={styles.neutralBtnText}>ADVANCE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.neutralEliminateBtn}
              onPress={() => sendPlayerAction('ts-vote-r1-neutral', { decision: 'eliminate' })}
              activeOpacity={0.8}
            >
              <Text style={styles.neutralBtnEmoji}>❌</Text>
              <Text style={styles.neutralBtnText}>ELIMINATE</Text>
            </TouchableOpacity>
          </View>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: r2-voting ───────────────────────────────────────────────────────
  if (gs.phase === 'r2-voting') {
    const amIVoter = (gs.r2VoterIds ?? []).includes(myId ?? '');
    const iHaveSubmitted = (gs.r2SubmittedVoterIds ?? []).includes(myId ?? '');
    const votesIn = (gs.r2SubmittedVoterIds ?? []).length;
    const totalVotersR2 = (gs.r2VoterIds ?? []).length;

    if (!amIVoter || iHaveSubmitted) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
  
          <View style={styles.centered}>
            {iHaveSubmitted ? (
              <>
                <Text style={styles.waitEmoji}>✅</Text>
                <Text style={styles.waitTitle}>Vote submitted!</Text>
              </>
            ) : (
              <>
                <Text style={styles.waitEmoji}>👀</Text>
                <Text style={styles.waitTitle}>Watching the vote...</Text>
              </>
            )}
            <Text style={styles.waitSub}>
              {votesIn} / {totalVotersR2} voted
            </Text>
          </View>
  
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    // Performers can't vote for themselves, so in a 2-performer R2 they can only pick 1
    const isR2Performer = gs.r2Results.some(r => r.playerId === myId);
    const requiredR2Votes = Math.min(2, (gs.r2Results ?? []).length - (isR2Performer ? 1 : 0));

    const toggleR2Vote = (id: string) => {
      setR2Selected(prev => {
        if (prev.includes(id)) return prev.filter(v => v !== id);
        if (prev.length >= requiredR2Votes) return [prev[prev.length - 1], id];
        return [...prev, id];
      });
    };

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🗳️ Round 2 Vote</Text>
          </View>
          <Text style={styles.votingTitle}>Pick your top {requiredR2Votes === 1 ? '1' : '2'} to advance to the Final!</Text>
          <Text style={styles.votingSubtitle}>{votesIn} / {totalVotersR2} voted</Text>
          <Text style={styles.votingHint}>Select {requiredR2Votes === 1 ? '1 performer' : '2 performers'}</Text>

          <View style={styles.candidateList}>
            {gs.r2Results.map(r => {
              const isSelected = r2Selected.includes(r.playerId);
              const isSelf = myId === r.playerId;
              return (
                <TouchableOpacity
                  key={r.playerId}
                  style={[
                    styles.voteRow,
                    isSelected && styles.voteRowSelected,
                    isSelf && styles.voteRowSelf,
                  ]}
                  onPress={() => !isSelf && toggleR2Vote(r.playerId)}
                  activeOpacity={0.78}
                  disabled={isSelf}
                >
                  <View style={[styles.voteCheckbox, isSelected && styles.voteCheckboxSelected]}>
                    {isSelected && <Text style={styles.voteCheckmark}>✓</Text>}
                  </View>
                  <Text style={styles.voteRowName}>{r.playerName}</Text>
                  {isSelf && <Text style={styles.voteRowSelfLabel}>you</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <PrimaryButton
            title={`Submit Vote (${r2Selected.length}/${requiredR2Votes})`}
            onPress={() => {
              if (r2Selected.length >= requiredR2Votes) {
                sendPlayerAction('ts-vote-r2', { voteFor: r2Selected });
              }
            }}
            disabled={r2Selected.length < requiredR2Votes}
            style={{ marginTop: 8 }}
          />
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: tiebreak-prep ───────────────────────────────────────────────────
  if (gs.phase === 'tiebreak-prep') {
    const tiedNames = gs.tiebreakerCandidates
      .map(id => players.find(p => p.id === id)?.name ?? id)
      .join(' vs ');

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.tiebreakerHeader}>
            <Text style={styles.tiebreakerTitle}>
              {gs.round === 3 ? '⭐ FINAL TIEBREAKER!' : '⚡ TIEBREAKER!'}
            </Text>
            <Text style={styles.tiebreakerSubtitle}>
              {gs.round === 3 ? `${tiedNames} — 10 second tiebreaker!` : `${tiedNames} are tied`}
            </Text>
          </View>

          <View style={styles.performerBadge}>
            <Text style={styles.performerBadgeText}>
              🎤 {currentPerformer?.name ?? '???'}'s turn
            </Text>
          </View>

          <View style={styles.promptBoxTiebreak}>
            <Text style={styles.promptTiebreakLabel}>10-second challenge</Text>
            <Text style={styles.promptText}>{gs.prompt}</Text>
          </View>

          {iAmPerformer ? (
            <PrimaryButton
              title="Start →"
              onPress={() => sendPlayerAction('ts-start', {})}
            />
          ) : (
            <View style={styles.waitingBox}>
              <Text style={styles.waitingText}>
                {currentPerformer?.name ?? '...'} is getting ready...
              </Text>
            </View>
          )}
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: tiebreak-vote ───────────────────────────────────────────────────
  if (gs.phase === 'tiebreak-vote') {
    const amIVoterTB = gs.tbVoterIds.includes(myId ?? '');
    const iHaveSubmittedTB = gs.tbSubmittedVoterIds.includes(myId ?? '');
    const tbVotesIn = gs.tbSubmittedVoterIds.length;
    const tbTotalVoters = gs.tbVoterIds.length;
    const iAmTiebreakerCandidate = gs.tiebreakerCandidates.includes(myId ?? '');

    if (!amIVoterTB || iHaveSubmittedTB) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
  
          <View style={styles.centered}>
            {iHaveSubmittedTB ? (
              <>
                <Text style={styles.waitEmoji}>✅</Text>
                <Text style={styles.waitTitle}>Voted!</Text>
              </>
            ) : (
              <>
                <Text style={styles.waitEmoji}>⚡</Text>
                <Text style={styles.waitTitle}>Tiebreaker vote in progress</Text>
              </>
            )}
            <Text style={styles.waitSub}>
              {tbVotesIn} / {tbTotalVoters} voted
            </Text>
          </View>
  
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.tiebreakerHeader}>
            <Text style={styles.tiebreakerTitle}>
              {gs.round === 3 ? '⭐ FINAL TIEBREAKER VOTE' : '⚡ TIEBREAKER VOTE'}
            </Text>
          </View>
          <Text style={styles.votingTitle}>Who wins the tiebreaker?</Text>
          <Text style={styles.votingSubtitle}>{tbVotesIn} / {tbTotalVoters} voted</Text>
          <Text style={styles.votingHint}>Tap to vote instantly</Text>

          <View style={styles.candidateList}>
            {gs.tiebreakerCandidates.map(id => {
              const p = players.find(pl => pl.id === id);
              const isSelf = myId === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.voteRow, styles.voteRowInstant, isSelf && styles.voteRowSelf]}
                  onPress={() => {
                    if (!isSelf) sendPlayerAction('ts-vote-tb', { voteFor: id });
                  }}
                  activeOpacity={0.78}
                  disabled={isSelf}
                >
                  <Text style={styles.voteRowName}>{p?.name ?? id}</Text>
                  {isSelf
                    ? <Text style={styles.voteRowSelfLabel}>you</Text>
                    : <Text style={styles.voteRowArrow}>→</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: r3-voting ───────────────────────────────────────────────────────
  if (gs.phase === 'r3-voting') {
    const iAmFinalist = (gs.r3FinalistIds ?? []).includes(myId ?? '');
    const amIR3Voter = (gs.r3VoterIds ?? []).includes(myId ?? '');
    const iHaveSubmittedR3 = (gs.r3SubmittedVoterIds ?? []).includes(myId ?? '');
    const r3VotesIn = (gs.r3SubmittedVoterIds ?? []).length;

    if (iAmFinalist || !amIR3Voter || iHaveSubmittedR3) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
  
          <View style={styles.centered}>
            {iHaveSubmittedR3 ? (
              <><Text style={styles.waitEmoji}>🏆</Text><Text style={styles.waitTitle}>Final vote cast!</Text></>
            ) : iAmFinalist ? (
              <><Text style={styles.waitEmoji}>😤</Text><Text style={styles.waitTitle}>The crowd is voting...</Text></>
            ) : (
              <><Text style={styles.waitEmoji}>🏆</Text><Text style={styles.waitTitle}>Final vote in progress</Text></>
            )}
            <Text style={styles.waitSub}>{r3VotesIn} / {(gs.r3VoterIds ?? []).length} voted</Text>
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
            <Text style={styles.badgeText}>🏆 Final Vote</Text>
          </View>
          <Text style={styles.votingTitle}>Cast your final vote!</Text>
          <Text style={styles.votingSubtitle}>{r3VotesIn} / {(gs.r3VoterIds ?? []).length} voted</Text>
          <Text style={styles.votingHint}>Who should win the Talent Show?</Text>

          <View style={styles.candidateList}>
            {gs.r3FinalistIds.map(id => {
              const p = players.find(pl => pl.id === id);
              const isSelf = myId === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.voteRow, styles.voteRowInstant, styles.voteRowFinals, isSelf && styles.voteRowSelf]}
                  onPress={() => {
                    if (!isSelf) sendPlayerAction('ts-vote-r3', { voteFor: id });
                  }}
                  activeOpacity={0.78}
                  disabled={isSelf}
                >
                  <Text style={[styles.voteRowName, styles.voteRowNameFinals]}>{p?.name ?? id}</Text>
                  {isSelf
                    ? <Text style={styles.voteRowSelfLabel}>you</Text>
                    : <Text style={styles.voteRowArrow}>→</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: winner ──────────────────────────────────────────────────────────
  if (gs.phase === 'winner') {
    const winner = players.find(p => p.id === gs.winnerId);
    const runnerUp = players.find(p => p.id === gs.runnerUpId);

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.winnerHeadline}>🎉 Talent Show Over!</Text>

          <View style={styles.winnerPodium}>
            <View style={styles.winnerCard}>
              <Text style={styles.winnerMedal}>🥇</Text>
              <Text style={styles.winnerName}>{winner?.name ?? '???'}</Text>
              <Text style={styles.winnerSub}>Winner · +1 point</Text>
            </View>

            {runnerUp && (
              <View style={[styles.winnerCard, styles.runnerUpCard]}>
                <Text style={styles.winnerMedal}>🥈</Text>
                <Text style={[styles.winnerName, styles.runnerUpName]}>{runnerUp.name}</Text>
                <Text style={styles.winnerSub}>Runner-up</Text>
              </View>
            )}
          </View>

          {(gs.r1Results ?? []).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Round 1 Results</Text>
              <View style={styles.resultTable}>
                {gs.r1Results.map(r => {
                  const color =
                    r.outcome === 'eliminated'
                      ? COLORS.danger
                      : r.outcome === 'golden'
                      ? COLORS.warning
                      : COLORS.success;
                  const label =
                    r.outcome === 'eliminated' ? 'ELIM' : r.outcome === 'golden' ? 'GOLDEN' : 'ADV';
                  return (
                    <View key={r.playerId} style={styles.resultTableRow}>
                      <Text style={styles.resultTableName}>{r.playerName}</Text>
                      <Text style={styles.resultTableStats}>
                        🔴{r.buzzCount} ⭐{r.goldenCount}
                      </Text>
                      <Text style={[styles.resultTableOutcome, { color }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.actions}>
            {isHost ? (
              <>
                <PrimaryButton title="Play Again" onPress={handlePlayAgain} />
                <SecondaryButton
                  title="Choose New Game"
                  onPress={() => navigation.navigate('GameSelect')}
                />
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

  // Fallback
  return (
    <SafeAreaView style={styles.safe}>

      <View style={styles.centered}>
        <Text style={styles.waitTitle}>Loading...</Text>
      </View>

    </SafeAreaView>
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
    gap: 16,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },

  centeredFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 14,
  },

  centeredScroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 14,
  },

  goBackLink: {
    color: COLORS.text2,
    textDecorationLine: 'underline',
    fontSize: 14,
  },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'center',
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.bold },

  roundBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 9999,
    paddingVertical: 5,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  roundBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONTS.extrabold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  roundIntroContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  roundIntroTop: {
    alignItems: 'center',
    gap: 20,
  },
  roundIntroEmoji: {
    fontSize: 80,
  },
  roundIntroBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  roundIntroBadgeFinals: {
    backgroundColor: COLORS.warning,
  },
  roundIntroBadgeText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: FONTS.extrabold,
    letterSpacing: 3,
  },
  roundIntroBody: {
    gap: 16,
    alignItems: 'center',
  },
  roundIntroDescLarge: {
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 28,
    fontFamily: FONTS.semibold,
  },
  roundIntroTip: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roundIntroTipText: {
    fontSize: 13,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
  },
  roundIntroBottom: {
    gap: 12,
  },

  finalistsVsLabel: {
    fontSize: 11,
    fontFamily: FONTS.extrabold,
    color: COLORS.warning,
    letterSpacing: 3,
    textAlign: 'center',
  },
  finalistsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  finalistName: {
    fontSize: 36,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -1,
    textAlign: 'center',
  },
  finalistsVs: {
    fontSize: 16,
    fontFamily: FONTS.extrabold,
    color: COLORS.warning,
    letterSpacing: 2,
  },

  performerBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  performerBadgeText: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: FONTS.extrabold,
  },

  extremeLabel: {
    backgroundColor: COLORS.danger + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  extremeLabelText: {
    color: COLORS.danger,
    fontSize: 12,
    fontFamily: FONTS.extrabold,
    letterSpacing: 1.5,
  },

  // ── Prompt boxes ─────────────────────────────────────────────────────────
  promptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  promptBoxFinals: {
    borderColor: COLORS.warning,
    borderWidth: 2,
  },
  promptBoxSmall: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxWidth: 320,
    alignSelf: 'center',
  },
  promptBoxTiebreak: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 6,
  },
  promptTiebreakLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  promptText: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  promptTextSmall: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 22,
  },

  prepInfo: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  prepInfoText: {
    fontSize: 13,
    color: COLORS.text2,
    lineHeight: 19,
  },

  waitingBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
  },

  // ── Get-ready screen ──────────────────────────────────────────────────────
  getReadyLabel: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bigCountdown: {
    fontSize: 120,
    fontFamily: FONTS.extrabold,
    letterSpacing: -5,
    lineHeight: 120,
  },
  getReadyPerformer: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
  },

  // ── Performing screen ─────────────────────────────────────────────────────
  performTimer: {
    fontSize: 90,
    fontFamily: FONTS.extrabold,
    letterSpacing: -4,
    lineHeight: 90,
  },
  performTimerLabel: {
    fontSize: 13,
    color: COLORS.text3,
    fontFamily: FONTS.medium,
    marginTop: -6,
  },

  buzzStats: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  buzzStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 2,
  },
  buzzStatDivider: {
    width: 1,
    backgroundColor: COLORS.borderHi,
  },
  buzzStatCount: {
    fontSize: 26,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
  },
  buzzStatLabel: {
    fontSize: 11,
    color: COLORS.text3,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
  },

  reactionRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
    justifyContent: 'center',
  },

  buzzBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.4,
  },
  buzzBtnUsed: { opacity: 0.3 },
  buzzBtnEmoji: { fontSize: 28 },
  buzzBtnText: {
    fontSize: 16,
    fontFamily: FONTS.extrabold,
    color: '#fff',
    letterSpacing: 2,
  },
  buzzBtnCount: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.semibold },

  goldenBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.warning,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: COLORS.warning,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.4,
  },
  goldenBtnUsed: { opacity: 0.3 },
  goldenBtnEmoji: { fontSize: 28 },
  goldenBtnText: {
    fontSize: 16,
    fontFamily: FONTS.extrabold,
    color: '#fff',
    letterSpacing: 1,
  },
  goldenBtnCount: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.semibold },

  reactedNotice: {
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  reactedNoticeText: { fontSize: 13, color: COLORS.text2 },

  buzzThresholdNote: { marginTop: 4 },
  buzzThresholdText: {
    fontSize: 11,
    color: COLORS.text3,
    textAlign: 'center',
  },

  watchText: {
    fontSize: 14,
    color: COLORS.text3,
    marginTop: 4,
  },

  // ── R1 Result card ────────────────────────────────────────────────────────
  resultEmoji: { fontSize: 70 },
  resultName: {
    fontSize: 32,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
  },
  resultOutcome: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  resultStats: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  resultStatText: {
    fontSize: 14,
    color: COLORS.text2,
    fontFamily: FONTS.semibold,
  },
  resultSub: {
    fontSize: 14,
    color: COLORS.text3,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  progressPill: {
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  progressText: { fontSize: 12, color: COLORS.text3, fontFamily: FONTS.medium },
  advanceBtn: { marginTop: 20, width: '100%' },

  // ── Voting ────────────────────────────────────────────────────────────────
  votingTitle: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
  },
  votingSubtitle: {
    fontSize: 13,
    color: COLORS.text2,
    textAlign: 'center',
  },
  votingHint: {
    fontSize: 12,
    color: COLORS.text3,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  candidateList: { gap: 10 },

  voteRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voteRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '18',
  },
  voteRowSelf: { opacity: 0.4 },
  voteRowInstant: { paddingVertical: 20 },
  voteRowFinals: {
    borderColor: COLORS.warning + '55',
    backgroundColor: COLORS.warning + '0A',
  },
  voteRowName: {
    flex: 1,
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  voteRowNameFinals: { fontSize: 20 },
  voteRowSelfLabel: {
    fontSize: 12,
    color: COLORS.text3,
    fontStyle: 'italic',
  },
  voteRowArrow: { fontSize: 18, color: COLORS.text2 },

  voteCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteCheckboxSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  voteCheckmark: {
    fontSize: 13,
    color: '#fff',
    fontFamily: FONTS.extrabold,
  },

  // ── Tiebreaker ────────────────────────────────────────────────────────────
  tiebreakerHeader: {
    backgroundColor: COLORS.warning + '18',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  tiebreakerTitle: {
    fontSize: 26,
    fontFamily: FONTS.extrabold,
    color: COLORS.warning,
    letterSpacing: 1,
  },
  tiebreakerSubtitle: {
    fontSize: 14,
    color: COLORS.text2,
    fontFamily: FONTS.semibold,
  },

  // ── Winner ceremony ───────────────────────────────────────────────────────
  winnerHeadline: {
    fontSize: 30,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  winnerPodium: {
    gap: 10,
    marginBottom: 4,
  },
  winnerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.warning,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: COLORS.warning,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.2,
  },
  runnerUpCard: {
    borderColor: COLORS.text3,
    shadowColor: 'transparent',
    shadowOpacity: 0,
  },
  winnerMedal: { fontSize: 44 },
  winnerName: {
    fontSize: 28,
    fontFamily: FONTS.extrabold,
    color: COLORS.accentHi,
    textAlign: 'center',
  },
  runnerUpName: { color: COLORS.text2 },
  winnerSub: { fontSize: 13, color: COLORS.text3 },

  // ── Result table ──────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  resultTable: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resultTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  resultTableName: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  resultTableStats: {
    fontSize: 12,
    color: COLORS.text3,
    marginRight: 10,
  },
  resultTableOutcome: {
    fontSize: 11,
    fontFamily: FONTS.extrabold,
    letterSpacing: 1,
  },

  // ── Neutral vote ──────────────────────────────────────────────────────────
  neutralVoteContext: {
    fontSize: 14,
    color: COLORS.text3,
    textAlign: 'center',
  },
  neutralBtnRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginTop: 8,
  },
  neutralAdvanceBtn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.4,
  },
  neutralEliminateBtn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.4,
  },
  neutralBtnEmoji: {
    fontSize: 32,
  },
  neutralBtnText: {
    fontSize: 14,
    fontFamily: FONTS.extrabold,
    color: '#fff',
    letterSpacing: 1.5,
  },

  // ── Misc ──────────────────────────────────────────────────────────────────
  actions: { gap: 10, marginTop: 8 },
  waitEmoji: { fontSize: 52 },
  waitTitle: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  waitSub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
  },
});
