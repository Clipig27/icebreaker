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

/**
 * Canonical answer normalizer.
 * Must stay in sync with the copy in backend/index.js.
 * - lowercase
 * - trim leading/trailing whitespace
 * - strip punctuation
 * - collapse internal whitespace to single space
 */
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // remove punctuation (keeps alphanumeric + underscore + space)
    .replace(/\s+/g, ' ')     // collapse runs of whitespace
    .trim();
}

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
    const key = normalizeAnswer(ans.text);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ans);
  }

  const deltas: ScoreDelta[] = [];
  const newStreaks: Record<string, number> = { ...streaks };

  for (const group of groups.values()) {
    const groupSize = group.length;
    const key = normalizeAnswer(group[0].text);
    console.log(`[StandOut] Group key="${key}" size=${groupSize}`);

    if (groupSize === 1) {
      // Unique answer — reward scales with consecutive unique-answer streak
      // streak 1→+10, 2→+15, 3→+20, 4+→+25
      const player = group[0];
      const streak = (newStreaks[player.playerId] ?? 0) + 1;
      newStreaks[player.playerId] = streak;
      const pts = streak >= 4 ? 25 : streak === 3 ? 20 : streak === 2 ? 15 : 10;
      console.log(`[StandOut] Unique: player=${player.playerName} streak=${streak} delta=+${pts}`);
      deltas.push({
        playerId: player.playerId,
        playerName: player.playerName,
        delta: pts,
        streakCount: streak,
      });
    } else {
      // Duplicate — penalty = -10 * (groupSize - 1)
      // e.g. 2→-10, 3→-20, 4→-30
      const penalty = -10 * (groupSize - 1);
      for (const player of group) {
        newStreaks[player.playerId] = 0;
        console.log(`[StandOut] Duplicate: player=${player.playerName} groupSize=${groupSize} delta=${penalty}`);
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
  guess: number | null;
  distance: number; // abs(guess - correctAnswer), lower = better
}

export function calculateGuessResults(
  guesses: { playerId: string; playerName: string; guess: number }[],
  target: number
): GuessResult[] {
  return guesses
    .map(g => ({ ...g, distance: Math.abs(g.guess - target) }))
    .sort((a, b) => a.distance - b.distance); // closest first
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
