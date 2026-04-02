/**
 * userStorage.ts
 *
 * Supabase-backed user profile storage for public.users.
 * Supabase auth session is persisted by the Supabase client itself.
 *
 * Legacy AsyncStorage user data is ignored on reads so stale local-only
 * usernames cannot bypass real profile checks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const LEGACY_USER_KEY = '@icebreaker:user_v1';

export interface LocalUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  trophies: number;
  wins: number;
  gamesPlayed: number;
  isPro: boolean;
}

export function makeUser(username: string, id = ''): LocalUser {
  const now = new Date().toISOString();

  return {
    id,
    username: username.trim(),
    avatarUrl: null,
    createdAt: now,
    updatedAt: now,
    trophies: 0,
    wins: 0,
    gamesPlayed: 0,
    isPro: false,
  };
}

function rowToUser(row: Record<string, any>): LocalUser {
  return {
    id: row.id ?? '',
    username: row.username ?? '',
    avatarUrl: row.avatar_url ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    trophies: row.trophies ?? 0,
    wins: row.wins ?? 0,
    gamesPlayed: row.games_played ?? 0,
    isPro: row.is_pro ?? false,
  };
}

export async function getProfileById(userId: string): Promise<LocalUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.username) return null;

  return rowToUser(data);
}

export async function checkUsernameAvailable(
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  const normalized = username.trim().toLowerCase();

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('username_lower', normalized);

  if (error) throw error;

  if (!data || data.length === 0) return true;

  if (excludeUserId) {
    return data.every((row) => row.id === excludeUserId);
  }

  return false;
}

export async function upsertProfile(userId: string, username: string): Promise<LocalUser> {
  const trimmed = username.trim();

  const payload = {
    id: userId,
    username: trimmed,
    username_lower: trimmed.toLowerCase(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;

  return rowToUser(data);
}

export async function getStoredUser(): Promise<LocalUser | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  return getProfileById(session.user.id);
}

export async function saveUser(user: LocalUser): Promise<void> {
  if (!user.id) {
    throw new Error('Cannot save user without an id');
  }

  await upsertProfile(user.id, user.username);
}

export async function patchUser(patch: Partial<LocalUser>): Promise<LocalUser | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.username !== undefined) {
    const trimmed = patch.username.trim();
    updates.username = trimmed;
    updates.username_lower = trimmed.toLowerCase();
  }

  if (patch.avatarUrl !== undefined) updates.avatar_url = patch.avatarUrl;
  if (patch.trophies !== undefined) updates.trophies = patch.trophies;
  if (patch.wins !== undefined) updates.wins = patch.wins;
  if (patch.gamesPlayed !== undefined) updates.games_played = patch.gamesPlayed;
  if (patch.isPro !== undefined) updates.is_pro = patch.isPro;

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', session.user.id)
    .select()
    .single();

  if (error) throw error;

  return rowToUser(data);
}

export async function clearUser(): Promise<void> {
  await supabase.auth.signOut();
  await AsyncStorage.removeItem(LEGACY_USER_KEY).catch(() => {});
}