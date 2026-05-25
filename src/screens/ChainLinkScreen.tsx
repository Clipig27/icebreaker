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
  Animated,
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
  winner: string | null;
  log: Array<{ text: string; playerId?: string; type: string }>;
  drawPile: string[];
  referee: null | CLReferee;
};

const PLAYER_COLORS = ['#C8642F', '#7C5CF6', '#06B6D4', '#22C55E'];
const CHALLENGE_WINDOW_MS = 5000;

function useEllipsis(): string {
  const [dots, setDots] = useState('.');
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => (d.length >= 3 ? '.' : d + '.'));
    }, 500);
    return () => clearInterval(id);
  }, []);
  return dots;
}

// ── Card component ──────────────────────────────────────────────────────────
function HandCard({
  word,
  selected,
  onPress,
}: {
  word: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.handCard, selected && styles.handCardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.handCardWord}>{word}</Text>
    </TouchableOpacity>
  );
}

// ── Opponent strip card ─────────────────────────────────────────────────────
function OpponentCard({
  name,
  cardCount,
  isActive,
  colorIdx,
}: {
  name: string;
  cardCount: number;
  isActive: boolean;
  colorIdx: number;
}) {
  const color = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  return (
    <View style={[styles.opponentCard, isActive && { borderColor: color, shadowColor: color, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6 }]}>
      <View style={[styles.opponentDot, { backgroundColor: color }]} />
      <Text style={styles.opponentName} numberOfLines={1}>{name}</Text>
      <Text style={styles.opponentCount}>{cardCount}</Text>
    </View>
  );
}

// ── Referee panel ───────────────────────────────────────────────────────────
function RefereePanel({ referee, onDismiss }: { referee: CLReferee; onDismiss: () => void }) {
  const dots = useEllipsis();
  if (referee.state === 'thinking') {
    return (
      <View style={styles.refereeCard}>
        <Text style={styles.refereeTitle}>⚖ Ruling on "{referee.card}"{dots}</Text>
        <Text style={styles.refereeSub}>AI referee is deliberating</Text>
      </View>
    );
  }
  const isValid = referee.verdict === 'VALID';
  return (
    <View style={[styles.refereeCard, isValid ? styles.refereeValid : styles.refereeInvalid]}>
      <Text style={[styles.refereeVerdict, { color: isValid ? '#22C55E' : '#EF4444' }]}>
        {isValid ? 'VALID' : 'INVALID'}
      </Text>
      <Text style={styles.refereeWhy}>"{referee.why}"</Text>
      <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.75}>
        <Text style={styles.dismissBtnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Challenge window panel ──────────────────────────────────────────────────
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

  const progress = challengeStartedAt !== null ? msLeft / CHALLENGE_WINDOW_MS : 1;
  const secsLeft = (msLeft / 1000).toFixed(1);

  return (
    <View style={styles.challengePanel}>
      <Text style={styles.challengeTitle}>
        <Text style={{ fontWeight: '900' }}>{byName}</Text> played{' '}
        <Text style={{ fontWeight: '900', color: '#F5F0E8' }}>{pending.card}</Text>
      </Text>
      <Text style={styles.challengeReason}>"{pending.reason}"</Text>

      {challengeStartedAt !== null && (
        <View style={styles.countdownRow}>
          <View style={styles.countdownTrack}>
            <View style={[styles.countdownFill, { width: `${progress * 100}%` as any, backgroundColor: progress > 0.4 ? '#22C55E' : '#EF4444' }]} />
          </View>
          <Text style={styles.countdownSecs}>{secsLeft}s</Text>
        </View>
      )}

      {!isMyTurn ? (
        <TouchableOpacity style={styles.challengeBtn} onPress={onChallenge} activeOpacity={0.8}>
          <Text style={styles.challengeBtnText}>CHALLENGE</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.challengeWaiting}>Your link is on the table…</Text>
      )}
    </View>
  );
}

// ── Event log ───────────────────────────────────────────────────────────────
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

