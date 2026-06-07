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
import { COLORS, RADIUS, FONTS } from '../constants/theme';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import GameIntro from '../components/GameIntro';
import PhaseTransition from '../components/PhaseTransition';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ConfessBet'>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#e8927c';
const ACCENT_BG = 'rgba(232,146,124,0.12)';
const MULTIPLIERS = [3, 2, 1.5];
const MIN_BETS = [2, 5, 10];
const STARTING_BANK = 100;
const ROUND_OPTIONS = [3, 5, 8] as const;

const PROMPT_SETS = [
  ["What's the pettiest thing you've ever done?", "Confess a tiny lie you tell all the time.", "What do you secretly judge people for?"],
  ["Admit an irrational fear you have.", "What's the weirdest thing you do alone?", "Confess a guilty pleasure you'd never post."],
  ["What's a grudge you're still holding?", "Admit something you pretend to like.", "What's the most childish thing you still do?"],
  ["Confess a white lie from this week.", "What's a hill you'd embarrassingly die on?", "Admit a habit you hide from people."],
  ["What's something you've Googled and immediately regretted?", "Confess a time you blamed someone else for your mistake.", "What's a compliment you give that you never mean?"],
  ["Admit a text you've left on read for no reason.", "What's the dumbest thing that's made you cry?", "Confess something you do only when no one's watching."],
  ["What's a skill you fake having?", "Admit the pettiest reason you've disliked someone.", "What's a 'small' lie that snowballed on you?"],
  ["Confess a snack you've hidden so you didn't have to share.", "What's an opinion you'd never say out loud at work?", "Admit something embarrassing in your search history."],
  ["What's a chore you pretend to forget?", "Confess a time you pretended to know what someone was talking about.", "What's your most unreasonable dealbreaker?"],
  ["Admit a way you've cheated at a game.", "What's a sound or habit that secretly enrages you?", "Confess something you've never told your closest friend."],
  ["What's the most childish reason you've held a grudge?", "Admit a purchase you're weirdly ashamed of.", "What's a lie you've told to get out of plans?"],
  ["Confess a time you took credit you didn't deserve.", "What's a 'guilty' food combo you genuinely love?", "Admit something you do to look busy when you're not."],
];

// ─── Game state types ─────────────────────────────────────────────────────────

interface StreetAction {
  playerId: string;
  folded: boolean;
  bet?: number;
  targetId?: string;
}

interface StreetActionWithStreet extends StreetAction {
  street: number;
}

interface SettlementResult {
  playerId: string;
  net: number;
  correct: boolean;
  targetId?: string;
  bet?: number;
  street?: number;
}

interface SettlementData {
  confessorId: string;
  results: SettlementResult[];
}

