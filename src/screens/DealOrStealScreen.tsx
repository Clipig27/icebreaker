import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { COLORS, RADIUS, FONTS } from '../constants/theme';
import GameIntro from '../components/GameIntro';
import PhaseTransition from '../components/PhaseTransition';

// ── Types ─────────────────────────────────────────────────────────────────────

type DSPhase =
  | 'intro'
  | 'setup'
  | 'round-intro'
  | 'discussion'
  | 'action'
  | 'round-results'
  | 'round-end'
  | 'game-over';

interface RoundHistoryEntry {
  round: number;
  actionLog: Record<string, { action: 'deal' | 'steal' | 'neutral'; target: string | null }>;
  dealAttemptCount: number;
  dealSuccessCount: number;
  stealAttemptCount: number;
  stealSuccessCount: number;
  mutualStealCount: number;
  neutralCount: number;
  stolenFromCount: number;
  chainBonusCount: number;
  deltas: Record<string, number>;
  startBalances: Record<string, number>;
  endBalances: Record<string, number>;
}

interface DSGameState {
  game: 'dealOrSteal';
  phase: DSPhase;
  round: number;
  totalRounds?: number;
  // Speaking order
  firstSpeakerId?: string;
  speakingOrder?: string[];       // playerIds in order for this round
  usedFirstSpeakers?: string[];   // prevents repeating first speakers until all have gone
  // Stable anonymous assignment: set once at game start, never shuffled
  anonOrder?: string[];           // playerIds in fixed anon-index order
  balances: Record<string, number>;
  roundStartBalances?: Record<string, number>;
  submittedActionIds?: string[];
  roundOutcome?: {
    dealAttemptCount: number;
    dealSuccessCount: number;
    stealAttemptCount: number;
    stealSuccessCount: number;
    mutualStealCount: number;
    neutralCount: number;
    stolenFromCount: number;
    chainBonusCount: number;
    closedLoopCount: number;
    deltas: Record<string, number>;
  };
  roundHistory?: RoundHistoryEntry[];
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DealOrSteal'>;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 100.0;

/** Round options keyed by player count: 4→[4,8], 5→[5,10], 6→[6,12] */
function getRoundOptions(playerCount: number): number[] {
  if (playerCount === 4) return [4, 8];
  if (playerCount === 5) return [5, 10];
  if (playerCount === 6) return [6, 12];
  return [5, 10];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDelta(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `-${fmt(Math.abs(n))}`;
  return '$0.00';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DealOrStealScreen({ navigation }: Props) {
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

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const gsRef = useRef<DSGameState | null>(null);
  const sendGameStateRef = useRef(sendGameState);

  const [showRules, setShowRules] = useState(false);
  const [actionType, setActionType] = useState<'deal' | 'steal' | 'neutral' | null>(null);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sendGameStateRef.current = sendGameState;
  }, [sendGameState]);

  const gs = (room?.gameState?.game === 'dealOrSteal' ? room.gameState : null) as DSGameState | null;

  // headerLeft (Leave button) is set globally in App.tsx screenOptions

  // Fade animation on phase / round change
  useEffect(() => {
    gsRef.current = gs;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    setActionType(null);
    setActionTarget(null);

    // Debug: log key data whenever we enter round-results
    if (gs?.phase === 'round-results') {
      console.log('[dos-fe] round-results arrived');
      console.log('[dos-fe] myId:', myId);
      console.log('[dos-fe] gs.balances:', JSON.stringify(gs.balances));
      console.log('[dos-fe] gs.roundOutcome:', JSON.stringify(gs.roundOutcome));
      console.log('[dos-fe] myBalance from balances:', gs.balances?.[myId]);
      console.log('[dos-fe] myDelta from deltas:', gs.roundOutcome?.deltas?.[myId]);
    }
  }, [gs?.phase, gs?.round, fadeAnim]);

  // Setup timeout
  useEffect(() => {
    if (gs) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8000);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  }, [gs]);

