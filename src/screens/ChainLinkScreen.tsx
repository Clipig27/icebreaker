import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import { COLORS } from '../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ChainLink'>;
};

type CLChainEntry = { word: string; by: string | null; reason: string };

type CLReferee = {
  state: 'thinking' | 'done';
  verdict: 'VALID' | 'INVALID' | null;
  why: string;
  card: string;
  who: string;
  challenger: string;
};

type CLGameState = {
  game: 'chainLink';
  phase: 'playing' | 'win';
  hands: Record<string, string[]>;
  chain: Array<CLChainEntry>;
  turnOrder: string[];
  turnIdx: number;
  pending: { card: string; reason: string; by: string } | null;
  challengeStartedAt: number | null;
  turnStartedAt: number | null;
  winner: string | null;
  log: Array<{ text: string; playerId?: string; type: string }>;
  drawPile: string[];
  referee: null | CLReferee;
};

const { width: SCREEN_W } = Dimensions.get('window');
const TURN_TIMER_MS = 20000;
const CHALLENGE_WINDOW_MS = 3000;

// ── Color helpers ────────────────────────────────────────────────────────────
function cardCountColor(count: number, maxCards: number): string {
  if (maxCards <= 1) return '#3B82F6';
  const t = Math.max(0, Math.min(1, (count - 1) / (maxCards - 1)));
  const r = Math.round(239 * (1 - t) + 59 * t);
  const g = Math.round(68 * (1 - t) + 130 * t);
  const b = Math.round(68 * (1 - t) + 246 * t);
  return `rgb(${r},${g},${b})`;
}

// ── Ellipsis hook ────────────────────────────────────────────────────────────
function useEllipsis(): string {
  const [dots, setDots] = useState('.');
  useEffect(() => {
    const id = setInterval(() => setDots(d => (d.length >= 3 ? '.' : d + '.')), 500);
    return () => clearInterval(id);
  }, []);
  return dots;
}

