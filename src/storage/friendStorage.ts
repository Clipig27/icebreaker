/**
 * friendStorage.ts
 *
 * Supabase-backed friend system for public.friend_requests and public.friends.
 * All operations are scoped to the currently authenticated user via auth.uid().
 */
import { supabase } from '../lib/supabase';

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  senderUsername: string;
  receiverUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friendUsername: string;
  friendAvatarUrl: string | null;
  friendTrophies: number;
  friendIsOnline: boolean;
  createdAt: string;
}

function rowToFriendRequest(row: Record<string, any>): FriendRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    senderUsername: row.sender?.username ?? '',
    receiverUsername: row.receiver?.username ?? '',
    status: row.status,
    createdAt: row.created_at,
  };
}

function rowToFriend(row: Record<string, any>): Friend {
  return {
    id: row.id,
    userId: row.user_id,
    friendId: row.friend_id,
    friendUsername: row.friend?.username ?? '',
    friendAvatarUrl: row.friend?.avatar_url ?? null,
    friendTrophies: row.friend?.trophies ?? 0,
    friendIsOnline: row.friend?.is_online ?? false,
    createdAt: row.created_at,
  };
}

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

/**
 * Send a friend request to a user by their username.
 * Looks up the target user's id, then inserts a pending request.
 * Throws if the username doesn't exist or a request already exists.
 */
export async function sendFriendRequest(username: string): Promise<FriendRequest> {
  const currentUserId = await getCurrentUserId();
  const normalized = username.trim().toLowerCase();

  const { data: target, error: lookupError } = await supabase
    .from('users')
    .select('id')
    .eq('username_lower', normalized)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!target) throw new Error(`User "${username}" not found`);
  if (target.id === currentUserId) throw new Error('Cannot send a friend request to yourself');

  const { data, error } = await supabase
    .from('friend_requests')
    .insert({ sender_id: currentUserId, receiver_id: target.id })
    .select(`
      *,
      sender:sender_id ( username ),
      receiver:receiver_id ( username )
    `)
    .single();

  if (error) throw error;
  return rowToFriendRequest(data);
}

/**
 * Fetch all pending friend requests received by the current user.
 * Includes the sender's username for display.
 */
export async function getIncomingRequests(): Promise<FriendRequest[]> {
  const currentUserId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('friend_requests')
    .select(`
      *,
      sender:sender_id ( username ),
      receiver:receiver_id ( username )
    `)
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToFriendRequest);
}

/**
 * Fetch all pending friend requests sent by the current user.
 * Includes the receiver's username for display.
 */
export async function getOutgoingRequests(): Promise<FriendRequest[]> {
  const currentUserId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('friend_requests')
    .select(`
      *,
      sender:sender_id ( username ),
      receiver:receiver_id ( username )
    `)
    .eq('sender_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToFriendRequest);
}

/**
 * Accept a pending friend request by its id.
 * The DB trigger automatically inserts both rows into public.friends.
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);

  if (error) throw error;
}

/**
 * Decline a pending friend request by its id.
 */
export async function declineFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'declined' })
    .eq('id', requestId);

  if (error) throw error;
}

/**
 * Fetch the current user's full friends list.
 * Joins into public.users to return the friend's username, avatar,
 * trophies, and online status.
 */
export async function getFriends(): Promise<Friend[]> {
  const currentUserId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('friends')
    .select(`
      *,
      friend:friend_id ( username, avatar_url, trophies, is_online )
    `)
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToFriend);
}

/**
 * Remove a friend by their user id.
 * The DB trigger handles deleting the reverse row and clearing the request.
 */
export async function unfriend(friendId: string): Promise<void> {
  const currentUserId = await getCurrentUserId();

  const { error } = await supabase
    .from('friends')
    .delete()
    .eq('user_id', currentUserId)
    .eq('friend_id', friendId);

  if (error) throw error;
}