  // Host initialises state on first mount
  useEffect(() => {
    if (!isHost) return;
    const balances = Object.fromEntries(players.map(p => [p.id, STARTING_BALANCE]));
    const init: DSGameState = {
      game: 'dealOrSteal',
      phase: 'setup',
      round: 1,
      balances,
      usedFirstSpeakers: [],
    };
    gsRef.current = init;
    sendGameStateRef.current(init);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalRounds = gs?.totalRounds ?? 5;
  const iHaveSubmittedAction = gs?.submittedActionIds?.includes(myId) ?? false;

  const myBalance = gs?.balances?.[myId] ?? STARTING_BALANCE;
  const totalPot = Object.values(gs?.balances ?? {}).reduce((s, v) => s + v, 0);
  const myPct = totalPot > 0 ? Math.round((myBalance / totalPot) * 100) : 0;

  // Standings sorted by balance descending
  const standings = [...players].sort(
    (a, b) => ((gs?.balances ?? {})[b.id] ?? 0) - ((gs?.balances ?? {})[a.id] ?? 0)
  );

  const canConfirmAction =
    actionType === 'neutral' ||
    (actionType !== null && actionTarget !== null);

  // ── Speaking order helpers ─────────────────────────────────────────────────

  /**
   * Rotate players array so it starts at firstSpeakerId,
   * preserving join-order for the rest.
   */
  const buildSpeakingOrder = (firstSpeakerId: string): string[] => {
    const ids = players.map(p => p.id);
    const idx = ids.indexOf(firstSpeakerId);
    if (idx === -1) return ids;
    return [...ids.slice(idx), ...ids.slice(0, idx)];
  };

  /**
   * Pick the next first speaker from players not yet used.
   * If everyone has gone, start a new cycle (fresh pool).
   * Returns { firstSpeakerId, newUsed }.
   */
  const pickFirstSpeaker = (
    used: string[]
  ): { firstSpeakerId: string; newUsed: string[] } => {
    const available = players.filter(p => !used.includes(p.id));
    const pool = available.length > 0 ? available : players;
    const picked = pool[Math.floor(Math.random() * pool.length)].id;
    const newUsed = available.length > 0 ? [...used, picked] : [picked];
    return { firstSpeakerId: picked, newUsed };
  };

  // ── Anonymous leaderboard helpers ─────────────────────────────────────────

  /**
   * Players sorted by balance descending. Uses anonOrder as a stable tiebreaker
   * so rows don't flicker when two balances are equal between rounds.
   */
  const sortedByBalance = () => {
    const bals = gs?.balances ?? {};
    const tiebreaker = gs?.anonOrder ?? players.map(p => p.id);
    return [...players].sort((a, b) => {
      const diff = (bals[b.id] ?? 0) - (bals[a.id] ?? 0);
      if (diff !== 0) return diff;
      return tiebreaker.indexOf(a.id) - tiebreaker.indexOf(b.id);
    });
  };

  /**
   * Compact leaderboard — shown on discussion, action, and waiting screens.
   * No names. Current user's row shows YOU. Total pot in header.
   */
  const renderCompactLeaderboard = () => {
    if (!gs) return null;
    const bals = gs.balances ?? {};
    const pot = Object.values(bals).reduce((s, v) => s + v, 0);
    const sorted = sortedByBalance();
    return (
      <View style={styles.compactLB}>
        <View style={styles.compactLBInner}>
          {/* Left: big pot */}
          <View style={styles.compactLBLeft}>
            <Text style={styles.compactLBPotLabel}>TOTAL POT</Text>
            <Text style={styles.compactLBPotBig}>{fmt(pot)}</Text>
          </View>

          <View style={styles.compactLBDivider} />

          {/* Right: player rows — fixed-width columns so alignment never shifts */}
          <View style={styles.compactLBRight}>
            {sorted.map(p => {
              const bal = bals[p.id] ?? STARTING_BALANCE;
              const pct = pot > 0 ? Math.round((bal / pot) * 100) : 0;
              const isMe = p.id === myId;
              return (
                <View key={p.id} style={styles.compactLBRow}>
                  <Text style={[styles.compactLBBal, isMe && styles.compactLBMeText]}>
                    {fmt(bal)}
                  </Text>
                  <Text style={[styles.compactLBPct, isMe && styles.compactLBMeText]}>
                    {pct}%
                  </Text>
                  {/* Fixed-width slot keeps every row the same width */}
                  <View style={styles.compactLBYouSlot}>
                    {isMe && <Text style={styles.compactYouBadge}>YOU</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  /**
   * Expanded leaderboard — shown on results, round-end, and game-over.
   * No names. Current user's row labelled YOU. Total pot in header.
   */
  const renderExpandedLeaderboard = (showDeltas = false) => {
    if (!gs) return null;
    const bals = gs.balances ?? {};
    const deltas = gs.roundOutcome?.deltas ?? {};
    const pot = Object.values(bals).reduce((s, v) => s + v, 0);
    const sorted = sortedByBalance();
    return (
      <View style={styles.expandedLB}>
        <View style={[styles.expandedLBHeader]}>
          <Text style={styles.sectionLabel}>Standings (anonymous)</Text>
          <Text style={styles.expandedLBPotLabel}>Total pot {fmt(pot)}</Text>
        </View>
        {sorted.map((p, i) => {
          const bal = bals[p.id] ?? STARTING_BALANCE;
          const pct = pot > 0 ? Math.round((bal / pot) * 100) : 0;
          const delta = deltas[p.id] ?? 0;
          const isMe = p.id === myId;
          return (
            <View key={p.id} style={[
              styles.expandedLBRow,
              i === 0 && styles.expandedLBRowFirst,
              isMe && styles.expandedLBRowMe,
            ]}>
              {isMe
                ? <Text style={[styles.expandedLBLabel, styles.expandedLBLabelMe]}>YOU</Text>
                : <Text style={[styles.expandedLBLabel, { color: COLORS.text3 }]}>—</Text>
              }
              <Text style={[styles.expandedLBBal, isMe && styles.expandedLBLabelMe]}>
                {fmt(bal)}
              </Text>
              {showDeltas && (
                <Text style={[styles.expandedLBDelta, { color: delta >= 0 ? COLORS.success : COLORS.danger }]}>
                  {fmtDelta(delta)}
                </Text>
              )}
              <Text style={styles.expandedLBPct}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Phase transitions (host-driven) ────────────────────────────────────────

  const handleSelectRounds = (n: number) => {
    if (!gs) return;
    const { firstSpeakerId, newUsed } = pickFirstSpeaker(gs.usedFirstSpeakers ?? []);
    const speakingOrder = buildSpeakingOrder(firstSpeakerId);
    // Rebuild balances from the live players list — gs.balances may be {} if the
    // gameStateUpdated echo from the init effect hasn't arrived yet (race window
    // between gameStarted arriving and the host's own updateGameState being ACKed).
    const balances = Object.fromEntries(players.map(p => [p.id, STARTING_BALANCE]));
    const roundStartBalances = { ...balances };
    // Shuffle player ids once for a stable tiebreaker when balances are equal.
    // Prevents leaderboard rows from flickering between rounds on tied balances.
    const anonOrder = [...players].sort(() => Math.random() - 0.5).map(p => p.id);
    const next: DSGameState = {
      ...gs,
      balances,
      totalRounds: n,
      phase: 'round-intro',
      round: 1,
      firstSpeakerId,
      speakingOrder,
      usedFirstSpeakers: newUsed,
      roundStartBalances,
      anonOrder,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleStartDiscussion = () => {
    if (!isHost || !gs) return;
    const next: DSGameState = { ...gs, phase: 'discussion' };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleStartActions = () => {
    if (!isHost || !gs) return;
    const next: DSGameState = {
      ...gs,
      phase: 'action',
      submittedActionIds: [],
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleForceAdvance = () => {
    if (!isHost || !gs) return;
    // Tell the backend to score now with whatever actions have been submitted.
    // Unsubmitted players are treated as Neutral by the backend scorer.
    sendPlayerAction('dos-force-score', {});
  };

  const handleContinueFromResults = () => {
    if (!isHost || !gs) return;
    const next: DSGameState = { ...gs, phase: 'round-end' };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleNextRound = () => {
    if (!isHost || !gs) return;
    const nextRound = gs.round + 1;
    if (nextRound > totalRounds) {
      const next: DSGameState = { ...gs, phase: 'game-over' };
      gsRef.current = next;
      sendGameStateRef.current(next);
      return;
    }
    const { firstSpeakerId, newUsed } = pickFirstSpeaker(gs.usedFirstSpeakers ?? []);
    const speakingOrder = buildSpeakingOrder(firstSpeakerId);
    const roundStartBalances = { ...gs.balances };
    const next: DSGameState = {
      ...gs,
      phase: 'round-intro',
      round: nextRound,
      firstSpeakerId,
      speakingOrder,
      usedFirstSpeakers: newUsed,
      roundStartBalances,
      submittedActionIds: undefined,
      roundOutcome: undefined,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  // ── Player actions ─────────────────────────────────────────────────────────

  const handleSubmitAction = () => {
    if (!actionType) return;
    if ((actionType === 'deal' || actionType === 'steal') && !actionTarget) return;
    console.log('[dos] submit | choice:', actionType, '| target:', actionTarget ?? 'none', '| myId:', myId);
    sendPlayerAction('dos-action', {
      choice: actionType,
      target: actionType !== 'neutral' ? actionTarget : undefined,
    });
  };

  // ── Loading / error guards ─────────────────────────────────────────────────

  if (gs?.phase === 'intro' || (!gs)) {
    return (
      <GameIntro
        emoji="🤝"
        title="Deal or Steal"
        tagline="Cooperate or betray. Finish with the highest balance."
        rules={[
          { emoji: '💰', text: 'Everyone starts at $100. Each round, secretly choose DEAL, STEAL, or NEUTRAL.' },
          { emoji: '🤝', text: 'Both DEAL = both gain. One DEAL + one STEAL = stealer takes from dealer.' },
          { emoji: '⚔️', text: 'Both STEAL = nobody gains. Standings shown anonymously.' },
          { emoji: '🏆', text: 'Highest balance at the end wins!' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  if (players.length < 4 || players.length > 6) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitTitle}>Wrong player count</Text>
          <Text style={styles.waitSub}>Deal or Steal requires 4–6 players.{'\n'}Currently: {players.length}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={styles.linkText}>← Back to games</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase renders ──────────────────────────────────────────────────────────

  const renderSetup = () => {
    const roundOptions = getRoundOptions(players.length);
    return (
      <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
        <Text style={styles.setupTitle}>How many rounds?</Text>
        <Text style={styles.setupSub}>
          {players.length} players · deal, steal, or stay neutral each round · highest balance wins
        </Text>
        <View style={styles.setupOptions}>
          {roundOptions.map(n => (
            <TouchableOpacity key={n} style={styles.setupOption} onPress={() => handleSelectRounds(n)}>
              <Text style={styles.setupOptionNum}>{n}</Text>
              <Text style={styles.setupOptionLabel}>rounds</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={() => setShowRules(true)} style={styles.rulesChip}>
          <Text style={styles.rulesChipText}>? How to play</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderWaitingSetup = () => (
    <View style={styles.centered}>
      <Text style={styles.waitTitle}>Waiting for host...</Text>
      <Text style={styles.waitSub}>Host is choosing round count.</Text>
      <TouchableOpacity onPress={() => setShowRules(true)} style={[styles.rulesChip, { marginTop: 20 }]}>
        <Text style={styles.rulesChipText}>? How to play</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRoundIntro = () => {
    const firstSpeakerName = players.find(p => p.id === gs.firstSpeakerId)?.name ?? '?';
    const order = gs.speakingOrder ?? players.map(p => p.id);

    return (
      <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
        <View style={styles.roundBadgeRow}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>ROUND {gs.round} / {totalRounds}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowRules(true)} style={styles.helpBtn}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
        </View>

        {renderCompactLeaderboard()}

        <Text style={styles.phaseLabel}>Round {gs.round}</Text>

        <View style={styles.firstSpeakerCard}>
          <Text style={styles.firstSpeakerLabel}>SPEAKS FIRST</Text>
          <Text style={styles.firstSpeakerName}>
            {firstSpeakerName}
            {gs.firstSpeakerId === myId ? ' (you)' : ''}
          </Text>
          <Text style={styles.firstSpeakerSub}>
            Lead the discussion. Set the tone. Then everyone acts in secret.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Speaking order this round</Text>
        <View style={styles.speakingOrderList}>
          {order.map((id, i) => {
            const name = players.find(p => p.id === id)?.name ?? '?';
            const isFirst = i === 0;
            const isMe = id === myId;
            return (
              <View key={id} style={[styles.speakingOrderRow, isFirst && styles.speakingOrderRowFirst]}>
                <Text style={[styles.speakingOrderNum, isFirst && styles.speakingOrderNumFirst]}>
                  {i + 1}
                </Text>
                <Text style={[styles.speakingOrderName, isFirst && styles.speakingOrderNameFirst]}>
                  {name}{isMe ? ' (you)' : ''}
                </Text>
                {isFirst && <Text style={styles.speakingOrderTag}>first</Text>}
              </View>
            );
          })}
        </View>

        <View style={styles.actions}>
          {isHost ? (
            <>
              <PrimaryButton title="Start Discussion →" onPress={handleStartDiscussion} />
              <SecondaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
            </>
          ) : (
            <Text style={styles.waitSub}>Waiting for host to start discussion...</Text>
          )}
        </View>
      </AnimatedScrollView>
    );
  };

  const renderDiscussion = () => {
    const order = gs.speakingOrder ?? players.map(p => p.id);
    const firstSpeakerName = players.find(p => p.id === gs.firstSpeakerId)?.name ?? '?';

    return (
      <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
        <View style={styles.roundBadgeRow}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>ROUND {gs.round} / {totalRounds}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowRules(true)} style={styles.helpBtn}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
        </View>

        {renderCompactLeaderboard()}

        <Text style={styles.phaseLabel}>💬 Discussion</Text>
        <Text style={styles.phaseSub}>
          {firstSpeakerName} leads. Talk it out, make deals, cast suspicion. When ready, host starts actions.
        </Text>

        <Text style={styles.sectionLabel}>Speaking order</Text>
        <View style={styles.speakingOrderList}>
          {order.map((id, i) => {
            const name = players.find(p => p.id === id)?.name ?? '?';
            const isMe = id === myId;
            const isFirst = i === 0;
            return (
              <View key={id} style={[styles.speakingOrderRow, isFirst && styles.speakingOrderRowFirst]}>
                <Text style={[styles.speakingOrderNum, isFirst && styles.speakingOrderNumFirst]}>
                  {i + 1}
                </Text>
                <Text style={[styles.speakingOrderName, isFirst && styles.speakingOrderNameFirst]}>
                  {name}{isMe ? ' (you)' : ''}
                </Text>
                {isFirst && <Text style={styles.speakingOrderTag}>leads</Text>}
              </View>
            );
          })}
        </View>

        {isHost ? (
          <View style={styles.actions}>
            <PrimaryButton title="Start Actions →" onPress={handleStartActions} />
            <SecondaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
          </View>
        ) : (
          <Text style={styles.waitSub}>Waiting for host to start actions...</Text>
        )}
      </AnimatedScrollView>
    );
  };

  const renderAction = () => {
    const submittedCount = gs.submittedActionIds?.length ?? 0;
    const otherPlayers = players.filter(p => p.id !== myId);

    if (iHaveSubmittedAction) {
      return (
        <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
          <View style={styles.roundBadgeRow}>
            <View style={styles.roundBadge}>
              <Text style={styles.roundBadgeText}>ROUND {gs.round} / {totalRounds}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowRules(true)} style={styles.helpBtn}>
              <Text style={styles.helpBtnText}>?</Text>
            </TouchableOpacity>
          </View>

          {renderCompactLeaderboard()}

          <View style={{ alignItems: 'center', marginTop: 32, gap: 10 }}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>Action locked in!</Text>
            <Text style={styles.waitSub}>{submittedCount} / {players.length} submitted</Text>
          </View>
        </AnimatedScrollView>
      );
    }

    return (
      <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
        <View style={styles.roundBadgeRow}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>ROUND {gs.round} / {totalRounds}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowRules(true)} style={styles.helpBtn}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
        </View>

        {renderCompactLeaderboard()}

        <Text style={styles.phaseLabel}>🎴 Your Move</Text>
        <Text style={styles.phaseSub}>
          Choose your action. All choices are hidden until resolution.
        </Text>

        {/* Step 1: Choose action type */}
        <Text style={styles.sectionLabel}>Action</Text>

        <TouchableOpacity
          style={[styles.actionOption, actionType === 'deal' && styles.actionOptionSelected]}
          onPress={() => { setActionType('deal'); setActionTarget(null); }}
        >
          <Text style={styles.actionOptionTitle}>🤝  Deal</Text>
          <Text style={styles.actionOptionDesc}>
            Propose a deal. Mutual deal → both +50% (voided if you get stolen from). They go Neutral → you +25%. They steal or deal elsewhere → you get nothing, no penalty.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionOption, actionType === 'steal' && styles.actionOptionSelected]}
          onPress={() => { setActionType('steal'); setActionTarget(null); }}
        >
          <Text style={styles.actionOptionTitle}>🔪  Steal</Text>
          <Text style={styles.actionOptionDesc}>
            Target a player who chose Deal or is stealing someone else. Succeed → gain 30% of their round-start balance (split if multiple stealers). Fail (Neutral target, mutual steal, or closed steal loop) → lose -30%.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionOption, actionType === 'neutral' && styles.actionOptionSelected]}
          onPress={() => { setActionType('neutral'); setActionTarget(null); }}
        >
          <Text style={styles.actionOptionTitle}>🛡  Neutral</Text>
          <Text style={styles.actionOptionDesc}>
            Do nothing. Fully protected from steals. No gain, no risk.
          </Text>
        </TouchableOpacity>

        {/* Step 2: Choose target (if deal or steal) */}
        {(actionType === 'deal' || actionType === 'steal') && (
          <>
            <Text style={styles.sectionLabel}>
              {actionType === 'deal' ? 'Who are you dealing with?' : 'Who are you stealing from?'}
            </Text>
            {otherPlayers.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.actionOption, actionTarget === p.id && styles.actionOptionSelected]}
                onPress={() => setActionTarget(p.id)}
              >
                <Text style={styles.actionOptionTitle} numberOfLines={1}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={styles.guesserProgress}>{submittedCount} / {players.length} submitted</Text>

        <View style={styles.actions}>
          <PrimaryButton
            title="Confirm →"
            onPress={handleSubmitAction}
            disabled={!canConfirmAction}
          />
        </View>

        {isHost && iHaveSubmittedAction && submittedCount < players.length && (
          <TouchableOpacity onPress={handleForceAdvance} style={{ marginTop: 12, alignSelf: 'center' }}>
            <Text style={styles.forceText}>Force advance (skip remaining)</Text>
          </TouchableOpacity>
        )}
      </AnimatedScrollView>
    );
  };

  const renderRoundResults = () => {
    const outcome = gs.roundOutcome;
    if (!outcome) return null;

    const myDelta = outcome.deltas?.[myId] ?? 0;

    return (
      <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
        <View style={styles.roundBadgeRow}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>ROUND {gs.round} / {totalRounds}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowRules(true)} style={styles.helpBtn}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.phaseLabel}>Round {gs.round} Results</Text>

        {/* Public aggregate stats — anonymous, no targets revealed */}
        <View style={styles.publicResultsGrid}>
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.dealAttemptCount}</Text>
            <Text style={styles.publicResultLabel}>Deals{'\n'}attempted</Text>
          </View>
          <View style={styles.publicResultDivider} />
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.dealSuccessCount}</Text>
            <Text style={styles.publicResultLabel}>Deal{'\n'}players</Text>
          </View>
          <View style={styles.publicResultDivider} />
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.stealAttemptCount}</Text>
            <Text style={styles.publicResultLabel}>Steals{'\n'}attempted</Text>
          </View>
          <View style={styles.publicResultDivider} />
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.stealSuccessCount}</Text>
            <Text style={styles.publicResultLabel}>Steals{'\n'}landed</Text>
          </View>
          <View style={styles.publicResultDivider} />
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.stolenFromCount}</Text>
            <Text style={styles.publicResultLabel}>Players{'\n'}drained</Text>
          </View>
        </View>

        {(outcome.mutualStealCount > 0 || outcome.chainBonusCount > 0 || outcome.closedLoopCount > 0) && (
          <View style={styles.publicResultsRow}>
            {outcome.mutualStealCount > 0 && (
              <View style={styles.publicResultCell}>
                <Text style={styles.publicResultNum}>⚡ {outcome.mutualStealCount}</Text>
                <Text style={styles.publicResultLabel}>
                  Mutual{'\n'}steal{outcome.mutualStealCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {outcome.mutualStealCount > 0 && (outcome.chainBonusCount > 0 || outcome.closedLoopCount > 0) && (
              <View style={styles.publicResultDivider} />
            )}
            {outcome.chainBonusCount > 0 && (
              <View style={styles.publicResultCell}>
                <Text style={styles.publicResultNum}>🔗 {outcome.chainBonusCount}</Text>
                <Text style={styles.publicResultLabel}>
                  Chain{'\n'}reaction{outcome.chainBonusCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {outcome.chainBonusCount > 0 && outcome.closedLoopCount > 0 && (
              <View style={styles.publicResultDivider} />
            )}
            {outcome.closedLoopCount > 0 && (
              <View style={styles.publicResultCell}>
                <Text style={styles.publicResultNum}>🔄 {outcome.closedLoopCount}</Text>
                <Text style={styles.publicResultLabel}>
                  Closed{'\n'}loop{outcome.closedLoopCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Anonymous leaderboard with this-round deltas */}
        {renderExpandedLeaderboard(true)}

        {/* Private: your result */}
        <View style={styles.myResultCard}>
          <Text style={styles.myResultLabel}>Your result</Text>
          <Text style={styles.myResultBalance}>{fmt(myBalance)}</Text>
          <Text style={[styles.myResultDelta, { color: myDelta >= 0 ? COLORS.success : COLORS.danger }]}>
            {fmtDelta(myDelta)} this round
          </Text>
          <Text style={styles.potLabel}>Pot {fmt(totalPot)} · your share {myPct}%</Text>
        </View>

        <Text style={styles.revealNote}>
          Who did what? Full reveal at end of game.
        </Text>

        <View style={styles.actions}>
          {isHost ? (
            <PrimaryButton title="Continue →" onPress={handleContinueFromResults} />
          ) : (
            <Text style={styles.waitSub}>Waiting for host to continue...</Text>
          )}
        </View>
      </AnimatedScrollView>
    );
  };

  const renderRoundEnd = () => (
    <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
      <View style={styles.roundBadgeRow}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>ROUND {gs.round} / {totalRounds}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowRules(true)} style={styles.helpBtn}>
          <Text style={styles.helpBtnText}>?</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.phaseLabel}>After Round {gs.round}</Text>
      <Text style={styles.phaseSub}>Balances updated. Identities stay hidden.</Text>

      {renderExpandedLeaderboard(true)}

      <View style={styles.myResultCard}>
        <Text style={styles.balanceLabel}>Your balance</Text>
        <Text style={styles.balanceValue}>{fmt(myBalance)}</Text>
        <Text style={styles.potLabel}>Pot {fmt(totalPot)} · your share {myPct}%</Text>
      </View>

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
    </AnimatedScrollView>
  );

  const renderGameOver = () => {
    const bals = gs.balances ?? {};
    const topBalance = standings.length > 0 ? (bals[standings[0].id] ?? 0) : 0;
    const winners = standings.filter(p => (bals[p.id] ?? 0) === topBalance);
    const winnerText = winners.map(p => p.name).join(' & ');

    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.gameOverEmoji}>🏆</Text>
        <Text style={styles.gameOverTitle}>{winnerText} wins!</Text>
        <Text style={styles.gameOverSub}>Highest balance after {totalRounds} rounds.</Text>

        <View style={styles.divider} />
        {/* Named final standings — identities revealed at game-over */}
        <Text style={styles.sectionLabel}>Final Standings (revealed)</Text>
        {standings.map((p, i) => (
          <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
            <Text style={styles.standingRank}>#{i + 1}</Text>
            <Text style={styles.standingName} numberOfLines={1}>{p.name}{p.id === myId ? ' (you)' : ''}</Text>
            <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
              {fmt(bals[p.id] ?? STARTING_BALANCE)}
            </Text>
          </View>
        ))}

        {(gs.roundHistory?.length ?? 0) > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Round History</Text>
            {(gs.roundHistory ?? []).map(entry => renderHistoryEntry(entry))}
          </>
        )}

        <View style={styles.actions}>
          {isHost ? (
            <>
              <PrimaryButton title="Play Again" onPress={() => startGame('dealOrSteal')} />
              <SecondaryButton title="Choose New Game" onPress={() => navigation.navigate('GameSelect')} />
            </>
          ) : (
            <Text style={styles.waitSub}>Waiting for host...</Text>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderHistoryEntry = (entry: RoundHistoryEntry) => (
    <View key={entry.round} style={styles.historyCard}>
      <Text style={styles.historyRound}>Round {entry.round}</Text>
      <Text style={styles.historyPublic}>
        {entry.dealAttemptCount} deal{entry.dealAttemptCount !== 1 ? 's' : ''} attempted
        {' · '}{entry.dealSuccessCount} successful
        {' · '}{entry.stealAttemptCount} steal{entry.stealAttemptCount !== 1 ? 's' : ''} attempted
        {' · '}{entry.stealSuccessCount} landed
        {entry.mutualStealCount > 0 ? ` · ${entry.mutualStealCount} mutual` : ''}
        {(entry.chainBonusCount ?? 0) > 0 ? ` · ${entry.chainBonusCount} chain` : ''}
      </Text>
      {players.map(p => {
        const a = entry.actionLog?.[p.id];
        if (!a) return null;
        const delta = entry.deltas?.[p.id] ?? 0;
        let actionText: string = a.action;
        if ((a.action === 'steal' || a.action === 'deal') && a.target) {
          const targetName = players.find(pl => pl.id === a.target)?.name ?? '?';
          actionText = `${a.action} → ${targetName}`;
        }
        return (
          <View key={p.id} style={styles.historyRow}>
            <Text style={styles.historyPlayerName} numberOfLines={1}>
              {p.name}{p.id === myId ? ' (you)' : ''}
            </Text>
            <Text style={styles.historyAction}>{actionText}</Text>
            <Text style={[styles.historyDelta, { color: delta >= 0 ? COLORS.success : COLORS.danger }]}>
              {fmtDelta(delta)}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ── Rules modal ────────────────────────────────────────────────────────────

  const renderRulesModal = () => (
    <Modal visible={showRules} transparent animationType="slide" onRequestClose={() => setShowRules(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.modalTitle}>Deal or Steal</Text>
            <Text style={styles.modalSubtitle}>4–6 players · social strategy · hidden actions</Text>

            <Text style={styles.ruleSection}>👥 Player count & round options</Text>
            <Text style={styles.ruleText}>
              Requires exactly 4–6 players. Round options depend on lobby size:{'\n'}
              · 4 players → 4 or 8 rounds{'\n'}
              · 5 players → 5 or 10 rounds{'\n'}
              · 6 players → 6 or 12 rounds
            </Text>

            <Text style={styles.ruleSection}>💰 Starting balance</Text>
            <Text style={styles.ruleText}>Everyone starts with $10. Highest balance at the end wins.</Text>

            <Text style={styles.ruleSection}>🗣 Speaking order</Text>
            <Text style={styles.ruleText}>
              Each round, one player is designated to speak first and leads the discussion.
              The first-speaker rotates so every player leads exactly once before anyone leads twice.
              Speaking order for the rest of the round goes through all players starting from the first speaker.{'\n\n'}
              Host manually advances from speaking order / discussion into the action phase.
            </Text>

            <Text style={styles.ruleSection}>🎴 Actions (everyone chooses one per round)</Text>
            <Text style={styles.ruleText}>
              Each player secretly picks one action:{'\n\n'}
              🤝  Deal(player) — propose a deal with that player.{'\n'}
              🔪  Steal(player) — attempt to steal from that player.{'\n'}
              🛡  Neutral — do nothing. Fully protected from steals.{'\n\n'}
              All choices stay hidden until resolution. You may say anything during discussion.
            </Text>

            <Text style={styles.ruleSection}>🤝 Deal outcomes</Text>
            <Text style={styles.ruleText}>
              When you choose Deal(player), the result depends on what they do:{'\n\n'}
              · They deal back → Mutual deal. Both gain +50% of your own round-start balance — BUT if someone steals from you this round, your deal bonus is voided and you only take the steal loss.{'\n'}
              · They go Neutral → You gain +25%.{'\n'}
              · They steal or deal someone else → You get nothing, no penalty.{'\n\n'}
              Note: Choosing Deal does NOT protect you from steals. Getting stolen voids your mutual deal gain.
            </Text>

            <Text style={styles.ruleSection}>🔪 Steal outcomes</Text>
            <Text style={styles.ruleText}>
              A steal SUCCEEDS if your target chose Deal or is stealing someone else (not you).{'\n'}
              → Target loses 30% of their round-start balance. You gain that 30%. Split evenly if multiple stealers.{'\n\n'}
              A steal FAILS and you lose -30% if:{'\n'}
              · Target chose Neutral{'\n'}
              · Mutual steal (A steals B, B steals A — both fail){'\n'}
              · You are part of a closed steal loop (see below)
            </Text>

            <Text style={styles.ruleSection}>🔄 Closed steal loop</Text>
            <Text style={styles.ruleText}>
              If a group of players all steal each other in a pure cycle (A→B→C→A with no exit), every member of the loop fails — all lose -30%.{'\n\n'}
              Players outside the loop who steal into it are not affected by the loop rule — their steal resolves normally.
            </Text>

            <Text style={styles.ruleSection}>🔗 Chain reaction</Text>
            <Text style={styles.ruleText}>
              If you steal from someone who was also going to steal successfully, you intercept their pending profit too.{'\n\n'}
              · The original steal target still loses their 20% (not double-drained).{'\n'}
              · The intercepted stealer gets nothing from their own steal — you get it.{'\n'}
              · Multiple interceptors split the profit evenly.
            </Text>

            <Text style={styles.ruleSection}>🛡 Neutral</Text>
            <Text style={styles.ruleText}>
              No gain, no loss. Completely protected — steal attempts against Neutral always fail.
            </Text>

            <Text style={styles.ruleSection}>📊 Anonymous standings</Text>
            <Text style={styles.ruleText}>
              A leaderboard is visible throughout the game, sorted highest to lowest, showing everyone's balance and share of the total pot.{'\n\n'}
              · Your row is labelled YOU. Other rows have no label.{'\n'}
              · Identities are only revealed at game-over.{'\n\n'}
              Try to figure out who's who based on how balances move each round.
            </Text>

            <Text style={styles.ruleSection}>🏆 Winning</Text>
            <Text style={styles.ruleText}>
              After all rounds, the player with the highest balance wins.{'\n'}
              Full action history is revealed at game-over.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.modalClose} onPress={() => setShowRules(false)}>
            <Text style={styles.modalCloseText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {renderRulesModal()}
      <PhaseTransition phaseKey={gs.phase}>
        {gs.phase === 'setup' && (
          isHost ? renderSetup() : renderWaitingSetup()
        )}
        {gs.phase === 'round-intro'   && renderRoundIntro()}
        {gs.phase === 'discussion'    && renderDiscussion()}
        {gs.phase === 'action'        && renderAction()}
        {gs.phase === 'round-results' && renderRoundResults()}
        {gs.phase === 'round-end'     && renderRoundEnd()}
        {gs.phase === 'game-over'     && renderGameOver()}
      </PhaseTransition>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 14,
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
    gap: 10,
  },

  // Waiting
  waitEmoji:  { fontSize: 52, textAlign: 'center' },
  waitTitle:  { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.text, textAlign: 'center' },
  waitSub:    { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  linkText:   { color: COLORS.text2, textDecorationLine: 'underline', fontSize: 14 },

  // Setup
  setupTitle: {
    fontSize: 30,
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
    maxWidth: 290,
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
  setupOptionNum:   { fontSize: 36, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -1 },
  setupOptionLabel: { fontSize: 12, color: COLORS.text2, fontFamily: FONTS.semibold, marginTop: 2 },
  rulesChip: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  rulesChipText: { fontSize: 13, color: COLORS.text2, fontFamily: FONTS.semibold },

  // Round badge row
  roundBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    letterSpacing: 1.5,
  },
  helpBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  helpBtnText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.text2 },

  // Phase labels
  phaseLabel: { fontSize: 26, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -0.4 },
  phaseSub:   { fontSize: 14, color: COLORS.text2, lineHeight: 20 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // First speaker card (round-intro)
  firstSpeakerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.warning,
    padding: 18,
    gap: 6,
    alignItems: 'center',
  },
  firstSpeakerLabel: {
    fontSize: 10,
    fontFamily: FONTS.extrabold,
    color: COLORS.warning,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  firstSpeakerName: {
    fontSize: 28,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  firstSpeakerSub: {
    fontSize: 13,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 2,
  },

  // Speaking order list
  speakingOrderList: { gap: 6 },
  speakingOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  speakingOrderRowFirst: {
    borderColor: COLORS.warning,
    backgroundColor: '#1a1500',
  },
  speakingOrderNum: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    width: 20,
  },
  speakingOrderNumFirst: { color: COLORS.warning },
  speakingOrderName: { flex: 1, fontSize: 15, fontFamily: FONTS.bold, color: COLORS.text },
  speakingOrderNameFirst: { color: COLORS.warning },
  speakingOrderTag: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Balance card
  balanceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5 },
  balanceValue: { fontSize: 42, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -1 },
  potLabel:     { fontSize: 12, color: COLORS.text3 },

  // Action options
  actionInstruction: { fontSize: 13, color: COLORS.text2, lineHeight: 19 },
  actionOption: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 4,
  },
  actionOptionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: '#130e2a',
  },
  actionOptionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text },
  actionOptionDesc:  { fontSize: 13, color: COLORS.text2, lineHeight: 18 },
  guesserProgress:   { fontSize: 12, color: COLORS.text3, textAlign: 'center', letterSpacing: 1 },
  forceText:         { fontSize: 13, color: COLORS.text3, textDecorationLine: 'underline' },

  // Public results (4-cell grid)
  publicResultsGrid: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  // Public results secondary row (mutual / drained)
  publicResultsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  publicResultCell:    { alignItems: 'center', flex: 1, gap: 4 },
  publicResultDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  publicResultNum:     { fontSize: 24, fontFamily: FONTS.extrabold, color: COLORS.text },
  publicResultLabel:   { fontSize: 10, color: COLORS.text2, textAlign: 'center', fontFamily: FONTS.semibold, lineHeight: 14 },

  // My result card
  myResultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  myResultLabel:   { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5 },
  myResultBalance: { fontSize: 38, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -1 },
  myResultDelta:   { fontSize: 18, fontFamily: FONTS.bold },
  myResultRole:    { fontSize: 12, color: COLORS.text2, marginTop: 4, textAlign: 'center' },

  // Reveal note
  revealNote: {
    fontSize: 12,
    color: COLORS.text3,
    textAlign: 'center',
    fontStyle: 'italic',
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
  standingRowFirst: { borderColor: COLORS.success, backgroundColor: '#071d0f' },
  standingRank:  { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text2, width: 28 },
  standingName:  { flex: 1, fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text },
  standingScore: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.text2 },

  // Game over
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: {
    fontSize: 36,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -1,
    textAlign: 'center',
  },
  gameOverSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
  divider:     { height: 1, backgroundColor: COLORS.border },

  // Round history
  historyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 6,
  },
  historyRound:   { fontSize: 13, fontFamily: FONTS.extrabold, color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5 },
  historyPublic:  { fontSize: 12, color: COLORS.text3, fontStyle: 'italic', lineHeight: 17 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  historyPlayerName: { flex: 1, fontSize: 14, fontFamily: FONTS.bold, color: COLORS.text },
  historyAction:     { fontSize: 13, color: COLORS.text2, flex: 1 },
  historyDelta:      { fontSize: 13, fontFamily: FONTS.bold, minWidth: 60, textAlign: 'right' },

  // Actions container
  actions: { gap: 10, marginTop: 4, alignItems: 'center' },

  // ── Compact leaderboard HUD ────────────────────────────────────────────────
  compactLB: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compactLBInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  compactLBLeft: {
    justifyContent: 'center',
    minWidth: 70,
  },
  compactLBPotLabel: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  compactLBPotBig: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  compactLBDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
  },
  compactLBRight: {
    flex: 1,
    gap: 2,
  },
  compactLBRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactLBBal: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'right',
  },
  compactLBPct: {
    fontSize: 11,
    color: COLORS.text3,
    width: 32,
    textAlign: 'right',
  },
  compactLBYouSlot: {
    width: 32,
    alignItems: 'flex-end',
  },
  compactLBMeText: {
    color: COLORS.accentHi,
    fontFamily: FONTS.extrabold,
  },
  compactYouBadge: {
    fontSize: 9,
    fontFamily: FONTS.extrabold,
    color: COLORS.accentHi,
    borderWidth: 1,
    borderColor: COLORS.accentHi,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  // ── Expanded leaderboard ───────────────────────────────────────────────────
  expandedLBHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  expandedLBPotLabel: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
  },
  expandedLB: { gap: 6 },
  expandedLBRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  expandedLBRowFirst: {
    borderColor: COLORS.success,
    backgroundColor: '#071d0f',
  },
  expandedLBRowMe: {
    borderColor: COLORS.accentHi,
    backgroundColor: '#130e2a',
  },
  expandedLBLabel: {
    width: 64,
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
  },
  expandedLBLabelMe: {
    color: COLORS.accentHi,
  },
  expandedLBBal: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
  },
  expandedLBDelta: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    minWidth: 60,
    textAlign: 'right',
  },
  expandedLBPct: {
    fontSize: 12,
    color: COLORS.text3,
    width: 36,
    textAlign: 'right',
  },

  // Rules modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: COLORS.borderHi,
  },
  modalScroll:   { padding: 24, gap: 12, paddingBottom: 8 },
  modalTitle:    { fontSize: 24, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 14, color: COLORS.text2, marginBottom: 4 },
  ruleSection:   { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.text, marginTop: 8 },
  ruleText:      { fontSize: 14, color: COLORS.text2, lineHeight: 21 },
  modalClose: {
    margin: 16,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 16, fontFamily: FONTS.bold, color: '#fff' },
});
