const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const {
  LIE_DETECTOR_PROMPTS,
  TALENT_SHOW_PROMPTS,
  TALENT_SHOW_TIEBREAK_PROMPTS,
  TALENT_SHOW_FINAL_PROMPTS,
  STAND_OUT_PROMPTS,
  NUMBER_GUESSOR_PROMPTS,
  PIE_CHARTS_PROMPTS,
  POTLUCK_QUESTIONS,
} = require('./prompts');

const PLOT_TWIST_PROMPTS = [
  "Write a story about a man who had his car stolen.",
  "Write a story about a birthday party that goes wrong.",
  "Write a story about two strangers stuck in an elevator.",
  "Write a story about a dog who becomes mayor of a town.",
  "Write a story about a heist at a candy factory.",
  "Write a story about a camping trip with an unexpected guest.",
];

const PLOT_TWIST_FALLBACK_WORDS = {
  0: ["police","keys","insurance","running","angry","phone","door","voice","hand","light","noise","shadow","smile","road","window","clock","money","stranger","night","search","witness","alarm","parking","lock","drive"],
  1: ["cake","candles","gift","balloon","crying","music","door","voice","hand","light","noise","shadow","smile","road","window","clock","money","stranger","surprise","dance","guest","mess","scream","laughter","drink"],
  2: ["button","stuck","phone","stranger","panic","floor","door","voice","hand","light","noise","shadow","smile","road","window","clock","money","wall","cable","mirror","ceiling","breath","silence","emergency","wait"],
  3: ["bark","election","bone","votes","leash","treat","door","voice","hand","light","noise","shadow","smile","road","window","clock","money","stranger","collar","paw","crowd","speech","loyal","fetch","tail"],
  4: ["chocolate","alarm","guards","sugar","vault","sticky","door","voice","hand","light","noise","shadow","smile","road","window","clock","money","stranger","wrapper","sweet","tunnel","disguise","bag","escape","catch"],
  5: ["tent","fire","bear","marshmallow","flashlight","woods","door","voice","hand","light","noise","shadow","smile","road","window","clock","money","stranger","sleeping","creek","trail","stars","howl","branch","rain"],
};

const app = express();
app.use(cors());
app.use(express.json());

console.log('[startup] ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET');

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout:   5000,
});

// ── In-memory state ───────────────────────────────────────────────────────────
const rooms = {};   // code → room object

// ── Stand Out helpers ─────────────────────────────────────────────────────────

const STAND_OUT_WIN_SCORE = 100;

/**
 * Canonical answer normalizer — must stay in sync with promptUtils.ts.
 * lowercase → strip punctuation → collapse whitespace → trim
 */
function normalizeAnswer(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s+#.'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute per-player score deltas for one Stand Out round.
 * Simple rule: unique answer = +10 pts, duplicate = 0 pts (no penalty).
 * Scores accumulate across rounds.
 * @param {Array<{playerId,playerName,text}>} answers
 * @param {Array<{id,name,score}>} players  current room players with accumulated scores
 */
function scoreStandOutRound(answers, players) {
  console.log('[standOut] raw answers   :', JSON.stringify(answers));

  // Normalize and group
  const groups = new Map();
  for (const ans of answers) {
    const key = normalizeAnswer(ans.text);
    console.log(`[standOut] normalize      : "${ans.text}" → "${key}"`);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ans);
  }

  console.log('[standOut] grouped results:', [...groups.entries()].map(([k, v]) => `"${k}" ×${v.length}`).join(', '));

  const deltas = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      // Unique — flat 10 points
      const player = group[0];
      deltas.push({ playerId: player.playerId, playerName: player.playerName, delta: 10, streakCount: 0 });
    }
    // Duplicate — no points, no penalty
  }

  const updatedPlayers = players.map(p => {
    const d = deltas.find(d => d.playerId === p.id);
    return d ? { ...p, score: p.score + d.delta } : p;
  });

  console.log('[standOut] final scores   :', updatedPlayers.map(p => `${p.name}:${p.score}`).join(', '));

  return { deltas, updatedPlayers };
}
// Future: replace with Supabase. For now: session-level username registry.
// lowercase_username → socketId  (freed on disconnect or explicit leave)
const usernames = {};

// Deal or Steal — private per-round action store (never broadcast to clients)
// dosRoundData[code] = { actions: { [playerId]: { action, target } } }
const dosRoundData = {};

// Lie Detector — server-side secret store (truth statement + votes, never broadcast until results)
// ldRoomData[code] = { truthStatement: 1|2, votes: [] }
const ldRoomData = {};

// Pot Luck — server-side secret store (correct answer index, active timers)
// potLuckRoomData[code] = { correctIndex, turnTimer, rollTimer }
const potLuckRoomData = {};

// Plot Twist — server-side secret store (target words per player, refill pool, timers)
// ptRoomData[code] = { targets: {playerId: [words]...}, pool: [], turnTimer, vetoTimer, vetoVotes: {} }
const ptRoomData = {};

