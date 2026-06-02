/**
 * InviteModal
 *
 * Global overlay that listens for incoming game invites via Supabase realtime.
 * When an invite arrives, a centered modal appears with Accept / Decline.
 * Rendered once in App.tsx so it works on every screen.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { supabase } from '../lib/supabase';
import {
  acceptInvite,
  declineInvite,
  getIncomingInvites,
  type GameInvite,
} from '../storage/inviteStorage';
import { COLORS, FONTS, RADIUS, SPACING, SHADOWS } from '../constants/theme';
import { navigationRef } from '../navigation/navigationRef';

type Props = {
  userId: string | null;
};

export default function InviteModal({ userId }: Props) {
  const [invite, setInvite] = useState<GameInvite | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`invite_listener_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_invites',
          filter: `receiver_id=eq.${userId}`,
        },
        async () => {
          try {
            const invites = await getIncomingInvites();
            if (invites.length > 0) setInvite(invites[0]);
          } catch {}
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const handleAccept = async () => {
    if (!invite) return;
    setLoading(true);
    try {
      await acceptInvite(invite.id);
      setInvite(null);
      if (navigationRef.isReady()) {
        navigationRef.navigate('JoinRoom', { roomCode: invite.roomCode });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!invite) return;
    try {
      await declineInvite(invite.id);
    } catch {}
    setInvite(null);
  };

  if (!invite) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <BlurView intensity={40} tint="dark" style={s.overlay}>
        <View style={s.card}>
          <Text style={s.emoji}>🎮</Text>
          <Text style={s.title}>Game Invite</Text>
          <Text style={s.from}>
            <Text style={s.fromName}>{invite.senderUsername}</Text>
            {' '}wants you to join their room
          </Text>
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>ROOM</Text>
            <Text style={s.codeText}>{invite.roomCode}</Text>
          </View>
          <TouchableOpacity
            style={[s.acceptBtn, loading && s.disabled]}
            onPress={handleAccept}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.acceptText}>Join Game →</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.declineBtn} onPress={handleDecline} disabled={loading}>
            <Text style={s.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.xl ?? 20,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 246, 0.35)',
    padding: 28,
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.modal,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.3,
  },
  emoji: { fontSize: 48 },
  title: {
    fontSize: 24,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  from: {
    fontSize: 16,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 22,
  },
  fromName: {
    color: COLORS.text,
    fontFamily: FONTS.extrabold,
  },
  codeBox: {
    backgroundColor: COLORS.surface2 ?? COLORS.bg,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginVertical: 4,
  },
  codeLabel: {
    fontSize: 10,
    fontFamily: FONTS.extrabold,
    letterSpacing: 2,
    color: COLORS.text2,
    marginBottom: 2,
  },
  codeText: {
    fontSize: 32,
    fontFamily: FONTS.extrabold,
    color: COLORS.accent,
    letterSpacing: 6,
  },
  acceptBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  acceptText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONTS.extrabold,
  },
  declineBtn: {
    paddingVertical: 10,
  },
  declineText: {
    color: COLORS.text2,
    fontSize: 14,
    fontFamily: FONTS.semibold,
  },
  disabled: { opacity: 0.5 },
});
