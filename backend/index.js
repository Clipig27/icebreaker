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

// Deal or Steal — private per-round action/accusation store (never sent to clients)
// dosRoundData[code] = { actions: { [playerId]: { action, target? } }, accusations: { [playerId]: { target } } }
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
 * Returns { balances, accusationEligible, stealMap, dealCount, stealCount, exposedDealerIds, deltas, roundSummary }
 */
function scoreDoSRound(room, code) {
  const gs = room.gameState;
  const actions = (dosRoundData[code] && dosRoundData[code].actions) || {};
  const players = room.players;

  const d1Id = gs.dealers[0];
  const d2Id = gs.dealers[1];

  const d1Action = (actions[d1Id] && actions[d1Id].action) || 'neutral';
  const d2Action = (actions[d2Id] && actions[d2Id].action) || 'neutral';
  const bothDealt = d1Action === 'deal' && d2Action === 'deal';

  const balances = Object.assign({}, gs.balances);
  const startBals = Object.assign({}, gs.roundStartBalances);

  const exposedDealerIds = [];

  // Step 1 — Deal resolution
  if (bothDealt) {
    exposedDealerIds.push(d1Id, d2Id);
    balances[d1Id] = round2(balances[d1Id] + 0.6 * startBals[d1Id]);
    balances[d2Id] = round2(balances[d2Id] + 0.6 * startBals[d2Id]);
  }

  // Step 2 — Steal resolution (per dealer)
  const nonDealerIds = players.map(p => p.id).filter(id => id !== d1Id && id !== d2Id);

  for (const dId of [d1Id, d2Id]) {
    const stealers = nonDealerIds.filter(id => {
      const a = actions[id];
      return a && a.action === 'steal' && a.target === dId;
    });
    if (stealers.length === 0) continue;

    if (exposedDealerIds.includes(dId)) {
      // Steal succeeds — split 50% of dealer's round-start balance
      const pool = 0.5 * startBals[dId];
      const perStealer = round2(pool / stealers.length);
      for (const sId of stealers) {
        balances[sId] = round2(balances[sId] + perStealer);
      }
      // Dealer loses 25% of round-start balance
      balances[dId] = round2(balances[dId] - 0.25 * startBals[dId]);
    } else {
      // Steal fails — each stealer loses 20% of their own round-start balance
      for (const sId of stealers) {
        const penalty = round2(0.2 * startBals[sId]);
        balances[sId] = round2(balances[sId] - penalty);
        // Penalty goes to exposed dealers (split equally) or targeted dealer
        if (exposedDealerIds.length > 0) {
          const share = round2(penalty / exposedDealerIds.length);
          for (const expId of exposedDealerIds) {
            balances[expId] = round2(balances[expId] + share);
          }
        } else {
          balances[dId] = round2(balances[dId] + penalty);
        }
      }
    }
  }

  // Accusation eligibility: exposed dealers who were targeted by ≥1 successful steal
  const accusationEligible = [d1Id, d2Id].filter(dId => {
    if (!exposedDealerIds.includes(dId)) return false;
    return nonDealerIds.some(id => {
      const a = actions[id];
      return a && a.action === 'steal' && a.target === dId;
    });
  });

  // stealMap: stealerId → dealerId they targeted (only successful steals)
  const stealMap = {};
  for (const id of nonDealerIds) {
    const a = actions[id];
    if (a && a.action === 'steal' && a.target && exposedDealerIds.includes(a.target)) {
      stealMap[id] = a.target;
    }
  }

  // Per-player balance deltas for standings
  const deltas = {};
  for (const p of players) {
    deltas[p.id] = round2((balances[p.id] !== undefined ? balances[p.id] : startBals[p.id]) - startBals[p.id]);
  }

  const dealCount = [d1Action, d2Action].filter(a => a === 'deal').length;
  const stealCount = nonDealerIds.filter(id => actions[id] && actions[id].action === 'steal').length;

  // Sanitised action log for end-game history (no targets visible until reveal)
  const actionLog = {};
  for (const p of players) {
    const a = actions[p.id];
    actionLog[p.id] = {
      action: (a && a.action) || 'neutral',
      target: (a && a.target) || null,
    };
  }

  const roundSummary = {
    round: gs.round,
    dealers: [d1Id, d2Id],
    actionLog,
    exposedDealerIds,
    dealCount,
    stealCount,
    deltas,
    startBalances: Object.assign({}, startBals),
    endBalances: Object.assign({}, balances),
  };

  return { balances, accusationEligible, stealMap, dealCount, stealCount, exposedDealerIds, deltas, roundSummary };
}

/**
 * Resolve accusations for a Deal or Steal round.
 * stealMap: stealerId → dealerId they successfully stole from.
 * Returns { balances, accusationOutcomes }
 */