// ── Disconnect grace period ───────────────────────────────────────────────────
const disconnectTimers   = {};  // socketId     → timeout handle
const playerPersistentIds = {}; // socketId     → persistentId (userId)
const persistentToSocket  = {}; // persistentId → current socketId

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/** Round a dollar value to 2 decimal places. */
function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Resolve all actions for a Deal or Steal round.
 *
 * Economy (all % of round-start balance):
 *   Mutual deal        +50% each  (A deals B, B deals A — not voided by steals)
 *   Deal into Neutral  +25%       (target chose Neutral — half reward for dealer)
 *   Deal into Steal     0         (no bonus, no penalty for dealer)
 *   Deal into elsewhere 0         (target is dealing someone else — no penalty)
 *   Steal success      +30% profit (split evenly among stealers of same target)
 *   Steal fail         -30%        (Neutral target, mutual steal, or closed loop)
 *   Neutral             0
 *
 * Resolution order:
 *   1. Mutual steals    → both fail; both lose 30% of round-start balance.
 *   2. Classify steals  → succeed if target chose Deal OR target is stealing
 *                         someone other than the stealer. Fail vs Neutral.
 *   2b.Closed loops     → detect steal cycles (A→B→C→A). All loop members'
 *                         steal actions fail (-30%). External stealers targeting
 *                         loop members still apply normally.
 *   5b. Mutual deal + stolen → deal bonus voided for the stolen party. They only
 *                         take the steal loss (same as if partner hadn't dealt back).
 *   3a. Snapshot profits → pending profit per successful stealer before interceptions.
 *   3b. Chain-reaction  → if a successful stealer is ALSO a successful steal
 *                         target, their pending profit is intercepted by whoever
 *                         stole them (split evenly). One clean pass only.
 *   3c. Apply atomically → drain targets (30%), credit stealers, credit interceptors.
 *   4. Failed steals    → each failed stealer loses 30% of round-start balance.
 *   5. Deal outcomes    → mutual +50%, into-neutral +25%, into-steal/elsewhere 0.
 *                         Deals resolve independently of steal outcomes.
 *   6. Neutral          → no change, protected from steals.
 *
 * Chain-reaction detail:
 *   Primary drain (20%) always applies to the original steal target — they do not
 *   lose a second time. The chain interception is profit redistribution only:
 *   the stealer-victim gets nothing from their own steal; interceptors get it instead.
 *   Circular chains (A→B→C→A) resolve cleanly in one pass using initial profits.
 *
 * Rounding rule: round2() (2 dp) on every monetary operation.
 *   Per-stealer share: round2(totalLost / stealerCount).
 *   Rounding artifacts (≤$0.01) are acceptable for a casual game.
 *
 * Deal rewards: mutual deal +50% each, deal-into-neutral +25%, deal-into-steal/elsewhere 0.
 *
 * Returns:
 *   { balances, deltas, roundSummary,
 *     dealAttemptCount, dealSuccessCount,
 *     stealAttemptCount, stealSuccessCount,
 *     mutualStealCount, neutralCount, stolenFromCount, chainBonusCount }
 */
function scoreDoSRound(room, code) {
  const gs      = room.gameState;
  const actions = (dosRoundData[code] && dosRoundData[code].actions) || {};

  // ── Diagnostic: dump full action map and roundStartBalances ──────────────
  console.log('[dos] actions map', JSON.stringify(actions, null, 2));
  console.log('[dos] roundStartBalances', JSON.stringify(gs.roundStartBalances, null, 2));

  // ── Authoritative participant set ─────────────────────────────────────────
  // Use gs.balances (set by host at round start) as the source of truth for
  // who is in this round. This is stable even if players disconnect mid-round,
  // and matches the target IDs players used when submitting their actions.
  const startBals = Object.assign({}, gs.roundStartBalances);
  const balances  = Object.assign({}, gs.balances);

  // Merge: anyone in gs.balances but missing from gs.roundStartBalances gets
  // a fallback of their current balance (handles first-round edge cases).
  for (const pid of Object.keys(balances)) {
    if (typeof startBals[pid] !== 'number' || isNaN(startBals[pid])) {
      startBals[pid] = balances[pid];
      console.warn('[scoreDoSRound] startBals missing for %s — using current balance %s', pid, startBals[pid]);
    }
  }
  for (const pid of Object.keys(startBals)) {
    if (typeof balances[pid] !== 'number' || isNaN(balances[pid])) {
      balances[pid] = startBals[pid];
      console.warn('[scoreDoSRound] balances missing for %s — using startBal %s', pid, balances[pid]);
    }
  }

  // playerIds = everyone who started this round (not just who is still connected)
  const playerIds = Object.keys(startBals);

  console.log('[scoreDoSRound] round=%d participantCount=%d actionCount=%d startBals=%j',
    gs.round, playerIds.length, Object.keys(actions).length, startBals);

  // ── Step 1: Detect and resolve mutual steals ──────────────────────────────
  const mutualStealers   = new Set();
  const processedMutuals = new Set();

  for (const aId of playerIds) {
    const aAct = actions[aId];
    if (!aAct || aAct.action !== 'steal') continue;
    const bId = aAct.target;
    if (!bId) continue;
    const bAct = actions[bId];
    if (!bAct || bAct.action !== 'steal' || bAct.target !== aId) continue;

    const pairKey = [aId, bId].sort().join(':');
    if (processedMutuals.has(pairKey)) continue;
    processedMutuals.add(pairKey);
    mutualStealers.add(aId);
    mutualStealers.add(bId);

    balances[aId] = round2(balances[aId] - 0.3 * startBals[aId]);
    balances[bId] = round2(balances[bId] - 0.3 * startBals[bId]);
    console.log('[scoreDoSRound] mutual steal: %s ↔ %s — each -30%%', aId, bId);
  }

  // ── Step 2: Classify non-mutual steal attempts ────────────────────────────
  const successfulStealTargets = {}; // targetId → [stealerId, ...]
  const failedStealers = [];

  for (const stealerId of playerIds) {
    const act = actions[stealerId];
    if (!act || act.action !== 'steal') continue;
    if (mutualStealers.has(stealerId)) continue;

    const targetId = act.target;
    if (!targetId || !playerIds.includes(targetId)) {
      failedStealers.push(stealerId);
      continue;
    }

    const targetAct = actions[targetId] || { action: 'neutral', target: null };
    let valid = false;
    if (targetAct.action === 'deal') {
      valid = true;
    } else if (targetAct.action === 'steal' && targetAct.target !== stealerId) {
      // Target is stealing someone else (not the stealer) — valid target.
      // Even if target is in a mutual steal with a third party, their action
      // is still 'steal' so this branch fires correctly.
      valid = true;
    }

    if (valid) {
      if (!successfulStealTargets[targetId]) successfulStealTargets[targetId] = [];
      successfulStealTargets[targetId].push(stealerId);
    } else {
      failedStealers.push(stealerId);
    }
  }

  // ── Step 2b: Closed steal loop detection ──────────────────────────────────
  // If the steal graph among successful non-mutual stealers contains a cycle
  // (A steals B, B steals C, C steals A), all loop members' steal actions
  // fail and each takes the -20% fail penalty. External stealers targeting
  // loop members are unaffected by this rule and still apply normally.
  const closedLoopMembers = new Set();
  {
    const stealerToTarget = {};
    for (const [tid, sIds] of Object.entries(successfulStealTargets)) {
      for (const sId of sIds) stealerToTarget[sId] = tid;
    }
    const loopVisited = {};
    for (const startId of Object.keys(stealerToTarget)) {
      if (loopVisited[startId]) continue;
      const path = [];
      const pathIdx = {};
      let cur = startId;
      while (cur && stealerToTarget[cur] && !loopVisited[cur]) {
        if (cur in pathIdx) {
          for (let i = pathIdx[cur]; i < path.length; i++) closedLoopMembers.add(path[i]);
          break;
        }
        pathIdx[cur] = path.length;
        path.push(cur);
        cur = stealerToTarget[cur];
      }
      for (const id of path) loopVisited[id] = true;
    }
    if (closedLoopMembers.size > 0) {
      console.log('[scoreDoSRound] closed steal loop: %d members — all fail', closedLoopMembers.size);
      for (const loopId of closedLoopMembers) {
        const tid = stealerToTarget[loopId];
        if (tid && successfulStealTargets[tid]) {
          successfulStealTargets[tid] = successfulStealTargets[tid].filter(s => s !== loopId);
          if (successfulStealTargets[tid].length === 0) delete successfulStealTargets[tid];
        }
        failedStealers.push(loopId);
      }
    }
  }

  // ── Step 3a: Snapshot initial steal profits (pre-chain-reaction) ──────────
  // Each stealer targets exactly one player, so no accumulation needed.
  const initialStealProfits = {}; // stealerId → pending profit before interceptions
  for (const [targetId, stealerIds] of Object.entries(successfulStealTargets)) {
    const lostAmount = round2(0.3 * startBals[targetId]);
    const sharePerStealer = round2(lostAmount / stealerIds.length);
    for (const sId of stealerIds) {
      initialStealProfits[sId] = sharePerStealer;
    }
  }

  // ── Step 3b: Chain-reaction interceptions (one clean pass) ────────────────
  // If A successfully steals B, and B had a pending steal profit (B's steal of C
  // was also going to succeed), A intercepts B's profit instead of B receiving it.
  // Multiple interceptors split the intercepted amount evenly.
  // Uses INITIAL profits only — circular chains resolve without recursion.
  const interceptedVictims = new Set(); // stealers whose profit was intercepted
  const chainBonuses = {};              // interceptorId → total bonus from chain

  for (const [victimId, interceptorIds] of Object.entries(successfulStealTargets)) {
    const victimProfit = initialStealProfits[victimId] || 0;
    if (victimProfit <= 0) continue; // no pending profit to intercept

    interceptedVictims.add(victimId);
    const sharePerInterceptor = round2(victimProfit / interceptorIds.length);
    for (const intId of interceptorIds) {
      chainBonuses[intId] = (chainBonuses[intId] || 0) + sharePerInterceptor;
    }
    console.log('[scoreDoSRound] chain: interceptors %j take %s profit from %s (was stealing, profit=%s)',
      interceptorIds, sharePerInterceptor, victimId, victimProfit);
  }

  // ── Step 3c: Apply drains and profits atomically ──────────────────────────
  const stolenFromPlayers = new Set();
  for (const [targetId] of Object.entries(successfulStealTargets)) {
    stolenFromPlayers.add(targetId);
    const lostAmount = round2(0.3 * startBals[targetId]);
    balances[targetId] = round2(balances[targetId] - lostAmount);
  }
  for (const [stealerId, profit] of Object.entries(initialStealProfits)) {
    if (!interceptedVictims.has(stealerId)) {
      // Not intercepted — gets their steal profit
      balances[stealerId] = round2(balances[stealerId] + profit);
    }
    // If intercepted, stealerId gets nothing (profit went to interceptors)
  }
  for (const [interceptorId, bonus] of Object.entries(chainBonuses)) {
    balances[interceptorId] = round2(balances[interceptorId] + bonus);
  }

  // ── Step 4: Apply failed steal penalties ──────────────────────────────────
  for (const stealerId of failedStealers) {
    balances[stealerId] = round2(balances[stealerId] - 0.3 * startBals[stealerId]);
  }

// ── Step 5: Resolve deal outcomes (FIXED) ───────────────────────────────────
const dealBonuses = {};
const processedDealPairs = new Set();

for (const actorId of playerIds) {
  const actorAction = actions[actorId];
  if (!actorAction || actorAction.action !== 'deal' || !actorAction.target) continue;

  const targetId = actorAction.target;
  const targetAction = actions[targetId];
  const startBal = startBals[actorId] ?? 0;

  console.log('[FIX CHECK] DEAL', {
    actorId,
    actorChoice: actorAction.action,
    targetId,
    targetChoice: targetAction?.action ?? 'NONE',
    startBal,
  });

  // 1. Mutual deal = +50% each — but voided for anyone who was stolen from.
  // Being stolen from while dealing means you get nothing from the deal
  // (same outcome as if your partner hadn't dealt back), so the risk is real.
  if (
    targetAction &&
    targetAction.action === 'deal' &&
    targetAction.target === actorId
  ) {
    const pairKey = [actorId, targetId].sort().join(':');

    if (!processedDealPairs.has(pairKey)) {
      processedDealPairs.add(pairKey);

      if (!stolenFromPlayers.has(actorId)) {
        dealBonuses[actorId] =
          (dealBonuses[actorId] || 0) + round2(startBal * 0.50);
      }

      if (!stolenFromPlayers.has(targetId)) {
        dealBonuses[targetId] =
          (dealBonuses[targetId] || 0) +
          round2((startBals[targetId] ?? 0) * 0.50);
      }

      console.log('[FIX] mutual deal applied', {
        actorId, actorStolen: stolenFromPlayers.has(actorId),
        actorGain: stolenFromPlayers.has(actorId) ? 0 : round2(startBal * 0.50),
        targetId, targetStolen: stolenFromPlayers.has(targetId),
        targetGain: stolenFromPlayers.has(targetId) ? 0 : round2((startBals[targetId] ?? 0) * 0.50),
      });
    }

    continue;
  }

  // 2. Deal into neutral or missing target action = +25%
  if (!targetAction || targetAction.action === 'neutral') {
    const gain = round2(startBal * 0.25);

    dealBonuses[actorId] = (dealBonuses[actorId] || 0) + gain;

    console.log('[FIX] deal→neutral SUCCESS', {
      actorId,
      targetId,
      gain,
    });

    continue;
  }

  // 3. Deal into someone dealing elsewhere = 0
  if (
    targetAction.action === 'deal' &&
    targetAction.target !== actorId
  ) {
    console.log('[FIX] deal→other deal = 0', {
      actorId,
      targetId,
    });
    continue;
  }

  // 4. Deal into steal = 0
  if (targetAction.action === 'steal') {
    console.log('[FIX] deal→steal = 0', {
      actorId,
      targetId,
    });
    continue;
  }
}

  const dealGainers = new Set();
  for (const [gId, bonus] of Object.entries(dealBonuses)) {
    if (bonus > 0) {
      balances[gId] = round2(balances[gId] + bonus);
      dealGainers.add(gId);
    }
  }

  // ── Compute deltas and stats ──────────────────────────────────────────────
  // Iterate all keys in balances (not just playerIds) so any actor whose
  // socket ID was in actions but not in roundStartBalances still gets a delta.
  const allIds = new Set([...playerIds, ...Object.keys(balances)]);
  const deltas = {};
  for (const pid of allIds) {
    const startB = startBals[pid] ?? 0;
    deltas[pid] = round2((balances[pid] ?? startB) - startB);
  }

  const dealAttemptCount  = playerIds.filter(id => actions[id] && actions[id].action === 'deal').length;
  const dealSuccessCount  = dealGainers.size;
  const stealAttemptCount = playerIds.filter(id => actions[id] && actions[id].action === 'steal').length;
  const stealSuccessCount = Object.values(successfulStealTargets).reduce((s, arr) => s + arr.length, 0);
  const mutualStealCount  = processedMutuals.size;
  const neutralCount      = playerIds.filter(id => !actions[id] || actions[id].action === 'neutral').length;
  const stolenFromCount   = stolenFromPlayers.size;
  const chainBonusCount   = interceptedVictims.size;
  const closedLoopCount   = closedLoopMembers.size;

  console.log('[scoreDoSRound] result | dealAttempt=%d dealSuccess=%d stealSuccess=%d neutral=%d deltas=%j',
    dealAttemptCount, dealSuccessCount, stealSuccessCount, neutralCount, deltas);

  const actionLog = {};
  for (const pid of playerIds) {
    const a = actions[pid];
    actionLog[pid] = {
      action: (a && a.action) || 'neutral',
      target: (a && a.target) || null,
    };
  }

  const roundSummary = {
    round: gs.round,
    actionLog,
    dealAttemptCount,
    dealSuccessCount,
    stealAttemptCount,
    stealSuccessCount,
    mutualStealCount,
    neutralCount,
    stolenFromCount,
    chainBonusCount,
    closedLoopCount,
    deltas,
    startBalances: Object.assign({}, startBals),
    endBalances:   Object.assign({}, balances),
  };

  return {
    balances, deltas, roundSummary,
    dealAttemptCount, dealSuccessCount,
    stealAttemptCount, stealSuccessCount,
    mutualStealCount, neutralCount, stolenFromCount, chainBonusCount, closedLoopCount,
  };
}

// ── Game-progress helpers (called after a player leaves) ──────────────────────

/** Resolve Lie Detector voting with votes collected so far. */
function resolveLieDetectorRound(code) {
  const room = rooms[code];
  if (!room) return;
  const gs = room.gameState;
  if (gs?.game !== 'lieDetector' || gs?.phase !== 'voting') return;
  const ld = ldRoomData[code];
  if (!ld) return;
  const order = gs.playerOrder ?? room.players.map(p => p.id);
  const speakerId = order[gs.speakerIndex ?? 0];
  const speaker = room.players.find(p => p.id === speakerId);
  const nonSpeakers = room.players.filter(p => p.id !== speakerId);
  const pointsAwarded = [];
  let speakerTotal = 0;
  for (const p of nonSpeakers) {
    const vote = (ld.votes ?? []).find(v => v.playerId === p.id);
    let listenerPts = 0;
    if (vote) {
      const s1ok = (vote.stmt1Vote === 'lie') === ld.stmt1IsLie;
      const s2ok = (vote.stmt2Vote === 'lie') === ld.stmt2IsLie;
      listenerPts = (s1ok ? 1 : 0) + (s2ok ? 1 : 0);
    }
    const wrong = vote ? 2 - listenerPts : 0;
    speakerTotal += wrong;
    pointsAwarded.push({ playerId: p.id, playerName: p.name, points: listenerPts });
    if (listenerPts > 0) p.score = (p.score ?? 0) + listenerPts;
  }
  if (speaker) {
    pointsAwarded.push({ playerId: speakerId, playerName: speaker.name, points: speakerTotal });
    speaker.score = (speaker.score ?? 0) + speakerTotal;
  }
  const next = {
    ...gs, phase: 'results',
    votedPlayerIds: (ld.votes ?? []).map(v => v.playerId),
    statementType: ld.statementType,
    stmt1IsLie: ld.stmt1IsLie,
    stmt2IsLie: ld.stmt2IsLie,
    votes: ld.votes,
    pointsAwarded,
  };
  room.gameState = next;
  io.to(code).emit('gameStateUpdated', next);
  io.to(code).emit('scoresUpdated', room.players);
}

/** Advance Lie Detector to the next speaker, skipping anyone no longer in the room. */
function advanceLieDetector(code) {
  const room = rooms[code];
  if (!room) return;
  const gs = room.gameState;
  if (gs?.game !== 'lieDetector') return;
  const order = gs.playerOrder ?? room.players.map(p => p.id);
  const totalRounds = gs.totalRounds ?? 1;
  const currentRound = gs.currentRound ?? 1;
  let nextIdx = (gs.speakerIndex + 1) % order.length;
  let checked = 0;
  while (checked < order.length) {
    if (room.players.find(p => p.id === order[nextIdx])) break;
    nextIdx = (nextIdx + 1) % order.length;
    checked++;
  }
  if (checked >= order.length || room.players.length < 2) {
    const next = { ...gs, phase: 'game-over' };
    room.gameState = next;
    io.to(code).emit('gameStateUpdated', next);
    return;
  }
  const completingRound = nextIdx <= gs.speakerIndex;
  const nextRound = completingRound ? currentRound + 1 : currentRound;
  if (completingRound && nextRound > totalRounds) {
    const next = { ...gs, phase: 'game-over' };
    room.gameState = next;
    io.to(code).emit('gameStateUpdated', next);
    return;
  }
  ldRoomData[code] = null;
  const prompt = LIE_DETECTOR_PROMPTS[Math.floor(Math.random() * LIE_DETECTOR_PROMPTS.length)];
  const next = {
    ...gs, phase: 'entering', prompt,
    speakerIndex: nextIdx, totalRounds, currentRound: nextRound,
    playerOrder: order, votedPlayerIds: [],
    statement1: undefined, statement2: undefined,
  };
  room.gameState = next;
  io.to(code).emit('gameStateUpdated', next);
}

/** Called after a player is removed from a room mid-game to unblock any stuck state. */
function checkGameProgressAfterLeave(code, leaverId) {
  const room = rooms[code];
  if (!room || room.phase !== 'playing' || room.players.length === 0) return;
  const gs = room.gameState;
  if (!gs) return;

  if (gs.game === 'lieDetector') {
    const order = gs.playerOrder ?? room.players.map(p => p.id);
    const speakerId = order[gs.speakerIndex ?? 0];
    if (gs.phase === 'entering' && leaverId === speakerId) {
      console.log('[leave] LD speaker left during entering — auto-advancing');
      advanceLieDetector(code);
    } else if (gs.phase === 'voting') {
      const nonSpeakers = room.players.filter(p => p.id !== speakerId);
      const votedIds = gs.votedPlayerIds ?? [];
      if (nonSpeakers.length === 0 || nonSpeakers.every(p => votedIds.includes(p.id))) {
        console.log('[leave] LD non-speaker left — all remaining voted, resolving round');
        resolveLieDetectorRound(code);
      }
    }
    return;
  }

  if (gs.game === 'standOut' && gs.phase === 'entering' && !room.standOutRoundScored) {
    const uniqueSubmitters = new Set((room.standOutAnswers ?? []).map(a => a.playerId));
    if (room.players.length > 0 && room.players.every(p => uniqueSubmitters.has(p.id))) {
      console.log('[leave] SO player left — all remaining submitted, scoring');
      room.standOutRoundScored = true;
      const { deltas, updatedPlayers } = scoreStandOutRound(
        room.standOutAnswers, room.players,
      );
      room.players = updatedPlayers;
      const winTarget = gs.targetScore ?? STAND_OUT_WIN_SCORE;
      const top = [...updatedPlayers].sort((a, b) => b.score - a.score)[0];
      const isGameOver = top && top.score >= winTarget;
      const winners = isGameOver ? updatedPlayers.filter(p => p.score >= winTarget) : [];
      const winnerName = winners.length > 1 ? winners.map(p => p.name).join(' & ') : (top?.name ?? '');
      const nextGs = {
        ...gs,
        phase: isGameOver ? 'game-over' : 'reveal',
        submittedPlayerIds: [...uniqueSubmitters],
        answers: room.standOutAnswers,
        roundDeltas: deltas,
        ...(isGameOver ? { winnerName } : {}),
      };
      room.gameState = nextGs;
      io.to(code).emit('gameStateUpdated', nextGs);
      io.to(code).emit('scoresUpdated', updatedPlayers);
    }
    return;
  }

  if (gs.game === 'numberGuessor' && gs.phase === 'guessing') {
    const submitted = gs.submittedGuesserIds ?? [];
    if (room.players.length > 0 && room.players.every(p => submitted.includes(p.id))) {
      console.log('[leave] NG player left — all remaining guessed, resolving');
      resolveNGRound(code);
    }
    return;
  }

  if (gs.game === 'dealOrSteal' && gs.phase === 'action') {
    const submitted = gs.submittedActionIds ?? [];
    if (room.players.length > 0 && room.players.every(p => submitted.includes(p.id))) {
      console.log('[leave] DoS player left — all remaining submitted, scoring');
      const result = scoreDoSRound(room, code);
      gs.phase = 'round-results';
      gs.balances = result.balances;
      gs.roundOutcome = {
        dealAttemptCount: result.dealAttemptCount, dealSuccessCount: result.dealSuccessCount,
        stealAttemptCount: result.stealAttemptCount, stealSuccessCount: result.stealSuccessCount,
        mutualStealCount: result.mutualStealCount, neutralCount: result.neutralCount,
        stolenFromCount: result.stolenFromCount, chainBonusCount: result.chainBonusCount,
        closedLoopCount: result.closedLoopCount, deltas: result.deltas,
      };
      if (!gs.roundHistory) gs.roundHistory = [];
      gs.roundHistory.push(result.roundSummary);
      dosRoundData[code] = { actions: {} };
      io.to(code).emit('gameStateUpdated', gs);
    }
    return;
  }
}

/** Remove player from every room they're in. Returns array of affected room codes. */
function removeSocketFromAllRooms(socketId) {
  const pid = stableId(socketId);
  const affected = [];
  for (const code in rooms) {
    const room = rooms[code];
    if (!room.players.find(p => p.id === pid)) continue;

    const wasHost = room.hostId === pid;
    room.players   = room.players.filter(p => p.id !== pid);
    affected.push(code);

    if (room.players.length === 0) {
      cleanupPlotTwist(code);
      delete rooms[code];
      delete dosRoundData[code];
      console.log(`Room ${code} deleted (empty)`);
      continue;
    }

    if (wasHost) {
      // Reassign host to the next remaining player
      room.hostId = room.players[0].id;
      io.to(code).emit('hostChanged', { newHostId: room.hostId, room });
      console.log(`Room ${code}: host reassigned to ${room.players[0].name}`);
    } else {
      io.to(code).emit('roomUpdated', room);
    }

    checkGameProgressAfterLeave(code, pid);
  }
  return affected;
}

// ── Pot Luck helpers ──────────────────────────────────────────────────────────

function cleanupPotLuck(code) {
  const d = potLuckRoomData[code];
  if (!d) return;
  if (d.turnTimer) clearTimeout(d.turnTimer);
  if (d.rollTimer) clearTimeout(d.rollTimer);
  potLuckRoomData[code] = null;
}

/**
 * Start (or restart) the 30-second turn timer for the current PotLuck actor.
 * If the timer fires, the actor is auto-skipped.
 */
function startPotLuckTurnTimer(code) {
  const d = potLuckRoomData[code];
  if (!d) return;
  if (d.turnTimer) { clearTimeout(d.turnTimer); d.turnTimer = null; }
  d.turnTimer = setTimeout(() => {
    const room = rooms[code];
    if (!room || room.gameState?.game !== 'potLuck' || room.gameState.phase !== 'live') return;
    const gs = room.gameState;
    const actorId = gs.order[gs.seatPtr];
    const actor = room.players.find(p => p.id === actorId);
    console.log('[potLuck] turn timer expired for %s in room %s — auto-skip', actorId, code);
    _potLuckApplySkip(code, gs, actorId, actor?.score ?? 0);
  }, 15000);
}

/**
 * Apply a skip action for actorId in the given gameState and emit updates.
 * Shared by both pl-skip handler and the auto-skip timer.
 */
function _potLuckApplySkip(code, gs, actorId, actorScore) {
  const room = rooms[code];
  const d = potLuckRoomData[code];
  if (!room || !d) return;
  if (d.turnTimer) { clearTimeout(d.turnTimer); d.turnTimer = null; }

  const lastResult = { playerId: actorId, kind: 'skip', delta: 0, total: actorScore, potAt: gs.pot };
  const newConsecutiveSkips = gs.consecutiveSkips + 1;

  if (newConsecutiveSkips >= gs.order.length) {
    // Full loop of skips — void the pot
    const revealAnswer = gs.currentQuestion.choices[d.correctIndex];
    const revealInfo = { answer: revealAnswer, scored: false, by: null };
    const nextGs = { ...gs, phase: 'reveal', lastResult, revealInfo, consecutiveSkips: newConsecutiveSkips };
    room.gameState = nextGs;
    io.to(code).emit('gameStateUpdated', nextGs);
  } else {
    const newPot = Math.min(gs.pot + 1, gs.effectivePotCap ?? gs.potCap);
    const newSeatPtr = (gs.seatPtr + 1) % gs.order.length;
    const nextGs = { ...gs, pot: newPot, seatPtr: newSeatPtr, consecutiveSkips: newConsecutiveSkips, lastResult, turnStartedAt: Date.now() };
    room.gameState = nextGs;
    io.to(code).emit('gameStateUpdated', nextGs);
    startPotLuckTurnTimer(code);
  }
}

/**
 * Initialize (or re-initialize) a PotLuck game for the given room.
 * Sets up potLuckRoomData, picks the first question, shuffles turn order,
 * overwrites room.gameState with the full initial state, and schedules
 * the rolling → live transition.
 * Must be called AFTER room.players is set to the starting lineup (score: 0).
 */
function initPotLuckGame(code) {
  const room = rooms[code];
  if (!room) return;
  cleanupPotLuck(code);

  const qIdx = Math.floor(Math.random() * POTLUCK_QUESTIONS.length);
  const q = POTLUCK_QUESTIONS[qIdx];
  potLuckRoomData[code] = { correctIndex: q.correctIndex, turnTimer: null, rollTimer: null };

  const shuffled = [...room.players.map(p => p.id)].sort(() => Math.random() - 0.5);
  const potCap = Math.min(10, Math.max(5, room.potLuckPotCap ?? 7));
  const startingPot = q.startingPot ?? 1;
  const effectivePotCap = potCap;
  const target = room.players.length * potCap;

  room.gameState = {
    game: 'potLuck',
    phase: 'rolling',
    pot: startingPot,
    potCap,
    effectivePotCap,
    target,
    order: shuffled,
    seatPtr: 0,
    consecutiveSkips: 0,
    usedQuestionIds: [qIdx],
    currentQuestion: { text: q.text, choices: q.choices, difficulty: q.difficulty ?? 'easy', startingPot },
    lastResult: null,
    revealInfo: null,
    winnerId: null,
    turnStartedAt: null,
  };

  // Auto-advance rolling → live after 2.5s
  const rollTimer = setTimeout(() => {
    const r = rooms[code];
    if (!r || r.gameState?.game !== 'potLuck' || r.gameState.phase !== 'rolling') return;
    r.gameState = { ...r.gameState, phase: 'live', turnStartedAt: Date.now() };
    io.to(code).emit('gameStateUpdated', r.gameState);
    startPotLuckTurnTimer(code);
  }, 2500);
  potLuckRoomData[code].rollTimer = rollTimer;
}

/**
 * Advance to the next PotLuck question. Called by pl-next-question (host action).
 */
function startNextPotLuckQuestion(code) {
  const room = rooms[code];
  if (!room || room.gameState?.game !== 'potLuck') return;
  const gs = room.gameState;
  let d = potLuckRoomData[code];
  if (!d) {
    console.warn('[potLuck] no potLuckRoomData for %s — creating', code);
    d = { turnTimer: null, rollTimer: null, correctIndex: 0 };
    potLuckRoomData[code] = d;
  }

  if (d.turnTimer) { clearTimeout(d.turnTimer); d.turnTimer = null; }
  if (d.rollTimer) { clearTimeout(d.rollTimer); d.rollTimer = null; }

  const used = gs.usedQuestionIds ?? [];
  const available = POTLUCK_QUESTIONS.map((_, i) => i).filter(i => !used.includes(i));
  const pool = available.length ? available : POTLUCK_QUESTIONS.map((_, i) => i);
  const qIdx = pool[Math.floor(Math.random() * pool.length)];
  const q = POTLUCK_QUESTIONS[qIdx];

  d.correctIndex = q.correctIndex;

  const shuffled = [...room.players.map(p => p.id)].sort(() => Math.random() - 0.5);
  const nextUsed = available.length ? [...used, qIdx] : [qIdx];
  const startingPot = q.startingPot ?? 1;
  const potCap = gs.potCap ?? 7;
  const effectivePotCap = potCap;

  const nextGs = {
    ...gs,
    phase: 'rolling',
    order: shuffled,
    seatPtr: 0,
    pot: startingPot,
    effectivePotCap,
    consecutiveSkips: 0,
    usedQuestionIds: nextUsed,
    currentQuestion: { text: q.text, choices: q.choices, difficulty: q.difficulty ?? 'easy', startingPot },
    lastResult: null,
    revealInfo: null,
    turnStartedAt: null,
  };
  room.gameState = nextGs;
  io.to(code).emit('gameStateUpdated', nextGs);

  const rollTimer = setTimeout(() => {
    const r = rooms[code];
    if (!r || r.gameState?.game !== 'potLuck' || r.gameState.phase !== 'rolling') return;
    r.gameState = { ...r.gameState, phase: 'live', turnStartedAt: Date.now() };
    io.to(code).emit('gameStateUpdated', r.gameState);
    startPotLuckTurnTimer(code);
  }, 2500);
  d.rollTimer = rollTimer;
}

// ── Chain Link ────────────────────────────────────────────────────────────────

const CHAINLINK_NOUNS = [
  'car','road','ocean','guitar','mountain','coffee','library','rocket',
  'umbrella','river','castle','phone','garden','volcano','compass','piano',
  'jungle','telescope','anchor','lighthouse','lantern','clock','mirror',
  'bridge','letter','map','crown','candle','ship','arrow',
  'feather','drum','wheel','torch','sword','hammer','kite','ladder',
  'net','lock','key','bell','flag','coin','mask','ring',
  'cloud','wave','storm','star','moon','fire','snow','wind',
  'forest','desert','island','cave','tower','village','market','harbor',
  'tunnel','canyon','meadow','glacier','cliff','valley',
  'train','bicycle','balloon','submarine','helicopter','raft',
  'window','door','staircase','roof','chimney','basement','attic',
  'newspaper','envelope','stamp','photograph','painting',
  'violin','trumpet','flute','harp','accordion',
  'apple','lemon','pepper','mushroom','bread','honey','salt',
  'scissors','needle','thread','button','glove','boot','hat',
  'rope','pulley','spark','fog','thunder','rainbow','tide','eclipse',
  'cathedral','palace','monument','fountain','statue','arch',
  'lantern','telescope','magnet','prism','lever','gear',
  'coral','fossil','amber','crystal','quartz','flint',
  'notebook','crayon','chalk','eraser','ruler','pencil',
  'bucket','barrel','crate','basket','bowl','jug',
  'saddle','bridle','stirrup','horseshoe','wagon','plow',
];

// De-duplicate
const CL_NOUNS = [...new Set(CHAINLINK_NOUNS)];

// chainLinkRoomData[code] = { challengeTimer: TimeoutHandle | null }
const chainLinkRoomData = {};

function initChainLinkGame(code) {
  const room = rooms[code];
  if (!room) return;

  // Cancel any existing timers
  const existing = chainLinkRoomData[code];
  if (existing?.challengeTimer) clearTimeout(existing.challengeTimer);
  if (existing?.turnTimer) clearTimeout(existing.turnTimer);
  chainLinkRoomData[code] = { challengeTimer: null, turnTimer: null };

  const HAND_SIZE = 7;
  const pool = [...CL_NOUNS];
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const hands = {};
  for (const player of room.players) {
    hands[player.id] = pool.splice(0, HAND_SIZE);
  }
  const anchor = pool.splice(0, 1)[0];

  // Randomize turn order
  const turnOrder = [...room.players.map(p => p.id)];
  for (let i = turnOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
  }

  room.gameState = {
    game: 'chainLink',
    phase: 'playing',
    hands,
    chain: [{ word: anchor, by: null, reason: 'anchor' }],
    turnOrder,
    turnIdx: 0,
    pending: null,
    challengeStartedAt: null,
    turnStartedAt: Date.now(),
    consecutiveSkips: 0,
    winner: null,
    log: [{ text: `Anchor: "${anchor}"`, type: 'system' }],
    drawPile: pool,
    referee: null,
  };

  io.to(code).emit('gameStateUpdated', room.gameState);
  console.log('[chainLink] game initialized for room %s (%d players)', code, room.players.length);

  // Start 15-second turn timer
  clStartTurnTimer(code);
}

function clBreakChain(code) {
  const room = rooms[code];
  if (!room || room.gameState?.game !== 'chainLink') return;
  const gs = room.gameState;

  // Pick a new anchor from draw pile (or recycle a random noun)
  let newAnchor;
  if (gs.drawPile.length > 0) {
    newAnchor = gs.drawPile[0];
    gs.drawPile = gs.drawPile.slice(1);
  } else {
    newAnchor = CL_NOUNS[Math.floor(Math.random() * CL_NOUNS.length)];
  }

  // Show chain-broken phase briefly, then resume playing
  const brokenGs = {
    ...gs,
    phase: 'chainBroken',
    consecutiveSkips: 0,
    turnStartedAt: null,
    log: [...gs.log, { text: `Everyone skipped — chain broken! New anchor: "${newAnchor}"`, type: 'system' }],
  };
  room.gameState = brokenGs;
  io.to(code).emit('gameStateUpdated', brokenGs);
  console.log('[chainLink] chain broken in room %s — new anchor: %s', code, newAnchor);

  // After 2.5 seconds, start fresh chain with the new anchor
  const d = chainLinkRoomData[code] ?? {};
  if (d.turnTimer) { clearTimeout(d.turnTimer); d.turnTimer = null; }
  setTimeout(() => {
    const r = rooms[code];
    if (!r || r.gameState?.game !== 'chainLink' || r.gameState.phase !== 'chainBroken') return;
    const current = r.gameState;
    const resumeGs = {
      ...current,
      phase: 'playing',
      chain: [{ word: newAnchor, by: null, reason: 'anchor' }],
      turnIdx: (current.turnIdx + 1) % current.turnOrder.length,
      turnStartedAt: Date.now(),
    };
    r.gameState = resumeGs;
    io.to(code).emit('gameStateUpdated', resumeGs);
    clStartTurnTimer(code);
  }, 2500);
}

function clStartTurnTimer(code) {
  const d = chainLinkRoomData[code] ?? {};
  if (d.turnTimer) clearTimeout(d.turnTimer);
  d.turnTimer = setTimeout(() => {
    const room = rooms[code];
    if (!room || room.gameState?.game !== 'chainLink') return;
    const gs = room.gameState;
    if (gs.phase !== 'playing' || gs.pending || gs.referee) return;
    // Auto-skip current player
    const actorId = gs.turnOrder[gs.turnIdx];
    const actor = room.players.find(p => p.id === actorId);
    const newSkips = (gs.consecutiveSkips ?? 0) + 1;

    // If everyone skipped, break the chain
    if (newSkips >= gs.turnOrder.length) {
      gs.consecutiveSkips = newSkips;
      gs.log = [...gs.log, { text: `${actor?.name ?? actorId} ran out of time`, type: 'skip', playerId: actorId }];
      room.gameState = gs;
      clBreakChain(code);
      return;
    }

    const nextGs = {
      ...gs,
      consecutiveSkips: newSkips,
      turnIdx: (gs.turnIdx + 1) % gs.turnOrder.length,
      turnStartedAt: Date.now(),
      log: [...gs.log, { text: `${actor?.name ?? actorId} ran out of time`, type: 'skip', playerId: actorId }],
    };
    room.gameState = nextGs;
    io.to(code).emit('gameStateUpdated', nextGs);
    console.log('[chainLink] %s auto-skipped (timer) in room %s (consecutive: %d/%d)', actorId, code, newSkips, gs.turnOrder.length);
    clStartTurnTimer(code);
  }, 15000);
  chainLinkRoomData[code] = d;
}

async function callChainLinkReferee(prevWord, playedWord, reason) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[chainLink] ANTHROPIC_API_KEY not set — auto-accepting');
    return { verdict: 'VALID', why: 'No referee available — link accepted by default.' };
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are the referee in a word-chain party game. A player must link a new word to the previous word with a SPECIFIC, real connection (functional, physical, categorical, or strongly associative). Vague links like "both exist" or "both can be big" are REACHES and should be rejected. Reasonable everyday associations should be accepted.

Previous word: "${prevWord}"
New word: "${playedWord}"
Player's stated reason: "${reason || '(no reason given — judge based on the words alone)'}"

You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no extra text. Example:
{"verdict": "VALID", "why": "Both are kitchen appliances used for heating food"}`,
        }],
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[chainLink] referee API error %d: %s', res.status, errBody.slice(0, 200));
      return { verdict: 'VALID', why: 'Referee error — link accepted by default.' };
    }
    const json = await res.json();
    console.log('[chainLink] referee raw response:', JSON.stringify(json).slice(0, 300));
    const text = (json.content?.[0]?.text ?? '').replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    console.log('[chainLink] referee parsed text:', text);
    try {
      const parsed = JSON.parse(text);
      const verdict = parsed.verdict === 'VALID' ? 'VALID' : 'INVALID';
      const why = parsed.why || (verdict === 'VALID' ? 'Link accepted.' : 'Link rejected.');
      return { verdict, why };
    } catch {
      console.error('[chainLink] failed to parse referee JSON:', text);
      const verdict = /INVALID/i.test(text) ? 'INVALID' : 'VALID';
      // Extract explanation from raw text
      const why = text.replace(/[{}"]/g, '').replace(/verdict\s*:\s*\w+,?\s*/i, '').replace(/why\s*:\s*/i, '').trim().slice(0, 80) || 'Link accepted.';
      return { verdict, why };
    }
  } catch (e) {
    console.error('[chainLink] referee error:', e?.message);
    return { verdict: 'VALID', why: 'Referee timed out — link accepted by default.' };
  }
}

function clAcceptLink(code) {
  const room = rooms[code];
  if (!room) return;
  const gs = room.gameState;
  if (!gs || gs.game !== 'chainLink' || !gs.pending) return;
  const d = chainLinkRoomData[code];
  if (d?.challengeTimer) { clearTimeout(d.challengeTimer); d.challengeTimer = null; }

  const { card, reason, by } = gs.pending;
  const actor = room.players.find(p => p.id === by);
  // Card is already in chain and removed from hand (done in cl-play)
  const currentHand = gs.hands[by] ?? [];
  const newLog = [...gs.log, { text: `${actor?.name ?? by} played "${card}" — accepted`, type: 'valid', playerId: by }];

  // Check win
  const isWin = currentHand.length === 0;

  const nextGs = {
    ...gs,
    phase: isWin ? 'win' : 'playing',
    pending: null,
    challengeStartedAt: null,
    turnStartedAt: isWin ? null : Date.now(),
    referee: null,
    winner: isWin ? by : null,
    turnIdx: (gs.turnIdx + 1) % gs.turnOrder.length,
    log: newLog,
  };
  room.gameState = nextGs;
  io.to(code).emit('gameStateUpdated', nextGs);
  console.log('[chainLink] link accepted: "%s" in room %s | win=%s', card, code, isWin);

  // Start turn timer for next player (or stop if game ended)
  const td = chainLinkRoomData[code] ?? {};
  if (td.turnTimer) { clearTimeout(td.turnTimer); td.turnTimer = null; }
  chainLinkRoomData[code] = td;
  if (!isWin) clStartTurnTimer(code);
}

function clDrawCard(gs, playerId) {
  // Draw one card for a player (penalty). Returns updated hands + drawPile.
  if (gs.drawPile.length === 0) return { hands: gs.hands, drawPile: [] };
  const card = gs.drawPile[0];
  return {
    hands: { ...gs.hands, [playerId]: [...(gs.hands[playerId] ?? []), card] },
    drawPile: gs.drawPile.slice(1),
  };
}

// ── Plot Twist AI helpers ──────────────────────────────────────────────────────

async function ptGeneratePool(prompt, need) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[plotTwist] ANTHROPIC_API_KEY not set — using fallback words');
    return null;
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `A party game: players co-write a story from this prompt, each secretly trying to bait others into SAYING one of their target words. Generate a pool of ${need} DISTINCT target words for this prompt. EVERY word must be:\n- a single common noun, verb, or adjective (no proper nouns, no phrases)\n- clearly RELATED to the prompt so a player would plausibly and naturally use it while writing the story\n- common enough to actually come up — NOT obscure\n- not the single most obvious word, but everyday and sayable\n\nIt is critical that all words are genuinely relatable to the prompt — a word nobody would ever naturally say makes the game unfair.\n\nPrompt: "${prompt}"\n\nRespond with ONLY a JSON array of ${need} lowercase strings, no markdown: ["word1","word2",...]`,
        }],
      }),
    });
    if (!res.ok) {
      console.error('[plotTwist] generate API error %d', res.status);
      return null;
    }
    const json = await res.json();
    const text = (json.content?.[0]?.text ?? '').replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.length >= need * 0.8) {
      return [...new Set(arr.map(w => String(w).toLowerCase()))];
    }
    return null;
  } catch (e) {
    console.error('[plotTwist] generate error:', e.message);
    return null;
  }
}

async function ptJudgeSentence(sentence, allWords) {
  // allWords = [{idx, word}]
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fallback: stem-based matching
  const fallbackCheck = () => {
    const lower = sentence.toLowerCase();
    return allWords
      .filter(({ word }) => {
        const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return re.test(lower);
      })
      .map(({ idx }) => idx);
  };

  if (!apiKey) {
    console.warn('[plotTwist] ANTHROPIC_API_KEY not set — using fallback matching');
    return fallbackCheck();
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Sentence: "${sentence}"\n\nHere is a list of target words (with an index). For each, decide if the sentence contains that word OR a clear equivalent (plural, tense, or obvious synonym like cop/police, scared/afraid). Be reasonably generous on equivalents but do not match unrelated words.\n\nWords: ${JSON.stringify(allWords)}\n\nRespond with ONLY a JSON array of the "idx" values whose word is present, no markdown. Example: [0,4] or []`,
        }],
      }),
    });
    if (!res.ok) {
      console.error('[plotTwist] judge API error %d', res.status);
      return fallbackCheck();
    }
    const json = await res.json();
    const text = (json.content?.[0]?.text ?? '').replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) {
      return arr.filter(x => Number.isInteger(x) && x >= 0 && x < allWords.length);
    }
    return fallbackCheck();
  } catch (e) {
    console.error('[plotTwist] judge error:', e.message);
    return fallbackCheck();
  }
}

