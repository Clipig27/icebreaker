/**
 * notificationStorage.ts
 *
 * Read-side access to public.notifications.
 * Notifications are written exclusively by DB triggers on friend_requests.
 * This module only reads + marks as read.
 */
import { supabase } from '../lib/supabase';

export type NotificationType = 'friend_request' | 'friend_accepted';

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromUserId:   string | null;
  fromUsername: string | null;
  refId:        string | null; // friend_requests.id (for friend_request type)
  isRead:       boolean;
  createdAt:    string;
}

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

function rowToNotification(row: Record<string, any>): AppNotification {
  return {
    id:           row.id,
    type:         row.type,
    fromUserId:   row.from_user_id  ?? null,
    fromUsername: row.from_user?.username ?? null,
    refId:        row.ref_id ?? null,
    isRead:       row.is_read,
    createdAt:    row.created_at,
  };
}

/** Fetch the most recent `limit` notifications for the current user. */
export async function getNotifications(limit = 20): Promise<AppNotification[]> {
  const userId = await getCurrentUserId();
  console.log('[notif] getNotifications — userId:', userId);

  const { data, error } = await supabase
    .from('notifications')
    .select('*, from_user:from_user_id ( username )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  console.log('[notif] getNotifications — rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  if (data?.length) console.log('[notif] first row sample:', JSON.stringify(data[0]));

  if (error) throw error;
  return (data ?? []).map(rowToNotification);
}

/** Returns the count of unread notifications for the current user. */
export async function getUnreadCount(): Promise<number> {
  const userId = await getCurrentUserId();
  console.log('[notif] getUnreadCount — userId:', userId);

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  console.log('[notif] getUnreadCount — count:', count, 'error:', error?.message ?? null);

  if (error) throw error;
  return count ?? 0;
}

/** Mark every unread notification as read for the current user. */
export async function markAllAsRead(): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}
