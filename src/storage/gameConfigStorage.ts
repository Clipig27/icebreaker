import { supabase } from '../lib/supabase';

export interface GameConfig {
  game_id: string;
  enabled: boolean;
}

/** Fetch which games are enabled. Returns a Set of enabled game IDs. */
export async function fetchEnabledGames(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('game_config')
    .select('game_id, enabled');

  if (error) {
    console.error('[gameConfig] fetch failed:', error.message);
    // Fallback: all games enabled
    return new Set([
      'lieDetector', 'talentShow', 'standOut', 'numberGuessor',
      'pieCharts', 'dealOrSteal', 'shadowProtocol', 'potLuck',
      'chainLink', 'plotTwist', 'blindRanking',
    ]);
  }

  return new Set((data as GameConfig[]).filter(g => g.enabled).map(g => g.game_id));
}

/** Toggle a game's enabled status (admin only). */
export async function toggleGame(gameId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('game_config')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('game_id', gameId);

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