function cleanupPlotTwist(code) {
  const d = ptRoomData[code];
  if (!d) return;
  if (d.turnTimer) clearInterval(d.turnTimer);
  if (d.vetoTimer) clearTimeout(d.vetoTimer);
  delete ptRoomData[code];
}

// ── Plot Twist game logic ─────────────────────────────────────────────────────

async function initPlotTwistGame(code) {
  const room = rooms[code];
  if (!room) return;

  const playerList = room.players;
  const numPlayers = playerList.length;
  const HAND_SIZE = 5; // 4 regular + 1 hard per player
  const POOL_BUFFER = 12;
  const needRegular = numPlayers * 4 + Math.floor(POOL_BUFFER * 0.8);
  const needHard = numPlayers * 1 + Math.ceil(POOL_BUFFER * 0.2);
  const need = needRegular + needHard;

  // Pick a random prompt
  const promptIdx = Math.floor(Math.random() * PLOT_TWIST_PROMPTS.length);
  const prompt = PLOT_TWIST_PROMPTS[promptIdx];

  // Generate word pool (AI or fallback)
  let allWords = await ptGeneratePool(prompt, need);
  if (!allWords || allWords.length < numPlayers * HAND_SIZE) {
    const fb = PLOT_TWIST_FALLBACK_WORDS[promptIdx] || PLOT_TWIST_FALLBACK_WORDS[0];
    allWords = [...fb];
    while (allWords.length < need) {
      allWords.push(...['door','voice','hand','light','noise','shadow','smile','road','window','clock']);
    }
    allWords = [...new Set(allWords)].slice(0, need);
  }

  // Split into regular (common, easy) and hard (uncommon) words
  // The last ~20% of the AI-generated list tends to be less obvious; use those as hard
  const shuffled = allWords.sort(() => Math.random() - 0.5);
  const hardCount = needHard;
  const hardWords = shuffled.slice(0, hardCount);
  const regularWords = shuffled.slice(hardCount);

  // Deal: each player gets 4 regular + 1 hard = 5 words
  // Each word is {word, hard: boolean}
  const targets = {};
  let rCursor = 0, hCursor = 0;
  const turnOrder = playerList.map(p => p.id);
  for (const p of playerList) {
    const hand = [];
    for (let i = 0; i < 4; i++) hand.push({ word: regularWords[rCursor++], hard: false });
    hand.push({ word: hardWords[hCursor++], hard: true });
    // Shuffle hand so the hard word isn't always last
    hand.sort(() => Math.random() - 0.5);
    targets[p.id] = hand;
  }
  // Pool: remaining words (mix of regular and hard)
  const pool = [];
  for (let i = rCursor; i < regularWords.length; i++) pool.push({ word: regularWords[i], hard: false });
  for (let i = hCursor; i < hardWords.length; i++) pool.push({ word: hardWords[i], hard: true });
  pool.sort(() => Math.random() - 0.5);

  // Store secret data server-side
  ptRoomData[code] = { targets, pool, turnTimer: null, vetoTimer: null, vetoVotes: {} };

  // Build game state (targets are NOT included — they're secret)
  const gs = {
    game: 'plotTwist',
    phase: 'play',
    prompt,
    promptIdx,
    story: [],
    turn: 0,
    turnOrder,
    scores: Object.fromEntries(playerList.map(p => [p.id, 0])),
    winner: null,
    pending: null,      // {by, text} — sentence awaiting veto
    lastResult: null,   // {by, text, hits:[{ownerId, ownerName, word}]} — notification
    judging: false,
    turnLeft: 20,
  };

  room.gameState = gs;
  io.to(code).emit('gameStateUpdated', gs);

  // Send each player their private words
  for (const p of playerList) {
    // p.id is the stableId (persistentId). Look up their current socket.
    const sid = persistentToSocket[p.id] || persistentToSocket[p.persistentId] || p.id;
    console.log('[plotTwist] sending words to %s (socket %s): %s', p.name, sid, targets[p.id].map(w => w.word + (w.hard ? '*' : '')).join(', '));
    io.to(sid).emit('pt-myWords', { words: targets[p.id] });
  }

  // Start turn timer
  ptStartTurnTimer(code);

  console.log('[plotTwist] game initialized in room %s — %d players, %d pool words', code, numPlayers, pool.length);
}

