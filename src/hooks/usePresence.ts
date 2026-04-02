/**
 * usePresence.ts
 *
 * React hook that manages app-level Supabase Presence for the current user.
 *
 * - Starts tracking when the user is active (mounted with a valid currentUser).
 * - Stops tracking and writes last_seen_at when the app backgrounds.
 * - Restarts tracking when the app returns to the foreground.
 * - Cleans up on unmount (e.g. sign-out).
 *
 * Called once from GameProvider, which has the correct lifecycle (app lifetime).
 * Do not call this in individual game screens.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { startPresence, stopPresence } from '../lib/presence';
import type { LocalUser } from '../storage/userStorage';

export function usePresence(currentUser: LocalUser | null): void {
  // Keep a ref so the AppState handler always sees the latest user
  // without needing to be recreated on every render.
  const userRef = useRef<LocalUser | null>(currentUser);
  userRef.current = currentUser;

  useEffect(() => {
    // No user yet (onboarding not complete) — do nothing
    if (!currentUser) return;

    // Capture the ID at the time this effect started.
    // Used in cleanup so we stop the right user even if currentUser has since changed.
    const userId = currentUser.id;
    const username = currentUser.username;

    // App is in the foreground when this effect runs
    startPresence(userId, username);

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const user = userRef.current;
      if (!user) return;

      if (nextState === 'active') {
        startPresence(user.id, user.username);
      } else {
        // 'background' or 'inactive' (e.g. notification tray, app switcher)
        stopPresence(user.id);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      // Stop presence on unmount or when the user ID changes (sign-out / account switch)
      stopPresence(userId);
    };
  }, [currentUser?.id]); // Only re-run if the auth identity changes
}
