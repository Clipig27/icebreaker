/**
 * presence.ts
 *
 * App-level Supabase Realtime Presence.
 * This is intentionally separate from the Socket.io multiplayer room system.
 *
 * Tracks whether the authenticated user is currently active in the app.
 * On background/disconnect, writes a durable last_seen_at to public.users.
 *
 * Usage:
 *   startPresence(userId, username)  — call when app becomes active
 *   stopPresence(userId)             — call when app backgrounds or user leaves
 *   writeLastSeen(userId)            — called automatically by stopPresence
 *
 * Both startPresence and stopPresence are synchronous and idempotent.
 * Async work (subscribe, untrack, DB write) runs fire-and-forget internally.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Single shared presence channel for the whole app lifetime.
// Using a module-level variable gives us idempotency without any React state.
let channel: RealtimeChannel | null = null;

const CHANNEL_NAME = 'app:presence';

/**
 * Join the presence channel and track this user as online.
 * No-op if already subscribed — safe to call multiple times.
 */
export function startPresence(userId: string, username: string): void {
  if (channel) return; // Already subscribed

  channel = supabase.channel(CHANNEL_NAME, {
    config: { presence: { key: userId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      // Reserved for future use (e.g. friends-online count, lobby indicators).
      // Do not add polling or frequent reads here.
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel!.track({
          user_id: userId,
          username,
          online_at: new Date().toISOString(),
        });
      }
    });
}

/**
 * Leave the presence channel and write a durable last_seen_at timestamp.
 * No-op if not currently subscribed.
 *
 * Synchronous: sets channel to null immediately so startPresence can re-subscribe
 * without waiting. Async cleanup (untrack, removeChannel, DB write) runs in the
 * background and errors are swallowed — all non-critical.
 */
export function stopPresence(userId: string): void {
  if (!channel) return;

  const ch = channel;
  channel = null; // Immediately free so startPresence can create a new channel

  // Untrack user from the presence map, then remove the channel
  ch.untrack()
    .catch(() => {})
    .finally(() => supabase.removeChannel(ch).catch(() => {}));

  // Persist a durable timestamp even after presence drops
  writeLastSeen(userId).catch(() => {});
}

/**
 * Write last_seen_at to public.users for this user.
 * Called automatically by stopPresence.
 * Requires an active Supabase auth session and RLS UPDATE permission on own row.
 */
export async function writeLastSeen(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
  // Intentionally no error throw — callers treat this as best-effort
}
