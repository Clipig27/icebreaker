import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { COLORS, RADIUS, SPACING, FONTS } from '../constants/theme';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import GameIntro from '../components/GameIntro';
import PhaseTransition from '../components/PhaseTransition';


// ── Types ──────────────────────────────────────────────────────────────────────

type Role = 'AGENT' | 'SHADOW' | 'INVESTIGATOR' | 'GUARDIAN';

interface PlayerRef { id: string; name: string; }

interface PrivateState {
  role: Role;
  shadowAllies: PlayerRef[];
  isAlive: boolean;
}

interface ScanResult {
  targetId: string;
  targetName: string;
  role: Role;
  glitched: boolean;
}

interface ChatMsg {
  key: string;
  playerId: string;
  playerName: string;
  text: string;
  isGhost: boolean;
}

interface PublicGS {
  game: string;
  phase: string;
  round: number;
  alivePlayers: PlayerRef[];
  eliminatedPlayers: PlayerRef[];
  eliminatedThisRound: PlayerRef | null;
  dayEliminatedPlayer: { id: string; name: string; role: Role } | null;
  submittedNightActionIds: string[];
  votes: Record<string, number>;
  runoffVotes: Record<string, number>;
  runoffCandidates: PlayerRef[];
  winner: 'AGENTS' | 'SHADOWS' | null;
  glitchActive: boolean;
  glitchType: string | null;
  glitchSwapPair: string[] | null;
  finalRoles: Array<{ id: string; name: string; role: Role }> | null;
  phaseEndsAt: number;
}

// ── Role presentation ──────────────────────────────────────────────────────────

const ROLE_COLOR: Record<Role, string> = {
  AGENT:        COLORS.text2,
  SHADOW:       COLORS.danger,
  INVESTIGATOR: COLORS.accent,
  GUARDIAN:     COLORS.success,
};

const ROLE_EMOJI: Record<Role, string> = {
  AGENT:        '🕵️',
  SHADOW:       '👤',
  INVESTIGATOR: '🔍',
  GUARDIAN:     '🛡️',
};

const ROLE_LABEL: Record<Role, string> = {
  AGENT:        'Agent',
  SHADOW:       'Shadow',
  INVESTIGATOR: 'Investigator',
  GUARDIAN:     'Guardian',
};

const ROLE_DESC: Record<Role, string> = {
  AGENT:        'Find and eliminate the Shadows before they take control. Survive.',
  SHADOW:       'Eliminate Agents each night. Stay hidden. Take control.',
  INVESTIGATOR: 'Each night, secretly scan one player to discover their role.',
  GUARDIAN:     'Each night, protect one player from being eliminated.',
};

// ── Timer hook ─────────────────────────────────────────────────────────────────