// ── Flash hook ───────────────────────────────────────────────────────────────
function useFlash(): Animated.Value {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

// ── Card change alert ────────────────────────────────────────────────────────
function CardChangeAlert({ text, color }: { text: string; color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 10 }),
      Animated.sequence([
        Animated.delay(1800),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -30, duration: 400, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, [opacity, translateY, scale]);

  return (
    <Animated.View style={[
      styles.cardChangeAlert,
      { backgroundColor: color, opacity, transform: [{ translateY }, { scale }] },
    ]}>
      <Text style={styles.cardChangeAlertText}>{text}</Text>
    </Animated.View>
  );
}

// ── Turn timer component ─────────────────────────────────────────────────────
function TurnTimer({ turnStartedAt }: { turnStartedAt: number | null }) {
  const [msLeft, setMsLeft] = useState(TURN_TIMER_MS);

  useEffect(() => {
    if (turnStartedAt === null) { setMsLeft(TURN_TIMER_MS); return; }
    const tick = () => {
      const elapsed = Date.now() - turnStartedAt;
      setMsLeft(Math.max(0, TURN_TIMER_MS - elapsed));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [turnStartedAt]);

  const progress = msLeft / TURN_TIMER_MS;
  const secs = Math.ceil(msLeft / 1000);
  const barColor = progress > 0.66 ? '#22C55E' : progress > 0.33 ? '#EAB308' : '#EF4444';

  return (
    <View style={timerStyles.wrap}>
      <View style={timerStyles.track}>
        <View style={[timerStyles.fill, { width: `${progress * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={[timerStyles.secs, { color: barColor }]}>{secs}s</Text>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  secs: { fontSize: 13, fontWeight: '800', minWidth: 28, textAlign: 'right' },
});

// ── Opponent card ────────────────────────────────────────────────────────────
function OpponentCard({
  name,
  cardCount,
  isActive,
  maxCards,
}: {
  name: string;
  cardCount: number;
  isActive: boolean;
  maxCards: number;
}) {
  const color = cardCountColor(cardCount, maxCards);
  const flash = useFlash();
  const isLastCard = cardCount === 1;

  const card = (
    <View style={[
      styles.opponentCard,
      { borderColor: isActive ? color : COLORS.borderHi },
      isActive && { shadowColor: color, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6 },
    ]}>
      <View style={[styles.opponentDot, { backgroundColor: color }]} />
      <Text style={styles.opponentName} numberOfLines={1}>{name}</Text>
      <Text style={[styles.opponentCount, { color }]}>{cardCount}</Text>
      {isLastCard && <Text style={styles.lastCardBadge}>!</Text>}
    </View>
  );

  if (isLastCard) {
    return <Animated.View style={{ opacity: flash }}>{card}</Animated.View>;
  }
  return card;
}

// ── Draggable hand card ──────────────────────────────────────────────────────
function DraggableHandCard({
  word,
  selected,
  onSelect,
  onPlay,
  canDrag,
}: {
  word: string;
  selected: boolean;
  onSelect: () => void;
  onPlay: () => void;
  canDrag: boolean;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const liftScale = useRef(new Animated.Value(1)).current;
  const canDragRef = useRef(canDrag);
  canDragRef.current = canDrag;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        return canDragRef.current && gs.dy < -8 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5;
      },
      onPanResponderGrant: () => {
        isDragging.current = true;
        Animated.spring(liftScale, { toValue: 1.15, useNativeDriver: true, speed: 20 }).start();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, gs) => {
        isDragging.current = false;
        if (gs.dy < -80) {
          // Dragged up enough — play the card
          Animated.timing(pan, {
            toValue: { x: 0, y: -400 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            liftScale.setValue(1);
            onPlayRef.current();
          });
        } else {
          // Snap back
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 20 }).start();
          Animated.spring(liftScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
        }
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        Animated.spring(liftScale, { toValue: 1, useNativeDriver: true }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={{
        transform: [...pan.getTranslateTransform(), { scale: liftScale }],
        zIndex: selected ? 100 : 1,
      }}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={[styles.handCard, selected && styles.handCardSelected]}
        onPress={onSelect}
        activeOpacity={0.75}
      >
        <Text
          style={styles.handCardWord}
          adjustsFontSizeToFit
          numberOfLines={word.includes(' ') ? 2 : 1}
        >
          {word}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Chain link connector ─────────────────────────────────────────────────────
function ChainConnector() {
  return (
    <View style={styles.chainConnector}>
      <View style={styles.chainConnectorLine} />
      <Text style={styles.chainConnectorIcon}>🔗</Text>
      <View style={styles.chainConnectorLine} />
    </View>
  );
}

// ── Referee panel ────────────────────────────────────────────────────────────
function RefereePanel({ referee, onDismiss, isHost }: { referee: CLReferee; onDismiss: () => void; isHost: boolean }) {
  const dots = useEllipsis();
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (referee.state === 'done') {
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 12 }).start();
    }
  }, [referee.state, scaleAnim]);

  if (referee.state === 'thinking') {
    return (
      <View style={styles.refereeCard}>
        <Text style={styles.refereeTitle}>Ruling on "{referee.card}"{dots}</Text>
        <Text style={styles.refereeSub}>AI referee is deliberating</Text>
      </View>
    );
  }
  const isValid = referee.verdict === 'VALID';
  const why = referee.why && referee.why.length > 0 ? referee.why : (isValid ? 'Link accepted.' : 'Link rejected.');
  return (
    <Animated.View style={[
      styles.refereeCard,
      isValid ? styles.refereeValid : styles.refereeInvalid,
      { transform: [{ scale: scaleAnim }] },
    ]}>
      <Text style={[styles.refereeVerdict, { color: isValid ? '#22C55E' : '#EF4444' }]}>
        {isValid ? 'VALID' : 'INVALID'}
      </Text>
      <Text style={styles.refereeWhy}>{why}</Text>
      {isHost && (
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.75}>
          <Text style={styles.dismissBtnText}>Continue</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ── Challenge window panel ───────────────────────────────────────────────────
function ChallengePanel({
  pending,
  challengeStartedAt,
  isMyTurn,
  onChallenge,
  byName,
}: {
  pending: { card: string; reason: string; by: string };
  challengeStartedAt: number | null;
  isMyTurn: boolean;
  onChallenge: () => void;
  byName: string;
}) {
  const [msLeft, setMsLeft] = useState(CHALLENGE_WINDOW_MS);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (challengeStartedAt === null) return;
    const tick = () => {
      const elapsed = Date.now() - challengeStartedAt;
      setMsLeft(Math.max(0, CHALLENGE_WINDOW_MS - elapsed));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [challengeStartedAt]);

  useEffect(() => {
    if (isMyTurn) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isMyTurn, pulseAnim]);

  const progress = challengeStartedAt !== null ? msLeft / CHALLENGE_WINDOW_MS : 1;
  const secsLeft = (msLeft / 1000).toFixed(1);

  return (
    <View style={styles.challengePanel}>
      <Text style={styles.challengeTitle}>
        <Text style={{ fontWeight: '900' }}>{byName}</Text> played{' '}
        <Text style={{ fontWeight: '900', color: '#F5F0E8' }}>{pending.card}</Text>
      </Text>
      {pending.reason.length > 0 && (
        <Text style={styles.challengeReason}>"{pending.reason}"</Text>
      )}

      {challengeStartedAt !== null && (
        <View style={styles.countdownRow}>
          <View style={styles.countdownTrack}>
            <View style={[styles.countdownFill, { width: `${progress * 100}%` as any, backgroundColor: progress > 0.4 ? '#22C55E' : '#EF4444' }]} />
          </View>
          <Text style={styles.countdownSecs}>{secsLeft}s</Text>
        </View>
      )}

      {!isMyTurn ? (
        <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <TouchableOpacity style={styles.challengeBtn} onPress={onChallenge} activeOpacity={0.8}>
            <Text style={styles.challengeBtnText}>CHALLENGE</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <Text style={styles.challengeWaiting}>Your link is on the table...</Text>
      )}
    </View>
  );
}

// ── Event log ────────────────────────────────────────────────────────────────
function EventLog({ entries }: { entries: CLGameState['log'] }) {
  const last3 = entries.slice(-3);
  return (
    <View style={styles.logContainer}>
      {last3.map((entry, i) => {
        const colorMap: Record<string, string> = {
          play: '#D99A2B', win: '#22C55E', invalid: '#EF4444', valid: '#22C55E',
        };
        const entryColor = colorMap[entry.type] ?? '#8585A0';
        return (
          <Text key={i} style={[styles.logEntry, { color: entryColor }]} numberOfLines={1}>
            {entry.text}
          </Text>
        );
      })}
    </View>
  );
}

// ── YOUR TURN banner ─────────────────────────────────────────────────────────
function YourTurnBanner() {
  const pulseAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.yourTurnBanner, { opacity: pulseAnim }]}>
      <Text style={styles.yourTurnBannerText}>YOUR TURN</Text>
    </Animated.View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ChainLinkScreen({ navigation }: Props) {
  const { room, players, sendPlayerAction, currentUser, isHost } = useGame();
  const gs = room?.gameState as CLGameState | null;

  const myId = (() => {
    if (currentUser?.id) {
      const byPersistent = players.find(
        p => (p as any).persistentId === currentUser.id || p.id === currentUser.id,
      );
      if (byPersistent) return byPersistent.id;
    }
    const bySocket = players.find(p => p.id === socket.id);
    if (bySocket) return bySocket.id;
    return currentUser?.id ?? socket.id ?? '';
  })();

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [cardAlert, setCardAlert] = useState<{ key: number; text: string; color: string } | null>(null);
  const alertKeyRef = useRef(0);
  const chainScrollRef = useRef<ScrollView>(null);
  const prevHandSizeRef = useRef<number | null>(null);

  // Scroll chain to end when it updates
  useEffect(() => {
    if (gs?.chain?.length) {
      setTimeout(() => chainScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [gs?.chain?.length]);

  // Reset selection when turn changes
  useEffect(() => {
    setSelectedCard(null);
    setReason('');
  }, [gs?.turnIdx]);

  // Track card count changes for alerts
  const myHandSize = (gs?.hands?.[myId] ?? []).length;
  useEffect(() => {
    if (prevHandSizeRef.current !== null && prevHandSizeRef.current !== myHandSize && myHandSize > 0) {
      const diff = myHandSize - prevHandSizeRef.current;
      if (diff > 0) {
        alertKeyRef.current += 1;
        setCardAlert({ key: alertKeyRef.current, text: `+${diff} card${diff > 1 ? 's' : ''} drawn`, color: '#EF4444' });
      } else if (diff < 0) {
        alertKeyRef.current += 1;
        setCardAlert({ key: alertKeyRef.current, text: `Card played!`, color: '#22C55E' });
      }
    }
    prevHandSizeRef.current = myHandSize;
  }, [myHandSize, myId]);

  // Clear alert after animation
  useEffect(() => {
    if (!cardAlert) return;
    const t = setTimeout(() => setCardAlert(null), 2500);
    return () => clearTimeout(t);
  }, [cardAlert]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!gs || !gs.turnOrder) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Setting up ChainLink...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const allPlayers = room?.players ?? players;
  const currentTurnId = gs.turnOrder[gs.turnIdx] ?? null;
  const isMyTurn = currentTurnId === myId;
  const myHand = gs.hands[myId] ?? [];
  const opponents = allPlayers.filter(p => p.id !== myId);
  const lastChainEntry = gs.chain.length > 0 ? gs.chain[gs.chain.length - 1] : null;
  const lastWord = lastChainEntry?.word ?? null;
  const currentPlayerName = allPlayers.find(p => p.id === currentTurnId)?.name ?? 'player';

  // Max cards among all players (for color gradient)
  const maxCards = useMemo(() => {
    let mx = 1;
    for (const pid of gs.turnOrder) {
      mx = Math.max(mx, (gs.hands[pid] ?? []).length);
    }
    return mx;
  }, [gs.hands, gs.turnOrder]);

  const canPlay = isMyTurn && selectedCard !== null && !gs.pending && !gs.referee;
  const canSkip = isMyTurn && !gs.pending && !gs.referee;
  const canDrag = isMyTurn && !gs.pending && !gs.referee;

  const handlePlay = useCallback((card?: string) => {
    const playCard = card ?? selectedCard;
    if (!playCard || !isMyTurn || gs.pending || gs.referee) return;
    sendPlayerAction('cl-play', { card: playCard, reason: reason.trim() });
    setSelectedCard(null);
    setReason('');
  }, [selectedCard, isMyTurn, gs.pending, gs.referee, reason, sendPlayerAction]);

  const handleSkip = () => {
    if (!canSkip) return;
    sendPlayerAction('cl-skip', {});
  };

  const handleChallenge = () => {
    sendPlayerAction('cl-challenge', {});
  };

  // ── Win screen ─────────────────────────────────────────────────────────
  if (gs.phase === 'win') {
    const winner = allPlayers.find(p => p.id === gs.winner);
    const winnerName = winner?.name ?? gs.winner ?? 'Someone';
    const isIWinner = gs.winner === myId;
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.winScroll}>
          <Text style={styles.winEmoji}>{isIWinner ? '🏆' : '🎉'}</Text>
          <Text style={styles.winTitle}>{isIWinner ? 'You win!' : `${winnerName} wins!`}</Text>
          <Text style={styles.winSub}>
            {isIWinner ? 'You emptied your hand first.' : `${winnerName} emptied their hand first.`}
          </Text>

          <View style={styles.winDivider} />
          <Text style={styles.winChainLabel}>THE CHAIN</Text>
          <View style={styles.winChainList}>
            {gs.chain.map((entry, i) => {
              const isAnchor = entry.by === null;
              const player = allPlayers.find(p => p.id === entry.by);
              return (
                <View key={i} style={styles.winChainEntry}>
                  <View style={[styles.winChainBullet, i > 0 && styles.winChainBulletConnected]}>
                    <Text style={styles.winChainNum}>{i + 1}</Text>
                  </View>
                  <View style={styles.winChainText}>
                    <Text style={styles.winChainWord}>
                      {isAnchor ? '⚓ ' : ''}{entry.word}
                    </Text>
                    {!isAnchor && entry.reason.length > 0 && (
                      <Text style={styles.winChainReason}>
                        "{entry.reason}" — {player?.name ?? entry.by}
                      </Text>
                    )}
                    {!isAnchor && entry.reason.length === 0 && (
                      <Text style={styles.winChainReason}>
                        — {player?.name ?? entry.by}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <TouchableOpacity style={styles.winPlayAgainBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.winPlayAgainText}>Back to Lobby</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main playing layout ────────────────────────────────────────────────
  const showHand = gs.phase === 'playing' && !gs.pending && !gs.referee;
  const showControls = isMyTurn && !gs.pending && !gs.referee;
  const myCardColor = cardCountColor(myHand.length, maxCards);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>

          {/* ── Card change alert overlay ──────────────────────────── */}
          {cardAlert && (
            <CardChangeAlert key={cardAlert.key} text={cardAlert.text} color={cardAlert.color} />
          )}

          {/* ── 1. Opponents strip ──────────────────────────────────── */}
          <View style={styles.opponentsStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.opponentsScroll}>
              {opponents.map((p) => {
                const cardCount = (gs.hands[p.id] ?? []).length;
                const isActive = p.id === currentTurnId;
                return (
                  <OpponentCard
                    key={p.id}
                    name={p.name}
                    cardCount={cardCount}
                    isActive={isActive}
                    maxCards={maxCards}
                  />
                );
              })}
              {opponents.length === 0 && (
                <Text style={styles.noOpponents}>No other players</Text>
              )}
            </ScrollView>
          </View>

          {/* ── Turn indicator + timer ─────────────────────────────── */}
          {isMyTurn && !gs.pending && !gs.referee && <YourTurnBanner />}
          {!isMyTurn && !gs.pending && !gs.referee && (
            <View style={styles.waitingBanner}>
              <Text style={styles.waitingBannerText}>{currentPlayerName}'s turn</Text>
            </View>
          )}
          {!gs.pending && !gs.referee && gs.phase === 'playing' && (
            <TurnTimer turnStartedAt={gs.turnStartedAt ?? null} />
          )}

          {/* ── 2. Chain area ──────────────────────────────────────── */}
          <View style={styles.chainArea}>
            <ScrollView
              ref={chainScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chainScroll}
            >
              {gs.chain.map((entry, i) => {
                const isAnchor = entry.by === null;
                const isLast = i === gs.chain.length - 1 && !isAnchor;
                return (
                  <View key={i} style={styles.chainEntryWrap}>
                    {i > 0 && <ChainConnector />}
                    <View style={[
                      styles.chainCard,
                      isAnchor && styles.chainAnchorCard,
                      isLast && styles.chainLastCard,
                    ]}>
                      <Text style={[styles.chainCardText, isAnchor && styles.chainAnchorText, isLast && styles.chainLastCardText]}>
                        {isAnchor ? '⚓ ' : ''}{entry.word}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {gs.chain.length === 0 && (
                <View style={styles.chainEmptyCard}>
                  <Text style={styles.chainEmptyText}>Chain starts here</Text>
                </View>
              )}
            </ScrollView>

            {lastWord && (
              <Text style={styles.chainLinkHint}>
                Link to: "{lastWord}"
              </Text>
            )}

            {/* Drop zone hint when dragging */}
            {canDrag && selectedCard && (
              <View style={styles.dropZoneHint}>
                <Text style={styles.dropZoneText}>Drag card here to play</Text>
              </View>
            )}
          </View>

          {/* ── 3. Referee panel ───────────────────────────────────── */}
          {gs.referee && (
            <View style={styles.sectionPad}>
              <RefereePanel
                referee={gs.referee}
                onDismiss={() => sendPlayerAction('cl-dismiss-referee', {})}
                isHost={isHost}
              />
            </View>
          )}

          {/* ── 4. Challenge window ────────────────────────────────── */}
          {gs.pending && !gs.referee && (
            <View style={styles.sectionPad}>
              <ChallengePanel
                pending={gs.pending}
                challengeStartedAt={gs.challengeStartedAt}
                isMyTurn={isMyTurn}
                onChallenge={handleChallenge}
                byName={allPlayers.find(p => p.id === gs.pending?.by)?.name ?? gs.pending.by}
              />
            </View>
          )}

          {/* ── Event log ──────────────────────────────────────────── */}
          {gs.log.length > 0 && (
            <EventLog entries={gs.log} />
          )}

          {/* ── 5. Your hand — scrollable with drag-to-play ────────── */}
          {showHand && (
            <View style={styles.handArea}>
              <View style={styles.handHeader}>
                <Text style={styles.handLabel}>YOUR HAND</Text>
                <View style={[styles.myCardCountBadge, { backgroundColor: myCardColor + '22', borderColor: myCardColor }]}>
                  <Text style={[styles.myCardCountText, { color: myCardColor }]}>{myHand.length} card{myHand.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              {canDrag && (
                <Text style={styles.dragHint}>Swipe a card up to play it</Text>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.handScroll}
              >
                {myHand.map((word) => (
                  <DraggableHandCard
                    key={word}
                    word={word}
                    selected={selectedCard === word}
                    onSelect={() => setSelectedCard(selectedCard === word ? null : word)}
                    onPlay={() => handlePlay(word)}
                    canDrag={canDrag}
                  />
                ))}
                {myHand.length === 0 && (
                  <Text style={styles.emptyHand}>No cards — waiting for result...</Text>
                )}
              </ScrollView>
            </View>
          )}

          {/* ── 6. Your turn controls ──────────────────────────────── */}
          {showControls && (
            <View style={styles.controlsArea}>
              <TextInput
                style={styles.reasonInput}
                placeholder="Explain To The Referee Why This Link Works"
                placeholderTextColor={COLORS.text2}
                value={reason}
                onChangeText={setReason}
                maxLength={120}
                keyboardAppearance="dark"
                returnKeyType="done"
                onSubmitEditing={() => handlePlay()}
              />
              <View style={styles.controlsBtnRow}>
                <TouchableOpacity
                  style={[styles.playBtn, !canPlay && styles.playBtnDisabled]}
                  onPress={() => handlePlay()}
                  disabled={!canPlay}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.playBtnText, !canPlay && styles.playBtnTextDisabled]}>
                    PLAY LINK
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={handleSkip}
                  disabled={!canSkip}
                  activeOpacity={0.75}
                >
                  <Text style={styles.skipBtnText}>SKIP</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  screen: {
    flex: 1,
    flexDirection: 'column',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text2,
  },

  // ── Card change alert ───────────────────────────────────────────────────
  cardChangeAlert: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    zIndex: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  cardChangeAlertText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },

  // ── Opponents strip ──────────────────────────────────────────────────────
  opponentsStrip: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderHi,
    backgroundColor: COLORS.surface2,
  },
  opponentsScroll: {
    paddingHorizontal: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  opponentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    minWidth: 80,
  },
  opponentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  opponentName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    maxWidth: 80,
  },
  opponentCount: {
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 2,
  },
  lastCardBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: '#EF4444',
    marginLeft: 2,
  },
  noOpponents: {
    fontSize: 13,
    color: COLORS.text2,
    fontStyle: 'italic',
  },

  // ── YOUR TURN banner ──────────────────────────────────────────────────────
  yourTurnBanner: {
    backgroundColor: '#C8642F',
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#C8642F',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  yourTurnBannerText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 3,
  },
  waitingBanner: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  waitingBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text2,
  },

  // ── Chain area ────────────────────────────────────────────────────────────
  chainArea: {
    flex: 1,
    backgroundColor: '#0D1A0D',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A2A',
    justifyContent: 'center',
  },
  chainScroll: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 1,
  },
  chainEntryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chainCard: {
    backgroundColor: '#F5F0E8',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D4C9B8',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chainAnchorCard: {
    backgroundColor: '#1A2E1A',
    borderColor: '#4A7A4A',
  },
  chainAnchorText: {
    color: '#C8E6C8',
  },
  chainLastCard: {
    borderColor: '#D99A2B',
    borderWidth: 3,
    shadowColor: '#D99A2B',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  chainCardText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C2418',
    letterSpacing: 0.3,
  },
  chainLastCardText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2C2418',
  },
  chainConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  chainConnectorLine: {
    width: 6,
    height: 2,
    backgroundColor: '#4A7A4A',
    borderRadius: 1,
  },
  chainConnectorIcon: {
    fontSize: 12,
    marginHorizontal: 1,
  },
  chainEmptyCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  chainEmptyText: {
    fontSize: 14,
    color: '#3A5A3A',
    fontStyle: 'italic',
  },
  chainLinkHint: {
    fontSize: 12,
    color: '#D99A2B',
    textAlign: 'center',
    paddingBottom: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dropZoneHint: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(200,100,47,0.15)',
    borderWidth: 1,
    borderColor: '#C8642F',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  dropZoneText: {
    fontSize: 11,
    color: '#C8642F',
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Section padding wrapper ─────────────────────────────────────────────
  sectionPad: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  // ── Referee panel ──────────────────────────────────────────────────────
  refereeCard: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D99A2B',
    backgroundColor: '#1A1508',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  refereeValid: {
    borderColor: '#22C55E',
    backgroundColor: '#071D0F',
  },
  refereeInvalid: {
    borderColor: '#EF4444',
    backgroundColor: '#1D0710',
  },
  refereeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D99A2B',
    textAlign: 'center',
  },
  refereeSub: {
    fontSize: 12,
    color: COLORS.text2,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  refereeVerdict: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
  },
  refereeWhy: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  dismissBtn: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  dismissBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text2,
    letterSpacing: 0.5,
  },

  // ── Challenge window ──────────────────────────────────────────────────
  challengePanel: {
    backgroundColor: COLORS.surface2,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D99A2B',
    padding: 16,
    gap: 10,
    alignItems: 'center',
  },
  challengeTitle: {
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
  },
  challengeReason: {
    fontSize: 13,
    color: COLORS.text2,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  countdownTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  countdownFill: {
    height: 8,
    borderRadius: 4,
  },
  countdownSecs: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text2,
    minWidth: 32,
    textAlign: 'right',
  },
  challengeBtn: {
    backgroundColor: '#C8642F',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
    shadowColor: '#C8642F',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  challengeBtnText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 2,
  },
  challengeWaiting: {
    fontSize: 14,
    color: COLORS.text2,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // ── Event log ─────────────────────────────────────────────────────────
  logContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderHi,
    backgroundColor: COLORS.bg,
  },
  logEntry: {
    fontSize: 11,
    fontWeight: '500',
  },

  // ── Hand area ─────────────────────────────────────────────────────────
  handArea: {
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderHi,
    backgroundColor: COLORS.bg,
  },
  handHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  handLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  myCardCountBadge: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  myCardCountText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dragHint: {
    fontSize: 10,
    color: '#C8642F',
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  handScroll: {
    paddingHorizontal: 14,
    gap: 10,
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 4,
  },
  handCard: {
    width: 72,
    height: 100,
    backgroundColor: '#F5F0E8',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  handCardSelected: {
    borderColor: '#C8642F',
    shadowColor: '#C8642F',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  handCardWord: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2C2418',
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyHand: {
    fontSize: 13,
    color: COLORS.text2,
    fontStyle: 'italic',
    paddingVertical: 20,
  },

  // ── Controls area ─────────────────────────────────────────────────────
  controlsArea: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 8,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderHi,
  },
  reasonInput: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    color: COLORS.text,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
  },
  controlsBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  playBtn: {
    flex: 1,
    backgroundColor: '#C8642F',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#C8642F',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  playBtnDisabled: {
    backgroundColor: COLORS.surface2,
    shadowOpacity: 0,
    elevation: 0,
  },
  playBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1.5,
  },
  playBtnTextDisabled: {
    color: COLORS.text2,
  },
  skipBtn: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderHi,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text2,
    letterSpacing: 1,
  },

  // ── Win screen ────────────────────────────────────────────────────────
  winScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 48,
    alignItems: 'center',
    gap: 12,
  },
  winEmoji: {
    fontSize: 64,
  },
  winTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  winSub: {
    fontSize: 15,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 22,
  },
  winDivider: {
    height: 1,
    backgroundColor: COLORS.borderHi,
    width: '100%',
    marginVertical: 4,
  },
  winChainLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 2,
    alignSelf: 'flex-start',
  },
  winChainList: {
    width: '100%',
    gap: 0,
  },
  winChainEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  winChainBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  winChainBulletConnected: {
    borderTopWidth: 0,
  },
  winChainNum: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
  },
  winChainText: {
    flex: 1,
    gap: 2,
  },
  winChainWord: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  winChainReason: {
    fontSize: 12,
    color: COLORS.text2,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  winPlayAgainBtn: {
    marginTop: 16,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  winPlayAgainText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
});
