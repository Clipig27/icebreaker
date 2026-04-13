/**
 * FriendsInviteModal
 *
 * Shows an in-place modal with the user's friends list.
 * Pressing "Invite" on a friend sends them a game invite via Supabase.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { getFriends, type Friend } from '../storage/friendStorage';
import { sendGameInvite } from '../storage/inviteStorage';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type Props = {
  visible: boolean;
  roomCode: string;
  onClose: () => void;
};

export default function FriendsInviteModal({ visible, roomCode, onClose }: Props) {
  const [friends, setFriends]       = useState<Friend[]>([]);
  const [loading, setLoading]       = useState(true);
  const [sent, setSent]             = useState<Record<string, boolean>>({});
  const [inviting, setInviting]     = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSent({});
    getFriends()
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const handleInvite = async (friend: Friend) => {
    setInviting(friend.friendId);
    try {
      await sendGameInvite(friend.friendId, roomCode);
      setSent(prev => ({ ...prev, [friend.friendId]: true }));
    } catch {
      // silently ignore — duplicate invite or network error
      setSent(prev => ({ ...prev, [friend.friendId]: true }));
    } finally {
      setInviting(null);
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>Invite Friends</Text>
          <Text style={s.subtitle}>Room code: <Text style={s.code}>{roomCode}</Text></Text>

          {loading ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 32 }} />
          ) : friends.length === 0 ? (
            <Text style={s.empty}>No friends yet. Add some from the Social tab!</Text>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={f => f.friendId}
              style={s.list}
              renderItem={({ item }) => {
                const isSent    = sent[item.friendId];
                const isBusy    = inviting === item.friendId;
                return (
                  <View style={s.row}>
                    <View style={s.rowLeft}>
                      <View style={[s.dot, item.friendIsOnline && s.dotOnline]} />
                      <Text style={s.friendName}>{item.friendUsername}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.inviteBtn, isSent && s.inviteBtnSent]}
                      onPress={() => !isSent && handleInvite(item)}
                      disabled={isSent || isBusy}
                    >
                      {isBusy
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={[s.inviteBtnText, isSent && s.inviteBtnTextSent]}>
                            {isSent ? 'Sent ✓' : 'Invite'}
                          </Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text2,
    marginBottom: SPACING.md,
  },
  code: {
    color: COLORS.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  list: {
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginRight: 10,
  },
  dotOnline: {
    backgroundColor: '#4ade80',
  },
  friendName: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
  },
  inviteBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 72,
    alignItems: 'center',
  },
  inviteBtnSent: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  inviteBtnTextSent: {
    color: COLORS.text2,
  },
  empty: {
    color: COLORS.text2,
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 16,
    fontSize: 14,
  },
  closeBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
