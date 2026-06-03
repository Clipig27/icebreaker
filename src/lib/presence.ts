/**
 * presence.ts
 *
 * App-level Supabase Realtime Presence.
 *
 * The channel is created on first call to startPresence and kept alive
 * for the entire app lifetime. Background/foreground transitions only
 * call track/untrack — never unsubscribe/resubscribe — which avoids the
 * "cannot add presence callbacks after subscribe()" error that occurs
 * when a new channel is created while the old one is still tearing down.
 */

import { supabase } from './supabase';

let channel: ReturnType<typeof supabase.channel> | null = null;
let isSubscribed = false;
// Buffered track call for when startPresence is called before subscribe completes.
let pendingTrack: { userId: string; username: string } | null = null;

const CHANNEL_NAME = 'app:presence';

/**
 * Track this user as online. Creates the channel on first call.
 * Safe to call multiple times (foreground transitions).
 */
export function startPresence(userId: string, username: string): void {
  // Write is_online = true to the users table so friends can see status
  supabase
    .from('users')
    .update({ is_online: true, last_seen_at: new Date().toISOString() })
    .eq('id', userId)
    .then(() => {});

  if (!channel) {
    // First call — create and subscribe the channel keyed by this user.
    channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => { /* reserved */ })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
          if (pendingTrack) {
            channel!.track({
              user_id: pendingTrack.userId,
              username: pendingTrack.username,
              online_at: new Date().toISOString(),
            }).catch((e) => console.warn('[presence]', e));
            pendingTrack = null;
          }
        }
      });

    // Buffer the track — will fire once SUBSCRIBED.
    pendingTrack = { userId, username };
    return;
  }

  // Channel already exists — just track (re-entering foreground).
  if (isSubscribed) {
    channel.track({
      user_id: userId,
      username,
      online_at: new Date().toISOString(),
    }).catch((e) => console.warn('[presence]', e));
  } else {
    pendingTrack = { userId, username };
  }
}

/**
 * Untrack this user (app backgrounded). Channel stays subscribed.
 */
export function stopPresence(userId: string): void {
  pendingTrack = null;
  if (channel && isSubscribed) {
    channel.untrack().catch((e) => console.warn('[presence]', e));
  }
  // Write is_online = false to the users table
  supabase
    .from('users')
    .update({ is_online: false, last_seen_at: new Date().toISOString() })
    .eq('id', userId)
    .then(() => {});
}

/**
 * Write last_seen_at to public.users for this user.
 */
export async function writeLastSeen(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}
