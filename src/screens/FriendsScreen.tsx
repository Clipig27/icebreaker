import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import {
  sendFriendRequest,
  getIncomingRequests,
  getFriends,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  type FriendRequest,
  type Friend,
} from '../storage/friendStorage';
import {
  sendGameInvite,
  getIncomingInvites,
  acceptInvite,
  declineInvite,
  type GameInvite,
} from '../storage/inviteStorage';
import { useGame } from '../context/GameContext';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Social'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

export default function FriendsScreen({ navigation }: Props) {
  const { room, currentUser } = useGame();

  const [friends, setFriends]               = useState<Friend[]>([]);
  const [requests, setRequests]             = useState<FriendRequest[]>([]);
  const [invites, setInvites]               = useState<GameInvite[]>([]);
  const [username, setUsername]             = useState('');
  const [sendStatus, setSendStatus]         = useState<string | null>(null);
  const [sendError, setSendError]           = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [actionLoading, setActionLoading]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, r, i] = await Promise.all([
        getFriends(),
        getIncomingRequests(),
        getIncomingInvites(),
      ]);
      setFriends(f);
      setRequests(r);
      setInvites(i);
    } catch (e: any) {
      // silently fail on background refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleSend = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setSendStatus(null);
    setSendError(null);
    setActionLoading('send');
    try {
      await sendFriendRequest(trimmed);
      setSendStatus(`Request sent to ${trimmed}`);
      setUsername('');
    } catch (e: any) {
      setSendError(e.message ?? 'Failed to send request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (req: FriendRequest) => {
    setActionLoading(req.id);
    try {
      await acceptFriendRequest(req.id);
      await load();
    } catch (e: any) {
      // no-op, list will stay as-is
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (req: FriendRequest) => {
    setActionLoading(req.id + '_decline');
    try {
      await declineFriendRequest(req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e: any) {
      // no-op
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnfriend = async (friend: Friend) => {
    setActionLoading('unfriend_' + friend.friendId);
    try {
      await unfriend(friend.friendId);
      setFriends(prev => prev.filter(f => f.friendId !== friend.friendId));
    } catch (e: any) {
      // no-op
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendInvite = async (friend: Friend) => {
    if (!room?.code) {
      Alert.alert(
        'No Active Room',
        'Create a game room first, then invite your friends.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Room', onPress: () => navigation.navigate('HostLobby') },
        ]
      );
      return;
    }
    setActionLoading('invite_' + friend.friendId);
    try {
      await sendGameInvite(friend.friendId, room.code);
      Alert.alert('Invite Sent', `Invite sent to ${friend.friendUsername} ✓`);
    } catch (e: any) {
      // duplicate invite — silently ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptInvite = async (invite: GameInvite) => {
    setActionLoading('inv_accept_' + invite.id);
    try {
      await acceptInvite(invite.id);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
      navigation.navigate('JoinRoom', { roomCode: invite.roomCode });
    } catch (e: any) {
      // no-op
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineInvite = async (invite: GameInvite) => {
    setActionLoading('inv_decline_' + invite.id);
    try {
      await declineInvite(invite.id);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (e: any) {
      // no-op
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={friends}
        keyExtractor={item => item.friendId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            {/* ── Add Friend ── */}
            <Text style={s.sectionTitle}>ADD FRIEND</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="Enter username..."
                placeholderTextColor={COLORS.text2}
                value={username}
                onChangeText={text => {
                  setUsername(text);
                  setSendStatus(null);
                  setSendError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!username.trim() || actionLoading === 'send') && s.btnDisabled]}
                onPress={handleSend}
                disabled={!username.trim() || actionLoading === 'send'}
              >
                {actionLoading === 'send'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.sendBtnText}>Send</Text>
                }
              </TouchableOpacity>
            </View>
            {sendError && <Text style={s.statusError}>{sendError}</Text>}

            {/* ── Incoming Requests ── */}
            {requests.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { marginTop: SPACING.xl }]}>
                  REQUESTS <Text style={s.badge}>{requests.length}</Text>
                </Text>
                {requests.map(req => (
                  <View key={req.id} style={s.requestRow}>
                    <Text style={s.reqUsername}>{req.senderUsername}</Text>
                    <View style={s.requestActions}>
                      <TouchableOpacity
                        style={[s.acceptBtn, actionLoading === req.id && s.btnDisabled]}
                        onPress={() => handleAccept(req)}
                        disabled={actionLoading === req.id}
                      >
                        {actionLoading === req.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.acceptBtnText}>Accept</Text>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.declineBtn, actionLoading === req.id + '_decline' && s.btnDisabled]}
                        onPress={() => handleDecline(req)}
                        disabled={actionLoading === req.id + '_decline'}
                      >
                        {actionLoading === req.id + '_decline'
                          ? <ActivityIndicator size="small" color={COLORS.text2} />
                          : <Text style={s.declineBtnText}>Decline</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* ── Game Invites ── */}
            {invites.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { marginTop: SPACING.xl }]}>
                  GAME INVITES <Text style={s.badge}>{invites.length}</Text>
                </Text>
                {invites.map(inv => (
                  <View key={inv.id} style={s.requestRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reqUsername}>{inv.senderUsername}</Text>
                      <Text style={s.inviteCode}>Room: {inv.roomCode}</Text>
                    </View>
                    <View style={s.requestActions}>
                      <TouchableOpacity
                        style={[s.acceptBtn, actionLoading === 'inv_accept_' + inv.id && s.btnDisabled]}
                        onPress={() => handleAcceptInvite(inv)}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === 'inv_accept_' + inv.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.acceptBtnText}>Join</Text>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.declineBtn, actionLoading === 'inv_decline_' + inv.id && s.btnDisabled]}
                        onPress={() => handleDeclineInvite(inv)}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === 'inv_decline_' + inv.id
                          ? <ActivityIndicator size="small" color={COLORS.text2} />
                          : <Text style={s.declineBtnText}>Decline</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* ── Active Room Banner ── */}
            {room?.code && (
              <View style={s.roomBanner}>
                <View>
                  <Text style={s.roomBannerLabel}>ACTIVE ROOM</Text>
                  <Text style={s.roomBannerCode}>{room.code}</Text>
                </View>
                <Text style={s.roomBannerHint}>Tap Invite on any friend →</Text>
              </View>
            )}

            {/* ── Friends header ── */}
            <Text style={[s.sectionTitle, { marginTop: SPACING.xl }]}>
              FRIENDS <Text style={s.badge}>{friends.length}</Text>
            </Text>
            {friends.length === 0 && (
              <Text style={s.empty}>No friends yet. Add someone above.</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={s.friendRow}>
            <View style={s.friendLeft}>
              <View style={[s.onlineDot, { backgroundColor: item.friendIsOnline ? COLORS.success : COLORS.border }]} />
              <View>
                <Text style={s.friendUsername}>{item.friendUsername}</Text>
                <Text style={[s.friendStatus, { color: item.friendIsOnline ? COLORS.success : COLORS.text2 }]}>
                  {item.friendIsOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            <View style={s.friendActions}>
              {item.friendIsOnline ? (
                <TouchableOpacity
                  style={[s.inviteBtn, actionLoading === 'invite_' + item.friendId && s.btnDisabled]}
                  onPress={() => handleSendInvite(item)}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'invite_' + item.friendId
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.inviteBtnText}>Invite</Text>
                  }
                </TouchableOpacity>
              ) : (
                <View style={s.offlineBadge}>
                  <Text style={s.offlineBadgeText}>Offline</Text>
                </View>
              )}
              <TouchableOpacity
                style={[s.unfriendBtn, actionLoading === 'unfriend_' + item.friendId && s.btnDisabled]}
                onPress={() => handleUnfriend(item)}
                disabled={actionLoading === 'unfriend_' + item.friendId}
              >
                <Text style={s.unfriendText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },

  // Section titles
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.text2,
    marginBottom: SPACING.sm,
  },
  badge: {
    color: COLORS.accent,
    fontSize: 11,
  },

  // Add friend input
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  statusSuccess: {
    marginTop: SPACING.sm,
    color: COLORS.success,
    fontSize: 13,
    fontWeight: '600',
  },
  statusError: {
    marginTop: SPACING.sm,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
  },

  // Requests
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    marginBottom: SPACING.sm,
  },
  reqUsername: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  acceptBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  declineBtn: {
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  declineBtnText: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 13,
  },

  inviteCode: {
    color: COLORS.text2,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // Friends list
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    marginBottom: SPACING.sm,
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  friendUsername: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  friendStatus: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  offlineBadge: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  offlineBadgeText: {
    color: COLORS.text2,
    fontSize: 11,
    fontWeight: '600',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inviteBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: 'center',
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  unfriendBtn: {
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unfriendText: {
    color: COLORS.text2,
    fontSize: 12,
    fontWeight: '600',
  },

  empty: {
    color: COLORS.text2,
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  roomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    marginTop: SPACING.xl,
  },
  roomBannerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 2,
  },
  roomBannerCode: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 3,
  },
  roomBannerHint: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
