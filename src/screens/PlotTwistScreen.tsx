import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  ActivityIndicator,
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
  navigation: NativeStackNavigationProp<RootStackParamList, 'PlotTwist'>;
};

type StoryLine = {
  by: string;
  byName: string;
  text: string;
  hits: Array<{ ownerId: string; ownerName: string; word: string }>;
};

type HitResult = {
  by: string;
  byName: string;
  text: string;
  hits: Array<{ ownerId: string; ownerName: string; word: string }>;
  replacements: Array<{ playerId: string; oldWord: string; newWord: string | null }>;
};

type PTGameState = {
  game: 'plotTwist';
  phase: 'intro' | 'setup' | 'dealing' | 'play' | 'gameover';
  prompt: string;
  promptIdx: number;
  story: StoryLine[];
  turn: number;
  turnOrder: string[];
  scores: Record<string, number>;
  winner: string | null;
  pending: { by: string; text: string } | null;
  lastResult: HitResult | null;
  judging: boolean;
  turnLeft: number;
  revealTargets?: Record<string, string[]>;
};

// Per-player hues for color coding
const PLAYER_HUES = [270, 330, 180, 140, 30, 200, 60, 310];

function playerHue(index: number): number {
  return PLAYER_HUES[index % PLAYER_HUES.length];
}

function playerColor(index: number): string {
  return `hsl(${playerHue(index)}, 55%, 55%)`;
}

function playerBg(index: number): string {
  return `hsla(${playerHue(index)}, 55%, 55%, 0.12)`;
}

