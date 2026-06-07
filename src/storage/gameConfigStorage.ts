import { supabase } from '../lib/supabase';

export interface GameConfig {
  game_id: string;
  enabled: boolean;
}

const ALL_GAMES = [
  'lieDetector', 'talentShow', 'standOut', 'numberGuessor',
  'pieCharts', 'dealOrSteal', 'shadowProtocol', 'potLuck',
  'chainLink', 'plotTwist', 'blindRanking', 'confessBet',
];

/** Fetch which games are enabled. Returns a Set of enabled game IDs.
 *  Games not in the DB are treated as enabled by default. */
export async function fetchEnabledGames(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('game_config')
    .select('game_id, enabled');

  if (error) {
    console.error('[gameConfig] fetch failed:', error.message);
    return new Set(ALL_GAMES);
  }

  const rows = data as GameConfig[];
  const knownIds = new Set(rows.map(r => r.game_id));
  const enabled = new Set(rows.filter(g => g.enabled).map(g => g.game_id));

  // Games not in the DB yet are enabled by default
  for (const id of ALL_GAMES) {
    if (!knownIds.has(id)) enabled.add(id);
  }

  return enabled;
}

/** Toggle a game's enabled status (admin only). Upserts so it works even if the row doesn't exist yet. */
export async function toggleGame(gameId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('game_config')
    .upsert(
      { game_id: gameId, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'game_id' },
    );

  if (error) {
    console.error('[gameConfig] toggle failed:', error.message);
    throw error;
  }
}

/** Check if the current user is an admin. */
export async function checkIsAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return false;

  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_admin === true;
}