interface CBGameState {
  game: 'confessBet';
  phase: 'intro' | 'submit' | 'street' | 'reveal' | 'game-over';
  totalRounds: number;
  currentRound: number;
  usedPromptSets: number[];
  prompts: string[];
  submissions: Record<string, string[]>;
  submittedPlayerIds: string[];
  confessorId: string;
  confessorCards: string[];
  street: number;
  bettingOrder: string[];
  currentBettorIdx: number;
  streetActions: StreetAction[];
  allActions: StreetActionWithStreet[];
  foldedPlayerIds: string[];
  banks: Record<string, number>;
  settlementData?: SettlementData;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickPromptSet(usedSets: number[]): { prompts: string[]; index: number } {
  const available = PROMPT_SETS.map((_, i) => i).filter(i => !usedSets.includes(i));
  const pool = available.length > 0 ? available : PROMPT_SETS.map((_, i) => i);
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { prompts: PROMPT_SETS[index], index };
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function computeSettlement(gs: CBGameState, playerNames: Record<string, string>): SettlementData {
  const { confessorId, allActions, banks } = gs;
  const results: SettlementResult[] = [];

  // Group actions by player (last action per player is what counts, but we track all streets)
  const playerBets = new Map<string, StreetActionWithStreet[]>();
  for (const action of allActions) {
    if (!playerBets.has(action.playerId)) playerBets.set(action.playerId, []);
    playerBets.get(action.playerId)!.push(action);
  }

  for (const [playerId, actions] of playerBets) {
    // Find the last non-fold bet action for this player
    const betActions = actions.filter(a => !a.folded && a.bet !== undefined);
    const foldAction = actions.find(a => a.folded);

    if (playerId === confessorId) {
      // Confessor's camouflage bet is fully refunded
      results.push({
        playerId,
        net: 0,
        correct: false, // confessor doesn't "guess"
        targetId: betActions.length > 0 ? betActions[betActions.length - 1].targetId : undefined,
        bet: betActions.length > 0 ? betActions[betActions.length - 1].bet : 0,
        street: betActions.length > 0 ? betActions[betActions.length - 1].street : undefined,
      });
      continue;
    }

    if (betActions.length === 0) {
      // Player folded without betting
      results.push({ playerId, net: 0, correct: false });
      continue;
    }

    // Use the latest bet action
    const lastBet = betActions[betActions.length - 1];
    const correct = lastBet.targetId === confessorId;
    const streetMultiplier = MULTIPLIERS[lastBet.street] ?? 1.5;

    if (correct) {
      // Win: bet * (multiplier - 1)
      const winnings = Math.round(lastBet.bet! * (streetMultiplier - 1));
      results.push({
        playerId,
        net: winnings,
        correct: true,
        targetId: lastBet.targetId,
        bet: lastBet.bet,
        street: lastBet.street,
      });
    } else {
      // Lose: -bet (goes to confessor)
      results.push({
        playerId,
        net: -lastBet.bet!,
        correct: false,
        targetId: lastBet.targetId,
        bet: lastBet.bet,
        street: lastBet.street,
      });
    }
  }

  // Players who had no actions at all (edge case)
  const allPlayerIds = Object.keys(banks);
  for (const pid of allPlayerIds) {
    if (!playerBets.has(pid)) {
      results.push({ playerId: pid, net: 0, correct: false });
    }
  }

  return { confessorId, results };
}

function applySettlement(banks: Record<string, number>, settlement: SettlementData): Record<string, number> {
  const newBanks = { ...banks };
  const confessorId = settlement.confessorId;
  let confessorGains = 0;

  for (const result of settlement.results) {
    if (result.playerId === confessorId) continue;
    newBanks[result.playerId] = Math.max(0, (newBanks[result.playerId] ?? 0) + result.net);
    if (result.net < 0) {
      // Lost bet goes to confessor
      confessorGains += Math.abs(result.net);
    }
  }

  newBanks[confessorId] = (newBanks[confessorId] ?? 0) + confessorGains;
  return newBanks;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConfessBetScreen({ navigation }: Props) {
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

  const allPlayers = room?.players ?? players;
  const gsRef = useRef<CBGameState | null>(null);
  const sendGameStateRef = useRef(sendGameState);
  useEffect(() => { sendGameStateRef.current = sendGameState; }, [sendGameState]);

  const gs = (room?.gameState?.game === 'confessBet' ? room.gameState : null) as CBGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // Local state
  const [confessions, setConfessions] = useState<string[]>(['', '', '']);
  const [hasSubmittedLocally, setHasSubmittedLocally] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [wagerText, setWagerText] = useState('');
  const [revealStep, setRevealStep] = useState(0); // 0=not started, 1=showing confessor, 2=showing results

  // Reset local state on phase/round change
  useEffect(() => {
    setConfessions(['', '', '']);
    setHasSubmittedLocally(false);
    setSelectedTarget(null);
    setWagerText('');
    setRevealStep(0);
  }, [gs?.phase, gs?.currentRound]);

  // Reset betting UI when street changes
  useEffect(() => {
    setSelectedTarget(null);
    setWagerText('');
  }, [gs?.street]);

  // Setup timeout
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

  // ── Host: handle player actions ─────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      if (!state) return;
      const ap = room?.players ?? players;

      // ── cb-submit ──
      if (action === 'cb-submit' && state.phase === 'submit') {
        const { confessions: playerConfessions } = data as { confessions: string[] };
        if (state.submittedPlayerIds.includes(playerId)) return;

        const nextSubmissions = { ...state.submissions, [playerId]: playerConfessions };
        const nextSubmittedIds = [...state.submittedPlayerIds, playerId];

        // Check if all players have submitted
        if (nextSubmittedIds.length >= ap.length) {
          // Pick confessor randomly
          const confessorId = ap[Math.floor(Math.random() * ap.length)].id;
          const confessorCards = shuffleArray((nextSubmissions as Record<string, string[]>)[confessorId] ?? ['', '', '']) as string[];
          const bettingOrder = shuffleArray(ap.map(p => p.id));

          const next: CBGameState = {
            ...state,
            submissions: nextSubmissions,
            submittedPlayerIds: nextSubmittedIds,
            phase: 'street',
            confessorId,
            confessorCards,
            street: 0,
            bettingOrder,
            currentBettorIdx: 0,
            streetActions: [],
            allActions: [],
            foldedPlayerIds: [],
          };
          gsRef.current = next;
          sendGameStateRef.current(next);
        } else {
          const next: CBGameState = {
            ...state,
            submissions: nextSubmissions,
            submittedPlayerIds: nextSubmittedIds,
          };
          gsRef.current = next;
          sendGameStateRef.current(next);
        }
      }

      // ── cb-bet ──
      if (action === 'cb-bet' && state.phase === 'street') {
        const { targetId, amount } = data as { targetId: string; amount: number };
        if (state.bettingOrder[state.currentBettorIdx] !== playerId) return;

        const streetAction: StreetAction = { playerId, folded: false, bet: amount, targetId };
        const nextStreetActions = [...state.streetActions, streetAction];
        const nextAllActions: StreetActionWithStreet[] = [...state.allActions, { ...streetAction, street: state.street }];
        const nextBettorIdx = state.currentBettorIdx + 1;

        // Check if all bettors for this street have acted
        if (nextBettorIdx >= state.bettingOrder.length) {
          // Advance to next street or reveal
          if (state.street >= 2) {
            // All streets done — go to reveal
            const settlement = computeSettlement(
              { ...state, streetActions: nextStreetActions, allActions: nextAllActions },
              Object.fromEntries(ap.map(p => [p.id, p.name])),
            );
            const newBanks = applySettlement(state.banks, settlement);
            const next: CBGameState = {
              ...state,
              streetActions: nextStreetActions,
              allActions: nextAllActions,
              phase: 'reveal',
              banks: newBanks,
              settlementData: settlement,
            };
            gsRef.current = next;
            sendGameStateRef.current(next);
          } else {
            // Next street
            const nextStreet = state.street + 1;
            const newBettingOrder = shuffleArray(
              state.bettingOrder.filter(id => !state.foldedPlayerIds.includes(id))
            );
            const next: CBGameState = {
              ...state,
              streetActions: [],
              allActions: nextAllActions,
              street: nextStreet,
              bettingOrder: newBettingOrder,
              currentBettorIdx: 0,
            };
            gsRef.current = next;
            sendGameStateRef.current(next);
          }
        } else {
          const next: CBGameState = {
            ...state,
            streetActions: nextStreetActions,
            allActions: nextAllActions,
            currentBettorIdx: nextBettorIdx,
          };
          gsRef.current = next;
          sendGameStateRef.current(next);
        }
      }

      // ── cb-fold ──
      if (action === 'cb-fold' && state.phase === 'street') {
        if (state.bettingOrder[state.currentBettorIdx] !== playerId) return;

        const streetAction: StreetAction = { playerId, folded: true };
        const nextStreetActions = [...state.streetActions, streetAction];
        const nextAllActions: StreetActionWithStreet[] = [...state.allActions, { ...streetAction, street: state.street }];
        const nextFolded = [...state.foldedPlayerIds, playerId];
        const nextBettorIdx = state.currentBettorIdx + 1;

        if (nextBettorIdx >= state.bettingOrder.length) {
          if (state.street >= 2) {
            const settlement = computeSettlement(
              { ...state, streetActions: nextStreetActions, allActions: nextAllActions, foldedPlayerIds: nextFolded },
              Object.fromEntries(ap.map(p => [p.id, p.name])),
            );
            const newBanks = applySettlement(state.banks, settlement);
            const next: CBGameState = {
              ...state,
              streetActions: nextStreetActions,
              allActions: nextAllActions,
              foldedPlayerIds: nextFolded,
              phase: 'reveal',
              banks: newBanks,
              settlementData: settlement,
            };
            gsRef.current = next;
            sendGameStateRef.current(next);
          } else {
            const nextStreet = state.street + 1;
            const newBettingOrder = shuffleArray(
              state.bettingOrder.filter(id => !nextFolded.includes(id))
            );
            // If everyone folded, go straight to reveal
            if (newBettingOrder.length === 0) {
              const settlement = computeSettlement(
                { ...state, streetActions: nextStreetActions, allActions: nextAllActions, foldedPlayerIds: nextFolded },
                Object.fromEntries(ap.map(p => [p.id, p.name])),
              );
              const newBanks = applySettlement(state.banks, settlement);
              const next: CBGameState = {
                ...state,
                streetActions: nextStreetActions,
                allActions: nextAllActions,
                foldedPlayerIds: nextFolded,
                phase: 'reveal',
                banks: newBanks,
                settlementData: settlement,
              };
              gsRef.current = next;
              sendGameStateRef.current(next);
            } else {
              const next: CBGameState = {
                ...state,
                streetActions: [],
                allActions: nextAllActions,
                foldedPlayerIds: nextFolded,
                street: nextStreet,
                bettingOrder: newBettingOrder,
                currentBettorIdx: 0,
              };
              gsRef.current = next;
              sendGameStateRef.current(next);
            }
          }
        } else {
          const next: CBGameState = {
            ...state,
            streetActions: nextStreetActions,
            allActions: nextAllActions,
            foldedPlayerIds: nextFolded,
            currentBettorIdx: nextBettorIdx,
          };
          gsRef.current = next;
          sendGameStateRef.current(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]); // eslint-disable-line

  // ── Host actions ────────────────────────────────────────────────────────────

  const handleSelectRounds = (n: number) => {
    if (!isHost || !gs) return;
    const { prompts, index } = pickPromptSet(gs.usedPromptSets ?? []);
    const banks: Record<string, number> = {};
    for (const p of allPlayers) {
      banks[p.id] = STARTING_BANK;
    }
    const next: CBGameState = {
      ...gs,
      phase: 'submit',
      totalRounds: n,
      currentRound: 1,
      usedPromptSets: [index],
      prompts,
      submissions: {},
      submittedPlayerIds: [],
      confessorId: '',
      confessorCards: [],
      street: 0,
      bettingOrder: [],
      currentBettorIdx: 0,
      streetActions: [],
      allActions: [],
      foldedPlayerIds: [],
      banks,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleNextRound = () => {
    if (!isHost || !gs) return;
    const nextRound = gs.currentRound + 1;
    if (nextRound > gs.totalRounds) {
      const next: CBGameState = { ...gs, phase: 'game-over' };
      gsRef.current = next;
      sendGameStateRef.current(next);
      return;
    }
    const { prompts, index } = pickPromptSet(gs.usedPromptSets);
    const next: CBGameState = {
      ...gs,
      phase: 'submit',
      currentRound: nextRound,
      usedPromptSets: [...gs.usedPromptSets, index],
      prompts,
      submissions: {},
      submittedPlayerIds: [],
      confessorId: '',
      confessorCards: [],
      street: 0,
      bettingOrder: [],
      currentBettorIdx: 0,
      streetActions: [],
      allActions: [],
      foldedPlayerIds: [],
      settlementData: undefined,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  // ── Player action helpers ───────────────────────────────────────────────────

  const handleSubmitConfessions = () => {
    const trimmed = confessions.map(c => c.trim());
    if (trimmed.some(c => c.length === 0)) return;
    setHasSubmittedLocally(true);
    sendPlayerAction('cb-submit', { confessions: trimmed });
  };

  const handleBet = () => {
    if (!selectedTarget || !wagerText) return;
    const amount = parseInt(wagerText, 10);
    if (isNaN(amount) || amount < MIN_BETS[gs?.street ?? 0]) return;
    const myBank = gs?.banks[myId] ?? 0;
    if (amount > myBank) return;
    sendPlayerAction('cb-bet', { targetId: selectedTarget, amount });
  };

  const handleFold = () => {
    sendPlayerAction('cb-fold', {});
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const playerNameMap: Record<string, string> = {};
  for (const p of allPlayers) {
    playerNameMap[p.id] = p.name;
  }

  // ── Intro ───────────────────────────────────────────────────────────────────

  if (!gs || gs.phase === 'intro' || (gs.phase as string) === 'start') {
    return (
      <GameIntro
        emoji="🎭"
        title="Confess & Bet"
        tagline="Bluff your confessions. Bet on who spilled the truth."
        rules={[
          { emoji: '✍️', text: 'Everyone writes 3 confessions to prompts. One player is secretly chosen as the confessor.' },
          { emoji: '🃏', text: "The confessor's cards are revealed one at a time across 3 betting streets." },
          { emoji: '💰', text: 'Bet on who you think the confessor is. Early streets pay more (3x, 2x, 1.5x).' },
          { emoji: '🎭', text: 'The confessor bets too (camouflage). Correct guesses win big. Wrong guesses lose to the confessor.' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (!gs) {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey="loading">
          <View style={styles.centered}>
            {setupTimedOut ? (
              <>
                <Text style={styles.waitTitle}>Could not load game</Text>
                <Text style={styles.waitSub}>Lost connection to the server.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
                  <Text style={[styles.waitSub, { textDecorationLine: 'underline' }]}>Go back</Text>
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

  // ── Setup (host picks rounds) ───────────────────────────────────────────────

  if (gs.phase === 'submit' && gs.totalRounds === 0) {
    // This state shouldn't happen with current flow, but guard anyway
  }

  // If no totalRounds set yet, show setup
  if (!gs.totalRounds || gs.totalRounds === 0) {
    if (isHost) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey="setup">
            <View style={styles.centered}>
              <Text style={styles.waitEmoji}>🎭</Text>
              <Text style={styles.setupTitle}>How many rounds?</Text>
              <Text style={styles.setupSub}>
                Each round a new confessor is chosen. Chip stacks carry forward.
              </Text>
              <View style={styles.setupOptions}>
                {ROUND_OPTIONS.map(n => (
                  <TouchableOpacity key={n} style={styles.setupOption} onPress={() => handleSelectRounds(n)}>
                    <Text style={styles.setupOptionNum}>{n}</Text>
                    <Text style={styles.setupOptionLabel}>rounds</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </PhaseTransition>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey="setup">
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🎭</Text>
            <Text style={styles.waitTitle}>Waiting for host...</Text>
            <Text style={styles.waitSub}>Host is choosing the number of rounds.</Text>
          </View>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: game-over ────────────────────────────────────────────────────────

  if (gs.phase === 'game-over') {
    const sorted = [...allPlayers].sort((a, b) => (gs.banks[b.id] ?? 0) - (gs.banks[a.id] ?? 0));
    const topChips = gs.banks[sorted[0]?.id] ?? 0;
    const winners = sorted.filter(p => (gs.banks[p.id] ?? 0) === topChips);

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.gameOverEmoji}>🏆</Text>
            <Text style={styles.gameOverTitle}>
              {winners.map(p => p.name).join(' & ')} wins!
            </Text>
            <Text style={styles.gameOverSub}>
              After {gs.totalRounds} round{gs.totalRounds > 1 ? 's' : ''} with ${topChips} chips.
            </Text>

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Final Chip Standings</Text>

            {sorted.map((p, i) => {
              const isMe = p.id === myId;
              const chips = gs.banks[p.id] ?? 0;
              return (
                <View key={p.id} style={[styles.standingRow, isMe && styles.standingRowMe]}>
                  <Text style={[styles.standingRank, isMe && styles.standingRankMe]}>#{i + 1}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Text style={[styles.standingName, isMe && styles.standingNameMe]} numberOfLines={1}>{p.name}</Text>
                    {isMe && <Text style={styles.standingYouBadge}>YOU</Text>}
                  </View>
                  <Text style={[styles.standingScore, { color: i === 0 ? COLORS.success : isMe ? COLORS.warning : COLORS.text2 }]}>
                    ${chips}
                  </Text>
                </View>
              );
            })}

            <View style={styles.actions}>
              {isHost ? (
                <>
                  <PrimaryButton title="Play Again" onPress={() => startGame('confessBet')} />
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

  // ── Phase: submit ───────────────────────────────────────────────────────────

  if (gs.phase === 'submit') {
    const iHaveSubmitted = hasSubmittedLocally || (gs.submittedPlayerIds ?? []).includes(myId);
    const submittedCount = (gs.submittedPlayerIds ?? []).length;
    const totalPlayers = allPlayers.length;

    if (iHaveSubmitted) {
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey={gs.phase}>
            <View style={styles.centered}>
              <Text style={styles.waitEmoji}>✅</Text>
              <Text style={styles.waitTitle}>Confessions submitted!</Text>
              <Text style={styles.waitSub}>
                {submittedCount} / {totalPlayers} players submitted
              </Text>
              <Text style={[styles.waitSub, { marginTop: 4 }]}>
                Waiting for everyone to confess...
              </Text>
            </View>
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    const allFilled = confessions.every(c => c.trim().length > 0);

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  Round {gs.currentRound} / {gs.totalRounds}
                </Text>
              </View>

              <Text style={styles.submitTitle}>Write your confessions</Text>
              <Text style={styles.submitSub}>
                Answer honestly (or bluff). One player will be randomly chosen as the confessor.
              </Text>

              {gs.prompts.map((prompt, i) => (
                <View key={i} style={styles.confessionBlock}>
                  <Text style={styles.promptLabel}>Prompt {i + 1}</Text>
                  <View style={styles.promptCard}>
                    <Text style={styles.promptCardText}>{prompt}</Text>
                  </View>
                  <TextInput
                    style={styles.confessionInput}
                    placeholder="Your confession..."
                    placeholderTextColor={COLORS.text3}
                    value={confessions[i]}
                    onChangeText={(text) => {
                      const next = [...confessions];
                      next[i] = text;
                      setConfessions(next);
                    }}
                    maxLength={120}
                    multiline
                    keyboardAppearance="dark"
                    inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
                  />
                </View>
              ))}

              <PrimaryButton
                title="Submit Confessions"
                onPress={handleSubmitConfessions}
                disabled={!allFilled}
                style={{ marginTop: 8 }}
              />

              <Text style={styles.playerProgress}>
                {submittedCount} / {totalPlayers} submitted
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
          <KeyboardDoneBar />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: street ───────────────────────────────────────────────────────────

  if (gs.phase === 'street') {
    const currentStreet = gs.street;
    const revealedCards = gs.confessorCards.slice(0, currentStreet + 1);
    const multiplier = MULTIPLIERS[currentStreet];
    const minBet = MIN_BETS[currentStreet];
    const currentBettorId = gs.bettingOrder[gs.currentBettorIdx];
    const isMyTurn = currentBettorId === myId;
    const currentBettorName = playerNameMap[currentBettorId] ?? 'Someone';
    const amIConfessor = myId === gs.confessorId;
    const myBank = gs.banks[myId] ?? 0;
    const iAmFolded = gs.foldedPlayerIds.includes(myId);

    // Targets: all other players
    const bettingTargets = allPlayers.filter(p => p.id !== myId);

    const parsedWager = parseInt(wagerText, 10);
    const wagerValid = !isNaN(parsedWager) && parsedWager >= minBet && parsedWager <= myBank;

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={`street-${currentStreet}`}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={styles.streetHeader}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    Round {gs.currentRound} / {gs.totalRounds}
                  </Text>
                </View>
                <View style={[styles.streetBadge]}>
                  <Text style={styles.streetBadgeText}>
                    Street {currentStreet + 1} / 3
                  </Text>
                </View>
              </View>

              {/* Chip Rail */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRailScroll}>
                <View style={styles.chipRail}>
                  {allPlayers.map(p => {
                    const chips = gs.banks[p.id] ?? 0;
                    const isMe = p.id === myId;
                    const isConfessorPlayer = p.id === gs.confessorId && myId === gs.confessorId;
                    return (
                      <View key={p.id} style={[styles.chipItem, isMe && styles.chipItemMe]}>
                        <Text style={[styles.chipName, isMe && { color: ACCENT }]} numberOfLines={1}>
                          {p.name}
                          {isConfessorPlayer ? ' (you)' : ''}
                        </Text>
                        <Text style={[styles.chipAmount, isMe && { color: ACCENT }]}>${chips}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Multiplier Badge */}
              <View style={styles.multiplierRow}>
                <View style={styles.multiplierBadge}>
                  <Text style={styles.multiplierText}>{multiplier}x payout</Text>
                </View>
                <Text style={styles.minBetText}>min bet: ${minBet}</Text>
              </View>

              {/* Revealed Cards */}
              <Text style={styles.sectionLabel}>Confessor's Cards</Text>
              <View style={styles.cardsContainer}>
                {revealedCards.map((card, i) => (
                  <View key={i} style={styles.confessionCard}>
                    <View style={styles.cardStreetBadge}>
                      <Text style={styles.cardStreetText}>#{i + 1}</Text>
                    </View>
                    <Text style={styles.confessionCardText}>{card}</Text>
                  </View>
                ))}
                {/* Unrevealed cards */}
                {Array.from({ length: 3 - revealedCards.length }).map((_, i) => (
                  <View key={`hidden-${i}`} style={styles.hiddenCard}>
                    <Text style={styles.hiddenCardText}>?</Text>
                    <Text style={styles.hiddenCardLabel}>Revealed on Street {currentStreet + 2 + i}</Text>
                  </View>
                ))}
              </View>

              {/* Betting Status */}
              <Text style={styles.sectionLabel}>Betting Order</Text>
              <View style={styles.bettingOrderContainer}>
                {gs.bettingOrder.map((pid, i) => {
                  const acted = i < gs.currentBettorIdx;
                  const isCurrent = i === gs.currentBettorIdx;
                  const action = gs.streetActions.find(a => a.playerId === pid);
                  const name = playerNameMap[pid] ?? '???';
                  return (
                    <View key={pid} style={[
                      styles.bettingOrderItem,
                      isCurrent && styles.bettingOrderItemCurrent,
                      acted && styles.bettingOrderItemDone,
                    ]}>
                      <Text style={[
                        styles.bettingOrderName,
                        isCurrent && { color: ACCENT },
                      ]} numberOfLines={1}>
                        {name}
                        {pid === myId ? ' (you)' : ''}
                      </Text>
                      {acted && action && (
                        <Text style={[
                          styles.bettingOrderStatus,
                          { color: action.folded ? COLORS.danger : COLORS.success },
                        ]}>
                          {action.folded ? 'FOLD' : `$${action.bet}`}
                        </Text>
                      )}
                      {isCurrent && (
                        <Text style={[styles.bettingOrderStatus, { color: ACCENT }]}>
                          BETTING...
                        </Text>
                      )}
                      {!acted && !isCurrent && (
                        <Text style={styles.bettingOrderStatus}>waiting</Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Betting UI */}
              {isMyTurn && !iAmFolded ? (
                <View style={styles.bettingSection}>
                  <Text style={styles.bettingTitle}>
                    {amIConfessor ? 'Your turn (camouflage bet)' : 'Your turn to bet'}
                  </Text>
                  {amIConfessor && (
                    <Text style={styles.bettingHint}>
                      Pick any player and bet to blend in. Your bet will be fully refunded.
                    </Text>
                  )}

                  <Text style={styles.inputLabel}>Who is the confessor?</Text>
                  <View style={styles.targetGrid}>
                    {bettingTargets.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.targetBtn,
                          selectedTarget === p.id && styles.targetBtnSelected,
                        ]}
                        onPress={() => setSelectedTarget(p.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={[
                          styles.targetBtnText,
                          selectedTarget === p.id && styles.targetBtnTextSelected,
                        ]} numberOfLines={1}>
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Wager (min ${minBet}, you have ${myBank})</Text>
                  <TextInput
                    style={styles.wagerInput}
                    value={wagerText}
                    onChangeText={(t) => setWagerText(t.replace(/[^0-9]/g, ''))}
                    placeholder={`$${minBet}`}
                    placeholderTextColor={COLORS.text3}
                    keyboardType="number-pad"
                    maxLength={5}
                    keyboardAppearance="dark"
                    inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
                  />

                  <View style={styles.betActions}>
                    <PrimaryButton
                      title={`Bet $${wagerText || '0'}`}
                      onPress={handleBet}
                      disabled={!selectedTarget || !wagerValid}
                      style={{ flex: 1 }}
                    />
                    {!amIConfessor && (
                      <TouchableOpacity style={styles.foldBtn} onPress={handleFold} activeOpacity={0.75}>
                        <Text style={styles.foldBtnText}>Fold</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : iAmFolded ? (
                <View style={styles.waitingBox}>
                  <Text style={styles.waitEmoji}>🃏</Text>
                  <Text style={styles.waitTitle}>You folded this hand</Text>
                  <Text style={styles.waitSub}>Watching the remaining bets...</Text>
                </View>
              ) : (
                <View style={styles.waitingBox}>
                  <Text style={styles.waitTitle}>Waiting for {currentBettorName}...</Text>
                  <Text style={styles.waitSub}>They are placing their bet.</Text>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
          <KeyboardDoneBar />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: reveal ───────────────────────────────────────────────────────────

  if (gs.phase === 'reveal') {
    const settlement = gs.settlementData;
    const confessorName = playerNameMap[gs.confessorId] ?? '???';
    const amIConfessor = myId === gs.confessorId;
    const myResult = settlement?.results.find(r => r.playerId === myId);
    const isLastRound = gs.currentRound >= gs.totalRounds;

    // Confessor earnings from wrong guesses
    const confessorEarnings = settlement
      ? settlement.results
          .filter(r => r.playerId !== gs.confessorId && r.net < 0)
          .reduce((sum, r) => sum + Math.abs(r.net), 0)
      : 0;

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                Round {gs.currentRound} / {gs.totalRounds}
              </Text>
            </View>

            {/* Confessor Reveal */}
            <View style={styles.revealBanner}>
              <Text style={styles.revealBannerLabel}>THE CONFESSOR WAS...</Text>
              <Text style={styles.revealBannerName}>{confessorName}</Text>
            </View>

            {/* Personal result */}
            {myResult && (
              <View style={[
                styles.personalResult,
                {
                  borderColor: amIConfessor
                    ? ACCENT
                    : myResult.correct
                    ? COLORS.success
                    : myResult.net === 0
                    ? COLORS.text3
                    : COLORS.danger,
                  backgroundColor: amIConfessor
                    ? ACCENT_BG
                    : myResult.correct
                    ? '#071d0f'
                    : myResult.net === 0
                    ? COLORS.surface
                    : '#1d0710',
                },
              ]}>
                <Text style={styles.personalResultText}>
                  {amIConfessor
                    ? `You were the confessor! Earned $${confessorEarnings} from wrong guesses.`
                    : myResult.correct
                    ? `You guessed correctly! Won $${myResult.net}.`
                    : myResult.net === 0
                    ? 'You folded. No gains, no losses.'
                    : `Wrong guess. Lost $${Math.abs(myResult.net)}.`}
                </Text>
              </View>
            )}

            {/* All confessions */}
            <Text style={styles.sectionLabel}>The Confessions</Text>
            <View style={styles.cardsContainer}>
              {gs.confessorCards.map((card, i) => (
                <View key={i} style={styles.confessionCard}>
                  <View style={styles.cardStreetBadge}>
                    <Text style={styles.cardStreetText}>#{i + 1}</Text>
                  </View>
                  <Text style={styles.confessionCardText}>{card}</Text>
                </View>
              ))}
            </View>

            {/* Results breakdown */}
            <Text style={styles.sectionLabel}>Settlement</Text>
            {settlement?.results.map(r => {
              const name = playerNameMap[r.playerId] ?? '???';
              const isConfessor = r.playerId === gs.confessorId;
              const isMe = r.playerId === myId;
              const netColor = isConfessor
                ? ACCENT
                : r.correct
                ? COLORS.success
                : r.net === 0
                ? COLORS.text2
                : COLORS.danger;
              const targetName = r.targetId ? playerNameMap[r.targetId] ?? '???' : '';

              return (
                <View key={r.playerId} style={[styles.resultRow, isMe && styles.resultRowMe]}>
                  <View style={styles.resultLeft}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.resultName, isMe && { color: COLORS.warning }]} numberOfLines={1}>
                        {name}
                      </Text>
                      {isMe && <Text style={styles.standingYouBadge}>YOU</Text>}
                    </View>
                    <Text style={styles.resultDetail}>
                      {isConfessor
                        ? `Confessor (bet refunded)`
                        : r.bet
                        ? `Bet $${r.bet} on ${targetName}${r.correct ? ' (correct!)' : ''}`
                        : 'Folded'}
                    </Text>
                  </View>
                  <Text style={[styles.resultNet, { color: netColor }]}>
                    {isConfessor
                      ? `+$${confessorEarnings}`
                      : r.net > 0
                      ? `+$${r.net}`
                      : r.net < 0
                      ? `-$${Math.abs(r.net)}`
                      : '$0'}
                  </Text>
                </View>
              );
            })}

            {/* Updated chip stacks */}
            <Text style={styles.sectionLabel}>Chip Stacks</Text>
            <View style={styles.chipStacksContainer}>
              {[...allPlayers]
                .sort((a, b) => (gs.banks[b.id] ?? 0) - (gs.banks[a.id] ?? 0))
                .map((p, i) => {
                  const chips = gs.banks[p.id] ?? 0;
                  const isMe = p.id === myId;
                  const maxChips = Math.max(...Object.values(gs.banks), 1);
                  const barWidth = `${Math.max(3, (chips / maxChips) * 100)}%` as `${number}%`;
                  return (
                    <View key={p.id} style={styles.chipStackRow}>
                      <Text style={[styles.chipStackName, isMe && { color: ACCENT }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <View style={styles.chipStackBarTrack}>
                        <View style={[styles.chipStackBarFill, {
                          width: barWidth,
                          backgroundColor: i === 0 ? ACCENT : COLORS.borderHi,
                        }]} />
                      </View>
                      <Text style={[styles.chipStackAmount, isMe && { color: ACCENT }]}>
                        ${chips}
                      </Text>
                    </View>
                  );
                })}
            </View>

            {/* Host controls */}
            <View style={styles.actions}>
              {isHost ? (
                <PrimaryButton
                  title={isLastRound ? 'Final Results' : 'Next Round'}
                  onPress={isLastRound ? () => {
                    const next: CBGameState = { ...gs, phase: 'game-over' };
                    gsRef.current = next;
                    sendGameStateRef.current(next);
                  } : handleNextRound}
                />
              ) : (
                <Text style={styles.waitSub}>Waiting for host to continue...</Text>
              )}
            </View>
          </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Fallback ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <PhaseTransition phaseKey="fallback">
        <View style={styles.centered}>
          <Text style={styles.waitTitle}>Setting up...</Text>
        </View>
      </PhaseTransition>
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
    gap: 14,
  },
  waitEmoji: { fontSize: 52 },
  waitTitle: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  waitSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },

  // Badge
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.bold },

  // Setup
  setupTitle: {
    fontSize: 28,
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -1,
  },
  setupOptionLabel: {
    fontSize: 12,
    color: COLORS.text2,
    fontFamily: FONTS.semibold,
    marginTop: 2,
  },

  // Section
  sectionLabel: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  actions: { gap: 10, marginTop: 8, alignItems: 'center' },

  // Submit phase
  submitTitle: {
    fontSize: 24,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  submitSub: {
    fontSize: 14,
    color: COLORS.text2,
    lineHeight: 20,
  },
  confessionBlock: { gap: 8 },
  promptLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  promptCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: ACCENT + '44',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  promptCardText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    lineHeight: 22,
  },
  confessionInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.medium,
    padding: 14,
    minHeight: 52,
    textAlignVertical: 'top',
  },
  playerProgress: { fontSize: 13, color: COLORS.text3, textAlign: 'center' },
  inputLabel: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    marginTop: 4,
  },

  // Street phase
  streetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streetBadge: {
    backgroundColor: ACCENT_BG,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: ACCENT + '55',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  streetBadgeText: {
    color: ACCENT,
    fontSize: 13,
    fontFamily: FONTS.bold,
  },

  // Chip rail
  chipRailScroll: { marginHorizontal: -20 },
  chipRail: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  chipItem: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  chipItemMe: {
    borderColor: ACCENT + '66',
    backgroundColor: ACCENT_BG,
  },
  chipName: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
  },
  chipAmount: {
    fontSize: 16,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
  },

  // Multiplier
  multiplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  multiplierBadge: {
    backgroundColor: ACCENT_BG,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: ACCENT,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  multiplierText: {
    fontSize: 14,
    fontFamily: FONTS.extrabold,
    color: ACCENT,
  },
  minBetText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
  },

  // Confession cards
  cardsContainer: { gap: 10 },
  confessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: ACCENT + '44',
    padding: 16,
    gap: 8,
  },
  cardStreetBadge: {
    backgroundColor: ACCENT_BG,
    borderRadius: RADIUS.full,
    paddingVertical: 2,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  cardStreetText: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: ACCENT,
  },
  confessionCardText: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    lineHeight: 24,
  },
  hiddenCard: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  hiddenCardText: {
    fontSize: 28,
    fontFamily: FONTS.extrabold,
    color: COLORS.text3,
  },
  hiddenCardLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.text3,
  },

  // Betting order
  bettingOrderContainer: { gap: 6 },
  bettingOrderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bettingOrderItemCurrent: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_BG,
  },
  bettingOrderItemDone: {
    opacity: 0.6,
  },
  bettingOrderName: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    flex: 1,
  },
  bettingOrderStatus: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.text3,
  },

  // Betting section
  bettingSection: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: ACCENT,
    padding: 16,
    gap: 12,
  },
  bettingTitle: {
    fontSize: 18,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
  },
  bettingHint: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: ACCENT,
    lineHeight: 18,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetBtn: {
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  targetBtnSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_BG,
  },
  targetBtnText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
  },
  targetBtnTextSelected: {
    color: ACCENT,
  },
  wagerInput: {
    backgroundColor: COLORS.surface2,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
  },
  betActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  foldBtn: {
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.danger,
    backgroundColor: '#1d0710',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  foldBtnText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.danger,
  },
  waitingBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },

  // Reveal phase
  revealBanner: {
    backgroundColor: ACCENT_BG,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: ACCENT,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  revealBannerLabel: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  revealBannerName: {
    fontSize: 32,
    fontFamily: FONTS.extrabold,
    color: ACCENT,
    letterSpacing: -0.5,
  },
  personalResult: {
    borderRadius: RADIUS.md,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  personalResultText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Result rows
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  resultRowMe: {
    borderColor: COLORS.warning,
    borderWidth: 1.5,
    backgroundColor: '#2a2000',
  },
  resultLeft: { flex: 1, gap: 2 },
  resultName: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  resultDetail: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
  },
  resultNet: {
    fontSize: 18,
    fontFamily: FONTS.extrabold,
  },

  // Chip stacks
  chipStacksContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  chipStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipStackName: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    width: 70,
  },
  chipStackBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  chipStackBarFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  chipStackAmount: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    width: 40,
    textAlign: 'right',
  },

  // Game over
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: {
    fontSize: 32,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  gameOverSub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
  },

  // Standings
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
  standingRowMe: {
    borderColor: COLORS.warning,
    borderWidth: 1.5,
    backgroundColor: '#2a2000',
  },
  standingRank: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    width: 28,
  },
  standingRankMe: { color: COLORS.warning },
  standingName: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  standingNameMe: {
    color: COLORS.warning,
    fontFamily: FONTS.extrabold,
  },
  standingScore: {
    fontSize: 15,
    fontFamily: FONTS.bold,
  },
  standingYouBadge: {
    fontSize: 10,
    fontFamily: FONTS.extrabold,
    color: COLORS.warning,
    backgroundColor: COLORS.warning + '22',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    letterSpacing: 0.5,
  },
});
