import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView,
  TouchableOpacity, FlatList,
} from 'react-native';
import { useGame } from '../context/GameContext';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

export default function JoinRoomScreen({ navigation, route }: any) {
  const { joinRoom, leaveRoom, room, currentUser } = useGame();

  const autoRoomCode: string | undefined = route?.params?.roomCode;

  const [name, setName]     = useState(currentUser?.username ?? '');
  const [code, setCode]     = useState(autoRoomCode ?? '');
  const [joined, setJoined] = useState(false);

  // Keep name in sync if user data loads after render
  useEffect(() => {
    if (currentUser?.username && !name) setName(currentUser.username);
  }, [currentUser]);

  // Auto-join when arriving via an accepted invite
  useEffect(() => {
    if (autoRoomCode && currentUser?.username) {
      joinRoom(autoRoomCode, currentUser.username);
    }
  }, [autoRoomCode, currentUser?.username]);

  // When we receive a fresh room (after calling joinRoom), mark as joined
  useEffect(() => {
    if (room && !joined) setJoined(true);
  }, [room]);

  // Navigate to the correct game screen once the host starts
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

  const handleJoin = () => {
    if (!name.trim() || !code.trim()) return;
    joinRoom(code.trim().toUpperCase(), name.trim());
  };

  const handleLeave = () => {
    leaveRoom();
    // Navigation to Home is handled by GameContext when 'leftRoom' fires
  };

  // ── Join form (not yet in a room) ────────────────────────────────────────────
  if (!joined) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Join a Game</Text>
        <Text style={styles.subtitle}>Enter the room code from the host</Text>
        <TextInput
          style={styles.input}
          placeholder="Room code (e.g. AB3X)"
          placeholderTextColor={COLORS.text2}
          value={code}
          onChangeText={t => setCode(t.toUpperCase())}
          maxLength={4}
          autoCapitalize="characters"
          autoFocus
        />
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={COLORS.text2}
          value={name}
          onChangeText={setName}
          maxLength={20}
        />
        <TouchableOpacity
          style={[styles.button, (!name.trim() || !code.trim()) && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={!name.trim() || !code.trim()}
        >
          <Text style={styles.buttonText}>Join Room</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Waiting lobby (joined, host hasn't started yet) ──────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Waiting for host…</Text>
      <Text style={styles.code}>{room?.code}</Text>
      <Text style={styles.subtitle}>The game will start when the host is ready</Text>

      <Text style={styles.label}>Players ({room?.players.length})</Text>
      <FlatList
        data={room?.players}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.playerRow}>
            <Text style={styles.playerIndex}>{index + 1}</Text>
            <Text style={styles.playerName}>{item.name}</Text>
            {index === 0 && <Text style={styles.hostBadge}>HOST</Text>}
          </View>
        )}
        style={styles.list}
      />

      <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
        <Text style={styles.leaveBtnText}>Leave Room</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.text2,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  code: {
    fontSize: 64,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 8,
    marginBottom: SPACING.sm,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  button: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  list: { width: '100%', marginBottom: SPACING.md },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  playerIndex: { color: COLORS.text2, marginRight: SPACING.md, fontSize: 14 },
  playerName:  { color: COLORS.text,  fontSize: 16, flex: 1 },
  hostBadge:   { color: COLORS.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  leaveBtn: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  leaveBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
});
