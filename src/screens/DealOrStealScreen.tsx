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
import { COLORS, RADIUS } from '../constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────

type DSPhase =
  | 'setup'
  | 'discussion'
  | 'action'
  | 'round-results'
  | 'accusation'
  | 'round-end'
  | 'game-over';

interface RoundHistoryEntry {
  round: number;
  dealers: string[];
  actionLog: Record<string, { action: 'deal' | 'steal' | 'neutral'; target: string | null }>;
  exposedDealerIds: string[];
  dealCount: number;
  stealCount: number;
  deltas: Record<string, number>;
  startBalances: Record<string, number>;
  endBalances: Record<string, number>;
  accusationOutcomes?: Record<
    string,
    { target: string | null; correct: boolean; skipped?: boolean; delta: number }
  >;
}

interface DSGameState {
  game: 'dealOrSteal';
  phase: DSPhase;
  round: number;
  totalRounds?: number;
  dealers: string[];
  balances: Record<string, number>;
  roundStartBalances?: Record<string, number>;
  submittedActionIds?: string[];
  roundOutcome?: {
    dealCount: number;
    stealCount: number;
    exposedDealerIds: string[];
    deltas: Record<string, number>;
  };
  accusationEligible?: string[];
  submittedAccusationIds?: string[];
  roundHistory?: RoundHistoryEntry[];
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DealOrSteal'>;
};