// ── Highlight hit words in a story line ─────────────────────────────────────
function HighlightedText({ text, hits }: { text: string; hits: StoryLine['hits'] }) {
  if (!hits || hits.length === 0) {
    return <Text style={s.msText}>{text}</Text>;
  }

  const words = hits.map(h => h.word);
  // Build regex to match hit words (stem-based)
  const patterns = words.map(w => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped + '\\w*';
  });
  const re = new RegExp(`(${patterns.join('|')})`, 'ig');
  const parts = text.split(re);

  return (
    <Text style={s.msText}>
      {parts.map((part, i) => {
        const isHit = words.some(w => {
          const stem = w.slice(0, Math.max(3, w.length - 2));
          return part.toLowerCase().startsWith(stem.toLowerCase());
        });
        return isHit ? (
          <Text key={i} style={s.hlWord}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        );
      })}
    </Text>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function PlotTwistScreen({ navigation }: Props) {
  const { room, players, sendPlayerAction, currentUser, isHost } = useGame();
  const gs = (room?.gameState?.game === 'plotTwist' ? room.gameState : null) as PTGameState | null;

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

  const [myWords, setMyWords] = useState<Array<{ word: string; hard: boolean }>>([]);
  const [draft, setDraft] = useState('');
  const [selfBlock, setSelfBlock] = useState<string | null>(null);
  const [vetoStatus, setVetoStatus] = useState<string | null>(null);
  const storyScrollRef = useRef<ScrollView>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Listen for private word updates
  useEffect(() => {
    const handler = ({ words }: { words: Array<{ word: string; hard: boolean }> }) => {
      setMyWords(words);
    };
    socket.on('pt-myWords', handler);
    // Request words in case we missed the initial emit (race condition with navigation)
    if (gs?.phase === 'play' && myWords.length === 0) {
      sendPlayerAction('pt-requestWords', {});
    }
    return () => { socket.off('pt-myWords', handler); };
  }, [gs?.phase]);

  // Listen for self-block events
  useEffect(() => {
    const handler = ({ word }: { word: string }) => {
      setSelfBlock(word);
      // Shake animation
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setSelfBlock(null), 2500);
    };
    socket.on('pt-selfBlock', handler);
    return () => { socket.off('pt-selfBlock', handler); };
  }, [shakeAnim]);

  // Auto-scroll story
  useEffect(() => {
    if (gs?.story?.length) {
      setTimeout(() => storyScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [gs?.story?.length]);

  // Clear draft on turn change
  useEffect(() => {
    setDraft('');
    setSelfBlock(null);
    setVetoStatus(null);
  }, [gs?.turn]);

  // headerLeft (Leave button) is set globally in App.tsx screenOptions

  // ── Derived state ──
  const turnOrder = gs?.turnOrder ?? [];
  const turnIdx = gs?.turn ?? 0;
  const currentTurnPlayerId = turnOrder[turnIdx];
  const isMyTurn = currentTurnPlayerId === myId;
  const wc = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const validLen = wc >= 5 && wc <= 12;
  const myTurnIndex = turnOrder.indexOf(myId);

  const getPlayerName = useCallback((id: string) => {
    const p = players.find(p => p.id === id);
    return p?.name ?? 'Unknown';
  }, [players]);

  const getPlayerIndex = useCallback((id: string) => {
    return turnOrder.indexOf(id);
  }, [turnOrder]);

  // ── Actions ──
  const handleSubmit = () => {
    if (!isMyTurn || !validLen || gs?.pending || gs?.judging) return;
    sendPlayerAction('pt-submit', { text: draft.trim() });
  };

  const handleSkip = () => {
    if (!isMyTurn || gs?.pending || gs?.judging) return;
    sendPlayerAction('pt-skip', {});
  };

  const handleVeto = (veto: boolean) => {
    sendPlayerAction('pt-veto', { veto });
    setVetoStatus(veto ? 'Voted to veto' : 'Voted to allow');
  };

  // ── Setup / Intro ──
  if (!gs || gs.phase === 'setup' || gs.phase === 'intro') {
    return (
      <GameIntro
        emoji="📜"
        title="Plot Twist"
        tagline="Co-write a story. Bait them into saying your secret words."
        rules={[
          { emoji: '✍️', text: 'Take turns adding one sentence (5–12 words) to a shared story.' },
          { emoji: '🎯', text: 'You hold 4 regular words (1 pt) and 1 hard word (3 pts).' },
          { emoji: '💥', text: 'Someone types your word → you score, they lose. Used words get replaced.' },
          { emoji: '🚫', text: "You can't use your own words — the game blocks you." },
          { emoji: '⏱️', text: '20 seconds per turn. Run out of time and you lose a point.' },
          { emoji: '🏆', text: 'First to 7 points wins!' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
        buttonLabel="DEAL & BEGIN"
      />
    );
  }

  // ── Dealing ──
  if (gs.phase === 'dealing' || !gs.turnOrder || gs.turnOrder.length === 0) {
    return (
      <SafeAreaView style={s.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <View style={s.center}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={s.dealMsg}>Generating secret words…</Text>
          </View>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Game Over ──
  if (gs.phase === 'gameover') {
    const winnerName = gs.winner ? getPlayerName(gs.winner) : 'Unknown';
    const isMe = gs.winner === myId;
    const ranked = Object.entries(gs.scores ?? {})
      .map(([id, score]) => ({ id, name: getPlayerName(id), score: score as number, idx: getPlayerIndex(id) }))
      .sort((a, b) => b.score - a.score);

    return (
      <SafeAreaView style={s.safe}>
        <PhaseTransition phaseKey={gs.phase}>
        <ScrollView contentContainerStyle={s.overScroll} showsVerticalScrollIndicator={false}>
          {/* Winner stamp */}
          <View style={s.stamp}>
            <Text style={s.stampText}>{isMe ? 'YOU WIN' : `${winnerName} WINS`}</Text>
          </View>

          {/* Reveal words */}
          <Text style={s.sectionLabel}>EVERYONE'S SECRET WORDS</Text>
          {ranked.map(({ id, name, score, idx }) => (
            <View key={id} style={[s.revealRow, { borderLeftColor: playerColor(idx) }]}>
              <Text style={[s.revealName, { color: playerColor(idx) }]}>{name}</Text>
              <Text style={s.revealWords}>
                {(gs.revealTargets?.[id] ?? []).map((e: any) => typeof e === 'string' ? e : e.word).join(', ')}
              </Text>
              <Text style={s.revealScore}>{score} pts</Text>
            </View>
          ))}

          {/* Story recap */}
          <Text style={[s.sectionLabel, { marginTop: 20 }]}>THE STORY</Text>
          <View style={s.recapCard}>
            <Text style={s.recapPrompt}>{gs.prompt} </Text>
            {(gs.story ?? []).map((line, i) => (
              <Text key={i} style={s.recapLine}>{line.text}. </Text>
            ))}
          </View>
        </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Play phase ──
  return (
    <SafeAreaView style={s.safe}>
      <PhaseTransition phaseKey={gs.phase}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={100}
      >
        <View style={{ flex: 1 }}>
          {/* Scoreboard */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scoreBar}>
            {turnOrder.map((id, i) => {
              const isActive = i === turnIdx;
              return (
                <View
                  key={id}
                  style={[
                    s.scorePill,
                    isActive && { borderColor: playerColor(i), borderWidth: 2, backgroundColor: playerBg(i) },
                  ]}
                >
                  <Text style={[s.scoreName, { color: playerColor(i) }]} numberOfLines={1}>
                    {id === myId ? 'You' : getPlayerName(id)}
                  </Text>
                  <Text style={s.scoreNum}>{gs.scores[id] ?? 0}</Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Secret words card */}
          <View style={s.secretCard}>
            <Text style={s.secretLabel}>YOUR SECRET WORDS</Text>
            <View style={s.secretRow}>
              {myWords.map((entry, i) => {
                const w = typeof entry === 'string' ? entry : entry.word;
                const hard = typeof entry === 'object' && entry.hard;
                return (
                  <View key={`${w}-${i}`} style={[s.secretChip, hard && s.secretChipHard]}>
                    <Text style={[s.secretChipText, hard && s.secretChipTextHard]}>{w}</Text>
                    {hard && <Text style={s.secretChipBadge}>3x</Text>}
                  </View>
                );
              })}
            </View>
            <Text style={s.secretHint}>gold = 1pt · purple = 3pts · used words get replaced · never say your own</Text>
          </View>

          {/* Story / manuscript */}
          <ScrollView ref={storyScrollRef} style={s.manuscript} contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={s.msPrompt}>{gs.prompt}</Text>
            {(gs.story ?? []).map((line, i) => {
              const pIdx = getPlayerIndex(line.by);
              return (
                <View key={i} style={s.msLine}>
                  <Text style={[s.msByline, { color: playerColor(pIdx) }]}>
                    {line.by === myId ? 'You' : line.byName}
                  </Text>
                  <HighlightedText text={line.text + '.'} hits={line.hits} />
                  {(line.hits?.length ?? 0) > 0 && (
                    <Text style={s.msHitTag}>
                      🎯 {line.hits.map(h => `${h.ownerName} +${(h as any).pts ?? 1}`).join(' · ')}
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Hit notification */}
          {gs.lastResult && gs.lastResult.hits.length > 0 && (
            <View style={s.hitBanner}>
              <Text style={s.hitHead}>
                ⚡ {gs.lastResult.by === myId ? 'You' : gs.lastResult.byName} hit a secret word!
              </Text>
              {gs.lastResult.hits.map((h, i) => {
                const ownerIdx = getPlayerIndex(h.ownerId);
                return (
                  <View key={i} style={[s.hitRow, { borderLeftColor: playerColor(ownerIdx) }]}>
                    <Text style={s.hitWord}>"{h.word}"</Text>
                    <Text style={[s.hitOwner, { color: playerColor(ownerIdx) }]}>
                      was {h.ownerId === myId ? 'your' : `${h.ownerName}'s`} word
                    </Text>
                    {gs.lastResult!.replacements?.[i] && (
                      <View style={s.hitSwap}>
                        <Text style={s.hitOld}>{h.word}</Text>
                        <Text style={s.hitArrow}>→</Text>
                        <Text style={s.hitNew}>new word dealt</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Veto panel */}
          {gs.pending && gs.pending.by !== myId && !vetoStatus && (
            <View style={s.vetoPanel}>
              <Text style={s.vetoWriter}>
                {getPlayerName(gs.pending.by)} wrote:
              </Text>
              <Text style={s.vetoText}>"{gs.pending.text}."</Text>
              <Text style={s.vetoAsk}>Make sense, continue the story & not a repeat?</Text>
              <View style={s.vetoButtons}>
                <TouchableOpacity style={s.vetoAllow} onPress={() => handleVeto(false)}>
                  <Text style={s.vetoAllowText}>✓ ALLOW</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.vetoDeny} onPress={() => handleVeto(true)}>
                  <Text style={s.vetoDenyText}>✗ VETO</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Veto status (after voting) */}
          {gs.pending && gs.pending.by !== myId && vetoStatus && (
            <View style={s.statusBar}>
              <Text style={s.statusText}>{vetoStatus} — waiting for others…</Text>
            </View>
          )}

          {/* Waiting for veto (writer view) */}
          {gs.pending && gs.pending.by === myId && (
            <View style={s.statusBar}>
              <Text style={s.statusText}>Waiting for the table to vote…</Text>
            </View>
          )}

          {/* Judging status */}
          {gs.judging && (
            <View style={s.statusBar}>
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={s.statusText}>Checking the sentence…</Text>
            </View>
          )}

          {/* Composer (my turn) */}
          {isMyTurn && !gs.judging && !gs.lastResult && !gs.pending && gs.phase === 'play' && (
            <View style={s.composer}>
              {/* Turn timer bar */}
              <View style={s.timerWrap}>
                <View
                  style={[
                    s.timerBar,
                    {
                      width: `${((gs.turnLeft ?? 20) / 20) * 100}%`,
                      backgroundColor: (gs.turnLeft ?? 20) <= 5 ? COLORS.danger : COLORS.accent,
                    },
                  ]}
                />
                <Text style={s.timerNum}>{gs.turnLeft ?? 20}s</Text>
              </View>

              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                <TextInput
                  style={[s.input, selfBlock && s.inputError]}
                  placeholder="Continue the story… (5–12 words)"
                  placeholderTextColor={COLORS.text3}
                  maxLength={80}
                  value={draft}
                  onChangeText={t => { setDraft(t); if (selfBlock) setSelfBlock(null); }}
                  multiline
                />
              </Animated.View>

              {selfBlock && (
                <View style={s.selfWarn}>
                  <Text style={s.selfWarnText}>
                    🚫 "<Text style={s.selfWarnWord}>{selfBlock}</Text>" is one of your own secret words — you can't use it!
                  </Text>
                </View>
              )}

              <View style={s.composeFoot}>
                <Text style={[s.wordCount, validLen ? s.wcOk : s.wcBad]}>
                  {wc} words {validLen ? '✓' : '(need 5–12)'}
                </Text>
                <View style={s.composeButtons}>
                  <TouchableOpacity
                    style={[s.addBtn, !validLen && s.addBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!validLen}
                  >
                    <Text style={s.addBtnText}>ADD LINE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
                    <Text style={s.skipBtnText}>SKIP</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Not my turn — waiting */}
          {!isMyTurn && !gs.pending && !gs.judging && !gs.lastResult && gs.phase === 'play' && (
            <View style={s.statusBar}>
              <Text style={s.statusText}>
                {getPlayerName(currentTurnPlayerId)} is writing…
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
      </PhaseTransition>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  dealMsg: { color: COLORS.text2, fontSize: 14, fontFamily: FONTS.medium },

  // Scoreboard
  scoreBar: { flexGrow: 0, paddingHorizontal: 12, paddingVertical: 8 },
  scorePill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: 6,
    minWidth: 60,
  },
  scoreName: { fontSize: 10, fontFamily: FONTS.bold, letterSpacing: 0.5 },
  scoreNum: { fontSize: 18, fontFamily: FONTS.extrabold, color: COLORS.text, marginTop: 1 },

  // Secret words
  secretCard: {
    backgroundColor: COLORS.surface2,
    marginHorizontal: 12,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secretLabel: { fontSize: 9, fontFamily: FONTS.bold, letterSpacing: 2, color: COLORS.text2 },
  secretRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginVertical: 4 },
  secretChip: {
    backgroundColor: 'rgba(240,193,75,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(240,193,75,0.4)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  secretChipText: { fontSize: 14, fontFamily: FONTS.bold, color: '#F0C14B' },
  secretChipHard: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderColor: 'rgba(167,139,250,0.5)',
  },
  secretChipTextHard: { color: '#C4B5FD' },
  secretChipBadge: {
    fontSize: 9,
    fontFamily: FONTS.extrabold,
    color: '#C4B5FD',
    marginLeft: 4,
  },
  secretHint: { fontSize: 10, color: COLORS.text3, textAlign: 'center' },

  // Manuscript
  manuscript: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  msPrompt: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.text2, fontStyle: 'italic', marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  msLine: { marginBottom: 10 },
  msByline: { fontSize: 9, fontFamily: FONTS.bold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  msText: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.text, lineHeight: 20 },
  hlWord: { backgroundColor: 'rgba(240,193,75,0.3)', color: '#F0C14B', fontFamily: FONTS.bold, borderRadius: 2 },
  msHitTag: { fontSize: 10, fontFamily: FONTS.bold, color: COLORS.danger, marginTop: 2 },

  // Hit notification banner
  hitBanner: {
    marginHorizontal: 12,
    marginVertical: 6,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  hitHead: { fontSize: 14, fontFamily: FONTS.bold, color: '#fff', textAlign: 'center' },
  hitRow: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    gap: 3,
  },
  hitWord: { fontSize: 16, fontFamily: FONTS.extrabold, color: '#F0C14B' },
  hitOwner: { fontSize: 12, fontFamily: FONTS.medium },
  hitSwap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  hitOld: { fontSize: 11, fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.5)', textDecorationLine: 'line-through' },
  hitArrow: { fontSize: 11, color: '#F0C14B' },
  hitNew: { fontSize: 11, fontFamily: FONTS.bold, color: '#9FE09F' },

  // Veto
  vetoPanel: {
    marginHorizontal: 12,
    marginVertical: 6,
    backgroundColor: COLORS.surface2,
    borderWidth: 2,
    borderColor: COLORS.danger,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  vetoWriter: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.text2 },
  vetoText: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.text, fontStyle: 'italic', textAlign: 'center' },
  vetoAsk: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.danger },
  vetoButtons: { flexDirection: 'row', gap: 10 },
  vetoAllow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  vetoAllowText: { color: COLORS.success, fontSize: 13, fontFamily: FONTS.bold },
  vetoDeny: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.danger,
  },
  vetoDenyText: { color: COLORS.danger, fontSize: 13, fontFamily: FONTS.bold },

  // Status
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statusText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.text2, fontStyle: 'italic' },

  // Composer
  composer: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  timerWrap: {
    height: 20,
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timerBar: { height: '100%', borderRadius: 10 },
  timerNum: {
    position: 'absolute',
    right: 8,
    top: 0,
    lineHeight: 20,
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.medium,
    lineHeight: 20,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  inputError: { borderColor: COLORS.danger, backgroundColor: 'rgba(244,63,94,0.08)' },
  selfWarn: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 8,
    padding: 10,
  },
  selfWarnText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.danger },
  selfWarnWord: { fontFamily: FONTS.extrabold },
  composeFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordCount: { fontSize: 11, fontFamily: FONTS.semibold },
  wcOk: { color: COLORS.success },
  wcBad: { color: COLORS.text3 },
  composeButtons: { flexDirection: 'row', gap: 8 },
  addBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: 13, fontFamily: FONTS.bold },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  skipBtnText: { color: COLORS.text2, fontSize: 12, fontFamily: FONTS.semibold },

  // Game over
  overScroll: { padding: 20, alignItems: 'center', gap: 16 },
  stamp: {
    borderWidth: 3,
    borderColor: COLORS.danger,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    transform: [{ rotate: '-3deg' }],
  },
  stampText: { fontSize: 28, fontFamily: FONTS.extrabold, color: COLORS.danger, letterSpacing: 2 },
  sectionLabel: { fontSize: 10, fontFamily: FONTS.bold, letterSpacing: 2, color: COLORS.text2, alignSelf: 'flex-start', width: '100%' },
  revealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 4,
    gap: 10,
    width: '100%',
  },
  revealName: { fontSize: 12, fontFamily: FONTS.bold, width: 60 },
  revealWords: { flex: 1, fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.text, lineHeight: 18 },
  revealScore: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.text2 },
  recapCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    width: '100%',
  },
  recapPrompt: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.text2, fontStyle: 'italic' },
  recapLine: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.text, lineHeight: 20 },
});
