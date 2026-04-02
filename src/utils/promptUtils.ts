import {
  STAND_OUT_PROMPTS,
  StandOutPrompt,
  StandOutDifficulty,
  NUMBER_GUESSOR_PROMPTS,
  NumberPrompt,
  PIE_CHARTS_PROMPTS,
  PieChartPrompt,
} from '../constants/gamePrompts';

// ─── Generic pick (avoid repeats, cycling once exhausted) ─────────────────────

export function pickFromBank<T extends { id: string }>(
  bank: T[],
  usedIds: Set<string>
): T {
  const available = bank.filter(p => !usedIds.has(p.id));
  const pool = available.length > 0 ? available : bank;
  const item = pool[Math.floor(Math.random() * pool.length)];
  if (available.length === 0) usedIds.clear();
  return item;
}

// ─── Stand Out ────────────────────────────────────────────────────────────────

// Difficulty weights scale with round number so early rounds stay accessible.
function getDifficultyWeights(round: number): Record<StandOutDifficulty, number> {
  if (round <= 3) return { easy: 0.7, medium: 0.3, hard: 0.0 };
  if (round <= 6) return { easy: 0.2, medium: 0.5, hard: 0.3 };
  return { easy: 0.0, medium: 0.3, hard: 0.7 };
}

export function pickStandOutPrompt(round: number, usedIds: Set<string>): StandOutPrompt {
  const weights = getDifficultyWeights(round);
  const rand = Math.random();

  let targetDiff: StandOutDifficulty;
  if (rand < weights.easy) targetDiff = 'easy';
  else if (rand < weights.easy + weights.medium) targetDiff = 'medium';
  else targetDiff = 'hard';

  // Prefer the target difficulty, fall back to any unused prompt
  const byDiff = STAND_OUT_PROMPTS.filter(
    p => p.difficulty === targetDiff && !usedIds.has(p.id)
  );
  const anyUnused = STAND_OUT_PROMPTS.filter(p => !usedIds.has(p.id));

  const pool = byDiff.length > 0 ? byDiff : anyUnused.length > 0 ? anyUnused : STAND_OUT_PROMPTS;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  if (anyUnused.length === 0) usedIds.clear();
  return picked;
}

// Scoring constants
export const STAND_OUT_WIN_SCORE = 100;

export interface ScoreDelta {
  playerId: string;
  playerName: string;
  delta: number;
  streakCount: number; // 0 = duplicate penalty, 1+ = unique streak tier
}

export interface Answer {
  playerId: string;
  playerName: string;
  text: string;
}

export function calculateStandOutScores(
  answers: Answer[],
  streaks: Record<string, number>
): { deltas: ScoreDelta[]; newStreaks: Record<string, number> } {
  // Group by normalised answer text
  const groups = new Map<string, Answer[]>();
  for (const ans of answers) {
    const key = ans.text.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ans);
  }

  const deltas: ScoreDelta[] = [];
  const newStreaks: Record<string, number> = { ...streaks };

  for (const group of groups.values()) {
    if (group.length === 1) {
      // Unique answer — reward based on streak tier
      const player = group[0];
      const streak = (newStreaks[player.playerId] ?? 0) + 1;
      newStreaks[player.playerId] = streak;
      const pts = streak >= 4 ? 25 : streak === 3 ? 20 : streak === 2 ? 15 : 10;
      deltas.push({
        playerId: player.playerId,
        playerName: player.playerName,
        delta: pts,
        streakCount: streak,
      });
    } else {
      // Duplicate — penalise all in the group
      const penalty = group.length >= 4 ? -12 : group.length === 3 ? -8 : -5;
      for (const player of group) {
        newStreaks[player.playerId] = 0;
        deltas.push({
          playerId: player.playerId,
          playerName: player.playerName,
          delta: penalty,
          streakCount: 0,
        });
      }
    }
  }

  return { deltas, newStreaks };
}

// ─── Number Guessor ───────────────────────────────────────────────────────────

export const NUMBER_GUESSOR_ROUNDS = 5;

export function pickNumberPrompt(usedIds: Set<string>): NumberPrompt {
  return pickFromBank(NUMBER_GUESSOR_PROMPTS, usedIds);
}

export interface GuessResult {
  playerId: string;
  playerName: string;
  guess: number;
  distance: number; // abs(guess - target)
}

export function calculateGuessResults(
  guesses: { playerId: string; playerName: string; guess: number }[],
  target: number
): GuessResult[] {
  return guesses
    .map(g => ({ ...g, distance: Math.abs(g.guess - target) }))
    .sort((a, b) => a.distance - b.distance);
}

// ─── Pie Charts ───────────────────────────────────────────────────────────────

export const PIE_CHARTS_DEFAULT_COUNT = 7;

export function buildPieChartSession(
  customPrompts: PieChartPrompt[],
  targetCount: number
): PieChartPrompt[] {
  const shuffled = [...PIE_CHARTS_PROMPTS].sort(() => Math.random() - 0.5);
  const presets = shuffled.slice(0, Math.max(0, targetCount - customPrompts.length));
  return [...customPrompts, ...presets].slice(0, targetCount);
}