function resolveDoSAccusations(room, code) {
  const gs = room.gameState;
  const accusations = (dosRoundData[code] && dosRoundData[code].accusations) || {};
  const stealMap = (dosRoundData[code] && dosRoundData[code].stealMap) || {};

  const balances = Object.assign({}, gs.balances);
  const startBals = gs.roundStartBalances || {};
  const accusationOutcomes = {};

  for (const accuserId in accusations) {
    const target = accusations[accuserId] && accusations[accuserId].target;
    if (!target) {
      accusationOutcomes[accuserId] = { target: null, correct: false, skipped: true, delta: 0 };
      continue;
    }
    // Correct if the accused player stole from the accuser
    const isCorrect = stealMap[target] === accuserId;
    if (isCorrect) {
      const recovered = round2(0.25 * (startBals[accuserId] || 0));
      balances[accuserId] = round2(balances[accuserId] + recovered);
      balances[target]    = round2(balances[target]    - recovered);
      accusationOutcomes[accuserId] = { target, correct: true,  delta: recovered };
    } else {
      const penalty = round2(0.1 * balances[accuserId]);
      balances[accuserId] = round2(balances[accuserId] - penalty);
      accusationOutcomes[accuserId] = { target, correct: false, delta: -penalty };
    }
  }

  return { balances, accusationOutcomes };
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
      return { game, phase: 'setup', round: 1, dealers: [], balances: {} };
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
      if (gs.phase !== 'action') return;
      if (!gs.submittedActionIds) gs.submittedActionIds = [];
      if (gs.submittedActionIds.includes(socket.id)) return;

      const { choice, target } = data || {};
      const isDealerRole = gs.dealers && gs.dealers.includes(socket.id);

      // Validate choice
      if (!['deal', 'steal', 'neutral'].includes(choice)) return;
      if (isDealerRole  && choice === 'steal') return;
      if (!isDealerRole && choice === 'deal')  return;
      if (choice === 'steal') {
        if (!target || !gs.dealers || !gs.dealers.includes(target)) return;
      }

      // Store privately — never enters broadcast gameState
      if (!dosRoundData[code]) dosRoundData[code] = { actions: {}, accusations: {}, stealMap: {} };
      dosRoundData[code].actions[socket.id] = { action: choice, target: choice === 'steal' ? target : null };

      gs.submittedActionIds.push(socket.id);
      io.to(code).emit('gameStateUpdated', gs);

      // All players submitted → resolve round
      if (gs.submittedActionIds.length >= room.players.length) {
        const result = scoreDoSRound(room, code);

        // Save stealMap for accusation resolution
        if (!dosRoundData[code]) dosRoundData[code] = { actions: {}, accusations: {}, stealMap: {} };
        dosRoundData[code].stealMap = result.stealMap;

        gs.phase = 'round-results';
        gs.balances = result.balances;
        gs.roundOutcome = {
          dealCount:        result.dealCount,
          stealCount:       result.stealCount,
          exposedDealerIds: result.exposedDealerIds,
          deltas:           result.deltas,
        };
        gs.accusationEligible    = result.accusationEligible;
        gs.submittedAccusationIds = [];
        if (!gs.roundHistory) gs.roundHistory = [];
        gs.roundHistory.push(result.roundSummary);

        io.to(code).emit('gameStateUpdated', gs);
      }
      return;
    }

    // ── Deal or Steal: player submits accusation ──────────────────────────────
    if (room.gameState?.game === 'dealOrSteal' && action === 'dos-accuse') {
      const gs = room.gameState;
      if (gs.phase !== 'accusation') return;
      if (!gs.accusationEligible || !gs.accusationEligible.includes(socket.id)) return;
      if (!gs.submittedAccusationIds) gs.submittedAccusationIds = [];
      if (gs.submittedAccusationIds.includes(socket.id)) return;

      const { target } = data || {};  // target: playerId or null/undefined to skip

      if (!dosRoundData[code]) dosRoundData[code] = { actions: {}, accusations: {}, stealMap: {} };
      dosRoundData[code].accusations[socket.id] = { target: target || null };

      gs.submittedAccusationIds.push(socket.id);
      io.to(code).emit('gameStateUpdated', gs);

      // All eligible have responded → resolve
      if (gs.submittedAccusationIds.length >= gs.accusationEligible.length) {
        const result = resolveDoSAccusations(room, code);
        gs.balances = result.balances;

        // Attach outcomes to last round history entry (revealed at end-game only)
        if (gs.roundHistory && gs.roundHistory.length > 0) {
          gs.roundHistory[gs.roundHistory.length - 1].accusationOutcomes = result.accusationOutcomes;
        }

        // Reset private round data for next round
        dosRoundData[code] = { actions: {}, accusations: {}, stealMap: {} };

        gs.phase = 'round-end';
        io.to(code).emit('gameStateUpdated', gs);
      }
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
