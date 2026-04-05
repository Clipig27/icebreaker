const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const {
  LIE_DETECTOR_PROMPTS,
  TALENT_SHOW_PROMPTS,
  STAND_OUT_PROMPTS,
  NUMBER_GUESSOR_PROMPTS,
  PIE_CHARTS_PROMPTS,
} = require('./prompts');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

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
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute per-player score deltas for one Stand Out round.
 * @param {Array<{playerId,playerName,text}>} answers
 * @param {Record<string,number>} streaks   per-player consecutive-unique count
 * @param {Array<{id,name,score}>} players  current room players
 */
function scoreStandOutRound(answers, streaks, players) {
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
  const newStreaks = { ...streaks };
  

  for (const group of groups.values()) {
    if (group.length === 1) {
      // Unique — streak bonus
      const player = group[0];
      const streak = (newStreaks[player.playerId] ?? 0) + 1;
      newStreaks[player.playerId] = streak;
      const pts = streak >= 4 ? 25 : streak === 3 ? 20 : streak === 2 ? 15 : 10;
      deltas.push({ playerId: player.playerId, playerName: player.playerName, delta: pts, streakCount: streak });
    } else {
      // Duplicate — penalise all in group
      const penalty = group.length >= 4 ? -12 : group.length === 3 ? -8 : -5;
      for (const player of group) {
        newStreaks[player.playerId] = 0;
        deltas.push({ playerId: player.playerId, playerName: player.playerName, delta: penalty, streakCount: 0 });
      }
    }
  }

  const updatedPlayers = players.map(p => {
    const d = deltas.find(d => d.playerId === p.id);
    return d ? { ...p, score: Math.max(0, p.score + d.delta) } : p;
  });

  console.log('[standOut] final scores   :', updatedPlayers.map(p => `${p.name}:${p.score}`).join(', '));

  return { deltas, newStreaks, updatedPlayers };
}
// Future: replace with Supabase. For now: session-level username registry.
// lowercase_username → socketId  (freed on disconnect or explicit leave)
const usernames = {};

