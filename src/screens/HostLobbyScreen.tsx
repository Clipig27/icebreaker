import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView,
  TouchableOpacity, FlatList, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useGame } from '../context/GameContext';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import FriendsInviteModal from '../components/FriendsInviteModal';

const CREATE_TIMEOUT_MS = 10_000;

export default function HostLobbyScreen({ navigation }: any) {
  const { createRoom, cancelRoom, room, currentUser, isConnected, setHostScreen } = useGame();

  const [name, setName]                 = useState(currentUser?.username ?? '');
  const [started, setStarted]           = useState(false);
  const [timedOut, setTimedOut]         = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const timeoutRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When host returns to lobby from GameSelectScreen, restore lobby state for non-hosts
  useFocusEffect(
    React.useCallback(() => {
      if (room) setHostScreen('lobby');
    }, [room?.code])
  );

  // Keep name in sync if user data loads after render
  useEffect(() => {
    if (currentUser?.username && !name) setName(currentUser.username);
  }, [currentUser]);

  // Clear timeout as soon as the room arrives
  useEffect(() => {
    if (room && timeoutRef.current) {
      console.log('[HostLobby] roomCreated received — clearing timeout');
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [room]);

  // Always clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;

    console.log('[HostLobby] Create tapped — isConnected:', isConnected);
    createRoom(name.trim());
    setStarted(true);
    setTimedOut(false);

    // Start the safety timeout — runs whether connected now or connecting
    timeoutRef.current = setTimeout(() => {
      console.log('[HostLobby] Timed out waiting for roomCreated');
      setTimedOut(true);
    }, CREATE_TIMEOUT_MS);
  };

  const handleRetry = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStarted(false);
    setTimedOut(false);
  };

  const handleCancel = () => {
    cancelRoom();
    // Navigation is handled by GameContext when 'roomCancelled' fires
  };

  // Back button while lobby is active → cancel the room (GameContext handles navigation)
  useEffect(() => {
    if (!room) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      // Allow programmatic resets (e.g. from roomCancelled → resetToMain)
      if (e.data.action.type === 'RESET') return;
      e.preventDefault();
      cancelRoom();
    });
    return unsub;
  }, [room]);

  // ── Form: not yet attempted ──────────────────────────────────────────────────
  if (!started) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Host a Game</Text>
        <Text style={styles.subtitle}>Enter your name to create a room</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={COLORS.text2}
          value={name}
          onChangeText={setName}
          maxLength={20}
          autoFocus={!currentUser?.username}
        />
        <TouchableOpacity
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!name.trim()}
        >
          <Text style={styles.buttonText}>Create Room</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Timed out: no roomCreated after CREATE_TIMEOUT_MS ───────────────────────
  if (timedOut) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorTitle}>Could not reach server</Text>
        <Text style={styles.subtitle}>
          Check your connection and try again.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleRetry}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelLinkText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Waiting for roomCreated ──────────────────────────────────────────────────
  if (!room) {
    const statusText = isConnected ? 'Creating room…' : 'Connecting to server…';
    console.log('[HostLobby] Waiting —', statusText);

    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.subtitle}>{statusText}</Text>
        <TouchableOpacity style={styles.cancelLink} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Lobby: room exists, waiting for players ──────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>Room Code</Text>
      <Text style={styles.code}>{room.code}</Text>
      <Text style={styles.subtitle}>Share this code with your friends</Text>

      <Text style={styles.label}>Players ({room.players.length})</Text>
      <FlatList
        data={room.players}
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

      <TouchableOpacity
        style={[styles.button, room.players.length < 2 && styles.buttonDisabled]}
        onPress={() => navigation.navigate('GameSelect')}
        disabled={room.players.length < 2}
      >
        <Text style={styles.buttonText}>Start Game →</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.inviteFriendsBtn}
        onPress={() => setInviteVisible(true)}
      >
        <Text style={styles.inviteFriendsBtnText}>👥  Invite Friends</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelRoomBtn} onPress={handleCancel}>
        <Text style={styles.cancelRoomBtnText}>Cancel Room</Text>
      </TouchableOpacity>

      <FriendsInviteModal
        visible={inviteVisible}
        roomCode={room.code}
        onClose={() => setInviteVisible(false)}
      />
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
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.danger,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
    textAlign: 'center',
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
  inviteFriendsBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  inviteFriendsBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
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
  cancelLink: { marginTop: SPACING.lg, padding: SPACING.sm },
  cancelLinkText: { color: COLORS.text2, fontSize: 14, textDecorationLine: 'underline' },
  cancelRoomBtn: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  cancelRoomBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
});
