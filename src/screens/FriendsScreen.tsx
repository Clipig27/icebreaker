import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Platform,
  Animated,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import {
  sendFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  getFriends,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
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
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';
import { ErrorBanner } from '../components/ErrorBanner';
import { parseError } from '../utils/errorUtils';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Social'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type Tab = 'friends' | 'requests';

export default function FriendsScreen({ navigation }: Props) {
  const { room, currentUser } = useGame();

  const [tab, setTab]                       = useState<Tab>('friends');
  const [friends, setFriends]               = useState<Friend[]>([]);
  const [requests, setRequests]             = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing]             = useState<FriendRequest[]>([]);
  const [invites, setInvites]               = useState<GameInvite[]>([]);
  const [username, setUsername]             = useState('');
  const [sendError, setSendError]           = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [actionLoading, setActionLoading]   = useState<string | null>(null);

  // Tab indicator animation
  const tabAnim = useRef(new Animated.Value(0)).current;
  const switchTab = (t: Tab) => {
    setTab(t);
    Animated.spring(tabAnim, {
      toValue: t === 'friends' ? 0 : 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  // Success animation
  const successAnim = useRef(new Animated.Value(0)).current;
  const [successName, setSuccessName] = useState<string | null>(null);
  const playSuccessAnim = (name: string) => {
    setSuccessName(name);
    successAnim.setValue(0);
    Animated.sequence([
      Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }),
      Animated.delay(2500),
      Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSuccessName(null));
  };

  const load = useCallback(async () => {
    try {
      const [f, r, o, i] = await Promise.all([
        getFriends(),
        getIncomingRequests(),
        getOutgoingRequests(),
        getIncomingInvites(),
      ]);
      setFriends(f);
      setRequests(r);
      setOutgoing(o);
      setInvites(i);
    } catch (e: any) {
      // silently fail on background refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s so accepted/declined requests update live
  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setSendError(null);
    setActionLoading('send');
    try {
      await sendFriendRequest(trimmed);
      setUsername('');
      playSuccessAnim(trimmed);
      getOutgoingRequests().then(setOutgoing).catch(() => {});
    } catch (e: any) {
      const msg = (e as any)?.message ?? '';
      if (msg.toLowerCase().includes('not found')) {
        Alert.alert('User Not Found', `"${trimmed}" doesn't exist. Check the spelling and try again.`);
      } else if (msg.toLowerCase().includes('yourself')) {
        Alert.alert('Oops', "You can't send a friend request to yourself.");
      } else if (msg.toLowerCase().includes('pending') || msg.toLowerCase().includes('already') || msg.toLowerCase().includes('duplicate')) {
        Alert.alert('Already Sent', `You already have a pending request with "${trimmed}".`);
      } else {
        setSendError(parseError(e));
      }
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
      // no-op
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (req: FriendRequest) => {
    Alert.alert(
      'Decline Request',
      `Decline friend request from ${req.senderUsername}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(req.id + '_decline');
            try {
              await declineFriendRequest(req.id);
              setRequests(prev => prev.filter(r => r.id !== req.id));
            } catch (e: any) {
              // no-op
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleCancelOutgoing = async (req: FriendRequest) => {
    Alert.alert(
      'Cancel Request',
      `Cancel friend request to ${req.receiverUsername}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('cancel_' + req.id);
            try {
              await cancelFriendRequest(req.id);
              setOutgoing(prev => prev.filter(r => r.id !== req.id));
            } catch (e: any) {
              // no-op
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleUnfriend = async (friend: Friend) => {
    Alert.alert(
      'Remove Friend',
      `Remove ${friend.friendUsername} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('unfriend_' + friend.friendId);
            try {
              await unfriend(friend.friendId);
              setFriends(prev => prev.filter(f => f.friendId !== friend.friendId));
            } catch (e: any) {
              // no-op
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
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
      Alert.alert('Invite Sent', `Invite sent to ${friend.friendUsername}!`);
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

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const requestCount = requests.length + outgoing.length + invites.length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        <Pressable style={s.tabBtn} onPress={() => switchTab('friends')}>
          <Text style={[s.tabText, tab === 'friends' && s.tabTextActive]}>
            Friends{friends.length > 0 ? ` (${friends.length})` : ''}
          </Text>
        </Pressable>
        <Pressable style={s.tabBtn} onPress={() => switchTab('requests')}>
          <Text style={[s.tabText, tab === 'requests' && s.tabTextActive]}>
            Requests{requestCount > 0 ? ` (${requestCount})` : ''}
          </Text>
          {requestCount > 0 && (
            <View style={s.tabDot} />
          )}
        </Pressable>
        {/* Animated underline */}
        <Animated.View style={[s.tabIndicator, {
          transform: [{
            translateX: tabAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1], // placeholder, overridden by layout
            }),
          }],
          left: tab === 'friends' ? '0%' : '50%',
        }]} />
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
           FRIENDS TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'friends' && (
        <FlatList
          data={friends}
          keyExtractor={item => item.friendId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
          contentContainerStyle={s.content}
          ListHeaderComponent={
            <>
              {/* Active Room Banner */}
              {room?.code && (
                <View style={s.roomBanner}>
                  <View>
                    <Text style={s.roomBannerLabel}>ACTIVE ROOM</Text>
                    <Text style={s.roomBannerCode}>{room.code}</Text>
                  </View>
                  <Text style={s.roomBannerHint}>Tap Invite on any friend</Text>
                </View>
              )}

              {friends.length === 0 && (
                <View style={s.emptyWrap}>
                  <Ionicons name="people-outline" size={48} color={COLORS.text2} />
                  <Text style={s.emptyTitle}>No friends yet</Text>
                  <Text style={s.emptySubtitle}>Go to Requests to add someone!</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => switchTab('requests')}>
                    <Text style={s.emptyBtnText}>Add Friend</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <View style={s.friendRow}>
              <View style={s.friendLeft}>
                <View style={[s.avatarCircle, item.friendIsOnline && s.avatarOnline]}>
                  <Text style={s.avatarText}>{item.friendUsername[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.friendUsername}>{item.friendUsername}</Text>
                  <Text style={[s.friendStatus, { color: item.friendIsOnline ? COLORS.success : COLORS.text2 }]}>
                    {item.friendIsOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
              <View style={s.friendActions}>
                {item.friendIsOnline && (
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
                )}
                <TouchableOpacity
                  onPress={() => handleUnfriend(item)}
                  disabled={actionLoading === 'unfriend_' + item.friendId}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={22} color={COLORS.text2} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           REQUESTS TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'requests' && (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        >
          {/* ── Add Friend ── */}
          <Text style={s.sectionTitle}>ADD FRIEND</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Enter username..."
              placeholderTextColor={COLORS.text2}
              maxLength={20}
              value={username}
              onChangeText={text => {
                setUsername(text);
                setSendError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              keyboardAppearance="dark"
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
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
          {sendError && (
            <ErrorBanner
              message={sendError}
              onDismiss={() => setSendError(null)}
              autoDismiss
            />
          )}
          {successName && (
            <Animated.View style={[s.successBanner, {
              opacity: successAnim,
              transform: [{
                translateY: successAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
              }, {
                scale: successAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.95, 1.05, 1] }),
              }],
            }]}>
              <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
              <Text style={s.successText}>Request sent to {successName}!</Text>
            </Animated.View>
          )}

          {/* ── Incoming Requests ── */}
          {requests.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: SPACING.xl }]}>
                RECEIVED <Text style={s.badge}>{requests.length}</Text>
              </Text>
              {requests.map(req => (
                <View key={req.id} style={s.requestRow}>
                  <View style={s.requestLeft}>
                    <View style={s.avatarCircle}>
                      <Text style={s.avatarText}>{req.senderUsername[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={s.reqUsername}>{req.senderUsername}</Text>
                  </View>
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

          {/* ── Outgoing Requests ── */}
          {outgoing.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: SPACING.xl }]}>
                SENT <Text style={s.badge}>{outgoing.length}</Text>
              </Text>
              {outgoing.map(req => (
                <View key={req.id} style={s.requestRow}>
                  <View style={s.requestLeft}>
                    <View style={s.avatarCircle}>
                      <Text style={s.avatarText}>{req.receiverUsername[0]?.toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={s.reqUsername}>{req.receiverUsername}</Text>
                      <View style={s.pendingBadge}>
                        <Text style={s.pendingBadgeText}>PENDING</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleCancelOutgoing(req)}
                    disabled={actionLoading === 'cancel_' + req.id}
                    hitSlop={8}
                    style={s.cancelBtn}
                  >
                    {actionLoading === 'cancel_' + req.id
                      ? <ActivityIndicator size="small" color={COLORS.danger} />
                      : <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                    }
                  </TouchableOpacity>
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

          {/* ── Empty state ── */}
          {requests.length === 0 && outgoing.length === 0 && invites.length === 0 && !successName && (
            <View style={[s.emptyWrap, { marginTop: SPACING.xl }]}>
              <Ionicons name="mail-outline" size={40} color={COLORS.text2} />
              <Text style={s.emptySubtitle}>No pending requests</Text>
            </View>
          )}
        </ScrollView>
      )}

      <KeyboardDoneBar />
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
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text2,
  },
  tabTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: '50%',
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
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
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  reqUsername: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
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
  cancelBtn: {
    padding: 4,
  },
  inviteCode: {
    color: COLORS.text2,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // Avatar
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface2 ?? COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarOnline: {
    borderColor: COLORS.success,
    borderWidth: 2,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
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
    paddingVertical: 12,
    marginBottom: SPACING.sm,
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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

  // Empty states
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    color: COLORS.text2,
    fontSize: 14,
  },
  emptyBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Room banner
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
    marginBottom: SPACING.md,
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

  // Badges & banners
  pendingBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  pendingBadgeText: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.30)',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: SPACING.sm,
  },
  successText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