// Deal or Steal — private per-round action store (never broadcast to clients)
// dosRoundData[code] = { actions: { [playerId]: { action, target } } }
const dosRoundData = {};

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
 *   Mutual deal        +30% each  (A deals B, B deals A — not voided by steals)
 *   Deal into Neutral  +15%       (target chose Neutral — half reward for dealer)
 *   Deal into Steal     0         (no bonus, no penalty for dealer)
 *   Deal into elsewhere 0         (target is dealing someone else — no penalty)
 *   Steal success      +20% profit (split evenly among stealers of same target)
 *   Steal fail         -20%        (Neutral target, mutual steal, or closed loop)
 *   Neutral             0
 *
 * Resolution order:
 *   1. Mutual steals    → both fail; both lose 20% of round-start balance.
 *   2. Classify steals  → succeed if target chose Deal OR target is stealing
 *                         someone other than the stealer. Fail vs Neutral.
 *   2b.Closed loops     → detect steal cycles (A→B→C→A). All loop members'
 *                         steal actions fail (-20%). External stealers targeting
 *                         loop members still apply normally.
 *   3a. Snapshot profits → pending profit per successful stealer before interceptions.
 *   3b. Chain-reaction  → if a successful stealer is ALSO a successful steal
 *                         target, their pending profit is intercepted by whoever
 *                         stole them (split evenly). One clean pass only.
 *   3c. Apply atomically → drain targets (20%), credit stealers, credit interceptors.
 *   4. Failed steals    → each failed stealer loses 20% of round-start balance.
 *   5. Deal outcomes    → mutual +30%, into-neutral +15%, into-steal/elsewhere 0.
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
 * Deal rewards: mutual deal +30% each, deal-into-neutral +15%, deal-into-steal/elsewhere 0.
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

    balances[aId] = round2(balances[aId] - 0.2 * startBals[aId]);
    balances[bId] = round2(balances[bId] - 0.2 * startBals[bId]);
    console.log('[scoreDoSRound] mutual steal: %s ↔ %s — each -20%%', aId, bId);
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
    const lostAmount = round2(0.2 * startBals[targetId]);
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
    const lostAmount = round2(0.2 * startBals[targetId]);
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
    balances[stealerId] = round2(balances[stealerId] - 0.2 * startBals[stealerId]);
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

  // 1. Mutual deal = +30% each
  if (
    targetAction &&
    targetAction.action === 'deal' &&
    targetAction.target === actorId
  ) {
    const pairKey = [actorId, targetId].sort().join(':');

    if (!processedDealPairs.has(pairKey)) {
      processedDealPairs.add(pairKey);

      dealBonuses[actorId] =
        (dealBonuses[actorId] || 0) + round2(startBal * 0.30);

      dealBonuses[targetId] =
        (dealBonuses[targetId] || 0) +
        round2((startBals[targetId] ?? 0) * 0.30);

      console.log('[FIX] mutual deal applied', {
        actorId,
        targetId,
        actorGain: round2(startBal * 0.30),
        targetGain: round2((startBals[targetId] ?? 0) * 0.30),
      });
    }

    continue;
  }

  // 2. Deal into neutral or missing target action = +15%
  if (!targetAction || targetAction.action === 'neutral') {
    const gain = round2(startBal * 0.15);

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

/** Remove player from every room they're in. Returns array of affected room codes. */
function removeSocketFromAllRooms(socketId) {
  const affected = [];
  for (const code in rooms) {
    const room = rooms[code];
    if (!room.players.find(p => p.id === socketId)) continue;

    const wasHost = room.hostId === socketId;
    room.players   = room.players.filter(p => p.id !== socketId);
    affected.push(code);

    if (room.players.length === 0) {
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
  }
  return affected;
}

// ── Game state bootstrap ──────────────────────────────────────────────────────
// Builds a usable initial gameState so clients receive a real state in
// `gameStarted` and never need to wait on a second `gameStateUpdated` emit
// just to get their first renderable state.
function buildInitialGameState(game) {
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  switch (game) {
    case 'lieDetector':
      return { game, phase: 'speaker-choice', prompt: pick(LIE_DETECTOR_PROMPTS), speakerIndex: 0, votedPlayerIds: [] };
    case 'talentShow':
      return { game, phase: 'prep', currentPrompt: pick(TALENT_SHOW_PROMPTS), currentPerformerIdx: 0, buzzCount: 0, performResults: [], submittedVoterIds: [] };
    case 'standOut': {
      const prompt = pick(STAND_OUT_PROMPTS);
      return { game, phase: 'prompt', roundNumber: 1, currentPrompt: prompt, submittedPlayerIds: [] };
    }
    case 'numberGuessor': {
      const prompt = pick(NUMBER_GUESSOR_PROMPTS);
      return {
        game,
        phase: 'guessing',
        round: 1,
        currentPrompt: prompt,
        submittedGuesserIds: [],
        guesses: [],
        totalScores: {},
      };
    }
    case 'pieCharts':
      return { game, phase: 'setup', questions: [], questionIdx: 0, submittedVoterIds: [], allVotes: [] };
    case 'dealOrSteal':
      return { game, phase: 'setup', round: 1, balances: {} };
    default:
      return { game, phase: 'start' };
  }
}

// ── HTTP health check ─────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length });
});

