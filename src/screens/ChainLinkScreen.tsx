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
import { COLORS, FONTS } from '../constants/theme';
import GameIntro from '../components/GameIntro';
import PhaseTransition from '../components/PhaseTransition';


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
  phase: 'intro' | 'playing' | 'win' | 'chainBroken';
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
const TURN_TIMER_MS = 15000;
// Challenge window removed — discussion is open-ended now

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
  secs: { fontSize: 13, fontFamily: FONTS.extrabold, minWidth: 28, textAlign: 'right' },
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

// ── Draggable hand card (direct swipe up to play) ───────────────────────────
function DraggableHandCard({
  word,
  onPlay,
  canDrag,
  onDragStart,
  onDragEnd,
}: {
  word: string;
  onPlay: () => void;
  canDrag: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const canDragRef = useRef(canDrag);
  canDragRef.current = canDrag;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        // Only capture upward drags
        return canDragRef.current && gs.dy < -6 && Math.abs(gs.dy) > Math.abs(gs.dx);
      },
      onPanResponderGrant: () => {
        onDragStartRef.current();
      },
      onPanResponderMove: (_, gs) => {
        pan.setValue({ x: gs.dx, y: Math.min(0, gs.dy) }); // only allow upward
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -80) {
          // Gentle settle into the chain area
          Animated.spring(pan, {
            toValue: { x: 0, y: gs.dy - 20 },
            useNativeDriver: false,
            speed: 30,
            bounciness: 4,
          }).start(() => {
            Animated.timing(pan, {
              toValue: { x: 0, y: gs.dy - 20 },
              duration: 0,
              useNativeDriver: false,
            }).start(() => {
              pan.setValue({ x: 0, y: 0 });
              onDragEndRef.current();
              onPlayRef.current();
            });
          });
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 20 }).start();
          onDragEndRef.current();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        onDragEndRef.current();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={{ transform: pan.getTranslateTransform() }}
      {...panResponder.panHandlers}
    >
      <View style={styles.handCard}>
        <Text
          style={styles.handCardWord}
          adjustsFontSizeToFit
          numberOfLines={word.includes(' ') ? 2 : 1}
        >
          {word}
        </Text>
      </View>
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
  isMyTurn,
  isHost,
  onChallenge,
  onAccept,
  byName,
}: {
  pending: { card: string; reason: string; by: string };
  isMyTurn: boolean;
  isHost: boolean;
  onChallenge: () => void;
  onAccept: () => void;
  byName: string;
}) {
  return (
    <View style={styles.challengePanel}>
      <Text style={styles.challengeTitle}>
        Discuss — is <Text style={{ fontFamily: FONTS.extrabold, color: '#F5F0E8' }}>{byName}</Text>'s answer valid?
      </Text>

      <View style={styles.challengeCardRow}>
        <Text style={styles.challengeCardLabel}>{pending.card}</Text>
      </View>

      {pending.reason.length > 0 && (
        <Text style={styles.challengeReason}>"{pending.reason}"</Text>
      )}

      {!isMyTurn && (
        <TouchableOpacity style={styles.challengeBtn} onPress={onChallenge} activeOpacity={0.8}>
          <Text style={styles.challengeBtnText}>🤖  Call AI Referee</Text>
        </TouchableOpacity>
      )}

      {isHost && (
        <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
          <Text style={styles.acceptBtnText}>Accept & Continue →</Text>
        </TouchableOpacity>
      )}

      {isMyTurn && !isHost && (
        <Text style={styles.challengeWaiting}>Waiting for group decision...</Text>
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

// ── Chain broken splash ──────────────────────────────────────────────────────
function ChainBrokenSplash({ chain, newAnchor: newAnchorProp }: { chain: CLChainEntry[]; newAnchor?: string }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.1, useNativeDriver: true, speed: 10, bounciness: 12 }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        Animated.delay(1500),
      ]),
    ).start();
  }, [scaleAnim, shakeAnim]);

  // Use the newAnchor from game state (set by backend), fall back to last chain word
  const newAnchor = newAnchorProp ?? (chain.length > 0 ? chain[chain.length - 1].word : '???');

  return (
    <View style={styles.chainBrokenContainer}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateX: shakeAnim }] }}>
        <Text style={styles.chainBrokenEmoji}>💥</Text>
        <Text style={styles.chainBrokenTitle}>Chain Broken!</Text>
        <Text style={styles.chainBrokenSub}>No valid links — starting fresh</Text>
      </Animated.View>
      <View style={styles.chainBrokenNewAnchor}>
        <Text style={styles.chainBrokenAnchorLabel}>NEW ANCHOR</Text>
        <Animated.View style={[styles.chainBrokenAnchorCard, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.chainBrokenAnchorWord}>⚓ {newAnchor}</Text>
        </Animated.View>
      </View>
    </View>
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


  const [reason, setReason] = useState('');
  const [isDragging, setIsDragging] = useState(false);
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

  // Reset reason when turn changes
  useEffect(() => {
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

  // Max cards among all players (for color gradient)
  const maxCards = useMemo(() => {
    if (!gs?.turnOrder) return 1;
    let mx = 1;
    for (const pid of gs.turnOrder) {
      mx = Math.max(mx, (gs.hands[pid] ?? []).length);
    }
    return mx;
  }, [gs?.hands, gs?.turnOrder]);

  const handlePlay = useCallback((card: string) => {
    if (!card || !gs || !gs.turnOrder) return;
    const currentTurnId_ = gs.turnOrder[gs.turnIdx] ?? null;
    const isMyTurn_ = currentTurnId_ === myId;
    if (!isMyTurn_ || gs.pending || gs.referee) return;
    sendPlayerAction('cl-play', { card, reason: reason.trim() });
    setReason('');
  }, [gs?.turnOrder, gs?.turnIdx, gs?.pending, gs?.referee, myId, reason, sendPlayerAction]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (gs?.phase === 'intro' || (!gs) || !gs.turnOrder) {
    return (
      <GameIntro
        emoji="🔗"
        title="ChainLink"
        tagline="Link words together. Challenge bad links."
        rules={[
          { emoji: '🃏', text: 'Each player gets 7 word cards. An anchor word starts the chain.' },
          { emoji: '🔗', text: 'Play a card by linking it to the last word. 15 seconds per turn.' },
          { emoji: '⚡', text: 'Other players can CHALLENGE your link. An AI referee decides.' },
          { emoji: '🏆', text: 'First player to empty their hand wins!' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
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

  const canPlay = isMyTurn && !gs.pending && !gs.referee;
  const canSkip = isMyTurn && !gs.pending && !gs.referee;
  const canDrag = isMyTurn && !gs.pending && !gs.referee;

  const handleSkip = () => {
    if (!canSkip) return;
    sendPlayerAction('cl-skip', {});
  };

  const handleChallenge = () => {
    sendPlayerAction('cl-challenge', {});
  };

  // ── Chain broken screen ──────────────────────────────────────────────
  if (gs.phase === 'chainBroken') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ChainBrokenSplash chain={gs.chain} newAnchor={(gs as any).newAnchor} />

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Win screen ─────────────────────────────────────────────────────────
  if (gs.phase === 'win') {
    const winner = allPlayers.find(p => p.id === gs.winner);
    const winnerName = winner?.name ?? gs.winner ?? 'Someone';
    const isIWinner = gs.winner === myId;
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

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

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Main playing layout ────────────────────────────────────────────────
  const showHand = gs.phase === 'playing' && !gs.pending && !gs.referee;
  const showControls = isMyTurn && !gs.pending && !gs.referee;
  const myCardColor = cardCountColor(myHand.length, maxCards);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PhaseTransition phaseKey={gs.phase}>

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

            {lastWord && !isDragging && (
              <Text style={styles.chainLinkHint}>
                Link to: "{lastWord}"
              </Text>
            )}

            {isDragging && (
              <View style={styles.dropZoneTarget}>
                <Text style={styles.dropZoneTargetText}>Release here to play</Text>
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
                isMyTurn={isMyTurn}
                isHost={isHost}
                onChallenge={handleChallenge}
                onAccept={() => sendPlayerAction('cl-accept', {})}
                byName={allPlayers.find(p => p.id === gs.pending?.by)?.name ?? gs.pending.by}
              />
            </View>
          )}

          {/* ── Event log ──────────────────────────────────────────── */}
          {gs.log.length > 0 && (
            <EventLog entries={gs.log} />
          )}

          {/* ── 5. Your hand — fan spread with drag-to-play ─────── */}
          {showHand && (
            <View style={styles.handArea}>
              <View style={styles.handHeader}>
                <Text style={styles.handLabel}>YOUR HAND</Text>
                <Text style={styles.myCardCountText}>{myHand.length} card{myHand.length !== 1 ? 's' : ''} left</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handFan}>
                {myHand.map((word, i) => {
                  const total = myHand.length;
                  const mid = (total - 1) / 2;
                  const maxAngle = total <= 6 ? Math.min(20, total * 3) : 0;
                  const angle = total <= 1 ? 0 : ((i - mid) / (mid || 1)) * maxAngle;
                  const arcY = total <= 6 ? Math.abs(i - mid) * 5 : 0;
                  const overlap = total > 8 ? -6 : total > 6 ? -10 : total > 4 ? -10 : 0;
                  return (
                    <View
                      key={word}
                      style={{
                        transform: [{ rotate: `${angle}deg` }, { translateY: arcY }],
                        zIndex: i,
                        marginLeft: i === 0 ? 0 : overlap,
                      }}
                    >
                      <DraggableHandCard
                        word={word}
                        onPlay={() => handlePlay(word)}
                        canDrag={canDrag}
                        onDragStart={() => setIsDragging(true)}
                        onDragEnd={() => setIsDragging(false)}
                      />
                    </View>
                  );
                })}
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
              />
              <View style={styles.controlsBtnRow}>
                <View style={styles.dragPlayHint}>
                  <Text style={styles.dragPlayHintText}>Swipe a card up to play</Text>
                </View>
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

      </PhaseTransition>
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
    fontFamily: FONTS.semibold,
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
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.bold,
    color: COLORS.text,
    maxWidth: 80,
  },
  opponentCount: {
    fontSize: 14,
    fontFamily: FONTS.extrabold,
    marginLeft: 2,
  },
  lastCardBadge: {
    fontSize: 12,
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.semibold,
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
    fontFamily: FONTS.extrabold,
    color: '#2C2418',
    letterSpacing: 0.3,
  },
  chainLastCardText: {
    fontSize: 18,
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.semibold,
    letterSpacing: 0.5,
  },
  // (drop zone moved to drag overlay)

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
    fontFamily: FONTS.bold,
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
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.bold,
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
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    minWidth: 32,
    textAlign: 'right',
  },
  challengeBtn: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#C8642F',
  },
  challengeBtnText: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: '#C8642F',
  },
  challengeCardRow: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignSelf: 'center',
    marginBottom: 4,
  },
  challengeCardLabel: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    color: '#F5F0E8',
    textAlign: 'center',
  },
  acceptBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  acceptBtnText: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: '#FFF',
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
    fontFamily: FONTS.medium,
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
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  myCardCountText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
  },
  dragHint: {
    fontSize: 10,
    color: '#C8642F',
    textAlign: 'center',
    marginBottom: 2,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.3,
  },
  handFan: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    minHeight: 130,
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
    fontFamily: FONTS.extrabold,
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
    alignItems: 'center',
  },
  dragPlayHint: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
  },
  dragPlayHintText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
    letterSpacing: 0.5,
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
    fontFamily: FONTS.bold,
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
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.bold,
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
    fontFamily: FONTS.bold,
    color: COLORS.text2,
  },
  winChainText: {
    flex: 1,
    gap: 2,
  },
  winChainWord: {
    fontSize: 16,
    fontFamily: FONTS.extrabold,
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
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },

  // ── Chain broken splash ────────────────────────────────────────────
  chainBrokenContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 32,
  },
  chainBrokenEmoji: {
    fontSize: 64,
    textAlign: 'center',
  },
  chainBrokenTitle: {
    fontSize: 32,
    fontFamily: FONTS.extrabold,
    color: '#EF4444',
    textAlign: 'center',
    letterSpacing: 1,
  },
  chainBrokenSub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    marginTop: 4,
  },
  chainBrokenNewAnchor: {
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  chainBrokenAnchorLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  chainBrokenAnchorCard: {
    backgroundColor: '#1A2E1A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4A7A4A',
    paddingVertical: 16,
    paddingHorizontal: 28,
    shadowColor: '#4A7A4A',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  chainBrokenAnchorWord: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    color: '#C8E6C8',
    letterSpacing: 0.5,
  },

  // ── Drop zone (in chain area, visible when dragging) ────────────────
  dropZoneTarget: {
    alignSelf: 'center',
    backgroundColor: 'rgba(200,100,47,0.15)',
    borderWidth: 2,
    borderColor: '#C8642F',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginBottom: 8,
  },
  dropZoneTargetText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: '#C8642F',
    letterSpacing: 0.5,
  },
});