function useCountdown(phaseEndsAt: number | undefined): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!phaseEndsAt) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phaseEndsAt]);
  return secs;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShadowProtocolScreen({ navigation }: any) {
  const { room, players, currentUser, isHost, sendPlayerAction, startGame } = useGame();


  const [priv, setPriv]         = useState<PrivateState | null>(null);
  const [scan, setScan]         = useState<ScanResult | null>(null);
  const [chat, setChat]         = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const chatRef    = useRef<FlatList>(null);
  const prevPhase  = useRef<string>('');

  const gs = room?.gameState as PublicGS | undefined;
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
  const timeLeft = useCountdown(gs?.phaseEndsAt);

  // headerLeft (Leave button) is set globally in App.tsx screenOptions

  // ── Request private state on mount ──────────────────────────────────────────
  useEffect(() => {
    sendPlayerAction('sp-request-private-state', {});
  }, []);

  // ── Reset selection when phase changes ──────────────────────────────────────
  useEffect(() => {
    const phase = gs?.phase ?? '';
    if (phase !== prevPhase.current) {
      prevPhase.current = phase;
      setSelected(null);
      setSubmitted(false);
      setScan(null);
    }
  }, [gs?.phase]);

  // ── Socket listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onPrivate = (data: PrivateState) => setPriv(data);
    const onScan    = (data: ScanResult)   => setScan(data);
    const onChat    = (msg: any) => {
      setChat(prev => [
        ...prev,
        { key: `${msg.timestamp}${msg.playerId}`, ...msg },
      ]);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
    };

    socket.on('spPrivateState', onPrivate);
    socket.on('spScanResult',   onScan);
    socket.on('spChatMessage',  onChat);
    return () => {
      socket.off('spPrivateState', onPrivate);
      socket.off('spScanResult',   onScan);
      socket.off('spChatMessage',  onChat);
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const submitNightAction = (targetId: string) => {
    if (submitted || !priv) return;
    const role = priv.role;
    if (role === 'SHADOW')       sendPlayerAction('sp-shadow-vote', { targetId });
    else if (role === 'INVESTIGATOR') sendPlayerAction('sp-investigate', { targetId });
    else if (role === 'GUARDIAN')    sendPlayerAction('sp-guard', { targetId });
    setSelected(targetId);
    setSubmitted(true);
  };

  const submitDayVote = (targetId: string) => {
    if (submitted) return;
    sendPlayerAction('sp-day-vote', { targetId });
    setSelected(targetId);
    setSubmitted(true);
  };

  const submitRunoffVote = (targetId: string) => {
    if (submitted) return;
    sendPlayerAction('sp-runoff-vote', { targetId });
    setSelected(targetId);
    setSubmitted(true);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    sendPlayerAction('sp-chat', { text });
    setChatInput('');
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (gs?.phase === 'intro' || (!gs)) {
    return (
      <GameIntro
        emoji="🌑"
        title="Shadow Protocol"
        tagline="Find the Shadows before it's too late."
        rules={[
          { emoji: '🎭', text: 'Players are secretly assigned roles: Innocents or Shadows.' },
          { emoji: '🗣️', text: 'Each round, discuss who you suspect and vote to eliminate someone.' },
          { emoji: '👤', text: 'The eliminated player\'s role is revealed.' },
          { emoji: '🏆', text: 'Innocents win if all Shadows are eliminated. Shadows win if they match or outnumber Innocents.' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  // ── Render guards ────────────────────────────────────────────────────────────

  if (gs.phase === 'loading' || !priv) {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs?.phase ?? 'loading'}>

        <View style={styles.center}>
          <Text style={styles.dim}>Waiting for game to start…</Text>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  const isAlive = priv.isAlive;
  const role    = priv.role;
  const rc      = ROLE_COLOR[role];

  // ── ROLE REVEAL ──────────────────────────────────────────────────────────────

  if (gs.phase === 'role-reveal') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.center}>
          <Text style={[styles.bigEmoji]}>{ROLE_EMOJI[role]}</Text>
          <Text style={[styles.roleTitle, { color: rc }]}>{ROLE_LABEL[role]}</Text>
          <Text style={styles.roleDesc}>{ROLE_DESC[role]}</Text>

          {role === 'SHADOW' && priv.shadowAllies.length > 0 && (
            <View style={styles.allyBox}>
              <Text style={styles.allyLabel}>Your allies</Text>
              {priv.shadowAllies.map(a => (
                <Text key={a.id} style={[styles.allyName, { color: COLORS.danger }]}>{a.name}</Text>
              ))}
            </View>
          )}

          <Text style={styles.timerSmall}>Night begins in {timeLeft}s</Text>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── NIGHT ────────────────────────────────────────────────────────────────────

  if (gs.phase === 'night') {
    const submitted_ = gs.submittedNightActionIds?.includes(myId) || submitted;
    const targets    = (gs.alivePlayers ?? []).filter(p => p.id !== myId);
    const shadowOnly = role === 'SHADOW'
      ? targets.filter(p => priv.shadowAllies.every(a => a.id !== p.id))
      : targets;

    const isActive = isAlive && role !== 'AGENT';
    const nightTargets = isActive ? (role === 'SHADOW' ? shadowOnly : targets) : [];

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.phaseLabel}>NIGHT — Round {gs.round}</Text>
          <Text style={styles.timerSmall}>⏱ {timeLeft}s</Text>

          {!isAlive && (
            <View style={styles.ghostBanner}>
              <Text style={styles.ghostText}>👻  You are eliminated. Watch the night unfold.</Text>
            </View>
          )}

          {isAlive && role === 'AGENT' && (
            <View style={styles.waitBox}>
              <Text style={styles.waitEmoji}>😴</Text>
              <Text style={styles.waitText}>You are an Agent. Stay quiet while others act.</Text>
              <Text style={styles.dim}>{gs.submittedNightActionIds?.length ?? 0} action(s) submitted</Text>
            </View>
          )}

          {isActive && (
            <>
              <Text style={styles.instruction}>
                {role === 'SHADOW'       && 'Choose a target to eliminate tonight.'}
                {role === 'INVESTIGATOR' && 'Choose someone to scan.'}
                {role === 'GUARDIAN'     && 'Choose someone to protect tonight.'}
              </Text>

              {submitted_ ? (
                <View style={styles.submittedBox}>
                  <Text style={styles.submittedText}>✓ Action submitted. Waiting for others…</Text>
                  {selected && <Text style={styles.dim}>Target: {gs.alivePlayers.find(p => p.id === selected)?.name}</Text>}
                </View>
              ) : (
                <View style={styles.targetList}>
                  {nightTargets.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.targetBtn, selected === p.id && styles.targetBtnSelected]}
                      onPress={() => submitNightAction(p.id)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.targetName} numberOfLines={1}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {scan && (
                <View style={[styles.scanBox, scan.glitched && styles.scanBoxGlitched]}>
                  <Text style={styles.scanTitle}>🔍 Scan Result{scan.glitched ? ' ⚠️' : ''}</Text>
                  <Text style={styles.scanText}>
                    {scan.targetName} is a{' '}
                    <Text style={{ color: ROLE_COLOR[scan.role] }}>{ROLE_LABEL[scan.role]}</Text>
                  </Text>
                  {scan.glitched && <Text style={styles.glitchNote}>⚠ Glitch detected — result may be unreliable.</Text>}
                </View>
              )}
            </>
          )}

          <View style={styles.aliveList}>
            <Text style={styles.sectionLabel}>ALIVE ({gs.alivePlayers?.length ?? 0})</Text>
            {(gs.alivePlayers ?? []).map(p => (
              <Text key={p.id} style={[styles.aliveItem, p.id === myId && { color: COLORS.accent }]}>
                {p.id === myId ? '→ ' : '  '}{p.name}
              </Text>
            ))}
          </View>
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── DAY REVEAL ───────────────────────────────────────────────────────────────

  if (gs.phase === 'day-reveal') {
    const elim = gs.eliminatedThisRound;
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <View style={styles.center}>
          <Text style={styles.phaseLabel}>DAWN — Round {gs.round}</Text>

          {gs.glitchActive && (
            <View style={styles.glitchBanner}>
              <Text style={styles.glitchBannerText}>⚡ GLITCH DETECTED</Text>
              <Text style={styles.glitchSub}>Something is wrong with the system…</Text>
            </View>
          )}

          {elim ? (
            <View style={styles.elimBox}>
              <Text style={styles.elimLabel}>Eliminated last night</Text>
              <Text style={styles.elimName}>{elim.name}</Text>
              {gs.glitchType === 'SCRAMBLED_REVEAL' && (
                <Text style={styles.glitchNote}>⚠ Identity may be scrambled.</Text>
              )}
            </View>
          ) : (
            <View style={styles.elimBox}>
              <Text style={styles.elimLabel}>No one was eliminated last night.</Text>
              <Text style={styles.dim}>The Guardian protected their target.</Text>
            </View>
          )}

          <Text style={styles.timerSmall}>Discussion begins in {timeLeft}s</Text>
        </View>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── DISCUSSION ───────────────────────────────────────────────────────────────

  if (gs.phase === 'discussion') {
    const ghostLabel = !isAlive ? ' (Ghost)' : '';
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <View style={styles.discussHeader}>
            <Text style={styles.phaseLabel}>DISCUSSION — Round {gs.round}</Text>
            <Text style={styles.timerSmall}>⏱ {timeLeft}s</Text>
          </View>

          {gs.dayEliminatedPlayer && (
            <View style={styles.dayEliminBanner}>
              <Text style={styles.dayEliminText}>
                {gs.dayEliminatedPlayer.name} was eliminated · Role:{' '}
                <Text style={{ color: ROLE_COLOR[gs.dayEliminatedPlayer.role] }}>
                  {ROLE_LABEL[gs.dayEliminatedPlayer.role]}
                </Text>
              </Text>
            </View>
          )}

          <FlatList
            ref={chatRef}
            data={chat}
            keyExtractor={m => m.key}
            style={styles.chatList}
            contentContainerStyle={{ padding: SPACING.sm }}
            renderItem={({ item }) => (
              <View style={[styles.chatBubble, item.isGhost && styles.chatGhost]}>
                <Text style={styles.chatName}>{item.playerName}{item.isGhost ? ' 👻' : ''}</Text>
                <Text style={styles.chatText}>{item.text}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={[styles.dim, { textAlign: 'center', padding: 20 }]}>No messages yet. Discuss!</Text>}
          />

          <View style={styles.chatInput}>
            <TextInput
              style={styles.chatField}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={`Message${ghostLabel}…`}
              placeholderTextColor={COLORS.text3}
              onSubmitEditing={sendChat}
              returnKeyType="send"
              maxLength={200}
              keyboardAppearance="dark"
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
            />
            <TouchableOpacity style={styles.chatSend} onPress={sendChat} activeOpacity={0.7}>
              <Text style={styles.chatSendText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        <KeyboardDoneBar />

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── VOTING ───────────────────────────────────────────────────────────────────

  if (gs.phase === 'voting') {
    const totalVotes = Object.values(gs.votes ?? {}).reduce((s, c) => s + c, 0);
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.phaseLabel}>VOTE — Round {gs.round}</Text>
          <Text style={styles.instruction}>Who is the Shadow? Vote to eliminate.</Text>
          <Text style={styles.timerSmall}>⏱ {timeLeft}s · {totalVotes} vote(s) cast</Text>

          {!isAlive && (
            <View style={styles.ghostBanner}>
              <Text style={styles.ghostText}>👻  Ghosts cannot vote.</Text>
            </View>
          )}

          {submitted ? (
            <View style={styles.submittedBox}>
              <Text style={styles.submittedText}>✓ Vote cast. Waiting for others…</Text>
            </View>
          ) : isAlive ? (
            <View style={styles.targetList}>
              {(gs.alivePlayers ?? [])
                .filter(p => p.id !== myId)
                .map(p => {
                  const voteCount = gs.votes?.[p.id] ?? 0;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.targetBtn, selected === p.id && styles.targetBtnSelected]}
                      onPress={() => submitDayVote(p.id)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.targetName} numberOfLines={1}>{p.name}</Text>
                      {voteCount > 0 && <Text style={styles.voteCount}>{voteCount} vote{voteCount !== 1 ? 's' : ''}</Text>}
                    </TouchableOpacity>
                  );
                })}
            </View>
          ) : null}

          {/* Show vote counts even after voting */}
          {(submitted || !isAlive) && Object.keys(gs.votes ?? {}).length > 0 && (
            <View style={styles.voteTally}>
              <Text style={styles.sectionLabel}>CURRENT TALLY</Text>
              {Object.entries(gs.votes ?? {}).sort(([, a], [, b]) => b - a).map(([id, count]) => {
                const p = gs.alivePlayers?.find(q => q.id === id);
                return (
                  <Text key={id} style={styles.tallyItem}>
                    {p?.name ?? id}: {count} vote{count !== 1 ? 's' : ''}
                  </Text>
                );
              })}
            </View>
          )}
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── RUNOFF VOTING ─────────────────────────────────────────────────────────────

  if (gs.phase === 'runoff-voting') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.phaseLabel}>RUNOFF — Round {gs.round}</Text>
          <Text style={styles.instruction}>Tie! Vote again between these two.</Text>
          <Text style={styles.timerSmall}>⏱ {timeLeft}s</Text>

          {!isAlive && (
            <View style={styles.ghostBanner}>
              <Text style={styles.ghostText}>👻  Ghosts cannot vote.</Text>
            </View>
          )}

          {submitted ? (
            <View style={styles.submittedBox}>
              <Text style={styles.submittedText}>✓ Runoff vote cast.</Text>
            </View>
          ) : isAlive ? (
            <View style={styles.targetList}>
              {(gs.runoffCandidates ?? []).map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.targetBtn, selected === p.id && styles.targetBtnSelected]}
                  onPress={() => submitRunoffVote(p.id)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.targetName}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>

        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── GAME OVER ─────────────────────────────────────────────────────────────────

  if (gs.phase === 'game-over') {
    const agentsWon = gs.winner === 'AGENTS';
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.phaseLabel}>GAME OVER</Text>
          <Text style={[styles.winnerText, { color: agentsWon ? COLORS.success : COLORS.danger }]}>
            {agentsWon ? '✅ Agents Win' : '☠️ Shadows Win'}
          </Text>
          <Text style={styles.dim}>
            {agentsWon
              ? 'All Shadows have been eliminated.'
              : 'The Shadows now control the room.'}
          </Text>

          {gs.finalRoles && (
            <View style={styles.roleRevealList}>
              <Text style={styles.sectionLabel}>ROLES REVEALED</Text>
              {gs.finalRoles.map(p => (
                <View key={p.id} style={styles.roleRevealItem}>
                  <Text style={styles.roleRevealName} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.roleRevealRole, { color: ROLE_COLOR[p.role] }]}>
                    {ROLE_EMOJI[p.role]} {ROLE_LABEL[p.role]}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actions}>
            {isHost ? (
              <>
                <PrimaryButton title="Play Again" onPress={() => startGame('shadowProtocol')} />
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

  // ── Fallback ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <PhaseTransition phaseKey={gs.phase}>

      <View style={styles.center}>
        <Text style={styles.dim}>Round {gs.round} · {gs.phase}</Text>
      </View>

      </PhaseTransition>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.bg },
  scroll:  { padding: SPACING.md, paddingBottom: SPACING.xl },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },

  phaseLabel: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text2, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  timerSmall: { fontSize: 13, color: COLORS.text2, marginBottom: SPACING.md },
  dim:        { fontSize: 13, color: COLORS.text2, textAlign: 'center' },
  instruction:{ fontSize: 15, color: COLORS.text, marginBottom: SPACING.md },
  sectionLabel:{ fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text2, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, marginTop: SPACING.md },

  bigEmoji:   { fontSize: 64, marginBottom: SPACING.sm },
  roleTitle:  { fontSize: 28, fontFamily: FONTS.extrabold, marginBottom: 8 },
  roleDesc:   { fontSize: 15, color: COLORS.text2, textAlign: 'center', lineHeight: 22, marginHorizontal: SPACING.lg },

  allyBox:    { marginTop: SPACING.lg, alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.danger },
  allyLabel:  { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text2, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  allyName:   { fontSize: 16, fontFamily: FONTS.bold },

  ghostBanner:{ backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  ghostText:  { fontSize: 14, color: COLORS.text2, textAlign: 'center' },

  waitBox:    { alignItems: 'center', padding: SPACING.lg },
  waitEmoji:  { fontSize: 40, marginBottom: SPACING.sm },
  waitText:   { fontSize: 15, color: COLORS.text, textAlign: 'center', marginBottom: 8 },

  targetList: { gap: 10, marginTop: SPACING.sm },
  targetBtn:  { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetBtnSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.surface2 },
  targetName: { fontSize: 16, fontFamily: FONTS.semibold, color: COLORS.text },
  voteCount:  { fontSize: 13, color: COLORS.text2 },

  submittedBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', gap: 4 },
  submittedText:{ fontSize: 15, color: COLORS.success, fontFamily: FONTS.semibold },

  scanBox:        { marginTop: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.accent },
  scanBoxGlitched:{ borderColor: COLORS.warning },
  scanTitle:      { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text2, marginBottom: 4 },
  scanText:       { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text },
  glitchNote:     { fontSize: 12, color: COLORS.warning, marginTop: 4 },

  aliveList:  { marginTop: SPACING.lg },
  aliveItem:  { fontSize: 14, color: COLORS.text2, paddingVertical: 3 },

  glitchBanner:     { backgroundColor: '#2A1010', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.danger },
  glitchBannerText: { fontSize: 14, fontFamily: FONTS.extrabold, color: COLORS.danger, letterSpacing: 1 },
  glitchSub:        { fontSize: 12, color: COLORS.text2, marginTop: 2 },

  elimBox:    { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', marginVertical: SPACING.md, minWidth: 240 },
  elimLabel:  { fontSize: 12, color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  elimName:   { fontSize: 26, fontFamily: FONTS.extrabold, color: COLORS.danger },

  discussHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayEliminBanner:{ backgroundColor: COLORS.surface2, padding: SPACING.sm, marginHorizontal: SPACING.md, borderRadius: RADIUS.sm, marginBottom: 4 },
  dayEliminText:  { fontSize: 13, color: COLORS.text2, textAlign: 'center' },

  chatList:   { flex: 1, backgroundColor: COLORS.surface },
  chatBubble: { backgroundColor: COLORS.surface2, borderRadius: RADIUS.sm, padding: 10, marginBottom: 6 },
  chatGhost:  { opacity: 0.6, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.border },
  chatName:   { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.text2, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  chatText:   { fontSize: 14, color: COLORS.text },
  chatInput:  { flexDirection: 'row', padding: SPACING.sm, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  chatField:  { flex: 1, backgroundColor: COLORS.surface2, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8, color: COLORS.text, fontSize: 14 },
  chatSend:   { backgroundColor: COLORS.accent, borderRadius: RADIUS.sm, paddingHorizontal: 16, justifyContent: 'center' },
  chatSendText: { color: COLORS.text, fontSize: 18, fontFamily: FONTS.bold },

  voteTally:  { marginTop: SPACING.md },
  tallyItem:  { fontSize: 14, color: COLORS.text, paddingVertical: 4 },

  winnerText:   { fontSize: 32, fontFamily: FONTS.extrabold, marginVertical: SPACING.sm },
  roleRevealList: { marginTop: SPACING.lg, gap: 8 },
  roleRevealItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md },
  roleRevealName: { fontSize: 16, fontFamily: FONTS.semibold, color: COLORS.text },
  roleRevealRole: { fontSize: 14, fontFamily: FONTS.bold },

  actions: { marginTop: SPACING.lg, gap: 10 },
  waitSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', marginTop: SPACING.md },
});