// ── Socket events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[connect] id=%s totalClients=%d', socket.id, io.engine.clientsCount);

  // ── Create room ─────────────────────────────────────────────────────────────
  socket.on('createRoom', ({ playerName }, ack) => {
    console.log('[createRoom] socket=%s playerName=%s', socket.id, playerName);
    // If already in a room, clean it up first
    removeSocketFromAllRooms(socket.id);

    const code = generateCode();
    rooms[code] = {
      hostId:    socket.id,
      code,
      players:   [{ id: socket.id, name: playerName, score: 0 }],
      phase:     'lobby',
      gameState: {},
    };
    socket.join(code);
    socket.emit('roomCreated', { code, room: rooms[code] });
    console.log('[createRoom] created code=%s by %s', code, playerName);
    if (ack) ack({ ok: true });
  });

  // ── Join room ────────────────────────────────────────────────────────────────
  socket.on('joinRoom', ({ code, playerName }, ack) => {
    console.log('[joinRoom] socket=%s code=%s playerName=%s', socket.id, code, playerName);
    const room = rooms[code];
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      if (ack) ack({ ok: false, message: 'Room not found' });
      return;
    }

    // If already in a different room (e.g. was a host), clean up that room first
    // (skip the target room so we don't accidentally remove ourselves mid-join)
    for (const existingCode in rooms) {
      if (existingCode === code) continue;
      const existing = rooms[existingCode];
      if (!existing.players.find(p => p.id === socket.id)) continue;

      const wasHost = existing.hostId === socket.id;
      existing.players = existing.players.filter(p => p.id !== socket.id);

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

    // Avoid double-joining
    if (!room.players.find(p => p.id === socket.id)) {
      room.players.push({ id: socket.id, name: playerName, score: 0 });
    }
    socket.join(code);
    io.to(code).emit('roomUpdated', room);
    console.log('[joinRoom] %s joined room %s', playerName, code);
    if (ack) ack({ ok: true });
  });

  // ── Leave room (voluntary) ───────────────────────────────────────────────────
  socket.on('leaveRoom', ({ code }) => {
    const room = rooms[code];
    if (!room) return;

    const wasHost = room.hostId === socket.id;
    room.players  = room.players.filter(p => p.id !== socket.id);
    socket.leave(code);
    socket.emit('leftRoom', { code });

    if (room.players.length === 0) {
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
  });

  // ── Cancel room (host only — kicks everyone) ─────────────────────────────────
  socket.on('cancelRoom', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    io.to(code).emit('roomCancelled', { code });
    delete rooms[code];
    console.log(`Room ${code} cancelled by host`);
  });

  // ── Start game ───────────────────────────────────────────────────────────────
  socket.on('startGame', ({ code, game }, ack) => {
    console.log('[startGame] socket=%s code=%s game=%s', socket.id, code, game);
    const room = rooms[code];
    if (!room) {
      console.warn('[startGame] room %s not found', code);
      if (ack) ack({ ok: false, message: 'Room not found' });
      return;
    }
    if (room.hostId !== socket.id) {
      console.warn('[startGame] socket %s is not host of %s', socket.id, code);
      if (ack) ack({ ok: false, message: 'Not the host' });
      return;
    }
    // Guard: Deal or Steal requires 4–6 players
    if (game === 'dealOrSteal' && (room.players.length < 4 || room.players.length > 6)) {
      console.warn('[startGame] dealOrSteal requires 4-6 players, got %d in room %s', room.players.length, code);
      if (ack) ack({ ok: false, message: `Deal or Steal requires 4–6 players. Currently: ${room.players.length}` });
      return;
    }
    room.phase     = 'playing';
    room.gameState = buildInitialGameState(game);
    // Reset Stand Out per-round accumulators
    if (game === 'standOut') {
      room.standOutAnswers     = [];
      room.standOutStreaks     = {};
      room.standOutRoundScored = false;
    }
    console.log('[startGame] broadcasting gameStarted to room %s (%d players)', code, room.players.length);
    io.to(code).emit('gameStarted', room);
    if (ack) ack({ ok: true });
  });

  // ── Update game state (host only) ────────────────────────────────────────────
  socket.on('updateGameState', ({ code, gameState }) => {
    console.log('[updateGameState] socket=%s code=%s phase=%s', socket.id, code, gameState?.phase ?? gameState?.currentPhase ?? '?');
    const room = rooms[code];
    if (!room) { console.warn('[updateGameState] room %s not found', code); return; }
    if (room.hostId !== socket.id) { console.warn('[updateGameState] socket %s is not host of %s', socket.id, code); return; }

    // Stand Out: clear accumulated answers + scored flag each time we enter the answering phase
    if (gameState?.game === 'standOut' && gameState?.phase === 'entering') {
      room.standOutAnswers     = [];
      room.standOutRoundScored = false;
      console.log('[standOut] entering phase — answers + roundScored reset for room', code);
    }

    room.gameState = gameState;
    io.to(code).emit('gameStateUpdated', gameState);
  });

  // ── Player action (any player) ───────────────────────────────────────────────
  socket.on('playerAction', ({ code, action, data }) => {
    const room = rooms[code];
    if (!room) return;

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
        io.to(code).emit('playerActionReceived', { playerId: socket.id, action, data });
        return;
      }

      const gs = room.gameState;

      // Deduplicate — ignore if this player already submitted this round
      if ((gs.submittedPlayerIds ?? []).includes(socket.id)) {
        console.warn('[SO-A] DUPLICATE — playerId already in submittedPlayerIds:', socket.id);
        return;
      }

      // Hard guard: scoring already ran (must be reset by updateGameState entering)
      if (room.standOutRoundScored) {
        console.warn('[SO-A] BLOCKED by standOutRoundScored=true — late submission from', socket.id,
          '| This flag should have been reset when phase->entering arrived');
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        console.warn('[SO-A] PLAYER NOT FOUND | socket:%s | room.players:%j',
          socket.id, room.players.map(p => ({ id: p.id, name: p.name })));
        return;
      }

      // Ensure accumulators exist
      if (!Array.isArray(room.standOutAnswers)) room.standOutAnswers = [];
      if (!room.standOutStreaks) room.standOutStreaks = {};

      room.standOutAnswers.push({ playerId: socket.id, playerName: player.name, text: data.text });
      const newSubmitted = [...(gs.submittedPlayerIds ?? []), socket.id];

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

        const { deltas, newStreaks, updatedPlayers } = scoreStandOutRound(
          room.standOutAnswers,
          room.standOutStreaks,
          room.players,
        );
        room.standOutStreaks = newStreaks;
        room.players         = updatedPlayers;

        const top        = [...updatedPlayers].sort((a, b) => b.score - a.score)[0];
        const isGameOver = top && top.score >= STAND_OUT_WIN_SCORE;

        const nextGs = {
          ...gs,
          phase:              isGameOver ? 'game-over' : 'reveal',
          submittedPlayerIds: newSubmitted,
          answers:            room.standOutAnswers,
          roundDeltas:        deltas,
          ...(isGameOver ? { winnerName: top.name } : {}),
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

    // ── Number Guessor: backend-authoritative handling ────────────────────────
    if (room.gameState?.game === 'numberGuessor' && action === 'ng-guess') {
      const value = Number(data?.value);

      if (!Number.isInteger(value) || value < 1 || value > 100) {
        return;
      }

      if (!room.gameState.guesses) room.gameState.guesses = [];
      if (!room.gameState.submittedGuesserIds) room.gameState.submittedGuesserIds = [];

      // prevent duplicate submit
      if (room.gameState.submittedGuesserIds.includes(socket.id)) {
        return;
      }

      room.gameState.guesses.push({ playerId: socket.id, value });
      room.gameState.submittedGuesserIds.push(socket.id);

      // update everyone with current submission count
      io.to(code).emit('gameStateUpdated', room.gameState);

      // all players submitted -> score and reveal
      if (room.gameState.submittedGuesserIds.length >= room.players.length) {
        const correctAnswer = room.gameState.currentPrompt.correctAnswer;

        const results = room.players.map((player) => {
          const guessObj = room.gameState.guesses.find((g) => g.playerId === player.id);
          const guess = guessObj?.value ?? null;
          const distance = guess !== null ? Math.abs(guess - correctAnswer) : 999;
          return { playerId: player.id, playerName: player.name, guess, distance };
        });

        // sort by distance ascending (closest first)
        results.sort((a, b) => a.distance - b.distance);

        // accumulate total scores (lower = better)
        if (!room.gameState.totalScores) room.gameState.totalScores = {};
        const roundScores = {};
        for (const r of results) {
          roundScores[r.playerId] = r.distance;
          room.gameState.totalScores[r.playerId] =
            (room.gameState.totalScores[r.playerId] ?? 0) + r.distance;
        }

        room.gameState.phase = 'reveal';
        room.gameState.targetNumber = correctAnswer;
        room.gameState.results = results;
        room.gameState.roundScores = roundScores;

        io.to(code).emit('gameStateUpdated', room.gameState);
      }

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

      // Duplicate guard
      if (!gs.submittedActionIds) gs.submittedActionIds = [];
      if (gs.submittedActionIds.includes(socket.id)) {
        console.log('[dos-action] REJECTED — duplicate from socket:%s', socket.id);
        return;
      }

      // Choice must be a known action
      if (!['deal', 'steal', 'neutral'].includes(choice)) {
        console.log('[dos-action] REJECTED — invalid choice: %s', choice);
        return;
      }

      // Deal and steal require a non-self target that is in this game session.
      // We validate against gs.balances (set by host at game start) rather than
      // room.players, because room.players is the live server list which can drift
      // from the frontend's player list due to reconnect timing. gs.balances is
      // the authoritative set of participants for this game session.
      if (choice === 'deal' || choice === 'steal') {
        if (!target || target === socket.id) {
          console.log('[dos-action] REJECTED — target missing or self | target:%s socket:%s', target ?? 'none', socket.id);
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
      dosRoundData[code].actions[socket.id] = {
        action: choice,
        target: choice !== 'neutral' ? target : null,
      };

      gs.submittedActionIds.push(socket.id);

      console.log('[dos-action] counted | socket:%s | choice:%s | now %d/%d submitted',
        socket.id, choice, gs.submittedActionIds.length, room.players.length);

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
      if (room.hostId !== socket.id) return;
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

    // ── All other games: relay as before ─────────────────────────────────────
    io.to(code).emit('playerActionReceived', { playerId: socket.id, action, data });
  });

  // ── Update scores (host only) ────────────────────────────────────────────────
  socket.on('updateScores', ({ code, players }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.players = players;
    io.to(code).emit('scoresUpdated', players);
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log('[disconnect] id=%s reason=%s', socket.id, reason);
    removeSocketFromAllRooms(socket.id);

    // Free username claim (if any)
    for (const key in usernames) {
      if (usernames[key] === socket.id) {
        delete usernames[key];
        break;
      }
    }
  });
});

httpServer.listen(3001, () => {
  console.log('Icebreaker backend running on port 3001');
});
