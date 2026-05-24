import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Animated, Pressable, Platform,
} from 'react-native';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useGame } from '../context/GameContext';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import FriendsInviteModal from '../components/FriendsInviteModal';

const CREATE_TIMEOUT_MS = 10_000;

export default function HostLobbyScreen({ navigation }: any) {
  const { createRoom, cancelRoom, leaveRoom, room, currentUser, isConnected, setHostScreen } = useGame();

  const [name, setName]               = useState(currentUser?.username ?? '');
  const [started, setStarted]         = useState(false);
  const [timedOut, setTimedOut]       = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── ALL hooks declared unconditionally ────────────────────────────────────
  const createBtnScale = useRef(new Animated.Value(1)).current;
  const startBtnScale  = useRef(new Animated.Value(1)).current;
  const formFade       = useRef(new Animated.Value(0)).current;
  const codeAnim       = useRef(new Animated.Value(0)).current;
  const listAnim       = useRef(new Animated.Value(0)).current;
  const actionsAnim    = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    React.useCallback(() => {
      if (room) setHostScreen('lobby');
    }, [room?.code])
  );

  useEffect(() => {
    if (currentUser?.username && !name) setName(currentUser.username);
  }, [currentUser]);

  useEffect(() => {
    if (room && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [room]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  // Form entrance
  useEffect(() => {
    Animated.spring(formFade, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, []);

  // Lobby entrance — fires when room first appears
  useEffect(() => {
    if (!room) return;
    Animated.stagger(100, [
      Animated.spring(codeAnim,    { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }),
      Animated.spring(listAnim,    { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.spring(actionsAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
    ]).start();
  }, [!!room]);

  useEffect(() => {
    if (!room) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (e.data.action.type === 'RESET') return;
      e.preventDefault();
      // Leave (transfers host) instead of cancel (kicks everyone)
      leaveRoom();
    });
    return unsub;
  }, [room]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const slideUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  });

  const bounce = (ref: Animated.Value, cb?: () => void) =>
    Animated.sequence([
      Animated.spring(ref, { toValue: 0.93, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(ref, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 16 }),
    ]).start(cb);

  const handleCreate = () => {
    if (!name.trim()) return;
    bounce(createBtnScale);
    createRoom(name.trim());
    setStarted(true);
    setTimedOut(false);
    timeoutRef.current = setTimeout(() => setTimedOut(true), CREATE_TIMEOUT_MS);
  };

  const handleRetry = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStarted(false);
    setTimedOut(false);
  };

  // ── Form ──────────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.safe}>
          <Animated.View style={[s.formWrap, {
            opacity: formFade,
            transform: [{ translateY: formFade.interpolate({ inputRange: [0,1], outputRange: [24,0] }) }],
          }]}>
            <View style={s.iconCircle}>
              <Ionicons name="game-controller" size={32} color={COLORS.accent} />
            </View>
            <Text style={s.title}>Host a Game</Text>
            <Text style={s.subtitle}>Create a room and share the code{'\n'}with your friends to join.</Text>

            <View style={s.inputWrap}>
              <Ionicons name="person-outline" size={18} color={COLORS.text2} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Your display name"
                placeholderTextColor={COLORS.text2}
                value={name}
                onChangeText={setName}
                maxLength={20}
                autoFocus={!currentUser?.username}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                keyboardAppearance="dark"
                inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
              />
            </View>
            <KeyboardDoneBar />

            <Animated.View style={{ width: '100%', transform: [{ scale: createBtnScale }] }}>
              <Pressable
                style={[s.primaryBtn, !name.trim() && s.primaryBtnDisabled]}
                onPress={handleCreate}
                disabled={!name.trim()}
              >
                <LinearGradient
                  colors={['#7C5CF6', '#5B3FD4']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.primaryBtnGradient}
                >
                  <Text style={s.primaryBtnText}>Create Room</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Timed out ─────────────────────────────────────────────────────────────
  if (timedOut) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.safe}>
          <View style={s.centerWrap}>
            <Ionicons name="wifi-outline" size={48} color={COLORS.danger} />
            <Text style={s.errorTitle}>Could not reach server</Text>
            <Text style={s.subtitle}>Check your connection and try again.</Text>
            <Pressable style={s.primaryBtn} onPress={handleRetry}>
              <LinearGradient colors={['#7C5CF6','#5B3FD4']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.primaryBtnGradient}>
                <Text style={s.primaryBtnText}>Try Again</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={s.ghostBtn} onPress={() => navigation.goBack()}>
              <Text style={s.ghostBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Connecting / creating ─────────────────────────────────────────────────
  if (!room) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.safe}>
          <View style={s.centerWrap}>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={s.subtitle} style={{ marginTop: 20 }}>
              {isConnected ? 'Creating room…' : 'Connecting…'}
            </Text>
            <Pressable style={s.ghostBtn} onPress={() => navigation.goBack()}>
              <Text style={s.ghostBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe}>

        {/* Room code card */}
        <Animated.View style={[s.codeCard, slideUp(codeAnim)]}>
          <LinearGradient colors={['#1E1830','#120E22']} style={s.codeCardGradient}>
            <Text style={s.codeLabel}>ROOM CODE</Text>
            <Text style={s.code}>{room.code}</Text>
            <Text style={s.codeHint}>Share this with your friends</Text>
          </LinearGradient>
          <View style={s.codeGlow} />
        </Animated.View>

        {/* Players */}
        <Animated.View style={[s.section, slideUp(listAnim)]}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>Players</Text>
            <View style={s.playerCount}>
              <Text style={s.playerCountText}>{room.players.length}</Text>
            </View>
          </View>
          <FlatList
            data={room.players}
            keyExtractor={(_, i) => i.toString()}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View style={s.playerRow}>
                <View style={[s.playerAvatar, index === 0 && s.playerAvatarHost]}>
                  <Text style={s.playerAvatarText}>{item.name[0].toUpperCase()}</Text>
                </View>
                <Text style={s.playerName}>{item.name}</Text>
                {index === 0 && (
                  <View style={s.hostBadge}>
                    <Text style={s.hostBadgeText}>HOST</Text>
                  </View>
                )}
              </View>
            )}
          />
          {room.players.length < 2 && (
            <Text style={s.waitingHint}>Waiting for at least 1 more player…</Text>
          )}
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[s.actions, slideUp(actionsAnim)]}>
          <Animated.View style={{ width: '100%', transform: [{ scale: startBtnScale }] }}>
            <Pressable
              style={[s.primaryBtn, room.players.length < 2 && s.primaryBtnDisabled]}
              disabled={room.players.length < 2}
              onPress={() => bounce(startBtnScale, () => navigation.navigate('GameSelect'))}
            >
              <LinearGradient colors={['#7C5CF6','#5B3FD4']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.primaryBtnGradient}>
                <Text style={s.primaryBtnText}>Start Game</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Pressable style={s.secondaryBtn} onPress={() => setInviteVisible(true)}>
            <Ionicons name="people-outline" size={18} color={COLORS.text} />
            <Text style={s.secondaryBtnText}>Invite Friends</Text>
          </Pressable>

          <Pressable style={s.dangerBtn} onPress={() => cancelRoom()}>
            <Text style={s.dangerBtnText}>Cancel Room</Text>
          </Pressable>
        </Animated.View>

        <FriendsInviteModal
          visible={inviteVisible}
          roomCode={room.code}
          onClose={() => setInviteVisible(false)}
        />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1, paddingHorizontal: 20 },

  // Form
  formWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent + '18',
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title:    { fontSize: 30, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  inputWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 14,
  },

  // Buttons
  primaryBtn: { width: '100%', borderRadius: RADIUS.md, overflow: 'hidden', marginTop: 4 },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  secondaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginTop: 10,
  },
  secondaryBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  ghostBtn: { marginTop: 16, paddingVertical: 10 },
  ghostBtnText: { color: COLORS.text2, fontSize: 14, textDecorationLine: 'underline', textAlign: 'center' },

  dangerBtn: { marginTop: 16, paddingVertical: 10, alignItems: 'center' },
  dangerBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },

  // Center states (loading / error)
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: COLORS.danger, textAlign: 'center', marginTop: 12 },

  // Room code card
  codeCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 20,
  },
  codeCardGradient: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  codeGlow: {
    position: 'absolute',
    inset: 0,
    borderRadius: 20,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0.35,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: COLORS.text2,
    marginBottom: 8,
  },
  code: {
    fontSize: 60,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 10,
  },
  codeHint: { fontSize: 13, color: COLORS.text2, marginTop: 6 },

  // Players section
  section: { width: '100%', flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text2, letterSpacing: 1.5, textTransform: 'uppercase' },
  playerCount: {
    backgroundColor: COLORS.accent + '22',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  playerCountText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarHost: { backgroundColor: COLORS.accent + '22', borderWidth: 1, borderColor: COLORS.accent + '55' },
  playerAvatarText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  playerName: { color: COLORS.text, fontSize: 15, flex: 1, fontWeight: '500' },
  hostBadge: {
    backgroundColor: COLORS.accent + '1A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
  },
  hostBadgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  waitingHint: { color: COLORS.text2, fontSize: 13, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },

  actions: { width: '100%', paddingBottom: 12, paddingTop: 4 },
});
