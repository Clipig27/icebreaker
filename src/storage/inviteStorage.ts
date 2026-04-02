/**
 * inviteStorage.ts
 *
 * Supabase-backed game invite system for public.game_invites.
 * Invites let an in-room user pull an online friend directly into their room.
 */
import { supabase } from '../lib/supabase';

export interface GameInvite {
  id: string;
  senderId: string;
  receiverId: string;
  senderUsername: string;
  roomCode: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
}

function rowToInvite(row: Record<string, any>): GameInvite {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    senderUsername: row.sender?.username ?? '',
    roomCode: row.room_code,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

/**
 * Send a game invite to a friend.
 * Throws if a pending invite for the same sender/receiver/room already exists.
 */
export async function sendGameInvite(
  receiverId: string,
  roomCode: string,
): Promise<GameInvite> {
  const currentUserId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('game_invites')
    .insert({ sender_id: currentUserId, receiver_id: receiverId, room_code: roomCode })
    .select(`*, sender:sender_id ( username )`)
    .single();

  if (error) throw error;
  return rowToInvite(data);
}

/**
 * Fetch all pending game invites received by the current user.
 * Includes sender username for display.
 */
export async function getIncomingInvites(): Promise<GameInvite[]> {
  const currentUserId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('game_invites')
    .select(`*, sender:sender_id ( username )`)
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToInvite);
}

/**
 * Accept a game invite. The caller is responsible for then joining the room.
 */
export async function acceptInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('game_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteId);

  if (error) throw error;
}

/**
 * Decline a game invite.
 */
export async function declineInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('game_invites')
    .update({ status: 'declined' })
    .eq('id', inviteId);

  if (error) throw error;
}
