import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList,
  Animated, Pressable, Platform, Keyboard,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '../context/GameContext';
import { COLORS, RADIUS, FONTS } from '../constants/theme';

export default function JoinRoomScreen({ navigation, route }: any) {
  const { joinRoom, leaveRoom, room, currentUser } = useGame();

  const autoRoomCode: string | undefined = route?.params?.roomCode;

  const [name, setName]     = useState(currentUser?.username ?? '');
  const [code, setCode]     = useState(autoRoomCode ?? '');
  const [joined, setJoined] = useState(false);

  // ── All hooks at top ───────────────────────────────────────────────────────
  const joinBtnScale = useRef(new Animated.Value(1)).current;
  const formFade     = useRef(new Animated.Value(0)).current;
  const codeAnim     = useRef(new Animated.Value(0)).current;
  const listAnim     = useRef(new Animated.Value(0)).current;
  const actionsAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(formFade, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, []);

  useEffect(() => {
    if (currentUser?.username && !name) setName(currentUser.username);
  }, [currentUser]);

  useEffect(() => {
    if (autoRoomCode && currentUser?.username) {
      joinRoom(autoRoomCode, currentUser.username);
    }
  }, [autoRoomCode, currentUser?.username]);

  useEffect(() => {
    if (room && !joined) setJoined(true);
  }, [room]);

  useEffect(() => {
    if (!joined || !room) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (e.data.action.type === 'RESET') return;
      e.preventDefault();
      leaveRoom();
    });
    return unsub;
  }, [joined, room]);

  useEffect(() => {
    if (room?.phase === 'playing' && room?.gameState?.game) {
      const screenMap: Record<string, string> = {
        lieDetector:   'LieDetector',
        talentShow:    'TalentShow',
        standOut:      'StandOut',
        numberGuessor: 'NumberGuessor',
        pieCharts:     'PieCharts',
      };
      const screen = screenMap[room.gameState.game];
      if (screen) navigation.navigate(screen as any);
    }
  }, [room?.phase, room?.gameState?.game]);

  useEffect(() => {
    if (!joined) return;
    Animated.stagger(100, [
      Animated.spring(codeAnim,    { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }),
      Animated.spring(listAnim,    { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.spring(actionsAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
    ]).start();
  }, [joined]);

  const slideUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  });

  const handleJoin = () => {
    if (!name.trim() || !code.trim()) return;
    Animated.sequence([
      Animated.spring(joinBtnScale, { toValue: 0.93, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(joinBtnScale, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 16 }),
    ]).start();
    joinRoom(code.trim().toUpperCase(), name.trim());
  };

  // ── Join form ─────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              contentContainerStyle={s.formScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
          <Animated.View style={[s.formWrap, {
            opacity: formFade,
            transform: [{ translateY: formFade.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }]}>
            <View style={s.iconCircle}>
              <Ionicons name="enter-outline" size={32} color="#06B6D4" />
            </View>
            <Text style={s.title}>Join a Game</Text>
            <Text style={s.subtitle}>Enter the room code from the host{'\n'}and your display name.</Text>

            <View style={[s.inputWrap, { marginTop: 16 }]}>
              <Ionicons name="keypad-outline" size={18} color={COLORS.text2} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Room code (e.g. AB3X)"
                placeholderTextColor={COLORS.text2}
                value={code}
                onChangeText={t => setCode(t.toUpperCase())}
                maxLength={4}
                autoCapitalize="characters"
                autoFocus
                returnKeyType="next"
                keyboardAppearance="dark"
                inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
              />
            </View>

            <View style={s.inputWrap}>
              <Ionicons name="person-outline" size={18} color={COLORS.text2} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Your display name"
                placeholderTextColor={COLORS.text2}
                value={name}
                onChangeText={setName}
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
                keyboardAppearance="dark"
                inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
              />
            </View>
            <KeyboardDoneBar />

            <Animated.View style={{ width: '100%', transform: [{ scale: joinBtnScale }] }}>
              <Pressable
                style={[s.primaryBtn, (!name.trim() || !code.trim()) && s.primaryBtnDisabled]}
                onPress={handleJoin}
                disabled={!name.trim() || !code.trim()}
              >
                <LinearGradient
                  colors={['#0891B2', '#0E7490']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.primaryBtnGradient}
                >
                  <Text style={s.primaryBtnText}>Join Room</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </Animated.View>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Waiting lobby ─────────────────────────────────────────────────────────
  const isHostSelecting = room?.hostScreen === 'selecting';

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe}>

        <Animated.View style={[s.codeCard, slideUp(codeAnim)]}>
          <LinearGradient
            colors={isHostSelecting ? ['#1A2E1A', '#0D1A0D'] : ['#1E1830', '#120E22']}
            style={s.codeCardGradient}
          >
            <View style={s.statusIcon}>
              <Ionicons
                name={isHostSelecting ? 'game-controller' : 'time-outline'}
                size={22}
                color={isHostSelecting ? '#22C55E' : '#06B6D4'}
              />
            </View>
            <Text style={s.statusTitle}>
              {isHostSelecting ? 'Get Ready…' : 'Waiting for host'}
            </Text>
            <Text style={s.code}>{room?.code}</Text>
            <Text style={s.codeHint}>
              {isHostSelecting ? 'Host is choosing a game' : 'The game starts when the host is ready'}
            </Text>
          </LinearGradient>
          <View style={[s.codeGlow, { shadowColor: isHostSelecting ? '#22C55E' : '#06B6D4' }]} />
        </Animated.View>

        <Animated.View style={[s.section, slideUp(listAnim)]}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>Players</Text>
            <View style={s.playerCount}>
              <Text style={s.playerCountText}>{room?.players.length}</Text>
            </View>
          </View>
          <FlatList
            data={room?.players}
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
        </Animated.View>

        <Animated.View style={[s.actions, slideUp(actionsAnim)]}>
          <Pressable style={s.dangerBtn} onPress={() => leaveRoom()}>
            <Text style={s.dangerBtnText}>Leave Room</Text>
          </Pressable>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1, paddingHorizontal: 20 },

  formScroll: { flexGrow: 1 },
  formWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#06B6D4' + '18',
    borderWidth: 1,
    borderColor: '#06B6D4' + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title:    { fontSize: 30, fontFamily: FONTS.extrabold, color: COLORS.text, textAlign: 'center' },
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
  input: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: 14 },

  primaryBtn: { width: '100%', borderRadius: RADIUS.md, overflow: 'hidden', marginTop: 6 },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },

  dangerBtn: { paddingVertical: 12, alignItems: 'center' },
  dangerBtnText: { color: COLORS.danger, fontSize: 14, fontFamily: FONTS.semibold },

  codeCard: { width: '100%', borderRadius: 20, overflow: 'hidden', marginTop: 12, marginBottom: 20 },
  codeCardGradient: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  codeGlow: {
    position: 'absolute', inset: 0, borderRadius: 20,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 24, shadowOpacity: 0.3,
  },
  statusIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  statusTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.text2, marginBottom: 6 },
  code: { fontSize: 58, fontFamily: FONTS.extrabold, color: COLORS.accent, letterSpacing: 10 },
  codeHint: { fontSize: 13, color: COLORS.text2, marginTop: 6, textAlign: 'center' },

  section: { width: '100%', flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text2, letterSpacing: 1.5, textTransform: 'uppercase' },
  playerCount: { backgroundColor: COLORS.accent + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  playerCountText: { color: COLORS.accent, fontFamily: FONTS.bold, fontSize: 13 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderHi, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },
  playerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center',
  },
  playerAvatarHost: { backgroundColor: COLORS.accent + '22', borderWidth: 1, borderColor: COLORS.accent + '55' },
  playerAvatarText: { color: COLORS.text, fontFamily: FONTS.bold, fontSize: 14 },
  playerName: { color: COLORS.text, fontSize: 15, flex: 1, fontFamily: FONTS.medium },
  hostBadge: {
    backgroundColor: COLORS.accent + '1A', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.accent + '40',
  },
  hostBadgeText: { color: COLORS.accent, fontSize: 10, fontFamily: FONTS.extrabold, letterSpacing: 1 },
  actions: { width: '100%', paddingBottom: 12 },
});
