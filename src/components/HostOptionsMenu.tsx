import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Dimensions,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import { useGame } from '../context/GameContext';

const { width: SW, height: SH } = Dimensions.get('window');

// Menu max height is ~1/5 of screen
const MENU_MAX_H = Math.round(SH / 5);
const MENU_W     = 210;

type Props = {
  onInvite?: () => void;
};

export default function HostOptionsMenu({ onInvite }: Props) {
  const { room, kickPlayer, endGame, restartGame, cancelRoom } = useGame();
  const [open, setOpen] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 4 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 130, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -8, duration: 130, useNativeDriver: true }),
      ]).start();
    }
  }, [open]);

  if (!room) return null;

  function handleKick(playerId: string, name: string) {
    Alert.alert(`Kick ${name}?`, 'They will be removed from the room.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick', style: 'destructive', onPress: () => kickPlayer(playerId) },
    ]);
  }

  function handleEndGame() {
    Alert.alert('End Game?', 'Everyone stays in the room. You\'ll pick a new game.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Game', onPress: () => { setOpen(false); endGame(); } },
    ]);
  }

  function handleRestart() {
    Alert.alert('Restart Game?', 'Scores reset and the game starts over.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restart', onPress: () => { setOpen(false); restartGame(); } },
    ]);
  }

  function handleCloseRoom() {
    Alert.alert('Close Room?', 'Everyone will be sent back to the home screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close Room', style: 'destructive', onPress: () => { setOpen(false); cancelRoom(); } },
    ]);
  }

  // Non-host players = everyone except host
  const nonHostPlayers = room.players.filter(p => p.id !== room.hostId);

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity
        style={s.trigger}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.triggerText}>HOST  ▾</Text>
      </TouchableOpacity>

      {/* Dropdown via Modal so it overlays everything */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        {/* Backdrop — tap to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />

        <Animated.View
          style={[
            s.menu,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
          pointerEvents="box-none"
        >
          {/* Room code */}
          <View style={s.codeRow}>
            <Text style={s.codeLabel}>ROOM CODE</Text>
            <Text style={s.code}>{room.code}</Text>
          </View>

          <View style={s.divider} />

          {/* Player list */}
          <Text style={s.sectionLabel}>IN ROOM</Text>
          <ScrollView
            style={{ maxHeight: MENU_MAX_H * 0.5 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Host row (no kick) */}
            <View style={s.playerRow}>
              <View style={s.hostBadge}>
                <Text style={s.hostBadgeText}>HOST</Text>
              </View>
              <Text style={s.playerName} numberOfLines={1}>
                {room.players.find(p => p.id === room.hostId)?.name ?? 'You'}
              </Text>
            </View>
            {nonHostPlayers.map(p => (
              <View key={p.id} style={s.playerRow}>
                <TouchableOpacity
                  style={s.kickBtn}
                  onPress={() => handleKick(p.id, p.name)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={s.kickText}>✕</Text>
                </TouchableOpacity>
                <Text style={s.playerName} numberOfLines={1}>{p.name}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={s.divider} />

          {/* Actions */}
          {onInvite && (
            <TouchableOpacity style={s.action} onPress={() => { setOpen(false); onInvite(); }}>
              <Text style={s.actionIcon}>👥</Text>
              <Text style={s.actionText}>Invite Friends</Text>
            </TouchableOpacity>
          )}

          {room.phase === 'playing' && (
            <>
              <TouchableOpacity style={s.action} onPress={handleEndGame}>
                <Text style={s.actionIcon}>🎮</Text>
                <Text style={s.actionText}>Pick New Game</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.action} onPress={handleRestart}>
                <Text style={s.actionIcon}>🔄</Text>
                <Text style={s.actionText}>Restart Game</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={[s.action, s.dangerAction]} onPress={handleCloseRoom}>
            <Text style={s.actionIcon}>🚪</Text>
            <Text style={[s.actionText, s.dangerText]}>Close Room</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: {
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  triggerText: {
    color: COLORS.accentHi,
    fontSize: 11,
    fontFamily: FONTS.extrabold,
    letterSpacing: 1.5,
  },

  // Dropdown
  menu: {
    position: 'absolute',
    top: 88,         // below the header (~56px) + safe area
    right: 12,
    width: MENU_W,
    backgroundColor: '#1A1A24',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    shadowOpacity: 0.7,
    elevation: 20,
  },

  codeRow: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 2,
  },
  codeLabel: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  code: {
    fontSize: 20,
    fontFamily: FONTS.extrabold,
    color: COLORS.accentHi,
    letterSpacing: 4,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 10,
    marginVertical: 6,
  },

  sectionLabel: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    marginBottom: 4,
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    gap: 8,
  },
  hostBadge: {
    backgroundColor: COLORS.accent + '33',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hostBadgeText: {
    fontSize: 8,
    fontFamily: FONTS.extrabold,
    color: COLORS.accentHi,
    letterSpacing: 0.5,
  },
  kickBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.danger + '22',
    borderWidth: 1,
    borderColor: COLORS.danger + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickText: {
    color: COLORS.danger,
    fontSize: 9,
    fontFamily: FONTS.extrabold,
    lineHeight: 12,
  },
  playerName: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  dangerAction: {
    marginTop: 2,
  },
  actionIcon: { fontSize: 14 },
  actionText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