const ROUND_OPTIONS = [5, 7, 10] as const;
const STARTING_BALANCE = 10.0;

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
  const { players, room, isHost, sendGameState, sendPlayerAction } = useGame();
  const myId = socket.id ?? '';

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const gsRef = useRef<DSGameState | null>(null);
  const sendGameStateRef = useRef(sendGameState);

  const [showRules, setShowRules] = useState(false);
  const [actionChoice, setActionChoice] = useState<'deal' | 'neutral' | { steal: string } | null>(null);
  const [accusationTarget, setAccusationTarget] = useState<string | 'skip' | null>(null);
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sendGameStateRef.current = sendGameState;
  }, [sendGameState]);

  const gs = (room?.gameState?.game === 'dealOrSteal' ? room.gameState : null) as DSGameState | null;

  // Fade animation on phase change
  useEffect(() => {
    gsRef.current = gs;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    // Reset local input state on phase change
    setActionChoice(null);
    setAccusationTarget(null);
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
      dealers: [],
      balances,
    };
    gsRef.current = init;
    sendGameStateRef.current(init);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalRounds = gs?.totalRounds ?? 5;
  const iAmDealer = gs?.dealers?.includes(myId) ?? false;
  const iHaveSubmittedAction = gs?.submittedActionIds?.includes(myId) ?? false;
  const iAmAccusationEligible = gs?.accusationEligible?.includes(myId) ?? false;
  const iHaveAccused = gs?.submittedAccusationIds?.includes(myId) ?? false;

  const myBalance = gs?.balances?.[myId] ?? STARTING_BALANCE;
  const totalPot = Object.values(gs?.balances ?? {}).reduce((s, v) => s + v, 0);
  const myPct = totalPot > 0 ? Math.round((myBalance / totalPot) * 100) : 0;

  const dealerNames = (gs?.dealers ?? []).map(
    id => players.find(p => p.id === id)?.name ?? '?'
  );

  // Standings sorted by balance descending
  const standings = [...players].sort(
    (a, b) => ((gs?.balances ?? {})[b.id] ?? 0) - ((gs?.balances ?? {})[a.id] ?? 0)
  );

  // ── Phase transitions (host-driven) ────────────────────────────────────────

  const pickDealers = (): string[] => {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return [shuffled[0].id, shuffled[1].id];
  };

  const handleSelectRounds = (n: number) => {
    if (!gs) return;
    const dealers = pickDealers();
    const roundStartBalances = { ...gs.balances };
    const next: DSGameState = {
      ...gs,
      totalRounds: n,
      phase: 'discussion',
      round: 1,
      dealers,
      roundStartBalances,
    };
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
    // Treat missing submissions as Neutral — tell backend to resolve now
    // We do this by broadcasting a synthetic "all submitted" state.
    // Backend resolves when submittedActionIds >= players.length.
    // Instead: host sends updateGameState to skip to round-results with current data resolved.
    // Simplest safe approach: host broadcasts a fake-resolved state.
    // Actually — since dos-action is backend-authoritative, the host cannot bypass it.
    // So we provide a host escape: navigate directly to round-end with no outcome applied.
    const next: DSGameState = {
      ...gs,
      phase: 'round-end',
      roundOutcome: { dealCount: 0, stealCount: 0, exposedDealerIds: [], deltas: {} },
      accusationEligible: [],
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  const handleContinueFromResults = () => {
    if (!isHost || !gs) return;
    if ((gs.accusationEligible?.length ?? 0) > 0) {
      const next: DSGameState = { ...gs, phase: 'accusation', submittedAccusationIds: [] };
      gsRef.current = next;
      sendGameStateRef.current(next);
    } else {
      const next: DSGameState = { ...gs, phase: 'round-end' };
      gsRef.current = next;
      sendGameStateRef.current(next);
    }
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
    const dealers = pickDealers();
    const roundStartBalances = { ...gs.balances };
    const next: DSGameState = {
      ...gs,
      phase: 'discussion',
      round: nextRound,
      dealers,
      roundStartBalances,
      submittedActionIds: undefined,
      roundOutcome: undefined,
      accusationEligible: undefined,
      submittedAccusationIds: undefined,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  // ── Player actions ─────────────────────────────────────────────────────────

  const handleSubmitAction = () => {
  if (!actionChoice) return;

  if (
    actionChoice !== null &&
    typeof actionChoice === 'object' &&
    !Array.isArray(actionChoice) &&
    'steal' in actionChoice
  ) {
    sendPlayerAction('dos-action', { choice: 'steal', target: actionChoice.steal });
  } else {
    sendPlayerAction('dos-action', { choice: actionChoice });
  }
};

  const handleSubmitAccusation = () => {
    if (accusationTarget === null) return;
    if (accusationTarget === 'skip') {
      sendPlayerAction('dos-accuse', { target: null });
    } else {
      sendPlayerAction('dos-accuse', { target: accusationTarget });
    }
  };

  // ── Loading / error guards ─────────────────────────────────────────────────

  if (!gs) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          {setupTimedOut ? (
            <>
              <Text style={styles.waitTitle}>Could not load game</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
                <Text style={styles.linkText}>← Go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.waitTitle}>Setting up...</Text>
          )}
        </View>
      </SafeAreaView>
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

  const renderSetup = () => (
    <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
      <Text style={styles.setupTitle}>How many rounds?</Text>
      <Text style={styles.setupSub}>
        Dealers get exposed if both deal. Steal from the exposed. Highest balance wins.
      </Text>
      <View style={styles.setupOptions}>
        {ROUND_OPTIONS.map(n => (
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

  const renderWaitingSetup = () => (
    <View style={styles.centered}>
      <Text style={styles.waitTitle}>Waiting for host...</Text>
      <Text style={styles.waitSub}>Host is choosing round count.</Text>
      <TouchableOpacity onPress={() => setShowRules(true)} style={[styles.rulesChip, { marginTop: 20 }]}>
        <Text style={styles.rulesChipText}>? How to play</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDiscussion = () => {
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

        <Text style={styles.phaseLabel}>💬 Discussion</Text>
        <Text style={styles.phaseSub}>
          Talk it out. Make deals. Cast suspicion. When everyone's ready, the host starts actions.
        </Text>

        <Text style={styles.sectionLabel}>Dealers this round</Text>
        <View style={styles.dealerRow}>
          {gs.dealers.map(id => {
            const name = players.find(p => p.id === id)?.name ?? '?';
            const isMe = id === myId;
            return (
              <View key={id} style={[styles.dealerChip, isMe && styles.dealerChipMe]}>
                <Text style={styles.dealerChipText}>{name}</Text>
                {isMe && <Text style={styles.dealerChipYou}> (you)</Text>}
              </View>
            );
          })}
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceValue}>{fmt(myBalance)}</Text>
          <Text style={styles.potLabel}>Pot {fmt(totalPot)} · your share {myPct}%</Text>
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

    if (iHaveSubmittedAction) {
      return (
        <Animated.View style={[styles.centeredContainer, { opacity: fadeAnim }]}>
          <Text style={styles.waitEmoji}>✅</Text>
          <Text style={styles.waitTitle}>Action locked in!</Text>
          <Text style={styles.waitSub}>{submittedCount} / {players.length} submitted</Text>
          <TouchableOpacity onPress={() => setShowRules(true)} style={[styles.rulesChip, { marginTop: 20 }]}>
            <Text style={styles.rulesChipText}>? Rules</Text>
          </TouchableOpacity>
        </Animated.View>
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

        <Text style={styles.phaseLabel}>🎴 Your Move</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {iAmDealer ? '🃏  You are a Dealer' : '👁  You are an Observer'}
          </Text>
        </View>

        {iAmDealer ? (
          <>
            <Text style={styles.actionInstruction}>
              If both Dealers choose Deal, you both become Exposed — and gain 60% of your starting balance. But Observers can then steal from you.
            </Text>

            <TouchableOpacity
              style={[styles.actionOption, actionChoice === 'deal' && styles.actionOptionSelected]}
              onPress={() => setActionChoice('deal')}
            >
              <Text style={styles.actionOptionTitle}>🤝  Deal</Text>
              <Text style={styles.actionOptionDesc}>Bet on your partner. Gain 60% if both deal.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionOption, actionChoice === 'neutral' && styles.actionOptionSelected]}
              onPress={() => setActionChoice('neutral')}
            >
              <Text style={styles.actionOptionTitle}>🛡  Neutral</Text>
              <Text style={styles.actionOptionDesc}>Stay protected. No gain, no risk.</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.actionInstruction}>
              If a Dealer is Exposed (both Dealers dealt), your Steal succeeds. If protected, you lose 20% of your balance.
            </Text>

            {gs.dealers.map(dId => {
              const dName = players.find(p => p.id === dId)?.name ?? '?';
              const isSelected =
                actionChoice !== null &&
                typeof actionChoice === 'object' &&
                !Array.isArray(actionChoice) &&
                'steal' in actionChoice &&
                actionChoice.steal === dId;
              return (
                <TouchableOpacity
                  key={dId}
                  style={[styles.actionOption, isSelected && styles.actionOptionSelected]}
                  onPress={() => setActionChoice({ steal: dId })}
                >
                  <Text style={styles.actionOptionTitle}>🔪  Steal from {dName}</Text>
                  <Text style={styles.actionOptionDesc}>
                    If {dName} is exposed, you split their 50%. If not, you lose 20% of your balance.
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.actionOption, actionChoice === 'neutral' && styles.actionOptionSelected]}
              onPress={() => setActionChoice('neutral')}
            >
              <Text style={styles.actionOptionTitle}>🛡  Neutral</Text>
              <Text style={styles.actionOptionDesc}>Do nothing. Keep your balance safe.</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.guesserProgress}>{submittedCount} / {players.length} submitted</Text>

        <View style={styles.actions}>
          <PrimaryButton
            title="Confirm →"
            onPress={handleSubmitAction}
            disabled={actionChoice === null}
          />
        </View>

        {isHost && submittedCount > 0 && (
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
    const wasDealer = gs.dealers.includes(myId);
    const wasExposed = outcome.exposedDealerIds?.includes(myId) ?? false;

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

        <View style={styles.publicResultsRow}>
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.dealCount}</Text>
            <Text style={styles.publicResultLabel}>Deal{outcome.dealCount !== 1 ? 's' : ''} made</Text>
          </View>
          <View style={styles.publicResultDivider} />
          <View style={styles.publicResultCell}>
            <Text style={styles.publicResultNum}>{outcome.stealCount}</Text>
            <Text style={styles.publicResultLabel}>Steal{outcome.stealCount !== 1 ? 's' : ''} attempted</Text>
          </View>
          {outcome.exposedDealerIds.length > 0 && (
            <>
              <View style={styles.publicResultDivider} />
              <View style={styles.publicResultCell}>
                <Text style={styles.publicResultNum}>⚡</Text>
                <Text style={styles.publicResultLabel}>
                  {outcome.exposedDealerIds
                    .map(id => players.find(p => p.id === id)?.name ?? '?')
                    .join(' & ')}{' '}
                  exposed
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.myResultCard}>
          <Text style={styles.myResultLabel}>Your result</Text>
          <Text style={styles.myResultBalance}>{fmt(myBalance)}</Text>
          <Text style={[styles.myResultDelta, { color: myDelta >= 0 ? COLORS.success : COLORS.danger }]}>
            {fmtDelta(myDelta)} this round
          </Text>
          {wasDealer && (
            <Text style={styles.myResultRole}>
              {wasExposed ? '⚡ You were a Dealer and became Exposed' : '🛡 You were a Dealer and stayed Protected'}
            </Text>
          )}
          <Text style={styles.potLabel}>Pot {fmt(totalPot)} · your share {myPct}%</Text>
        </View>

        {(gs.accusationEligible?.length ?? 0) > 0 && (
          <View style={styles.accusationNotice}>
            <Text style={styles.accusationNoticeText}>
              ⚠️ Accusation phase up next — some Dealers were stolen from.
            </Text>
          </View>
        )}

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

  const renderAccusation = () => {
    const nonDealerPlayers = players.filter(p => !gs.dealers.includes(p.id));
    const submittedCount = gs.submittedAccusationIds?.length ?? 0;
    const eligibleCount = gs.accusationEligible?.length ?? 0;

    if (!iAmAccusationEligible) {
      return (
        <View style={styles.centered}>
          <Text style={styles.waitEmoji}>⚖️</Text>
          <Text style={styles.waitTitle}>Accusation Phase</Text>
          <Text style={styles.waitSub}>
            Dealers who were stolen from are making their accusations.{'\n'}
            {submittedCount} / {eligibleCount} responded.
          </Text>
        </View>
      );
    }

    if (iHaveAccused) {
      return (
        <View style={styles.centered}>
          <Text style={styles.waitEmoji}>⚖️</Text>
          <Text style={styles.waitTitle}>Accusation submitted</Text>
          <Text style={styles.waitSub}>{submittedCount} / {eligibleCount} responded.</Text>
        </View>
      );
    }

    return (
      <AnimatedScrollView style={{ opacity: fadeAnim }} contentContainerStyle={styles.scroll}>
        <Text style={styles.phaseLabel}>⚖️ Accusation</Text>
        <Text style={styles.phaseSub}>
          You were stolen from this round. Accuse the right person to recover what you lost. Accuse the wrong person and you'll lose 10% of your balance. No one else will know.
        </Text>

        <Text style={styles.sectionLabel}>Who stole from you?</Text>

        {nonDealerPlayers.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.actionOption, accusationTarget === p.id && styles.actionOptionSelected]}
            onPress={() => setAccusationTarget(p.id)}
          >
            <Text style={styles.actionOptionTitle}>{p.name}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.actionOption, accusationTarget === 'skip' && styles.actionOptionSelected]}
          onPress={() => setAccusationTarget('skip')}
        >
          <Text style={styles.actionOptionTitle}>Skip — no accusation</Text>
          <Text style={styles.actionOptionDesc}>Stay quiet. No risk, no recovery.</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <PrimaryButton
            title="Submit Accusation →"
            onPress={handleSubmitAccusation}
            disabled={accusationTarget === null}
          />
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
      <Text style={styles.sectionLabel}>Standings · highest balance wins</Text>

      {standings.map((p, i) => (
        <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
          <Text style={styles.standingRank}>#{i + 1}</Text>
          <Text style={styles.standingName}>
            {p.name}
            {p.id === myId ? ' (you)' : ''}
          </Text>
          <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
            {fmt(gs.balances?.[p.id] ?? STARTING_BALANCE)}
          </Text>
        </View>
      ))}

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
    const topBalance = standings.length > 0 ? (gs.balances?.[standings[0].id] ?? 0) : 0;
    const winners = standings.filter(p => (gs.balances?.[p.id] ?? 0) === topBalance);
    const winnerText = winners.map(p => p.name).join(' & ');

    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.gameOverEmoji}>🏆</Text>
        <Text style={styles.gameOverTitle}>{winnerText} wins!</Text>
        <Text style={styles.gameOverSub}>Highest balance after {totalRounds} rounds.</Text>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Final Standings</Text>
        {standings.map((p, i) => (
          <View key={p.id} style={[styles.standingRow, i === 0 && styles.standingRowFirst]}>
            <Text style={styles.standingRank}>#{i + 1}</Text>
            <Text style={styles.standingName}>
              {p.name}{p.id === myId ? ' (you)' : ''}
            </Text>
            <Text style={[styles.standingScore, i === 0 && { color: COLORS.success }]}>
              {fmt(gs.balances?.[p.id] ?? STARTING_BALANCE)}
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
            <PrimaryButton title="Back to Games" onPress={() => navigation.navigate('GameSelect')} />
          ) : (
            <Text style={styles.waitSub}>Waiting for host...</Text>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderHistoryEntry = (entry: RoundHistoryEntry) => {
    const d1Name = players.find(p => p.id === entry.dealers[0])?.name ?? '?';
    const d2Name = players.find(p => p.id === entry.dealers[1])?.name ?? '?';

    return (
      <View key={entry.round} style={styles.historyCard}>
        <Text style={styles.historyRound}>Round {entry.round}</Text>
        <Text style={styles.historyDealers}>Dealers: {d1Name} & {d2Name}</Text>
        <Text style={styles.historyPublic}>
          {entry.dealCount} deal{entry.dealCount !== 1 ? 's' : ''} · {entry.stealCount} steal{entry.stealCount !== 1 ? 's' : ''}
          {entry.exposedDealerIds.length > 0 ? ' · EXPOSED' : ' · protected'}
        </Text>
        {players.map(p => {
          const a = entry.actionLog?.[p.id];
          if (!a) return null;
          const delta = entry.deltas?.[p.id] ?? 0;
          const isDealer = entry.dealers.includes(p.id);
          let actionText: string = a.action;
          if (a.action === 'steal' && a.target) {
            const targetName = players.find(pl => pl.id === a.target)?.name ?? '?';
            actionText = `steal → ${targetName}`;
          }
          return (
            <View key={p.id} style={styles.historyRow}>
              <Text style={styles.historyPlayerName}>
                {p.name}{isDealer ? ' (D)' : ''}
              </Text>
              <Text style={styles.historyAction}>{actionText}</Text>
              <Text style={[styles.historyDelta, { color: delta >= 0 ? COLORS.success : COLORS.danger }]}>
                {fmtDelta(delta)}
              </Text>
            </View>
          );
        })}
        {entry.accusationOutcomes && Object.keys(entry.accusationOutcomes).length > 0 && (
          <View style={styles.historyAccusations}>
            <Text style={styles.historyAccusationHeader}>Accusations</Text>
            {Object.entries(entry.accusationOutcomes).map(([accuserId, outcome]) => {
              if (outcome.skipped) return null;
              const accuserName = players.find(p => p.id === accuserId)?.name ?? '?';
              const targetName = outcome.target
                ? players.find(p => p.id === outcome.target)?.name ?? '?'
                : '—';
              return (
                <Text key={accuserId} style={styles.historyAccusationLine}>
                  {accuserName} → {targetName}: {outcome.correct ? '✓ correct' : '✗ wrong'} ({fmtDelta(outcome.delta)})
                </Text>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ── Rules modal ────────────────────────────────────────────────────────────

  const renderRulesModal = () => (
    <Modal visible={showRules} transparent animationType="slide" onRequestClose={() => setShowRules(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.modalTitle}>Deal or Steal</Text>
            <Text style={styles.modalSubtitle}>How to play</Text>

            <Text style={styles.ruleSection}>💰 Starting balance</Text>
            <Text style={styles.ruleText}>Everyone starts with $10. Highest balance at the end wins.</Text>

            <Text style={styles.ruleSection}>🃏 Dealers</Text>
            <Text style={styles.ruleText}>
              Each round, 2 Dealers are randomly selected. Everyone else is an Observer.
            </Text>

            <Text style={styles.ruleSection}>🤝 Deal + Deal (both Dealers deal)</Text>
            <Text style={styles.ruleText}>
              Both Dealers become EXPOSED and gain 60% of their starting-round balance.
              {'\n'}Observers can now steal from them.
            </Text>

            <Text style={styles.ruleSection}>🛡 Deal + Neutral / Neutral + Neutral</Text>
            <Text style={styles.ruleText}>
              No deal activates. Both Dealers are PROTECTED. Steal attempts will fail.
            </Text>

            <Text style={styles.ruleSection}>🔪 Steal (Observer action)</Text>
            <Text style={styles.ruleText}>
              Target one Dealer.{'\n\n'}
              If target is EXPOSED:{'\n'}
              · You and any co-stealers split 50% of that Dealer's starting balance.{'\n'}
              · The Dealer loses 25% of their starting balance.{'\n\n'}
              If target is PROTECTED:{'\n'}
              · You lose 20% of your starting-round balance.{'\n'}
              · Lost funds go to the targeted Dealer (or to Exposed Dealers if any exist).
            </Text>

            <Text style={styles.ruleSection}>⚖️ Accusations</Text>
            <Text style={styles.ruleText}>
              Dealers who were successfully stolen from may accuse one Observer.{'\n\n'}
              Correct: recover 25% of your starting-round balance; the accused loses that amount.{'\n'}
              Wrong: you lose 10% of your current balance.{'\n\n'}
              Results are revealed at end-game only.
            </Text>

            <Text style={styles.ruleSection}>🏆 Winning</Text>
            <Text style={styles.ruleText}>
              After all rounds, the player with the highest balance wins.
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
      {gs.phase === 'setup' && (
        isHost ? renderSetup() : renderWaitingSetup()
      )}
      {gs.phase === 'discussion'    && renderDiscussion()}
      {gs.phase === 'action'        && renderAction()}
      {gs.phase === 'round-results' && renderRoundResults()}
      {gs.phase === 'accusation'    && renderAccusation()}
      {gs.phase === 'round-end'     && renderRoundEnd()}
      {gs.phase === 'game-over'     && renderGameOver()}
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
  waitTitle:  { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  waitSub:    { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  linkText:   { color: COLORS.text2, textDecorationLine: 'underline', fontSize: 14 },

  // Setup
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
  setupOptionNum:   { fontSize: 36, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  setupOptionLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600', marginTop: 2 },
  rulesChip: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  rulesChipText: { fontSize: 13, color: COLORS.text2, fontWeight: '600' },

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
    fontWeight: '700',
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
  helpBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.text2 },

  // Phase labels
  phaseLabel: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  phaseSub:   { fontSize: 14, color: COLORS.text2, lineHeight: 20 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // Dealer chips
  dealerRow:        { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  dealerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dealerChipMe:   { borderColor: COLORS.warning, backgroundColor: '#1a1500' },
  dealerChipText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  dealerChipYou:  { fontSize: 13, color: COLORS.warning, fontWeight: '600' },

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
  balanceLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5 },
  balanceValue: { fontSize: 42, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  potLabel:     { fontSize: 12, color: COLORS.text3 },

  // Role badge
  roleBadge: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  roleBadgeText: { fontSize: 15, fontWeight: '700', color: COLORS.text },

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
  actionOptionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  actionOptionDesc:  { fontSize: 13, color: COLORS.text2, lineHeight: 18 },
  guesserProgress:   { fontSize: 12, color: COLORS.text3, textAlign: 'center', letterSpacing: 1 },
  forceText:         { fontSize: 13, color: COLORS.text3, textDecorationLine: 'underline' },

  // Public results
  publicResultsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  publicResultCell:    { alignItems: 'center', flex: 1, gap: 4 },
  publicResultDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  publicResultNum:     { fontSize: 28, fontWeight: '900', color: COLORS.text },
  publicResultLabel:   { fontSize: 11, color: COLORS.text2, textAlign: 'center', fontWeight: '600' },

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
  myResultLabel:   { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5 },
  myResultBalance: { fontSize: 38, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  myResultDelta:   { fontSize: 18, fontWeight: '700' },
  myResultRole:    { fontSize: 12, color: COLORS.text2, marginTop: 4, textAlign: 'center' },

  // Accusation notice
  accusationNotice: {
    backgroundColor: '#1a1500',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    padding: 12,
  },
  accusationNoticeText: { fontSize: 13, color: COLORS.warning, fontWeight: '600', textAlign: 'center' },

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
  standingRank:  { fontSize: 13, fontWeight: '700', color: COLORS.text2, width: 28 },
  standingName:  { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  standingScore: { fontSize: 15, fontWeight: '700', color: COLORS.text2 },

  // Game over
  gameOverEmoji: { fontSize: 64, textAlign: 'center' },
  gameOverTitle: {
    fontSize: 36,
    fontWeight: '900',
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
  historyRound:   { fontSize: 13, fontWeight: '800', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5 },
  historyDealers: { fontSize: 14, color: COLORS.text2 },
  historyPublic:  { fontSize: 13, color: COLORS.text3, fontStyle: 'italic' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  historyPlayerName: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  historyAction:     { fontSize: 13, color: COLORS.text2, flex: 1 },
  historyDelta:      { fontSize: 13, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  historyAccusations: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    gap: 3,
  },
  historyAccusationHeader: { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1 },
  historyAccusationLine:   { fontSize: 12, color: COLORS.text2 },

  // Actions container
  actions: { gap: 10, marginTop: 4, alignItems: 'center' },

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
  modalTitle:    { fontSize: 24, fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 14, color: COLORS.text2, marginBottom: 4 },
  ruleSection:   { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  ruleText:      { fontSize: 14, color: COLORS.text2, lineHeight: 21 },
  modalClose: {
    margin: 16,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