function ptStartTurnTimer(code) {
  const d = ptRoomData[code];
  if (!d) return;
  if (d.turnTimer) clearInterval(d.turnTimer);

  const room = rooms[code];
  if (!room || room.gameState?.game !== 'plotTwist') return;

  // Reset turnLeft to 20
  room.gameState.turnLeft = 20;
  io.to(code).emit('gameStateUpdated', room.gameState);

  // Tick every second
  let left = 20;
  d.turnTimer = setInterval(() => {
    const r = rooms[code];
    if (!r || r.gameState?.game !== 'plotTwist' || r.gameState.phase !== 'play') {
      clearInterval(d.turnTimer);
      d.turnTimer = null;
      return;
    }
    const gs = r.gameState;
    if (gs.pending || gs.judging || gs.lastResult) return; // pause timer during veto/judging/notification

    left--;
    gs.turnLeft = left;
    io.to(code).emit('gameStateUpdated', gs);

    if (left <= 0) {
      clearInterval(d.turnTimer);
      d.turnTimer = null;
      // Auto-skip with -1 penalty
      const currentPlayerId = gs.turnOrder[gs.turn];
      gs.scores[currentPlayerId] = Math.max(0, (gs.scores[currentPlayerId] || 0) - 1);
      const player = r.players.find(p => p.id === currentPlayerId);
      if (player) player.score = gs.scores[currentPlayerId];
      io.to(code).emit('scoresUpdated', r.players);
      ptAdvanceTurn(code);
    }
  }, 1000);
}

function ptAdvanceTurn(code) {
  const room = rooms[code];
  if (!room || room.gameState?.game !== 'plotTwist') return;
  const gs = room.gameState;
  gs.turn = (gs.turn + 1) % gs.turnOrder.length;
  gs.pending = null;
  gs.judging = false;
  gs.lastResult = null;
  io.to(code).emit('gameStateUpdated', gs);
  ptStartTurnTimer(code);
}

function ptGetPlayerSocket(code, playerId) {
  return persistentToSocket[playerId] || playerId;
}

async function ptResolveVeto(code) {
  const room = rooms[code];
  if (!room || room.gameState?.game !== 'plotTwist') return;
  const gs = room.gameState;
  const d = ptRoomData[code];
  if (!d || !gs.pending) return;

  const nonWriters = gs.turnOrder.filter(id => id !== gs.pending.by);
  const vetoCount = Object.values(d.vetoVotes).filter(v => v === 'veto').length;
  const majority = Math.floor(nonWriters.length / 2) + 1;

  if (vetoCount >= majority) {
    // Vetoed — skip turn
    console.log('[plotTwist] sentence vetoed in room %s (%d/%d votes)', code, vetoCount, nonWriters.length);
    gs.pending = null;
    io.to(code).emit('gameStateUpdated', gs);
    // Brief pause then advance
    setTimeout(() => ptAdvanceTurn(code), 1500);
  } else {
    // Allowed — judge the sentence
    const { by, text } = gs.pending;
    gs.pending = null;
    gs.judging = true;
    io.to(code).emit('gameStateUpdated', gs);
    await ptResolveSentence(code, by, text);
  }
}

