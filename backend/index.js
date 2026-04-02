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

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
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
      return { game, phase: 'setter-entry', round: 1, setterIndex: 0, currentPrompt: prompt, submittedGuesserIds: [], penalties: {} };
    }
    case 'pieCharts':
      return { game, phase: 'setup', questions: [], questionIdx: 0, submittedVoterIds: [], allVotes: [] };
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
      room.standOutAnswers = [];
      room.standOutStreaks  = {};
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
      const actualGame  = room.gameState?.game;
      const actualPhase = room.gameState?.phase;

      console.log('[standOut] so-answer received — socket:%s room:%s game:%s phase:%s',
        socket.id, code, actualGame, actualPhase);

      // Guard: only process during the correct game + phase
      if (actualGame !== 'standOut' || actualPhase !== 'entering') {
        console.warn('[standOut] IGNORED so-answer — expected game=standOut phase=entering, got game=%s phase=%s',
          actualGame, actualPhase);
        // Still relay so non-SO games using 'so-answer' aren't broken
        io.to(code).emit('playerActionReceived', { playerId: socket.id, action, data });
        return;
      }

      const gs = room.gameState;

      // Deduplicate — ignore if this player already submitted this round
      if ((gs.submittedPlayerIds ?? []).includes(socket.id)) {
        console.log('[standOut] duplicate submission ignored — playerId:', socket.id);
        return;
      }

      // Guard: this round's scoring has already run (prevent double-score)
      if (room.standOutRoundScored) {
        console.warn('[standOut] scoring already ran this round — ignoring late submission from', socket.id);
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        console.warn('[standOut] player not found for socket %s — room.players: %j', socket.id, room.players.map(p => p.id));
        return;
      }

      // Ensure accumulators exist (guard against missed reset)
      if (!Array.isArray(room.standOutAnswers)) room.standOutAnswers = [];
      if (!room.standOutStreaks) room.standOutStreaks = {};

      room.standOutAnswers.push({ playerId: socket.id, playerName: player.name, text: data.text });
      const newSubmitted = [...(gs.submittedPlayerIds ?? []), socket.id];

      const expected = room.players.length;
      const received = newSubmitted.length;
      console.log('[standOut] answer stored — player:%s text:"%s" | submitted:%d/%d | room.players:%j',
        player.name, data.text, received, expected, room.players.map(p => ({ id: p.id, name: p.name })));

      if (received >= expected) {
        // ── All answers in — guard against re-entry, then score ───────────
        room.standOutRoundScored = true;

        console.log('[standOut] completion condition met (%d >= %d) — running scoreStandOutRound', received, expected);

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

        console.log('[standOut] emitting gameStateUpdated phase:%s to room %s', nextGs.phase, code);
        io.to(code).emit('gameStateUpdated', nextGs);
        io.to(code).emit('scoresUpdated', updatedPlayers);
        console.log('[standOut] round complete — phase:%s winner:%s', nextGs.phase, isGameOver ? top.name : 'none');
      } else {
        // ── Partial — broadcast updated submitted list (keeps answers hidden) ──
        const nextGs = { ...gs, submittedPlayerIds: newSubmitted };
        room.gameState = nextGs;
        console.log('[standOut] partial update — emitting gameStateUpdated submitted:%d/%d', received, expected);
        io.to(code).emit('gameStateUpdated', nextGs);
      }

      return; // Do NOT relay to playerActionReceived
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
