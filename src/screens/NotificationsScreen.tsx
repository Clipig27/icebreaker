import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import {
  getNotifications,
  markAllAsRead,
  type AppNotification,
} from '../storage/notificationStorage';
import { acceptFriendRequest, declineFriendRequest } from '../storage/friendStorage';
import { useNotifications } from '../context/NotificationsContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min  < 1)  return 'just now';
  if (min  < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function notificationMessage(n: AppNotification): string {
  const name = n.fromUsername ?? 'Someone';
  if (n.type === 'friend_request')  return `${name} sent you a friend request`;
  if (n.type === 'friend_accepted') return `${name} accepted your friend request`;
  return 'New notification';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { refreshUnreadCount } = useNotifications();

  const [items, setItems]             = useState<AppNotification[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Locally track notifications whose friend_request has been acted on
  const [processed, setProcessed]     = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await getNotifications(20);
      setItems(data);
    } catch (err: any) {
      console.warn('[NotificationsScreen] load failed:', err?.message ?? err);
    }
  }, []);

  // On focus: load items, mark all read, refresh bell badge
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([
        load(),
        markAllAsRead().catch(() => {}),
      ])
        .finally(() => {
          setLoading(false);
          refreshUnreadCount();
        });
    }, [load, refreshUnreadCount])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleAccept = async (item: AppNotification) => {
    if (!item.refId) return;
    const key = 'accept_' + item.id;
    setActionLoading(key);
    try {
      await acceptFriendRequest(item.refId);
    } catch {
      // Request may already be processed from FriendsScreen — treat as OK
    } finally {
      setProcessed(prev => new Set(prev).add(item.id));
      setActionLoading(null);
    }
  };

  const handleDecline = async (item: AppNotification) => {
    if (!item.refId) return;
    const key = 'decline_' + item.id;
    setActionLoading(key);
    try {
      await declineFriendRequest(item.refId);
    } catch {
      // Already processed — still mark locally so buttons disappear
    } finally {
      setProcessed(prev => new Set(prev).add(item.id));
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={s.content}
        ListEmptyComponent={<Text style={s.empty}>No notifications yet.</Text>}
        renderItem={({ item }) => {
          const isProcessed = processed.has(item.id);
          const acceptKey   = 'accept_'  + item.id;
          const declineKey  = 'decline_' + item.id;
          const showActions = item.type === 'friend_request' && !!item.refId && !isProcessed;

          return (
            <View style={[s.item, item.isRead && s.itemRead]}>
              <View style={s.itemBody}>
                <Text style={s.message}>{notificationMessage(item)}</Text>
                <Text style={s.time}>{relativeTime(item.createdAt)}</Text>
              </View>

              {showActions && (
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.acceptBtn, actionLoading === acceptKey && s.btnDisabled]}
                    onPress={() => handleAccept(item)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === acceptKey
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.acceptBtnText}>Accept</Text>
                    }
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.declineBtn, actionLoading === declineKey && s.btnDisabled]}
                    onPress={() => handleDecline(item)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === declineKey
                      ? <ActivityIndicator size="small" color={COLORS.text2} />
                      : <Text style={s.declineBtnText}>Decline</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}

              {item.type === 'friend_request' && isProcessed && (
                <Text style={s.processedLabel}>Done ✓</Text>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.md,
    paddingBottom:     SPACING.xl,
  },
  empty: {
    color:      COLORS.text2,
    fontSize:   15,
    textAlign:  'center',
    marginTop:  SPACING.xxl,
  },

  // Notification item — highlighted border when unread
  item: {
    backgroundColor:   COLORS.surface,
    borderWidth:       1,
    borderColor:       COLORS.accent + '66', // accent-tinted border = unread indicator
    borderRadius:      RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.md,
    marginBottom:      SPACING.sm,
  },
  itemRead: {
    borderColor: COLORS.border, // muted border once read
  },
  itemBody: {
    marginBottom: SPACING.sm,
  },
  message: {
    color:      COLORS.text,
    fontSize:   15,
    fontWeight: '600',
    lineHeight: 21,
  },
  time: {
    color:      COLORS.text2,
    fontSize:   12,
    marginTop:  4,
    fontWeight: '500',
  },

  // Accept / Decline buttons
  actions: {
    flexDirection: 'row',
    gap:           SPACING.sm,
  },
  acceptBtn: {
    backgroundColor:   COLORS.accent,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: 16,
    paddingVertical:   8,
    minWidth:          72,
    alignItems:        'center',
  },
  acceptBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   13,
  },
  declineBtn: {
    borderWidth:       1,
    borderColor:       COLORS.borderHi,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: 16,
    paddingVertical:   8,
    minWidth:          72,
    alignItems:        'center',
  },
  declineBtnText: {
    color:      COLORS.text2,
    fontWeight: '600',
    fontSize:   13,
  },
  btnDisabled: { opacity: 0.5 },

  processedLabel: {
    color:      COLORS.success,
    fontSize:   13,
    fontWeight: '700',
  },
});