async function ptResolveSentence(code, by, text) {
  const room = rooms[code];
  if (!room || room.gameState?.game !== 'plotTwist') return;
  const gs = room.gameState;
  const d = ptRoomData[code];
  if (!d) return;

  // Build flat word list with indices — words are {word, hard} objects
  const flat = [];
  for (const [playerId, words] of Object.entries(d.targets)) {
    for (const entry of words) {
      const w = entry.word || entry; // handle {word,hard} or plain string
      const hard = entry.hard || false;
      flat.push({ idx: flat.length, player: playerId, word: w, hard });
    }
  }

  // AI judge
  const hitIndices = await ptJudgeSentence(text, flat.map(f => ({ idx: f.idx, word: f.word })));
  const allHits = hitIndices.map(idx => flat[idx]).filter(Boolean);

  // Filter out self-hits
  const scoringHits = allHits.filter(h => h.player !== by);

  // Calculate scores — regular words = 1pt, hard words = 3pts
  let writerLoss = 0;
  const gainByPlayer = {};
  scoringHits.forEach(h => {
    const pts = h.hard ? 3 : 1;
    gainByPlayer[h.player] = (gainByPlayer[h.player] || 0) + pts;
    writerLoss += pts;
  });

  // Apply scores (floor at 0 — can never go negative)
  for (const [pid, gain] of Object.entries(gainByPlayer)) {
    gs.scores[pid] = (gs.scores[pid] || 0) + gain;
    const player = room.players.find(p => p.id === pid);
    if (player) player.score = gs.scores[pid];
  }
  gs.scores[by] = Math.max(0, (gs.scores[by] || 0) - writerLoss);
  const writerPlayer = room.players.find(p => p.id === by);
  if (writerPlayer) writerPlayer.score = gs.scores[by];

  // Replace used words from pool
  // Hard words must be replaced by hard words, regular by regular
  // A player should never have 2 hard words at once
  const replacements = [];
  for (const h of scoringHits) {
    const hand = d.targets[h.player];
    if (!hand) continue;
    const idx = hand.findIndex(e => (e.word || e) === h.word);
    if (idx >= 0) {
      let repl = null;
      if (h.hard) {
        // Find a hard replacement from pool
        const hardIdx = d.pool.findIndex(e => e.hard);
        if (hardIdx >= 0) {
          repl = d.pool.splice(hardIdx, 1)[0];
        } else {
          // No hard words left — use a regular one (rare)
          repl = d.pool.length > 0 ? d.pool.shift() : null;
        }
      } else {
        // Find a regular (non-hard) replacement from pool
        const regIdx = d.pool.findIndex(e => !e.hard);
        if (regIdx >= 0) {
          repl = d.pool.splice(regIdx, 1)[0];
        } else {
          // No regular words left — use whatever is available
          repl = d.pool.length > 0 ? d.pool.shift() : null;
        }
      }
      if (repl) {
        hand[idx] = repl;
        replacements.push({ playerId: h.player, oldWord: h.word, newWord: repl.word || repl });
      } else {
        hand.splice(idx, 1);
        replacements.push({ playerId: h.player, oldWord: h.word, newWord: null });
      }
    }
  }

  // Build story line
  const byPlayer = room.players.find(p => p.id === by);
  const hitInfo = scoringHits.map(h => {
    const owner = room.players.find(p => p.id === h.player);
    const pts = h.hard ? 3 : 1;
    return { ownerId: h.player, ownerName: owner?.name ?? 'Unknown', word: h.word, hard: h.hard, pts };
  });

  gs.story.push({ by, byName: byPlayer?.name ?? 'Unknown', text, hits: hitInfo });

  // Check for winner
  const WIN = 7;
  let winnerId = null;
  for (const [pid, score] of Object.entries(gs.scores)) {
    if (score >= WIN) { winnerId = pid; break; }
  }

  gs.judging = false;

  if (scoringHits.length > 0) {
    gs.lastResult = { by, byName: byPlayer?.name ?? 'Unknown', text, hits: hitInfo, replacements };
  } else {
    gs.lastResult = null;
  }

  if (winnerId) {
    gs.winner = winnerId;
    gs.phase = 'gameover';
    // Reveal all words on game over
    gs.revealTargets = {};
    for (const [pid, words] of Object.entries(d.targets)) {
      gs.revealTargets[pid] = [...words];
    }
  }

  io.to(code).emit('gameStateUpdated', gs);
  io.to(code).emit('scoresUpdated', room.players);

  // Send updated private words to affected players
  for (const r of replacements) {
    const sid = ptGetPlayerSocket(code, r.playerId);
    if (sid) {
      io.to(sid).emit('pt-myWords', { words: d.targets[r.playerId] || [] });
    }
  }

  if (winnerId) {
    cleanupPlotTwist(code);
    return;
  }

  // After notification delay, advance turn
  const delay = scoringHits.length > 0 ? 4500 : 900;
  setTimeout(() => {
    const r = rooms[code];
    if (!r || r.gameState?.game !== 'plotTwist') return;
    r.gameState.lastResult = null;
    ptAdvanceTurn(code);
  }, delay);
}

// ── Game state bootstrap ──────────────────────────────────────────────────────
// Builds a usable initial gameState so clients receive a real state in
// `gameStarted` and never need to wait on a second `gameStateUpdated` emit
// just to get their first renderable state.
function buildInitialGameState(game) {
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  switch (game) {
    case 'lieDetector':
      return { game, phase: 'intro', prompt: '', speakerIndex: 0, votedPlayerIds: [] };
    case 'talentShow':
      return {
        game, round: 1, phase: 'intro',
        prompt: pick(TALENT_SHOW_PROMPTS),
        timerStartedAt: null, timerDuration: 3000, nextActDuration: 30000,
        performerQueue: [], currentPerformerIdx: 0,
        buzzedPlayerIds: [], goldenPlayerIds: [], totalVoters: 0,
        r1Results: [], eliminatedPlayerIds: [],
        r2Results: [], r2VoterIds: [],
        r2Votes: [], r2SubmittedVoterIds: [],
        tiebreakerCandidates: [], tiebreakerSpotsNeeded: 1, tiebreakerAlreadyAdvanced: [],
        tbVotes: [], tbSubmittedVoterIds: [], tbVoterIds: [],
        r1NeutralVoterIds: [], r1NeutralVotes: [], r1NeutralSubmittedIds: [],
        r3FinalistIds: [], r3Results: [],
        r3Votes: [], r3SubmittedVoterIds: [], r3VoterIds: [],
        winnerId: null, runnerUpId: null,
      };
    case 'standOut': {
      const prompt = pick(STAND_OUT_PROMPTS);
      return { game, phase: 'intro', roundNumber: 1, currentPrompt: prompt, submittedPlayerIds: [] };
    }
    case 'numberGuessor': {
      const prompt = pick(NUMBER_GUESSOR_PROMPTS);
      return {
        game,
        phase: 'intro',
        round: 1,
        currentPrompt: prompt,
        submittedGuesserIds: [],
        guesses: [],
        totalScores: {},
        timerStartedAt: null,
        streaks: {},
      };
    }
    case 'pieCharts':
      return { game, phase: 'intro', questions: [], questionIdx: 0, submittedVoterIds: [], allVotes: [] };
    case 'dealOrSteal':
      return { game, phase: 'intro', round: 1, balances: {} };
    case 'potLuck':
      return { game, phase: 'intro', pot: 1, potCap: 5, winMultiplier: 5, target: 0, order: [], seatPtr: 0, consecutiveSkips: 0, usedQuestionIds: [], currentQuestion: null, lastResult: null, revealInfo: null, winnerId: null };
    case 'chainLink':
      return { game, phase: 'intro', hands: {}, chain: [], turnOrder: [], turnIdx: 0, pending: null, challengeStartedAt: null, turnStartedAt: null, consecutiveSkips: 0, winner: null, log: [], drawPile: [], referee: null };
    case 'plotTwist':
      return { game, phase: 'intro', prompt: '', story: [], turn: 0, turnOrder: [], scores: {}, winner: null };
    case 'shadowProtocol':
      return { game, phase: 'intro' };
    default:
      return { game, phase: 'start' };
  }
}

// ── HTTP health check ─────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length });
});

/** Returns the stable canonical player ID for a socket (persistentId if known, else socket.id). */
function stableId(socketId) {
  return playerPersistentIds[socketId] ?? socketId;
}

/**
 * Check whether a socket is the host of a room.
 * Handles the reconnection race where playerPersistentIds hasn't been
 * populated yet for the new socket ID — falls back to checking whether
 * this socket's persistentId matches the hostId via persistentToSocket.
 */
function isHost(room, socketId) {
  if (!room) return false;
  const callerId = stableId(socketId);
  if (room.hostId === callerId) return true;
  // Fallback: check if socket's registered persistentId matches hostId
  const pid = playerPersistentIds[socketId];
  if (pid && room.hostId === pid) return true;
  // Reverse fallback: check if hostId maps to this socket via persistentToSocket
  if (persistentToSocket[room.hostId] === socketId) return true;
  return false;
}

/** Cancel a pending disconnect timer for a player identified by persistentId. */
function cancelPendingDisconnect(persistentId) {
  const oldSocketId = persistentId && persistentToSocket[persistentId];
  if (oldSocketId && disconnectTimers[oldSocketId]) {
    clearTimeout(disconnectTimers[oldSocketId]);
    delete disconnectTimers[oldSocketId];
    console.log('[grace] cancelled timer for persistentId=%s oldSocket=%s', persistentId, oldSocketId);
  }
}

// ── Number Guessor: reveal/scoring helper ─────────────────────────────────────
function resolveNGRound(code) {
  const room = rooms[code];
  if (!room || room.gameState?.game !== 'numberGuessor') return;
  if (room.gameState.phase !== 'guessing') return;

  // Cancel any pending server-side timer
  if (room.ngTimerTimeout) {
    clearTimeout(room.ngTimerTimeout);
    room.ngTimerTimeout = null;
  }

  const gs = room.gameState;
  const correctAnswer = gs.currentPrompt.correctAnswer;

  const results = room.players.map((player) => {
    const guessObj = (gs.guesses ?? []).find((g) => g.playerId === player.id);
    const timedOut = guessObj?.timedOut ?? false;
    const guess    = timedOut ? null : (guessObj?.value ?? null);
    const distance = guess !== null ? Math.abs(guess - correctAnswer) : 100;
    // timeTaken: seconds elapsed when submitted (1–20); timed-out = 20
    const timeTaken = timedOut ? 20 : Math.max(1, guessObj?.timeTaken ?? 20);
    return { playerId: player.id, playerName: player.name, guess, distance, timeTaken, timedOut };
  });

  // sort by distance ascending for display (closest first)
  results.sort((a, b) => a.distance - b.distance);

  // accumulate scores (lower = better); penalty = distance off + seconds taken
  if (!gs.totalScores) gs.totalScores = {};
  const roundScores = {};
  for (const r of results) {
    const penalty = r.distance + r.timeTaken;
    roundScores[r.playerId] = penalty;
    gs.totalScores[r.playerId] = (gs.totalScores[r.playerId] ?? 0) + penalty;
  }

  gs.phase        = 'reveal';
  gs.targetNumber = correctAnswer;
  gs.results      = results;
  gs.roundScores  = roundScores;

  io.to(code).emit('gameStateUpdated', gs);
}

