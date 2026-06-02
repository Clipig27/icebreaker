import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { COLORS, SPACING, RADIUS, FONTS } from '../constants/theme';
import GameIntro from '../components/GameIntro';
import PromptCard from '../components/PromptCard';
import PhaseTransition from '../components/PhaseTransition';

const GOLD   = '#FBBF24';
const GOLD_D = '#D97706';

const DIFF_COLOR = { easy: '#22C55E', medium: '#F59E0B', hard: '#EF4444' } as const;
const DIFF_LABEL = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' } as const;

type Difficulty = 'easy' | 'medium' | 'hard';

type FeedEntry = {
  key:        string;
  playerName: string;
  kind:       'correct' | 'wrong' | 'skip';
  delta:      number;
  total:      number;
  potAt:      number;
};

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function PotLuckScreen() {
  const { room, currentUser, isHost, sendPlayerAction, endGame, restartGame } = useGame();
  const gs = room?.gameState;

  const [feed, setFeed]             = useState<FeedEntry[]>([]);
  const [plan, setPlan]             = useState<'risk' | 'skip' | null>(null);
  const [actionSent, setActionSent] = useState(false);

  const lastResultKeyRef = useRef('');
  const questionKeyRef   = useRef(0);

  const myId     = currentUser?.id ?? '';
  const myPlayer = room?.players?.find(p => p.id === myId);
  const isMyTurn = gs?.phase === 'live' && gs?.order?.[gs.seatPtr] === myId;

  useEffect(() => {
    if (!gs?.lastResult) return;
    const lr  = gs.lastResult;
    const key = `${lr.playerId}-${lr.kind}-${lr.potAt}-${lr.total}`;
    if (key === lastResultKeyRef.current) return;
    lastResultKeyRef.current = key;
    const actor = room?.players?.find(p => p.id === lr.playerId);
    setFeed(prev => [{
      key,
      playerName: actor?.name ?? 'Player',
      kind:  lr.kind,
      delta: lr.delta,
      total: lr.total,
      potAt: lr.potAt,
    }, ...prev].slice(0, 6));
  }, [gs?.lastResult]);

  useEffect(() => {
    if (gs?.phase === 'rolling') {
      const qKey = gs?.usedQuestionIds?.length ?? 0;
      if (qKey !== questionKeyRef.current) {
        questionKeyRef.current = qKey;
        setFeed([]);
        setPlan(null);
        lastResultKeyRef.current = '';
      }
    }
  }, [gs?.phase, gs?.usedQuestionIds?.length]);

  useEffect(() => {
    setActionSent(false);
  }, [gs?.seatPtr, gs?.phase]);

  const handleAnswer = (choiceIdx: number) => {
    if (!isMyTurn || actionSent) return;
    setActionSent(true);
    sendPlayerAction('pl-answer', { choiceIdx });
  };

  const handleSkip = () => {
    if (!isMyTurn || actionSent) return;
    setActionSent(true);
    sendPlayerAction('pl-skip', {});
  };

  const handleNextQuestion = () => {
    if (!isHost) return;
    sendPlayerAction('pl-next-question', {});
  };

  if (gs?.phase === 'intro' || (!gs) || !room) {
    return (
      <GameIntro
        emoji="🧠"
        title="Smarty Pot"
        tagline="Risk the growing pot or pass it on."
        rules={[
          { emoji: '📚', text: 'Each question has a difficulty: Easy, Medium, or Hard. Harder = bigger starting pot.' },
          { emoji: '⏱️', text: 'On your turn you have 15 seconds — answer or skip.' },
          { emoji: '✅', text: 'Answer correctly = win the pot. Wrong = lose points equal to the pot.' },
          { emoji: '⏭️', text: 'Skip = pot grows by 1 and passes on. First to the target score wins!' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  if (gs.phase === 'rolling') {
    return (
      <SafeAreaView style={s.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <RollingPhase gs={gs} room={room} myId={myId} />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  if (gs.phase === 'live') {
    return (
      <SafeAreaView style={s.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <LivePhase
            gs={gs}
            room={room}
            myId={myId}
            myPlayer={myPlayer}
            isMyTurn={isMyTurn}
            actionSent={actionSent}
            feed={feed}
            plan={plan}
            setPlan={setPlan}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
          />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  if (gs.phase === 'reveal') {
    return (
      <SafeAreaView style={s.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <RevealPhase gs={gs} room={room} isHost={isHost} onNext={handleNextQuestion} />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  if (gs.phase === 'gameover') {
    return (
      <SafeAreaView style={s.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <GameOverPhase
            gs={gs}
            room={room}
            myId={myId}
            isHost={isHost}
            onRestart={restartGame}
            onEnd={endGame}
          />
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <PhaseTransition phaseKey={gs.phase}>
        <View style={s.center}><Text style={s.muted}>Waiting…</Text></View>
      </PhaseTransition>
    </SafeAreaView>
  );
}

// ─── Rolling Phase ────────────────────────────────────────────────────────────

function RollingPhase({ gs, room, myId }: any) {
  const order = gs.order ?? [];
  const anims = useRef(
    order.map(() => ({
      opacity:  new Animated.Value(0),
      translateX: new Animated.Value(40),
      scale:    new Animated.Value(0.92),
    }))
  ).current;

  useEffect(() => {
    const animations = anims.map((a: any, i: number) =>
      Animated.parallel([
        Animated.timing(a.opacity, { toValue: 1, duration: 300, delay: 250 + i * 200, useNativeDriver: true }),
        Animated.spring(a.translateX, { toValue: 0, delay: 250 + i * 200, useNativeDriver: true, tension: 90, friction: 8 }),
        Animated.spring(a.scale, { toValue: 1, delay: 250 + i * 200, useNativeDriver: true, tension: 90, friction: 8 }),
      ])
    );
    Animated.stagger(0, animations).start();
  }, []);

  return (
    <View style={s.rolling}>
      <Text style={s.rollHeader}>SMARTY POT</Text>
      <Text style={s.rollSubHeader}>TURN ORDER</Text>
      <View style={s.rollList}>
        {order.map((playerId: string, seat: number) => {
          const player = room.players?.find((p: any) => p.id === playerId);
          const isMe   = playerId === myId;
          const a      = anims[seat];
          return (
            <Animated.View
              key={playerId}
              style={[
                s.rollItem,
                isMe && s.rollItemMe,
                { opacity: a.opacity, transform: [{ translateX: a.translateX }, { scale: a.scale }] },
              ]}
            >
              <View style={[s.rollAvatarWrap, isMe && { backgroundColor: GOLD + '33' }]}>
                <Text style={[s.rollAvatarLetter, isMe && { color: GOLD }]}>
                  {(player?.name ?? '?')[0].toUpperCase()}
                </Text>
              </View>
              <Text style={[s.rollSeat, isMe && { color: GOLD }]}>{seat + 1}</Text>
              <Text style={[s.rollName, isMe && { color: COLORS.text }]}>{player?.name ?? 'Player'}</Text>
              {isMe && <Text style={s.rollYouTag}>YOU</Text>}
            </Animated.View>
          );
        })}
      </View>
      <Text style={s.rollHint}>Starting in a moment…</Text>
    </View>
  );
}

// ─── Turn Banner ────────────────────────────────────────────────────────────��─

function TurnBanner({ currentActor, isMyTurn, timeLeft, timerAnim }: any) {
  // pulseAnim: native driver (transform/scale only)
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isMyTurn) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.015, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMyTurn]);

  const timerColor = timeLeft > 7 ? '#22C55E' : timeLeft > 3 ? '#F59E0B' : '#EF4444';

  // Outer view handles non-native style (borderColor static), inner handles native scale
  return (
    <View style={[banner.wrap, isMyTurn && banner.myTurnWrap]}>
      <Animated.View style={[banner.innerRow, { transform: [{ scale: pulseAnim }] }]}>
      <View style={[banner.avatar, { backgroundColor: isMyTurn ? GOLD + '28' : COLORS.surface2 }]}>
        <Text style={[banner.avatarLetter, { color: isMyTurn ? GOLD : COLORS.text2 }]}>
          {(currentActor?.name ?? '?')[0].toUpperCase()}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[banner.name, isMyTurn && { color: GOLD }]} numberOfLines={1}>
          {isMyTurn ? '✦ YOUR TURN' : `${currentActor?.name ?? '...'}'s turn`}
        </Text>
        <View style={banner.timerTrack}>
          <Animated.View style={[
            banner.timerFill,
            {
              width: timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as any,
              backgroundColor: timerColor,
            },
          ]} />
        </View>
      </View>

      <View style={banner.timerBubble}>
        <Text style={[banner.timerNum, { color: timerColor }]}>{timeLeft}</Text>
        <Text style={[banner.timerSec, { color: timerColor }]}>s</Text>
      </View>
      </Animated.View>
    </View>
  );
}

// ─── Choices Grid ─────────────────────────────────────────────────────────────

function ChoicesGrid({ choices, onAnswer, actionSent }: any) {
  const anims = useRef(
    [0, 1, 2, 3].map(() => ({ opacity: new Animated.Value(0), y: new Animated.Value(14) }))
  ).current;

  useEffect(() => {
    anims.forEach((a, i) => {
      a.opacity.setValue(0);
      a.y.setValue(14);
      Animated.parallel([
        Animated.timing(a.opacity, { toValue: 1, duration: 220, delay: 80 + i * 50, useNativeDriver: true }),
        Animated.spring(a.y, { toValue: 0, delay: 80 + i * 50, useNativeDriver: true, tension: 110, friction: 8 }),
      ]).start();
    });
  }, []);

  return (
    <View style={s.choicesGrid}>
      {(choices ?? []).map((choice: string, i: number) => (
        <Animated.View key={i} style={{ width: '47%', opacity: anims[i].opacity, transform: [{ translateY: anims[i].y }] }}>
          <TouchableOpacity
            style={[s.choice, actionSent && s.choiceDisabled]}
            onPress={() => onAnswer(i)}
            disabled={actionSent}
            activeOpacity={0.65}
          >
            <View style={s.choiceLetterWrap}>
              <Text style={s.choiceLetter}>{String.fromCharCode(65 + i)}</Text>
            </View>
            <Text style={s.choiceText} numberOfLines={2}>{choice}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Live Phase ──────────────────────────────────────────────────���────────────

function LivePhase({ gs, room, myId, myPlayer, isMyTurn, actionSent, feed, plan, setPlan, onAnswer, onSkip }: any) {
  const [timeLeft, setTimeLeft]     = useState(15);
  const timerAnim                   = useRef(new Animated.Value(1)).current;
  const cardOpacity                 = useRef(new Animated.Value(0)).current;
  const cardSlide                   = useRef(new Animated.Value(16)).current;

  const currentActorId = gs.order?.[gs.seatPtr];
  const currentActor   = room.players?.find((p: any) => p.id === currentActorId);
  const mySeat         = (gs.order ?? []).indexOf(myId);
  const curSeat        = gs.seatPtr ?? 0;
  const orderLen       = (gs.order ?? []).length;
  const turnsAway      = mySeat === -1 ? -1 : (mySeat - curSeat + orderLen) % orderLen;
  const effectiveCap   = gs.effectivePotCap ?? gs.potCap ?? 7;
  const atCap          = gs.pot >= effectiveCap;

  const difficulty: Difficulty = gs.currentQuestion?.difficulty ?? 'easy';
  const diffColor  = DIFF_COLOR[difficulty];
  const diffLabel  = DIFF_LABEL[difficulty];

  // Reset timer on new turn
  useEffect(() => {
    if (gs?.phase !== 'live') return;
    setTimeLeft(15);
    timerAnim.setValue(1);
    Animated.timing(timerAnim, {
      toValue: 0,
      duration: 15000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(interval);
      timerAnim.stopAnimation();
    };
  }, [gs?.seatPtr, gs?.phase]);

  // Auto-skip from frontend when timer hits 0 (eliminates visible gap before backend fires)
  useEffect(() => {
    if (timeLeft === 0 && isMyTurn && !actionSent) {
      onSkip();
    }
  }, [timeLeft]);

  // Animate question card in on new seat
  useEffect(() => {
    cardOpacity.setValue(0);
    cardSlide.setValue(16);
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, tension: 100, friction: 9 }),
    ]).start();
  }, [gs?.seatPtr]);

  return (
    <View style={{ flex: 1 }}>
      <TurnBanner
        currentActor={currentActor}
        isMyTurn={isMyTurn}
        timeLeft={timeLeft}
        timerAnim={timerAnim}
      />

      <ScrollView style={s.liveScroll} contentContainerStyle={s.liveContent} showsVerticalScrollIndicator={false}>
        {/* My score bar */}
        {myPlayer && (
          <View style={s.meBar}>
            <Text style={s.meLabel}>YOU</Text>
            <Text style={s.meScore}>
              {myPlayer.score}<Text style={s.meTarget}>/{gs.target}</Text>
            </Text>
            <View style={s.meProgBg}>
              <Animated.View style={[s.meProgFill, { width: `${Math.min(100, (myPlayer.score / gs.target) * 100)}%` as any }]} />
            </View>
          </View>
        )}

        {/* Pot meter */}
        <View style={[s.pot, atCap && s.potMax]}>
          <Text style={[s.potLabel, atCap && { color: COLORS.danger }]}>
            {atCap ? 'MAX POT 🔥' : 'POT'}
          </Text>
          <Text style={[s.potNum, atCap && { color: COLORS.danger }]}>{gs.pot}</Text>
          <View style={s.potTrack}>
            {Array.from({ length: effectiveCap }).map((_: any, i: number) => (
              <View
                key={i}
                style={[
                  s.potDot,
                  i < gs.pot && (atCap ? s.potDotMax : s.potDotOn),
                  i < (gs.currentQuestion?.startingPot ?? 1) && !atCap && i < gs.pot && { backgroundColor: diffColor },
                ]}
              />
            ))}
          </View>
          {atCap && <Text style={s.potMaxTag}>MAX</Text>}
        </View>

        {/* Question card */}
        <Animated.View style={[s.qCard, { opacity: cardOpacity, transform: [{ translateY: cardSlide }] }]}>
          {/* Difficulty badge */}
          <View style={[s.diffBadge, { backgroundColor: diffColor + '1A', borderColor: diffColor + '55' }]}>
            <View style={[s.diffDot, { backgroundColor: diffColor }]} />
            <Text style={[s.diffText, { color: diffColor }]}>{diffLabel}</Text>
            <Text style={[s.diffPots, { color: diffColor + 'AA' }]}>
              starts at {gs.currentQuestion?.startingPot ?? 1}pt
            </Text>
          </View>

          <PromptCard text={gs.currentQuestion?.text ?? ''} size="md" accentColor="#FBBF24" />

          {isMyTurn ? (
            <>
              <Text style={s.yourTurnTag}>
                {actionSent ? 'LOCKING IN…' : `answer for ${gs.pot} pt${gs.pot !== 1 ? 's' : ''} · or skip`}
              </Text>
              <ChoicesGrid choices={gs.currentQuestion?.choices} onAnswer={onAnswer} actionSent={actionSent} />
              {!actionSent && (
                <TouchableOpacity style={s.skipBtn} onPress={onSkip} activeOpacity={0.7}>
                  <Text style={s.skipBtnText}>SKIP — pass pot to next player</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <SpectateView
              currentActor={currentActor}
              turnsAway={turnsAway}
              gs={gs}
              plan={plan}
              setPlan={setPlan}
            />
          )}
        </Animated.View>

        {/* Live feed */}
        <View style={s.feed}>
          <Text style={s.feedHeader}>
            LIVE · skips: {gs.consecutiveSkips ?? 0}/{orderLen}
          </Text>
          {feed.length === 0 ? (
            <Text style={s.feedEmpty}>waiting for first move…</Text>
          ) : (
            feed.map((f: FeedEntry) => <FeedRow key={f.key} entry={f} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Spectate View ─────────────────────────────��──────────────────────────────

function SpectateView({ currentActor, turnsAway, gs, plan, setPlan }: any) {
  const dotAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const effectiveCap = gs.effectivePotCap ?? gs.potCap ?? 7;
  const projectedPot = Math.min(gs.pot + Math.max(0, turnsAway - 1), effectiveCap);

  return (
    <View style={s.spectate}>
      <View style={s.waitingRow}>
        <Animated.View style={[s.waitDot, { opacity: dotAnim }]} />
        <Text style={s.waitingText}>
          <Text style={{ color: GOLD }}>{currentActor?.name ?? '...'}</Text>
          {' is deciding'}
        </Text>
      </View>
      <Text style={s.upNext}>
        {turnsAway <= 0 ? "you're up"
          : turnsAway === 1 ? "you're NEXT — plan now"
          : `${turnsAway} turn${turnsAway > 1 ? 's' : ''} away`}
      </Text>
      <View style={s.planRow}>
        <Text style={s.planLabel}>
          if pot reaches you at {projectedPot}:
        </Text>
        <TouchableOpacity
          style={[s.planBtn, plan === 'risk' && s.planBtnOn]}
          onPress={() => setPlan(plan === 'risk' ? null : 'risk')}
          activeOpacity={0.8}
        >
          <Text style={[s.planBtnText, plan === 'risk' && s.planBtnTextOn]}>RISK IT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.planBtn, plan === 'skip' && s.planBtnOn]}
          onPress={() => setPlan(plan === 'skip' ? null : 'skip')}
          activeOpacity={0.8}
        >
          <Text style={[s.planBtnText, plan === 'skip' && s.planBtnTextOn]}>SKIP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Feed Row ─────────────────────────────────────────────────────────────────

function FeedRow({ entry }: { entry: FeedEntry }) {
  const slideAnim = useRef(new Animated.Value(-8)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 9 }),
      Animated.timing(opacAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const kindColor = entry.kind === 'correct' ? COLORS.success
    : entry.kind === 'wrong' ? COLORS.danger : COLORS.text2;
  const borderColor = entry.kind === 'correct' ? COLORS.success
    : entry.kind === 'wrong' ? COLORS.danger : GOLD_D;
  const deltaStr = entry.kind === 'skip'
    ? `pot→${Math.min(entry.potAt + 1, 10)}`
    : `${entry.delta > 0 ? '+' : ''}${entry.delta}`;

  return (
    <Animated.View style={[s.feedRow, { borderLeftColor: borderColor, opacity: opacAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={s.feedName} numberOfLines={1}>{entry.playerName}</Text>
      <Text style={[s.feedVerdict, { color: kindColor }]}>
        {entry.kind === 'correct' ? 'CORRECT' : entry.kind === 'wrong' ? 'WRONG' : 'SKIPPED'}
      </Text>
      <Text style={s.feedDelta}>{deltaStr}</Text>
      <Text style={s.feedTotal}>{entry.total} pts</Text>
    </Animated.View>
  );
}

// ─── Reveal Phase ─────────────────────────────────────────────────���───────────

function RevealPhase({ gs, room, isHost, onNext }: any) {
  const sorted = [...(room?.players ?? [])].sort((a: any, b: any) => b.score - a.score);
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 9 }),
      Animated.timing(opacAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.ScrollView
      style={s.revealScroll}
      contentContainerStyle={s.revealContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[s.revealCard, { opacity: opacAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={s.revealAnswerLabel}>ANSWER</Text>
        <Text style={s.revealAnswer}>{gs.revealInfo?.answer ?? '—'}</Text>
        <Text style={s.revealNote}>
          {gs.revealInfo?.scored
            ? `${gs.revealInfo.by} took the pot 🎉`
            : 'Everyone skipped — pot voided'}
        </Text>
      </Animated.View>

      <View style={s.standingsCard}>
        <Text style={s.standingsHeader}>STANDINGS</Text>
        {sorted.map((p: any, i: number) => (
          <View key={p.id} style={[s.standingRow, i === 0 && s.standingRowFirst]}>
            <Text style={[s.standingRank, i === 0 && { color: GOLD }]}>#{i + 1}</Text>
            <Text style={s.standingName} numberOfLines={1}>{p.name}</Text>
            <Text style={[s.standingScore, i === 0 && { color: GOLD }]}>{p.score}</Text>
          </View>
        ))}
        <Text style={s.targetNote}>First to {gs.target} wins</Text>
      </View>

      {isHost ? (
        <TouchableOpacity style={s.nextBtn} onPress={onNext} activeOpacity={0.8}>
          <Text style={s.nextBtnText}>NEXT QUESTION →</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.waitingForHost}>Waiting for host to continue…</Text>
      )}
    </Animated.ScrollView>
  );
}

// ─── Game Over Phase ──────────────────────────────────────────────────────────

function GameOverPhase({ gs, room, myId, isHost, onRestart, onEnd }: any) {
  const winner = room?.players?.find((p: any) => p.id === gs.winnerId);
  const sorted = [...(room?.players ?? [])].sort((a: any, b: any) => b.score - a.score);
  const iWon   = gs.winnerId === myId;

  const bounceAnim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.spring(bounceAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 7 }).start();
  }, []);

  return (
    <ScrollView style={s.overScroll} contentContainerStyle={s.overContent} showsVerticalScrollIndicator={false}>
      <Animated.Text style={[s.overEmoji, { transform: [{ scale: bounceAnim }] }]}>
        {iWon ? '🏆' : '🎉'}
      </Animated.Text>
      <Text style={s.overTitle}>
        {iWon ? 'YOU WIN!' : `${winner?.name ?? '???'} WINS!`}
      </Text>

      <View style={s.overBoard}>
        {sorted.map((p: any, i: number) => (
          <View key={p.id} style={[s.overRow, i === 0 && s.overRowFirst]}>
            <Text style={[s.overRank, i === 0 && { color: GOLD }]}>{i + 1}</Text>
            <Text style={s.overName} numberOfLines={1}>{p.name}</Text>
            <Text style={[s.overScore, i === 0 && { color: GOLD }]}>{p.score}</Text>
          </View>
        ))}
      </View>

      {isHost && (
        <View style={s.overActions}>
          <TouchableOpacity style={s.restartBtn} onPress={onRestart} activeOpacity={0.8}>
            <Text style={s.restartBtnText}>PLAY AGAIN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.endBtn} onPress={onEnd} activeOpacity={0.8}>
            <Text style={s.endBtnText}>End Game</Text>
          </TouchableOpacity>
        </View>
      )}
      {!isHost && (
        <Text style={s.waitingForHost}>Waiting for host…</Text>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────��───────────────────────────────────

const banner = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  myTurnWrap: {
    borderColor: GOLD,
    backgroundColor: '#1E1A0A',
  },
  innerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: FONTS.extrabold,
    fontSize: 17,
  },
  name: {
    fontFamily: FONTS.extrabold,
    fontSize: 15,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  timerTrack: {
    height: 4,
    backgroundColor: COLORS.surface2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 2,
  },
  timerBubble: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  timerNum: {
    fontFamily: FONTS.extrabold,
    fontSize: 22,
    lineHeight: 26,
  },
  timerSec: {
    fontFamily: FONTS.bold,
    fontSize: 11,
  },
});

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.bg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted:   { color: COLORS.text2, fontSize: 15 },

  // Rolling
  rolling:      { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  rollHeader:   { fontFamily: FONTS.extrabold, fontSize: 22, color: GOLD, letterSpacing: 2, textAlign: 'center', marginBottom: 2 },
  rollSubHeader:{ fontFamily: FONTS.bold, fontSize: 12, color: COLORS.text3, letterSpacing: 3, textAlign: 'center', marginBottom: SPACING.xl },
  rollList:     { gap: SPACING.sm },
  rollItem:     {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
  },
  rollItemMe:      { borderColor: GOLD, backgroundColor: '#1A1600' },
  rollAvatarWrap:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface2 },
  rollAvatarLetter:{ fontFamily: FONTS.extrabold, fontSize: 14, color: COLORS.text2 },
  rollSeat:        { fontFamily: FONTS.extrabold, fontSize: 16, color: COLORS.text3, width: 22, textAlign: 'center' },
  rollName:        { flex: 1, fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text2 },
  rollYouTag:      { fontSize: 9, fontFamily: FONTS.extrabold, color: GOLD, letterSpacing: 1.5, borderWidth: 1, borderColor: GOLD, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 },
  rollHint:        { textAlign: 'center', color: COLORS.text3, fontSize: 12, marginTop: SPACING.xl },

  // Live
  liveScroll:   { flex: 1 },
  liveContent:  { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 32, gap: SPACING.md },

  // Score bar
  meBar:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderHi, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  meLabel:    { fontFamily: FONTS.extrabold, fontSize: 11, color: GOLD, letterSpacing: 1.5 },
  meScore:    { fontFamily: FONTS.extrabold, fontSize: 20, color: COLORS.text },
  meTarget:   { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.text3 },
  meProgBg:   { flex: 1, height: 5, backgroundColor: COLORS.surface2, borderRadius: 3, overflow: 'hidden' },
  meProgFill: { height: '100%', backgroundColor: GOLD, borderRadius: 3 },

  // Pot
  pot:       { alignSelf: 'center', alignItems: 'center', gap: 5, paddingHorizontal: 28, paddingVertical: 12, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: GOLD_D, backgroundColor: 'rgba(251,191,36,0.07)' },
  potMax:    { borderColor: COLORS.danger, backgroundColor: 'rgba(244,63,94,0.10)' },
  potLabel:  { fontFamily: FONTS.extrabold, fontSize: 10, letterSpacing: 4, color: GOLD },
  potNum:    { fontFamily: FONTS.extrabold, fontSize: 52, color: GOLD, lineHeight: 56 },
  potTrack:  { flexDirection: 'row', gap: 5 },
  potDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.surface2 },
  potDotOn:  { backgroundColor: GOLD },
  potDotMax: { backgroundColor: COLORS.danger },
  potMaxTag: { position: 'absolute', top: -9, right: -9, backgroundColor: COLORS.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // Difficulty badge
  diffBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 9, paddingVertical: 5 },
  diffDot:   { width: 7, height: 7, borderRadius: 4 },
  diffText:  { fontFamily: FONTS.extrabold, fontSize: 11, letterSpacing: 1 },
  diffPots:  { fontFamily: FONTS.semibold, fontSize: 10 },

  // Question card
  qCard:      { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderHi, padding: SPACING.md, gap: SPACING.md },
  qText:      { fontFamily: FONTS.extrabold, fontSize: 24, color: COLORS.text, textAlign: 'center', lineHeight: 33 },

  // Acting
  yourTurnTag: { textAlign: 'center', fontFamily: FONTS.extrabold, fontSize: 11, color: GOLD, letterSpacing: 1.5 },
  choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'space-between' },
  choice:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: 13, backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderHi },
  choiceDisabled: { opacity: 0.35 },
  choiceLetterWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  choiceLetter: { fontFamily: FONTS.extrabold, fontSize: 12, color: GOLD },
  choiceText:   { flex: 1, fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.text },

  skipBtn:      { marginTop: 2, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderHi, borderStyle: 'dashed', alignItems: 'center' },
  skipBtnText:  { fontSize: 11, color: COLORS.text2, fontFamily: FONTS.bold, letterSpacing: 0.3 },

  // Spectating
  spectate:    { gap: SPACING.sm, alignItems: 'center', paddingTop: 4 },
  waitingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitDot:     { width: 9, height: 9, borderRadius: 5, backgroundColor: GOLD },
  waitingText: { fontSize: 15, color: COLORS.text2, fontFamily: FONTS.semibold },
  upNext:      { fontFamily: FONTS.extrabold, fontSize: 12, color: GOLD, letterSpacing: 1.5 },
  planRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm, width: '100%' },
  planLabel:   { flex: 1, fontSize: 10, color: COLORS.text2, fontFamily: FONTS.semibold },
  planBtn:     { paddingHorizontal: 11, paddingVertical: 7, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.borderHi, backgroundColor: 'transparent' },
  planBtnOn:   { backgroundColor: GOLD, borderColor: GOLD },
  planBtnText: { fontFamily: FONTS.extrabold, fontSize: 10, color: COLORS.text2 },
  planBtnTextOn: { color: '#1A1300' },

  // Feed
  feed:       { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderHi, padding: SPACING.md, gap: SPACING.sm },
  feedHeader: { fontSize: 10, fontFamily: FONTS.extrabold, letterSpacing: 2, color: COLORS.text3 },
  feedEmpty:  { fontSize: 11, color: COLORS.text2, textAlign: 'center', paddingVertical: SPACING.sm },
  feedRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface2, borderRadius: RADIUS.sm, padding: SPACING.sm, borderLeftWidth: 3, borderLeftColor: GOLD_D },
  feedName:   { flex: 1, fontFamily: FONTS.bold, fontSize: 12, color: COLORS.text },
  feedVerdict:{ fontFamily: FONTS.extrabold, fontSize: 10 },
  feedDelta:  { fontSize: 10, color: COLORS.text2, minWidth: 44, textAlign: 'right', fontFamily: FONTS.semibold },
  feedTotal:  { fontFamily: FONTS.extrabold, fontSize: 11, color: GOLD, minWidth: 40, textAlign: 'right' },

  // Reveal
  revealScroll:   { flex: 1 },
  revealContent:  { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: 40, gap: SPACING.lg, alignItems: 'center' },
  revealCard:     { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderHi, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm },
  revealAnswerLabel: { fontSize: 10, fontFamily: FONTS.extrabold, letterSpacing: 3, color: COLORS.text2 },
  revealAnswer:   { fontSize: 26, fontFamily: FONTS.extrabold, color: GOLD, textAlign: 'center' },
  revealNote:     { fontSize: 13, color: COLORS.text2, textAlign: 'center' },
  standingsCard:  { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderHi, padding: SPACING.md, gap: SPACING.sm },
  standingsHeader:{ fontSize: 10, fontFamily: FONTS.extrabold, letterSpacing: 3, color: COLORS.text2, marginBottom: 4 },
  standingRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 8, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.surface2, borderRadius: RADIUS.sm },
  standingRowFirst: { borderWidth: 1, borderColor: GOLD },
  standingRank:   { fontFamily: FONTS.extrabold, fontSize: 13, color: COLORS.text2, width: 28 },
  standingName:   { flex: 1, fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text },
  standingScore:  { fontFamily: FONTS.extrabold, fontSize: 16, color: COLORS.text },
  targetNote:     { fontSize: 11, color: COLORS.text2, textAlign: 'center', marginTop: 4 },
  nextBtn:        { backgroundColor: GOLD, borderRadius: RADIUS.md, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center' },
  nextBtnText:    { fontFamily: FONTS.extrabold, fontSize: 15, color: '#1A1300', letterSpacing: 1 },
  waitingForHost: { fontSize: 13, color: COLORS.text2, textAlign: 'center' },

  // Game over
  overScroll:   { flex: 1 },
  overContent:  { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: 40, gap: SPACING.lg, alignItems: 'center' },
  overEmoji:    { fontSize: 60, textAlign: 'center' },
  overTitle:    { fontFamily: FONTS.extrabold, fontSize: 30, color: GOLD, textAlign: 'center' },
  overBoard:    { width: '100%', gap: SPACING.sm },
  overRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderHi, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  overRowFirst: { borderColor: GOLD },
  overRank:     { fontFamily: FONTS.extrabold, fontSize: 16, color: COLORS.text2, width: 24 },
  overName:     { flex: 1, fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text },
  overScore:    { fontFamily: FONTS.extrabold, fontSize: 20, color: COLORS.text },
  overActions:  { width: '100%', gap: SPACING.sm },
  restartBtn:   { backgroundColor: GOLD, borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center' },
  restartBtnText: { fontFamily: FONTS.extrabold, fontSize: 15, color: '#1A1300', letterSpacing: 1 },
  endBtn:       { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderHi, paddingVertical: 14, alignItems: 'center' },
  endBtnText:   { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text2 },
});