// ── Main screen ─────────────────────────────────────────────────────────────
export default function ChainLinkScreen({ navigation }: Props) {
  const { room, players, sendPlayerAction, currentUser } = useGame();
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
  const chainScrollRef = useRef<ScrollView>(null);

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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!gs || !gs.turnOrder) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Setting up ChainLink…</Text>
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

  const canPlay = isMyTurn && selectedCard !== null && reason.trim().length > 0 && !gs.pending && !gs.referee;
  const canSkip = isMyTurn && !gs.pending && !gs.referee;

  const handlePlay = () => {
    if (!canPlay || !selectedCard) return;
    sendPlayerAction('cl-play', { card: selectedCard, reason: reason.trim() });
    setSelectedCard(null);
    setReason('');
  };

  const handleSkip = () => {
    if (!canSkip) return;
    sendPlayerAction('cl-skip', {});
  };

  const handleChallenge = () => {
    sendPlayerAction('cl-challenge', {});
  };

  // ── Win screen ───────────────────────────────────────────────────────────
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
                  <View style={styles.winChainBullet}>
                    <Text style={styles.winChainNum}>{i + 1}</Text>
                  </View>
                  <View style={styles.winChainText}>
                    <Text style={styles.winChainWord}>
                      {isAnchor ? '⚓ ' : ''}{entry.word}
                    </Text>
                    {!isAnchor && (
                      <Text style={styles.winChainReason}>
                        "{entry.reason}" — {player?.name ?? entry.by}
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

  // ── Main playing layout ──────────────────────────────────────────────────
  const showHand = gs.phase === 'playing' && !gs.pending && !gs.referee;
  const showControls = isMyTurn && !gs.pending && !gs.referee;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>

          {/* ── 1. Opponents strip ──────────────────────────────────────── */}
          <View style={styles.opponentsStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.opponentsScroll}>
              {opponents.map((p, i) => {
                const originalIdx = allPlayers.findIndex(ap => ap.id === p.id);
                const cardCount = (gs.hands[p.id] ?? []).length;
                const isActive = p.id === currentTurnId;
                return (
                  <OpponentCard
                    key={p.id}
                    name={p.name}
                    cardCount={cardCount}
                    isActive={isActive}
                    colorIdx={originalIdx}
                  />
                );
              })}
              {opponents.length === 0 && (
                <Text style={styles.noOpponents}>No other players</Text>
              )}
            </ScrollView>
          </View>

          {/* ── 2. Chain area ───────────────────────────────────────────── */}
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
                    <View style={[styles.chainWordCard, isAnchor && styles.chainAnchorCard, isLast && styles.chainLastCard]}>
                      <Text style={[styles.chainWordText, isLast && styles.chainLastWordText]}>
                        {isAnchor ? '⚓ ' : ''}{entry.word}
                      </Text>
                    </View>
                    {i < gs.chain.length - 1 && (
                      <Text style={styles.chainArrow}>→</Text>
                    )}
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
          </View>

          {/* ── 3. Referee panel ────────────────────────────────────────── */}
          {gs.referee && (
            <View style={styles.sectionPad}>
              <RefereePanel
                referee={gs.referee}
                onDismiss={() => sendPlayerAction('cl-dismiss-referee', {})}
              />
            </View>
          )}

          {/* ── 4. Challenge window ─────────────────────────────────────── */}
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

          {/* ── Event log ───────────────────────────────────────────────── */}
          {gs.log.length > 0 && (
            <EventLog entries={gs.log} />
          )}

          {/* ── 5. Your hand ────────────────────────────────────────────── */}
          {showHand && (
            <View style={styles.handArea}>
              <Text style={styles.handLabel}>
                Your hand ({myHand.length})
                {isMyTurn && <Text style={styles.yourTurnTag}> — your turn</Text>}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.handScroll}
              >
                {myHand.map(word => (
                  <HandCard
                    key={word}
                    word={word}
                    selected={selectedCard === word}
                    onPress={() => setSelectedCard(selectedCard === word ? null : word)}
                  />
                ))}
                {myHand.length === 0 && (
                  <Text style={styles.emptyHand}>No cards — waiting for result…</Text>
                )}
              </ScrollView>
            </View>
          )}

          {/* ── 6. Your turn controls ────────────────────────────────────── */}
          {showControls && (
            <View style={styles.controlsArea}>
              <TextInput
                style={styles.reasonInput}
                placeholder={selectedCard ? `Why does "${selectedCard}" link to "${lastWord}"?` : 'Select a card first…'}
                placeholderTextColor={COLORS.text2}
                value={reason}
                onChangeText={setReason}
                maxLength={120}
                keyboardAppearance="dark"
                returnKeyType="done"
                onSubmitEditing={handlePlay}
                editable={selectedCard !== null}
              />
              <View style={styles.controlsBtnRow}>
                <TouchableOpacity
                  style={[styles.playBtn, !canPlay && styles.playBtnDisabled]}
                  onPress={handlePlay}
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

          {/* Waiting message when not your turn and no pending */}
          {!isMyTurn && !gs.pending && !gs.referee && (
            <View style={styles.waitingBar}>
              <Text style={styles.waitingText}>
                Waiting for {allPlayers.find(p => p.id === currentTurnId)?.name ?? 'player'}…
              </Text>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
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
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.text2,
    marginLeft: 2,
  },
  noOpponents: {
    fontSize: 13,
    color: COLORS.text2,
    fontStyle: 'italic',
  },

  // ── Chain area ───────────────────────────────────────────────────────────
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
    gap: 6,
  },
  chainWordCard: {
    backgroundColor: '#1A2E1A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A4A2A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainAnchorCard: {
    borderColor: '#4A7A4A',
    backgroundColor: '#162816',
  },
  chainLastCard: {
    borderColor: '#D99A2B',
    borderWidth: 2,
    backgroundColor: '#1E2A14',
  },
  chainWordText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#C8E6C8',
    letterSpacing: 0.3,
  },
  chainLastWordText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F0F0C8',
  },
  chainArrow: {
    fontSize: 14,
    color: '#3A5A3A',
    fontWeight: '700',
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

  // ── Section padding wrapper ───────────────────────────────────────────────
  sectionPad: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  // ── Referee panel ────────────────────────────────────────────────────────
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

  // ── Challenge window ─────────────────────────────────────────────────────
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

  // ── Event log ────────────────────────────────────────────────────────────
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

  // ── Hand area ────────────────────────────────────────────────────────────
  handArea: {
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderHi,
    backgroundColor: COLORS.bg,
  },
  handLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  yourTurnTag: {
    color: '#D99A2B',
    fontWeight: '800',
  },
  handScroll: {
    paddingHorizontal: 14,
    gap: 10,
    alignItems: 'center',
    paddingBottom: 8,
  },
  handCard: {
    width: 80,
    height: 110,
    backgroundColor: '#F5F0E8',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#2C2418',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyHand: {
    fontSize: 13,
    color: COLORS.text2,
    fontStyle: 'italic',
    paddingVertical: 20,
  },

  // ── Controls area ────────────────────────────────────────────────────────
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
    fontSize: 14,
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

  // ── Waiting bar ──────────────────────────────────────────────────────────
  waitingBar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderHi,
    backgroundColor: COLORS.bg,
  },
  waitingText: {
    fontSize: 13,
    color: COLORS.text2,
    fontStyle: 'italic',
  },

  // ── Win screen ───────────────────────────────────────────────────────────
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
    gap: 8,
  },
  winChainEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
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