// ── Socket events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[connect] id=%s totalClients=%d', socket.id, io.engine.clientsCount);

  // ── Re-register persistentId after reconnect ─────────────────────────────────
  // When a socket reconnects it gets a new socket.id. The client sends this
  // immediately on 'connect' so stableId() keeps working for all subsequent events.
  socket.on('registerPersistentId', ({ persistentId }) => {
    if (!persistentId) return;
    // Update the old socketId → persistentId mapping if it changed
    const oldSocketId = persistentToSocket[persistentId];
    if (oldSocketId && oldSocketId !== socket.id) {
      delete playerPersistentIds[oldSocketId];
    }
    // Cancel pending disconnect BEFORE updating persistentToSocket, so it finds the old socket's timer
    cancelPendingDisconnect(persistentId);
    playerPersistentIds[socket.id] = persistentId;
    persistentToSocket[persistentId] = socket.id;
    // Re-join any room socket channel the player was already in
    for (const code in rooms) {
      const room = rooms[code];
      if (room.players.find(p => p.id === persistentId || p.persistentId === persistentId)) {
        socket.join(code);
        console.log('[registerPersistentId] pid=%s rejoined channel %s', persistentId, code);
        // Send fresh room state to the reconnecting player so their UI is up to date.
        // If a game is in progress, send gameStarted so the client navigates to the correct game screen.
        if (room.phase === 'playing') {
          socket.emit('gameStarted', room);
        } else {
          socket.emit('roomUpdated', room);
        }
        break;
      }
    }
  });

  // ── Create room ─────────────────────────────────────────────────────────────
  socket.on('createRoom', ({ playerName, persistentId }, ack) => {
    console.log('[createRoom] socket=%s playerName=%s persistentId=%s', socket.id, playerName, persistentId);
    // Register FIRST so stableId() works in removeSocketFromAllRooms
    if (persistentId) {
      playerPersistentIds[socket.id] = persistentId;
      persistentToSocket[persistentId] = socket.id;
    }
    cancelPendingDisconnect(persistentId);
    removeSocketFromAllRooms(socket.id);

    const playerId = stableId(socket.id);
    const code = generateCode();
    rooms[code] = {
      hostId:    playerId,
      code,
      players:   [{ id: playerId, name: playerName, score: 0, persistentId: persistentId ?? null }],
      phase:     'lobby',
      hostScreen: 'lobby',
      gameState: {},
    };
    socket.join(code);
    socket.emit('roomCreated', { code, room: rooms[code] });
    console.log('[createRoom] created code=%s by %s', code, playerName);
    if (ack) ack({ ok: true });
  });

  // ── Join room ────────────────────────────────────────────────────────────────
  socket.on('joinRoom', ({ code, playerName, persistentId }, ack) => {
    console.log('[joinRoom] socket=%s code=%s playerName=%s persistentId=%s', socket.id, code, playerName, persistentId);
    const room = rooms[code];
    if (!room) {
      console.log('[joinRoom] room %s not found. Active rooms: %s', code, Object.keys(rooms).join(', ') || '(none)');
      socket.emit('error', { message: 'Room not found — check the code and try again.' });
      if (ack) ack({ ok: false, message: 'Room not found — check the code and try again.' });
      return;
    }

    // Cancel any pending grace-period disconnect for this player
    cancelPendingDisconnect(persistentId);

    // Register persistentId → socket mapping
    if (persistentId) {
      playerPersistentIds[socket.id] = persistentId;
      persistentToSocket[persistentId] = socket.id;
    }

    // ── Reject ALL joins if a game is in progress ─────────────────────────────
    // Only allow reconnecting players who are still in the players list AND
    // were disconnected (their socket left the channel). Brand new players
    // and players who voluntarily left are always blocked mid-game.
    if (room.phase === 'playing') {
      const existingPlayer = persistentId
        ? room.players.find(p => p.persistentId === persistentId || p.id === persistentId)
        : null;

      if (existingPlayer) {
        // Genuine reconnect — they're still in the players list, let them back in
        socket.join(code);
        socket.emit('gameStarted', room);
        io.to(code).emit('roomUpdated', room);
        console.log('[joinRoom] %s RECONNECTED mid-game in room %s', playerName, code);
        if (ack) ack({ ok: true });
      } else {
        // New player trying to join mid-game — reject
        socket.emit('error', { message: 'Game in progress — try again when this round ends.' });
        if (ack) ack({ ok: false, message: 'Game in progress — try again when this round ends.' });
        console.log('[joinRoom] REJECTED %s — game in progress in room %s', playerName, code);
      }
      return;
    }

    // ── Rejoin: player was previously in this room (lobby phase) ────────────
    const existingPlayer = persistentId
      ? room.players.find(p => p.persistentId === persistentId)
      : null;

    if (existingPlayer) {
      socket.join(code);
      socket.emit('roomUpdated', room);
      io.to(code).emit('roomUpdated', room);
      console.log('[joinRoom] %s REJOINED room %s', playerName, code);
      if (ack) ack({ ok: true });
      return;
    }

    // ── Leave any other rooms first ───────────────────────────────────────────
    const joinerStableId = stableId(socket.id);
    for (const existingCode in rooms) {
      if (existingCode === code) continue;
      const existing = rooms[existingCode];
      if (!existing.players.find(p => p.id === joinerStableId)) continue;

      const wasHost = existing.hostId === joinerStableId;
      existing.players = existing.players.filter(p => p.id !== joinerStableId);

      if (existing.players.length === 0) {
        delete rooms[existingCode];
      } else if (wasHost) {
        existing.hostId = existing.players[0].id;
        io.to(existingCode).emit('hostChanged', { newHostId: existing.hostId, room: existing });
      } else {
        io.to(existingCode).emit('roomUpdated', existing);
      }

      socket.leave(existingCode);
    }

    // ── New player joining ───────────────────────────────────────────────────
    if (!room.players.find(p => p.id === joinerStableId)) {
      room.players.push({ id: joinerStableId, name: playerName, score: 0, persistentId: persistentId ?? null });
    }
    socket.join(code);
    if (room.phase === 'playing') {
      socket.emit('gameStarted', room);
      io.to(code).emit('roomUpdated', room);
    } else {
      io.to(code).emit('roomUpdated', room);
    }
    console.log('[joinRoom] %s joined room %s', playerName, code);
    if (ack) ack({ ok: true });
  });

  // ── Leave room (voluntary) ───────────────────────────────────────────────────
  socket.on('leaveRoom', ({ code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }

    const leaverId = stableId(socket.id);
    const wasHost = room.hostId === leaverId;
    room.players  = room.players.filter(p => p.id !== leaverId);
    socket.leave(code);
    socket.emit('leftRoom', { code });

    if (room.players.length === 0) {
      cleanupPlotTwist(code);
      delete rooms[code];
      delete dosRoundData[code];
      console.log(`Room ${code} deleted (empty after leave)`);
      return;
    }

    if (wasHost) {
      room.hostId = room.players[0].id;
      io.to(code).emit('hostChanged', { newHostId: room.hostId, room });
    } else {
      io.to(code).emit('roomUpdated', room);
    }

    checkGameProgressAfterLeave(code, leaverId);
  });

  // ── Cancel room (host only — kicks everyone) ─────────────────────────────────
  socket.on('cancelRoom', ({ code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }
    if (!isHost(room, socket.id)) { socket.emit('error', { message: 'Only the host can cancel the room.' }); return; }

    io.to(code).emit('roomCancelled', { code });
    cleanupPlotTwist(code);
    delete rooms[code];
    console.log(`Room ${code} cancelled by host`);
  });

  // ── Start game ───────────────────────────────────────────────────────────────
  socket.on('startGame', ({ code, game, persistentId, potCap }, ack) => {
    // Re-register persistentId mapping in case of reconnect before registerPersistentId arrived
    if (persistentId) {
      const old = persistentToSocket[persistentId];
      if (old && old !== socket.id) delete playerPersistentIds[old];
      playerPersistentIds[socket.id] = persistentId;
      persistentToSocket[persistentId] = socket.id;
      cancelPendingDisconnect(persistentId);
    }
    console.log('[startGame] socket=%s stableId=%s code=%s game=%s', socket.id, stableId(socket.id), code, game);
    const room = rooms[code];
    if (!room) {
      console.warn('[startGame] room %s not found', code);
      if (ack) ack({ ok: false, message: 'Room not found' });
      return;
    }
    if (!isHost(room, socket.id)) {
      console.warn('[startGame] socket %s stableId %s is not host %s of room %s', socket.id, stableId(socket.id), room.hostId, code);
      if (ack) ack({ ok: false, message: 'Not the host' });
      return;
    }
    // Guard: Deal or Steal requires 4–6 players
    if (game === 'dealOrSteal' && (room.players.length < 4 || room.players.length > 6)) {
      console.warn('[startGame] dealOrSteal requires 4-6 players, got %d in room %s', room.players.length, code);
      if (ack) ack({ ok: false, message: `Deal or Steal requires 4–6 players. Currently: ${room.players.length}` });
      return;
    }
    room.phase      = 'playing';
    room.hostScreen = 'playing';
    room.gameState  = buildInitialGameState(game);
    // Reset all player scores at the start of every game
    room.players = room.players.map(p => ({ ...p, score: 0 }));
    // Reset Lie Detector secret store
    if (game === 'lieDetector') {
      ldRoomData[code] = null;
    }
    // Reset Stand Out per-round accumulators
    if (game === 'standOut') {
      room.standOutAnswers     = [];
      room.standOutRoundScored = false;
    }
    // Store pot cap for when host starts from intro
    if (game === 'potLuck' && typeof potCap === 'number') {
      room.potLuckPotCap = Math.min(10, Math.max(5, potCap));
    }
    console.log('[startGame] broadcasting gameStarted to room %s (%d players)', code, room.players.length);
    io.to(code).emit('gameStarted', room);
    if (ack) ack({ ok: true });
  });

  // ── Set host screen (host only) — mirrors host navigation to non-hosts ────────
  socket.on('setHostScreen', ({ code, screen }) => {
    const room = rooms[code];
    if (!room) return;
    if (!isHost(room, socket.id)) return;
    room.hostScreen = screen;
    io.to(code).emit('roomUpdated', room);
  });

  // ── Kick player (host only) ──────────────────────────────────────────────────
  socket.on('kickPlayer', ({ code, playerId }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }
    if (!isHost(room, socket.id)) { socket.emit('error', { message: 'Only the host can kick players.' }); return; }
    if (playerId === room.hostId) return; // can't kick yourself

    const targetSocketId = persistentToSocket[playerId];
    room.players = room.players.filter(p => p.id !== playerId);

    // Kick the target off the room channel and notify them
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) targetSocket.leave(code);
      io.to(targetSocketId).emit('playerKicked', { code });
    }

    io.to(code).emit('roomUpdated', room);
    console.log('[kickPlayer] player %s kicked from room %s', playerId, code);
  });

  // ── End game early → host returns to game select, others return to waiting ───
  socket.on('endGame', ({ code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }
    if (!isHost(room, socket.id)) { socket.emit('error', { message: 'Only the host can end the game.' }); return; }

    room.phase      = 'lobby';
    room.hostScreen = 'selecting';
    room.gameState  = {};
    // Clear game-specific server state
    ldRoomData[code]  = null;
    dosRoundData[code] = { actions: {} };
    if (room.ngTimerTimeout) { clearTimeout(room.ngTimerTimeout); room.ngTimerTimeout = null; }
    room.standOutAnswers     = [];
    room.standOutRoundScored = false;
    cleanupPotLuck(code);
    cleanupPlotTwist(code);

    io.to(code).emit('gameEnded', room);
    console.log('[endGame] host ended game in room %s', code);
  });

  // ── Restart current game from scratch ─────────────────────────────────────────
  socket.on('restartGame', ({ code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }
    if (!isHost(room, socket.id)) { socket.emit('error', { message: 'Only the host can restart the game.' }); return; }

    const game = room.gameState?.game;
    if (!game) return;

    // Reset game-specific server state the same way startGame does
    ldRoomData[code]  = null;
    dosRoundData[code] = { actions: {} };
    if (room.ngTimerTimeout) { clearTimeout(room.ngTimerTimeout); room.ngTimerTimeout = null; }
    room.standOutAnswers     = [];
    room.standOutRoundScored  = false;
    cleanupPotLuck(code);
    cleanupPlotTwist(code);

    room.gameState  = buildInitialGameState(game);
    room.players    = room.players.map(p => ({ ...p, score: 0 }));
    room.phase      = 'playing';
    room.hostScreen = 'playing';

    io.to(code).emit('gameStarted', room);
    console.log('[restartGame] room %s restarted game %s', code, game);
  });

  // ── Update game state (host only) ────────────────────────────────────────────
  socket.on('updateGameState', ({ code, gameState }) => {
    console.log('[updateGameState] socket=%s code=%s phase=%s', socket.id, code, gameState?.phase ?? gameState?.currentPhase ?? '?');
    const room = rooms[code];
    if (!room) { console.warn('[updateGameState] room %s not found', code); socket.emit('error', { message: 'Room no longer exists.' }); return; }
    if (!isHost(room, socket.id)) { console.warn('[updateGameState] socket %s is not host of %s', socket.id, code); socket.emit('error', { message: 'Only the host can update game state.' }); return; }

    // Stand Out: clear accumulated answers + scored flag at the start of every round
    if (gameState?.game === 'standOut' && (gameState?.phase === 'prompt' || gameState?.phase === 'entering')) {
      room.standOutAnswers     = [];
      room.standOutRoundScored = false;
      console.log('[standOut] %s phase — answers + roundScored reset for room %s', gameState.phase, code);
    }

    // Number Guessor: clear guesses each time a new guessing phase starts
    if (gameState?.game === 'numberGuessor' && gameState?.phase === 'guessing') {
      gameState.guesses = [];
      gameState.submittedGuesserIds = [];
      // timerStartedAt is set by the host client when it broadcasts the guessing phase
      console.log('[numberGuessor] guessing phase — guesses reset for room', code);

      // Server-side safety timer: resolve round 21s after it started (1s buffer)
      if (room.ngTimerTimeout) clearTimeout(room.ngTimerTimeout);
      room.ngTimerTimeout = setTimeout(() => {
        console.log('[numberGuessor] server timer fired for room', code);
        resolveNGRound(code);
      }, 21000);
    }

    room.gameState = gameState;
    io.to(code).emit('gameStateUpdated', gameState);
  });

  // ── Player action (any player) ───────────────────────────────────────────────
  socket.on('playerAction', ({ code, action, data }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }

    // ── Generic: advance from intro screen (host only) ──────────────────────
    if (action === 'advanceFromIntro') {
      if (!isHost(room, socket.id)) return;
      const gs = room.gameState;
      if (!gs || gs.phase !== 'intro') return;

      const game = gs.game;
      // Determine the real starting phase for each game
      const STARTING_PHASES = {
        lieDetector: 'setup',
        talentShow: 'prep',
        standOut: 'prompt',
        numberGuessor: 'guessing',
        pieCharts: 'setup',
        dealOrSteal: 'setup',
        shadowProtocol: 'setup',
        potLuck: 'rolling',
        chainLink: 'playing',
        plotTwist: 'dealing',
      };

      const nextPhase = STARTING_PHASES[game] || 'setup';

      // Games with async init
      if (game === 'potLuck') {
        gs.phase = nextPhase;
        initPotLuckGame(code);
        return;
      }
      if (game === 'chainLink') {
        gs.phase = nextPhase;
        initChainLinkGame(code);
        return;
      }
      if (game === 'plotTwist') {
        gs.phase = 'dealing';
        io.to(code).emit('gameStateUpdated', gs);
        initPlotTwistGame(code).catch(err => console.error('[plotTwist] init failed:', err));
        return;
      }

      // All other games: just advance the phase
      gs.phase = nextPhase;
      room.gameState = gs;
      io.to(code).emit('gameStateUpdated', gs);
      console.log('[advanceFromIntro] %s → phase %s in room %s', game, nextPhase, code);
      return;
    }

    // ── Stand Out: server owns answer collection + scoring ───────────────────
    if (action === 'so-answer') {
      // ── A. Event received ──────────────────────────────────────────────────
      const actualGame  = room.gameState?.game;
      const actualPhase = room.gameState?.phase;
      console.log('[SO-A] so-answer received | socket:%s | room:%s | game:%s | phase:%s | data:%j',
        socket.id, code, actualGame, actualPhase, data);

      // Guard: only process during the correct game + phase
      if (actualGame !== 'standOut' || actualPhase !== 'entering') {
        console.warn('[SO-A] IGNORED — expected game=standOut phase=entering, got game=%s phase=%s | DIAGNOSE: host may not have sent updateGameState yet',
          actualGame, actualPhase);
        io.to(code).emit('playerActionReceived', { playerId: stableId(socket.id), action, data });
        return;
      }

      const gs = room.gameState;
      const soPlayerId = stableId(socket.id);

      // Deduplicate — ignore if this player already submitted this round
      if ((gs.submittedPlayerIds ?? []).includes(soPlayerId)) {
        console.warn('[SO-A] DUPLICATE — playerId already in submittedPlayerIds:', soPlayerId);
        return;
      }

      // Hard guard: scoring already ran (must be reset by updateGameState entering)
      if (room.standOutRoundScored) {
        console.warn('[SO-A] BLOCKED by standOutRoundScored=true — late submission from', soPlayerId,
          '| This flag should have been reset when phase->entering arrived');
        return;
      }

      const player = room.players.find(p => p.id === soPlayerId);
      if (!player) {
        console.warn('[SO-A] PLAYER NOT FOUND | socket:%s stableId:%s | room.players:%j',
          socket.id, soPlayerId, room.players.map(p => ({ id: p.id, name: p.name })));
        return;
      }

      // Ensure accumulators exist
      if (!Array.isArray(room.standOutAnswers)) room.standOutAnswers = [];

      room.standOutAnswers.push({ playerId: soPlayerId, playerName: player.name, text: data.text });
      const newSubmitted = [...(gs.submittedPlayerIds ?? []), soPlayerId];

      // ── B. After inserting answer ──────────────────────────────────────────
      console.log('[SO-B] answer inserted | answers:%j | count:%d | playerIds:%j',
        room.standOutAnswers,
        room.standOutAnswers.length,
        room.standOutAnswers.map(a => a.playerId));

      // ── C. Completion check — use Set over stored answers to be duplicate-safe
      const uniqueSubmitters = new Set(room.standOutAnswers.map(a => a.playerId));
      const expected = room.players.length;
      const received = uniqueSubmitters.size;
      console.log('[SO-C] completion check | expected:%d | received:%d | room.players:%j',
        expected, received, room.players.map(p => p.id));

      if (received >= expected) {
        // ── D. Before scoring ──────────────────────────────────────────────
        console.log('[SO-D] TRIGGERING SCORING | answers:%d | players:%d',
          room.standOutAnswers.length, room.players.length);
        room.standOutRoundScored = true;

        const { deltas, updatedPlayers } = scoreStandOutRound(
          room.standOutAnswers,
          room.players,
        );
        room.players = updatedPlayers;

        const winTarget2 = gs.targetScore ?? STAND_OUT_WIN_SCORE;
        const top        = [...updatedPlayers].sort((a, b) => b.score - a.score)[0];
        const isGameOver = top && top.score >= winTarget2;
        const winners2   = isGameOver ? updatedPlayers.filter(p => p.score >= winTarget2) : [];
        const winnerName2 = winners2.length > 1 ? winners2.map(p => p.name).join(' & ') : (top?.name ?? '');

        const nextGs = {
          ...gs,
          phase:              isGameOver ? 'game-over' : 'reveal',
          submittedPlayerIds: newSubmitted,
          answers:            room.standOutAnswers,
          roundDeltas:        deltas,
          ...(isGameOver ? { winnerName: winnerName2 } : {}),
        };
        room.gameState = nextGs;

        // ── E. After scoring ───────────────────────────────────────────────
        console.log('[SO-E] scoring done | new phase:%s | scores:%j',
          nextGs.phase, updatedPlayers.map(p => ({ name: p.name, score: p.score })));
        console.log('[SO-E] emitting gameStateUpdated + scoresUpdated to room', code);

        io.to(code).emit('gameStateUpdated', nextGs);
        io.to(code).emit('scoresUpdated', updatedPlayers);

        console.log('[SO-E] emit complete');
      } else {
        // Partial — broadcast updated submitted list (answers stay hidden)
        const nextGs = { ...gs, submittedPlayerIds: newSubmitted };
        room.gameState = nextGs;
        console.log('[SO-C] partial — emitting gameStateUpdated submitted:%d/%d', received, expected);
        io.to(code).emit('gameStateUpdated', nextGs);
      }

      return; // Do NOT relay to playerActionReceived
    }

    // ── Stand Out: entering timer expired (host only) ────────────────────────
    if (room.gameState?.game === 'standOut' && action === 'so-timer-expired') {
      if (room.gameState.phase !== 'entering') return;
      if (room.standOutRoundScored) return;

      if (!Array.isArray(room.standOutAnswers)) room.standOutAnswers = [];

      const gs = room.gameState;
      const answeredIds = new Set(room.standOutAnswers.map(a => a.playerId));
      const newSubmitted = [...(gs.submittedPlayerIds ?? [])];
      const timedOutDeltas = [];

      // Auto-submit every player who didn't answer with a -10 penalty
      for (const player of room.players) {
        if (!answeredIds.has(player.id)) {
          room.standOutAnswers.push({ playerId: player.id, playerName: player.name, text: '(no answer)', timedOut: true });
          newSubmitted.push(player.id);
          timedOutDeltas.push({ playerId: player.id, playerName: player.name, delta: -10, streakCount: 0, timedOut: true });
        }
      }

      room.standOutRoundScored = true;

      // Score only players who actually answered (exclude timed-out placeholders)
      const answeredAnswers = room.standOutAnswers.filter(a => !a.timedOut);
      const { deltas: answeredDeltas, updatedPlayers: intermediate } = scoreStandOutRound(
        answeredAnswers, room.players,
      );

      // Apply timeout penalties on top of the scored intermediate state
      const updatedPlayers = intermediate.map(p => {
        const timeout = timedOutDeltas.find(d => d.playerId === p.id);
        return timeout ? { ...p, score: Math.max(0, p.score + timeout.delta) } : p;
      });
      room.players = updatedPlayers;

      const allDeltas = [...answeredDeltas, ...timedOutDeltas];
      const winTarget3 = gs.targetScore ?? STAND_OUT_WIN_SCORE;
      const top = [...updatedPlayers].sort((a, b) => b.score - a.score)[0];
      const isGameOver = top && top.score >= winTarget3;
      const winners3 = isGameOver ? updatedPlayers.filter(p => p.score >= winTarget3) : [];
      const winnerName3 = winners3.length > 1 ? winners3.map(p => p.name).join(' & ') : (top?.name ?? '');

      const nextGs = {
        ...gs,
        phase: isGameOver ? 'game-over' : 'reveal',
        submittedPlayerIds: newSubmitted,
        answers: room.standOutAnswers,
        roundDeltas: allDeltas,
        ...(isGameOver ? { winnerName: winnerName3 } : {}),
      };
      room.gameState = nextGs;

      console.log('[SO-timer] expired — %d answered, %d timed out, new phase: %s', answeredAnswers.length, timedOutDeltas.length, nextGs.phase);
      io.to(code).emit('gameStateUpdated', nextGs);
      io.to(code).emit('scoresUpdated', updatedPlayers);
      return;
    }

    // ── Number Guessor: player submits guess ─────────────────────────────────
    if (room.gameState?.game === 'numberGuessor' && action === 'ng-guess') {
      const value = Number(data?.value);
      if (!Number.isInteger(value) || value < 1 || value > 100) return;
      if (room.gameState.phase !== 'guessing') return;

      if (!room.gameState.guesses) room.gameState.guesses = [];
      if (!room.gameState.submittedGuesserIds) room.gameState.submittedGuesserIds = [];

      const ngPlayerId = stableId(socket.id);
      if (room.gameState.submittedGuesserIds.includes(ngPlayerId)) return;

      // Time penalty: 1 pt per second elapsed (min 1, max 20)
      const submittedAt    = Date.now();
      const timerStartedAt = room.gameState.timerStartedAt ?? submittedAt;
      const elapsed        = submittedAt - timerStartedAt;
      const timeTaken      = Math.min(20, Math.max(1, Math.floor(elapsed / 1000)));

      room.gameState.guesses.push({ playerId: ngPlayerId, value, timeTaken });
      room.gameState.submittedGuesserIds.push(ngPlayerId);

      io.to(code).emit('gameStateUpdated', room.gameState);

      if (room.gameState.submittedGuesserIds.length >= room.players.length) {
        resolveNGRound(code);
      }
      return;
    }

    // ── Number Guessor: timer expired (host fires when 20s elapses) ──────────
    if (room.gameState?.game === 'numberGuessor' && action === 'ng-timer-expired') {
      if (room.gameState.phase !== 'guessing') return;

      if (!room.gameState.guesses) room.gameState.guesses = [];
      if (!room.gameState.submittedGuesserIds) room.gameState.submittedGuesserIds = [];

      // Auto-submit timed-out players with max penalty
      for (const player of room.players) {
        if (!room.gameState.submittedGuesserIds.includes(player.id)) {
          room.gameState.guesses.push({ playerId: player.id, value: null, timeTaken: 20, timedOut: true });
          room.gameState.submittedGuesserIds.push(player.id);
        }
      }

      resolveNGRound(code);
      return;
    }

    // ── Deal or Steal: player submits action ──────────────────────────────────
    if (room.gameState?.game === 'dealOrSteal' && action === 'dos-action') {
      const gs = room.gameState;
      const { choice, target } = data || {};

      console.log('[dos-action] recv | socket:%s | room:%s | choice:%s | target:%s | phase:%s | submitted:%d/%d',
        socket.id, code,
        choice ?? '?', target ?? 'none',
        gs.phase,
        gs.submittedActionIds?.length ?? 0,
        room.players.length);

      // Phase guard
      if (gs.phase !== 'action') {
        console.log('[dos-action] REJECTED — wrong phase: %s', gs.phase);
        return;
      }

      const dosPlayerId = stableId(socket.id);
      // Duplicate guard
      if (!gs.submittedActionIds) gs.submittedActionIds = [];
      if (gs.submittedActionIds.includes(dosPlayerId)) {
        console.log('[dos-action] REJECTED — duplicate from socket:%s stableId:%s', socket.id, dosPlayerId);
        return;
      }

      // Choice must be a known action
      if (!['deal', 'steal', 'neutral'].includes(choice)) {
        console.log('[dos-action] REJECTED — invalid choice: %s', choice);
        return;
      }

      if (choice === 'deal' || choice === 'steal') {
        if (!target || target === dosPlayerId) {
          console.log('[dos-action] REJECTED — target missing or self | target:%s playerId:%s', target ?? 'none', dosPlayerId);
          return;
        }
        if (!gs.balances || !(target in gs.balances)) {
          console.log('[dos-action] REJECTED — target not in game balances | target:%s | balanceKeys:%j',
            target, gs.balances ? Object.keys(gs.balances) : []);
          return;
        }
        console.log('[dos-action] target OK | target:%s', target);
      }

      // Store privately — never enters broadcast gameState
      if (!dosRoundData[code]) dosRoundData[code] = { actions: {} };
      dosRoundData[code].actions[dosPlayerId] = {
        action: choice,
        target: choice !== 'neutral' ? target : null,
      };

      gs.submittedActionIds.push(dosPlayerId);

      console.log('[dos-action] counted | socket:%s stableId:%s | choice:%s | now %d/%d submitted',
        socket.id, dosPlayerId, choice, gs.submittedActionIds.length, room.players.length);

      io.to(code).emit('gameStateUpdated', gs);

      // All players submitted → resolve round
      if (gs.submittedActionIds.length >= room.players.length) {
        console.log('[dos-action] all submitted — resolving round %d', gs.round);
        const result = scoreDoSRound(room, code);

        gs.phase = 'round-results';
        gs.balances = result.balances;
        gs.roundOutcome = {
          dealAttemptCount:  result.dealAttemptCount,
          dealSuccessCount:  result.dealSuccessCount,
          stealAttemptCount: result.stealAttemptCount,
          stealSuccessCount: result.stealSuccessCount,
          mutualStealCount:  result.mutualStealCount,
          neutralCount:      result.neutralCount,
          stolenFromCount:   result.stolenFromCount,
          chainBonusCount:   result.chainBonusCount,
          closedLoopCount:   result.closedLoopCount,
          deltas:            result.deltas,
        };
        if (!gs.roundHistory) gs.roundHistory = [];
        gs.roundHistory.push(result.roundSummary);

        // Clear private round data — history is now in gs.roundHistory
        dosRoundData[code] = { actions: {} };

        console.log('[dos-action] round resolved | phase->round-results | round=%d', gs.round);
        io.to(code).emit('gameStateUpdated', gs);
      }
      return;
    }

    // ── Deal or Steal: host force-scores with submitted actions ───────────────
    // Unsubmitted players are treated as Neutral by scoreDoSRound's default.
    if (room.gameState?.game === 'dealOrSteal' && action === 'dos-force-score') {
      const gs = room.gameState;
      if (!isHost(room, socket.id)) return;
      if (gs.phase !== 'action') return;

      console.log('[dos-force-score] host triggered force score | round=%d', gs.round);
      const result = scoreDoSRound(room, code);

      gs.phase = 'round-results';
      gs.balances = result.balances;
      gs.roundOutcome = {
        dealAttemptCount:  result.dealAttemptCount,
        dealSuccessCount:  result.dealSuccessCount,
        stealAttemptCount: result.stealAttemptCount,
        stealSuccessCount: result.stealSuccessCount,
        mutualStealCount:  result.mutualStealCount,
        neutralCount:      result.neutralCount,
        stolenFromCount:   result.stolenFromCount,
        chainBonusCount:   result.chainBonusCount,
        closedLoopCount:   result.closedLoopCount,
        deltas:            result.deltas,
      };
      if (!gs.roundHistory) gs.roundHistory = [];
      gs.roundHistory.push(result.roundSummary);
      dosRoundData[code] = { actions: {} };

      console.log('[dos-force-score] round resolved | phase->round-results');
      io.to(code).emit('gameStateUpdated', gs);
      return;
    }

    // ── Lie Detector: ld-submit (speaker submits statements) ─────────────────
    if (action === 'ld-submit') {
      const gs = room.gameState;
      if (gs?.game !== 'lieDetector' || gs?.phase !== 'entering') return;
      const submitterId = stableId(socket.id);
      const order = gs.playerOrder ?? room.players.map(p => p.id);
      const speakerId = order[gs.speakerIndex ?? 0];
      if (submitterId !== speakerId) return;
      const expectedVoterCount = room.players.filter(p => p.id !== speakerId).length;
      ldRoomData[code] = {
        statementType: data.statementType,
        stmt1IsLie: data.stmt1IsLie,
        stmt2IsLie: data.stmt2IsLie,
        votes: [],
      };
      const next = {
        ...gs,
        phase: 'voting',
        statement1: data.statement1,
        statement2: data.statement2,
        votedPlayerIds: [],
        expectedVoterCount,
      };
      room.gameState = next;
      io.to(code).emit('gameStateUpdated', next);
      return;
    }

    // ── Lie Detector: ld-vote (non-speaker casts vote) ───────────────────────
    if (action === 'ld-vote') {
      const gs = room.gameState;
      if (gs?.game !== 'lieDetector' || gs?.phase !== 'voting') return;
      const voterId = stableId(socket.id);
      const order = gs.playerOrder ?? room.players.map(p => p.id);
      const speakerId = order[gs.speakerIndex ?? 0];
      if (voterId === speakerId) return;
      if ((gs.votedPlayerIds ?? []).includes(voterId)) return;
      const voter = room.players.find(p => p.id === voterId);
      if (!voter) return;
      const ld = ldRoomData[code];
      if (!ld) return;
      ld.votes.push({ playerId: voterId, playerName: voter.name, stmt1Vote: data.stmt1Vote, stmt2Vote: data.stmt2Vote });
      const newVotedIds = [...(gs.votedPlayerIds ?? []), voterId];
      const speaker = room.players.find(p => p.id === speakerId);
      const nonSpeakers = room.players.filter(p => p.id !== speakerId);
      if (newVotedIds.length >= (gs.expectedVoterCount ?? nonSpeakers.length)) {
        const pointsAwarded = [];
        let speakerTotal = 0;
        for (const p of nonSpeakers) {
          const vote = ld.votes.find(v => v.playerId === p.id);
          let listenerPts = 0;
          if (vote) {
            const s1ok = (vote.stmt1Vote === 'lie') === ld.stmt1IsLie;
            const s2ok = (vote.stmt2Vote === 'lie') === ld.stmt2IsLie;
            listenerPts = (s1ok ? 1 : 0) + (s2ok ? 1 : 0);
          }
          const wrong = vote ? 2 - listenerPts : 0;
          speakerTotal += wrong;
          pointsAwarded.push({ playerId: p.id, playerName: p.name, points: listenerPts });
          if (listenerPts > 0) p.score = (p.score ?? 0) + listenerPts;
        }
        if (speaker) {
          pointsAwarded.push({ playerId: speakerId, playerName: speaker.name, points: speakerTotal });
          speaker.score = (speaker.score ?? 0) + speakerTotal;
        }
        const next = {
          ...gs,
          phase: 'results',
          votedPlayerIds: newVotedIds,
          statementType: ld.statementType,
          stmt1IsLie: ld.stmt1IsLie,
          stmt2IsLie: ld.stmt2IsLie,
          votes: ld.votes,
          pointsAwarded,
        };
        room.gameState = next;
        io.to(code).emit('gameStateUpdated', next);
        io.to(code).emit('scoresUpdated', room.players);
      } else {
        const next = { ...gs, votedPlayerIds: newVotedIds };
        room.gameState = next;
        io.to(code).emit('gameStateUpdated', next);
      }
      return;
    }

    // ── Pot Luck: player submits an answer ───────────────────────────────────
    if (room.gameState?.game === 'potLuck' && action === 'pl-answer') {
      const gs = room.gameState;
      if (gs.phase !== 'live') return;

      const actorId = stableId(socket.id);
      if (gs.order[gs.seatPtr] !== actorId) return; // not your turn

      const plData = potLuckRoomData[code];
      if (!plData) return;

      // Cancel turn timer
      if (plData.turnTimer) { clearTimeout(plData.turnTimer); plData.turnTimer = null; }

      const choiceIdx = data?.choiceIdx;
      if (typeof choiceIdx !== 'number' || choiceIdx < 0 || choiceIdx > 3) return;

      const isCorrect = choiceIdx === plData.correctIndex;
      const actor = room.players.find(p => p.id === actorId);

      if (isCorrect) {
        const newScore = Math.max(0, (actor?.score ?? 0) + gs.pot);
        room.players = room.players.map(p => p.id === actorId ? { ...p, score: newScore } : p);
        const lastResult = { playerId: actorId, kind: 'correct', delta: gs.pot, total: newScore, potAt: gs.pot };
        const isWin = newScore >= gs.target;
        const revealInfo = { answer: gs.currentQuestion.choices[plData.correctIndex], scored: true, by: actor?.name ?? '' };
        const nextGs = { ...gs, phase: isWin ? 'gameover' : 'reveal', lastResult, revealInfo, winnerId: isWin ? actorId : null };
        room.gameState = nextGs;
        io.to(code).emit('gameStateUpdated', nextGs);
        io.to(code).emit('scoresUpdated', room.players);
        console.log('[potLuck] %s answered CORRECT in room %s (pot=%d, score=%d, win=%s)', actorId, code, gs.pot, newScore, isWin);
      } else {
        const newScore = Math.max(0, (actor?.score ?? 0) - gs.pot);
        room.players = room.players.map(p => p.id === actorId ? { ...p, score: newScore } : p);
        const lastResult = { playerId: actorId, kind: 'wrong', delta: -(gs.pot), total: newScore, potAt: gs.pot };
        const newPot = Math.min(gs.pot + 1, gs.effectivePotCap ?? gs.potCap);
        const newSeatPtr = (gs.seatPtr + 1) % gs.order.length;
        const nextGs = { ...gs, pot: newPot, seatPtr: newSeatPtr, consecutiveSkips: 0, lastResult, turnStartedAt: Date.now() };
        room.gameState = nextGs;
        io.to(code).emit('gameStateUpdated', nextGs);
        io.to(code).emit('scoresUpdated', room.players);
        startPotLuckTurnTimer(code);
        console.log('[potLuck] %s answered WRONG in room %s (pot=%d, score=%d)', actorId, code, gs.pot, newScore);
      }
      return;
    }

    // ── Pot Luck: player skips their turn ────────────────────────────────────
    if (room.gameState?.game === 'potLuck' && action === 'pl-skip') {
      const gs = room.gameState;
      if (gs.phase !== 'live') return;

      const actorId = stableId(socket.id);
      if (gs.order[gs.seatPtr] !== actorId) return;

      const plData = potLuckRoomData[code];
      if (!plData) return;

      const actor = room.players.find(p => p.id === actorId);
      _potLuckApplySkip(code, gs, actorId, actor?.score ?? 0);
      console.log('[potLuck] %s SKIPPED in room %s (pot=%d)', actorId, code, gs.pot);
      return;
    }

    // ── Pot Luck: host advances to next question ──────────────────────────────
    if (room.gameState?.game === 'potLuck' && action === 'pl-next-question') {
      console.log('[potLuck] pl-next-question from socket=%s stableId=%s hostId=%s phase=%s', socket.id, stableId(socket.id), room.hostId, room.gameState.phase);
      if (!isHost(room, socket.id)) {
        console.warn('[potLuck] pl-next-question rejected: not host');
        return;
      }
      if (room.gameState.phase !== 'reveal') {
        console.warn('[potLuck] pl-next-question rejected: phase=%s (expected reveal)', room.gameState.phase);
        return;
      }
      startNextPotLuckQuestion(code);
      return;
    }

    // ── Chain Link: play a card ───────────────────────────────────────────────
    if (room.gameState?.game === 'chainLink' && action === 'cl-play') {
      const gs = room.gameState;
      if (gs.phase !== 'playing' || gs.pending) return;
      const actorId = stableId(socket.id);
      if (gs.turnOrder[gs.turnIdx] !== actorId) return; // not your turn
      const card = data.card;
      const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
      if (!card) return;
      const hand = gs.hands[actorId] ?? [];
      if (!hand.includes(card)) return; // don't own that card

      // Stop turn timer
      const td = chainLinkRoomData[code] ?? {};
      if (td.turnTimer) { clearTimeout(td.turnTimer); td.turnTimer = null; }
      chainLinkRoomData[code] = td;

      const actor = room.players.find(p => p.id === actorId);
      const challengeStartedAt = Date.now();
      const logMsg = reason ? `${actor?.name ?? actorId} played "${card}": "${reason}"` : `${actor?.name ?? actorId} played "${card}"`;
      // Add card to chain immediately (will be removed if ruled INVALID)
      const newChain = [...gs.chain, { word: card, by: actorId, reason }];
      // Remove card from hand immediately
      const newHands = { ...gs.hands, [actorId]: (gs.hands[actorId] ?? []).filter(c => c !== card) };
      const nextGs = {
        ...gs,
        hands: newHands,
        chain: newChain,
        pending: { card, reason, by: actorId },
        challengeStartedAt,
        turnStartedAt: null,
        consecutiveSkips: 0,
        referee: null,
        log: [...gs.log, { text: logMsg, type: 'play', playerId: actorId }],
      };
      room.gameState = nextGs;
      io.to(code).emit('gameStateUpdated', nextGs);

      // 5-second auto-accept timer
      const d = chainLinkRoomData[code] ?? {};
      if (d.challengeTimer) clearTimeout(d.challengeTimer);
      d.challengeTimer = setTimeout(() => {
        clAcceptLink(code);
      }, 3000);
      chainLinkRoomData[code] = d;
      console.log('[chainLink] %s played "%s" in room %s — challenge window open', actorId, card, code);
      return;
    }

    // ── Chain Link: challenge ─────────────────────────────────────────────────
    if (room.gameState?.game === 'chainLink' && action === 'cl-challenge') {
      const gs = room.gameState;
      if (gs.phase !== 'playing' || !gs.pending) return;
      const challengerId = stableId(socket.id);
      if (gs.pending.by === challengerId) return; // can't challenge own play

      const d = chainLinkRoomData[code] ?? {};
      if (d.challengeTimer) { clearTimeout(d.challengeTimer); d.challengeTimer = null; }
      if (d.turnTimer) { clearTimeout(d.turnTimer); d.turnTimer = null; }
      chainLinkRoomData[code] = d;

      const challenger = room.players.find(p => p.id === challengerId);
      // Set referee to thinking state immediately
      const thinkingGs = {
        ...gs,
        challengeStartedAt: null,
        turnStartedAt: null,
        referee: { state: 'thinking', verdict: null, why: '', card: gs.pending.card, who: gs.pending.by, challenger: challengerId },
        log: [...gs.log, { text: `${challenger?.name ?? challengerId} challenged!`, type: 'challenge', playerId: challengerId }],
      };
      room.gameState = thinkingGs;
      io.to(code).emit('gameStateUpdated', thinkingGs);

      // Call referee async
      const prevWord = gs.chain.length > 1 ? gs.chain[gs.chain.length - 2].word : '';
      const { card, reason, by } = gs.pending;
      callChainLinkReferee(prevWord, card, reason).then(({ verdict, why }) => {
        const r = rooms[code];
        if (!r || r.gameState?.game !== 'chainLink') return;
        const currentGs = r.gameState;

        const actor = r.players.find(p => p.id === by);

        if (verdict === 'VALID') {
          // Link is valid — card already in chain + removed from hand (done in cl-play)
          // Challenger draws a penalty card
          const currentHand = currentGs.hands[by] ?? [];
          const isWin = currentHand.length === 0;
          const { hands: handsAfterDraw, drawPile: newDrawPile } = clDrawCard(currentGs, challengerId);

          const logEntry = `"${card}" ruled VALID — ${actor?.name ?? by}'s link stands. ${challenger?.name ?? challengerId} draws a card.`;
          const nextGs = {
            ...currentGs,
            phase: isWin ? 'win' : 'playing',
            hands: handsAfterDraw,
            drawPile: newDrawPile,
            pending: null,
            challengeStartedAt: null,
            turnStartedAt: null, // timer resumes on dismiss
            winner: isWin ? by : null,
            turnIdx: (currentGs.turnIdx + 1) % currentGs.turnOrder.length,
            referee: { state: 'done', verdict: 'VALID', why, card, who: by, challenger: challengerId },
            log: [...currentGs.log, { text: logEntry, type: 'valid', playerId: by }],
          };
          r.gameState = nextGs;
          io.to(code).emit('gameStateUpdated', nextGs);
          console.log('[chainLink] VALID ruling for "%s" in room %s — challenger %s draws', card, code, challengerId);
        } else {
          // Link is invalid — remove card from chain, give it back + draw penalty
          const revertedChain = currentGs.chain.filter(e => !(e.word === card && e.by === by));
          const revertedHands = { ...currentGs.hands, [by]: [...(currentGs.hands[by] ?? []), card] };
          const { hands: handsAfterDraw, drawPile: newDrawPile } = clDrawCard({ ...currentGs, hands: revertedHands }, by);
          const logEntry = `"${card}" ruled INVALID — ${actor?.name ?? by} keeps it and draws a card.`;
          const nextGs = {
            ...currentGs,
            chain: revertedChain,
            hands: handsAfterDraw,
            drawPile: newDrawPile,
            pending: null,
            challengeStartedAt: null,
            turnStartedAt: null, // timer resumes on dismiss
            turnIdx: (currentGs.turnIdx + 1) % currentGs.turnOrder.length,
            referee: { state: 'done', verdict: 'INVALID', why, card, who: by, challenger: challengerId },
            log: [...currentGs.log, { text: logEntry, type: 'invalid', playerId: by }],
          };
          r.gameState = nextGs;
          io.to(code).emit('gameStateUpdated', nextGs);
          console.log('[chainLink] INVALID ruling for "%s" in room %s', card, code);
        }
      });
      return;
    }

    // ── Chain Link: skip ──────────────────────────────────────────────────────
    if (room.gameState?.game === 'chainLink' && action === 'cl-skip') {
      const gs = room.gameState;
      if (gs.phase !== 'playing' || gs.pending) return;
      const actorId = stableId(socket.id);
      if (gs.turnOrder[gs.turnIdx] !== actorId) return;

      // Stop turn timer
      const sd = chainLinkRoomData[code] ?? {};
      if (sd.turnTimer) { clearTimeout(sd.turnTimer); sd.turnTimer = null; }
      chainLinkRoomData[code] = sd;

      const actor = room.players.find(p => p.id === actorId);
      const newSkips = (gs.consecutiveSkips ?? 0) + 1;

      // If everyone skipped, break the chain
      if (newSkips >= gs.turnOrder.length) {
        gs.consecutiveSkips = newSkips;
        gs.log = [...gs.log, { text: `${actor?.name ?? actorId} skipped`, type: 'skip', playerId: actorId }];
        room.gameState = gs;
        clBreakChain(code);
        return;
      }

      const nextGs = {
        ...gs,
        consecutiveSkips: newSkips,
        turnIdx: (gs.turnIdx + 1) % gs.turnOrder.length,
        turnStartedAt: Date.now(),
        log: [...gs.log, { text: `${actor?.name ?? actorId} skipped`, type: 'skip', playerId: actorId }],
      };
      room.gameState = nextGs;
      io.to(code).emit('gameStateUpdated', nextGs);
      console.log('[chainLink] %s skipped in room %s (consecutive: %d/%d)', actorId, code, newSkips, gs.turnOrder.length);
      clStartTurnTimer(code);
      return;
    }

    // ── Chain Link: dismiss referee (after viewing result) ────────────────────
    if (room.gameState?.game === 'chainLink' && action === 'cl-dismiss-referee') {
      const gs = room.gameState;
      if (!gs.referee || gs.referee.state !== 'done') return;
      const isWin = gs.phase === 'win';
      const nextGs = { ...gs, referee: null, turnStartedAt: isWin ? null : Date.now() };
      room.gameState = nextGs;
      io.to(code).emit('gameStateUpdated', nextGs);
      if (!isWin) clStartTurnTimer(code);
      return;
    }

    // ── Plot Twist: submit sentence ───────────────────────────────────────────
    if (room.gameState?.game === 'plotTwist' && action === 'pt-submit') {
      const gs = room.gameState;
      const d = ptRoomData[code];
      if (!d || gs.phase !== 'play' || gs.pending || gs.judging) return;

      const actorId = stableId(socket.id);
      const currentPlayerId = gs.turnOrder[gs.turn];
      if (actorId !== currentPlayerId) return; // not your turn

      const text = (data.text || '').trim();
      if (!text) return;

      // Self-word guard (server-side enforcement)
      const myWords = d.targets[actorId] || [];
      const lower = text.toLowerCase();
      const selfHit = myWords.find(entry => {
        const w = entry.word || entry; // handle {word,hard} or plain string
        const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return re.test(lower);
      });
      if (selfHit) {
        io.to(socket.id).emit('pt-selfBlock', { word: selfHit.word || selfHit });
        return;
      }

      // Pause turn timer
      if (d.turnTimer) { clearInterval(d.turnTimer); d.turnTimer = null; }

      // Enter veto phase
      gs.pending = { by: actorId, text };
      d.vetoVotes = {};
      io.to(code).emit('gameStateUpdated', gs);

      // Auto-resolve veto after 10 seconds if not enough votes
      d.vetoTimer = setTimeout(() => {
        ptResolveVeto(code);
      }, 10000);

      return;
    }

    // ── Plot Twist: veto vote ─────────────────────────────────────────────────
    if (room.gameState?.game === 'plotTwist' && action === 'pt-veto') {
      const gs = room.gameState;
      const d = ptRoomData[code];
      if (!d || !gs.pending) return;

      const voterId = stableId(socket.id);
      if (voterId === gs.pending.by) return; // writer can't vote
      if (d.vetoVotes[voterId] !== undefined) return; // already voted

      d.vetoVotes[voterId] = data.veto ? 'veto' : 'allow';

      // Check if all non-writers have voted
      const nonWriters = gs.turnOrder.filter(id => id !== gs.pending.by);
      const totalVotes = Object.keys(d.vetoVotes).length;
      if (totalVotes >= nonWriters.length) {
        if (d.vetoTimer) { clearTimeout(d.vetoTimer); d.vetoTimer = null; }
        ptResolveVeto(code);
      }
      return;
    }

    // ── Plot Twist: request words (client missed initial emit) ──────────────
    if (room.gameState?.game === 'plotTwist' && action === 'pt-requestWords') {
      const d = ptRoomData[code];
      if (!d) return;
      const actorId = stableId(socket.id);
      const words = d.targets[actorId];
      if (words) {
        io.to(socket.id).emit('pt-myWords', { words });
        console.log('[plotTwist] re-sent words to %s on request', actorId);
      }
      return;
    }

    // ── Plot Twist: skip turn ─────────────────────────────────────────────────
    if (room.gameState?.game === 'plotTwist' && action === 'pt-skip') {
      const gs = room.gameState;
      const d = ptRoomData[code];
      if (!d || gs.phase !== 'play' || gs.pending || gs.judging) return;

      const actorId = stableId(socket.id);
      const currentPlayerId = gs.turnOrder[gs.turn];
      if (actorId !== currentPlayerId) return;

      ptAdvanceTurn(code);
      return;
    }

    // ── All other games: relay as before ─────────────────────────────────────
    io.to(code).emit('playerActionReceived', { playerId: stableId(socket.id), action, data });
  });

  // ── Update scores (host only) ────────────────────────────────────────────────
  socket.on('updateScores', ({ code, players }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room no longer exists.' }); return; }
    if (!isHost(room, socket.id)) { socket.emit('error', { message: 'Only the host can update scores.' }); return; }
    room.players = players;
    io.to(code).emit('scoresUpdated', players);
  });

  // ── Disconnect — immediately transfer host, then 630-second grace period ──────
  socket.on('disconnect', (reason) => {
    console.log('[disconnect] id=%s reason=%s — starting 630s grace period', socket.id, reason);
    // Do NOT immediately transfer host — the reconnect window is 630 s.
    // If the host doesn't reconnect in time, removeSocketFromAllRooms() handles the transfer.
    disconnectTimers[socket.id] = setTimeout(() => {
      console.log('[grace] expired for socket=%s — removing from rooms', socket.id);
      removeSocketFromAllRooms(socket.id);
      const pid = playerPersistentIds[socket.id];
      if (pid && persistentToSocket[pid] === socket.id) {
        delete persistentToSocket[pid];
      }
      delete playerPersistentIds[socket.id];
      delete disconnectTimers[socket.id];
      // Free username claim (if any)
      for (const key in usernames) {
        if (usernames[key] === socket.id) {
          delete usernames[key];
          break;
        }
      }
    }, 630_000);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Icebreaker backend running on port ${PORT}`);
});
