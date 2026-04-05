'use strict';

// ── Shadow Protocol — Mafia-style social deduction game ───────────────────────

// ── Role distribution by player count ─────────────────────────────────────────
const ROLE_DIST = {
  6:  { SHADOW: 2, INVESTIGATOR: 1, GUARDIAN: 1, AGENT: 2 },
  7:  { SHADOW: 2, INVESTIGATOR: 1, GUARDIAN: 1, AGENT: 3 },
  8:  { SHADOW: 3, INVESTIGATOR: 1, GUARDIAN: 1, AGENT: 3 },
  9:  { SHADOW: 3, INVESTIGATOR: 1, GUARDIAN: 1, AGENT: 4 },
  10: { SHADOW: 3, INVESTIGATOR: 1, GUARDIAN: 1, AGENT: 5 },
};

// ── Phase durations (ms) ───────────────────────────────────────────────────────
const PHASE_MS = {
  'role-reveal':   10000,
  'night':         50000,
  'day-reveal':     7000,
  'discussion':   120000,
  'voting':        40000,
  'runoff-voting': 30000,
};

// ── Glitch system ──────────────────────────────────────────────────────────────
// 35% chance per round from round 2 onward.
// FALSE_SCAN        → investigator receives the wrong role
// ROLE_SWAP         → day reveal shows two alive players swapped
// SCRAMBLED_REVEAL  → night elimination shows the wrong name
const GLITCH_TYPES  = ['FALSE_SCAN', 'ROLE_SWAP', 'SCRAMBLED_REVEAL'];
const GLITCH_CHANCE = 0.35;

// ── Per-room private state ─────────────────────────────────────────────────────
// spData[roomCode] = {
//   roles:            { [playerId]: 'AGENT'|'SHADOW'|'INVESTIGATOR'|'GUARDIAN' }
//   alive:            Set<playerId>
//   dead:             playerId[]
//   round:            number
//   glitch:           null | { type: string }
//   nightActions:     { shadowVotes: {}, investigatorTarget: null, guardianTarget: null }
//   dayVotes:         { [voterId]: targetId }
//   runoffCandidates: playerId[]
//   runoffVotes:      { [voterId]: targetId }
//   phaseTimer:       TimeoutHandle | null
// }
const spData = {};

// ── Utilities ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearTimer(sp) {
  if (sp && sp.phaseTimer) {
    clearTimeout(sp.phaseTimer);
    sp.phaseTimer = null;
  }
}

function schedulePhase(sp, code, ms, callback) {
  clearTimer(sp);
  sp.phaseTimer = setTimeout(callback, ms);
  console.log('[sp:%s] timer set %dms', code, ms);
}

function playerName(room, id) {
  return room.players.find(p => p.id === id)?.name ?? '???';
}

function alivePlayers(room, sp) {
  return [...sp.alive].map(id => ({ id, name: playerName(room, id) }));
}

function eliminatedPlayers(room, sp) {
  return sp.dead.map(id => ({ id, name: playerName(room, id) }));
}

// ── Broadcast public state ─────────────────────────────────────────────────────
function broadcastState(room, code, io) {
  io.to(code).emit('gameStateUpdated', room.gameState);
}

// ── Send private role to one player ───────────────────────────────────────────
function sendPrivate(room, code, playerId, sp, io) {
  if (!sp || !sp.roles[playerId]) return;
  const role = sp.roles[playerId];
  const shadowAllies = role === 'SHADOW'
    ? room.players
        .filter(p => p.id !== playerId && sp.roles[p.id] === 'SHADOW')
        .map(p => ({ id: p.id, name: p.name }))
    : [];
  io.to(playerId).emit('spPrivateState', {
    role,
    shadowAllies,
    isAlive: sp.alive.has(playerId),
  });
}

// ── Check win conditions ───────────────────────────────────────────────────────
// Returns 'AGENTS' | 'SHADOWS' | null
function getWinner(sp) {
  const shadows    = [...sp.alive].filter(id => sp.roles[id] === 'SHADOW').length;
  const nonShadows = sp.alive.size - shadows;
  if (shadows === 0)           return 'AGENTS';
  if (shadows >= nonShadows)   return 'SHADOWS';
  return null;
}

// ── Finalize game ──────────────────────────────────────────────────────────────
function finalizeGame(room, code, winner, io) {
  const sp = spData[code];
  if (!sp) return;
  clearTimer(sp);

  room.gameState.phase      = 'game-over';
  room.gameState.winner     = winner;
  room.gameState.finalRoles = room.players.map(p => ({
    id: p.id, name: p.name, role: sp.roles[p.id] ?? 'AGENT',
  }));

  console.log('[sp:%s] game over — winner=%s', code, winner);
  broadcastState(room, code, io);
}

// ── Initialize ─────────────────────────────────────────────────────────────────
function initGame(room, code, io) {
  const players = room.players;
  const n       = players.length;
  const dist    = ROLE_DIST[n];

  if (!dist) {
    console.warn('[sp:%s] invalid player count %d', code, n);
    return false;
  }

  // Assign roles
  const roleList = [];
  for (const [role, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) roleList.push(role);
  }
  const shuffled = shuffle(roleList);
  const roles = {};
  players.forEach((p, i) => { roles[p.id] = shuffled[i]; });

  spData[code] = {
    roles,
    alive:            new Set(players.map(p => p.id)),
    dead:             [],
    round:            1,
    glitch:           null,
    nightActions:     { shadowVotes: {}, investigatorTarget: null, guardianTarget: null },
    dayVotes:         {},
    runoffCandidates: [],
    runoffVotes:      {},
    phaseTimer:       null,
  };

  // Set initial public game state
  room.gameState = {
    game:                   'shadowProtocol',
    phase:                  'role-reveal',
    round:                  1,
    alivePlayers:           players.map(p => ({ id: p.id, name: p.name })),
    eliminatedPlayers:      [],
    eliminatedThisRound:    null,
    dayEliminatedPlayer:    null,
    submittedNightActionIds:[],
    votes:                  {},
    runoffVotes:            {},
    runoffCandidates:       [],
    winner:                 null,
    glitchActive:           false,
    glitchType:             null,
    glitchSwapPair:         null,
    finalRoles:             null,
    phaseEndsAt:            Date.now() + PHASE_MS['role-reveal'],
  };

  console.log('[sp:%s] initialized | players=%d | roles=%j', code, n, roles);

  // Send each player their private role after a short delay (give clients time
  // to navigate to the screen after receiving `gameStarted`)
  setTimeout(() => {
    for (const p of players) {
      sendPrivate(room, code, p.id, spData[code], io);
    }
  }, 800);

  // Auto-advance role-reveal → night
  const sp = spData[code];
  schedulePhase(sp, code, PHASE_MS['role-reveal'], () => startNight(room, code, io));

  return true;
}

// ── Night phase ────────────────────────────────────────────────────────────────
function startNight(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  sp.nightActions = { shadowVotes: {}, investigatorTarget: null, guardianTarget: null };

  room.gameState.phase                  = 'night';
  room.gameState.submittedNightActionIds = [];
  room.gameState.eliminatedThisRound    = null;
  room.gameState.dayEliminatedPlayer    = null;
  room.gameState.glitchActive           = false;
  room.gameState.glitchType             = null;
  room.gameState.glitchSwapPair         = null;
  room.gameState.votes                  = {};
  room.gameState.runoffVotes            = {};
  room.gameState.runoffCandidates       = [];
  room.gameState.phaseEndsAt            = Date.now() + PHASE_MS['night'];

  broadcastState(room, code, io);
  schedulePhase(sp, code, PHASE_MS['night'], () => resolveNight(room, code, io));
}

// ── Check if all required night actions submitted ──────────────────────────────
function checkNightComplete(room, code, io) {
  const sp = spData[code];
  if (!sp || room.gameState.phase !== 'night') return;

  const { shadowVotes, investigatorTarget, guardianTarget } = sp.nightActions;
  const aliveShadows       = [...sp.alive].filter(id => sp.roles[id] === 'SHADOW');
  const aliveInvestigators = [...sp.alive].filter(id => sp.roles[id] === 'INVESTIGATOR');
  const aliveGuardians     = [...sp.alive].filter(id => sp.roles[id] === 'GUARDIAN');

  const shadowsDone       = aliveShadows.every(id => !!shadowVotes[id]);
  const investigatorsDone = aliveInvestigators.length === 0 || investigatorTarget !== null;
  const guardiansDone     = aliveGuardians.length === 0     || guardianTarget !== null;

  if (shadowsDone && investigatorsDone && guardiansDone) {
    clearTimer(sp);
    resolveNight(room, code, io);
  }
}

// ── Resolve night ──────────────────────────────────────────────────────────────
function resolveNight(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  const { shadowVotes, investigatorTarget, guardianTarget } = sp.nightActions;

  // Tally shadow votes
  const tally = {};
  for (const targetId of Object.values(shadowVotes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  // Find majority target (random tie-break)
  let shadowTarget = null;
  if (Object.keys(tally).length > 0) {
    const maxVotes = Math.max(...Object.values(tally));
    const leaders  = Object.entries(tally).filter(([, c]) => c === maxVotes).map(([id]) => id);
    shadowTarget   = leaders[Math.floor(Math.random() * leaders.length)];
  }

  // Guardian protection
  let eliminated = null;
  if (shadowTarget && shadowTarget !== guardianTarget && sp.alive.has(shadowTarget)) {
    eliminated = shadowTarget;
    sp.alive.delete(eliminated);
    sp.dead.push(eliminated);
  }

  // Glitch roll (no glitch on round 1)
  const glitchType = sp.round > 1 && Math.random() < GLITCH_CHANCE
    ? GLITCH_TYPES[Math.floor(Math.random() * GLITCH_TYPES.length)]
    : null;
  sp.glitch = glitchType ? { type: glitchType } : null;

  // ── Investigator private scan result ──────────────────────────────────────
  if (investigatorTarget && sp.alive.has(investigatorTarget)) {
    const investigatorId = [...sp.alive].find(id => sp.roles[id] === 'INVESTIGATOR');
    if (investigatorId) {
      let scannedRole = sp.roles[investigatorTarget];
      let glitched    = false;

      if (glitchType === 'FALSE_SCAN') {
        const others = ['AGENT', 'SHADOW', 'INVESTIGATOR', 'GUARDIAN'].filter(r => r !== scannedRole);
        scannedRole = others[Math.floor(Math.random() * others.length)];
        glitched    = true;
      }

      io.to(investigatorId).emit('spScanResult', {
        targetId:   investigatorTarget,
        targetName: playerName(room, investigatorTarget),
        role:       scannedRole,
        glitched,
      });
    }
  }

  // ── ROLE_SWAP glitch — two alive players appear swapped in day reveal ─────
  let swapPair = null;
  if (glitchType === 'ROLE_SWAP' && sp.alive.size >= 2) {
    const arr = [...sp.alive];
    const i1  = Math.floor(Math.random() * arr.length);
    let   i2;
    do { i2 = Math.floor(Math.random() * arr.length); } while (i2 === i1);
    swapPair = [arr[i1], arr[i2]];
  }

  // ── SCRAMBLED_REVEAL — show wrong name as eliminated ──────────────────────
  let revealedEliminated = null;
  if (eliminated) {
    if (glitchType === 'SCRAMBLED_REVEAL' && sp.alive.size > 0) {
      const aliveArr = [...sp.alive];
      const fakeId   = aliveArr[Math.floor(Math.random() * aliveArr.length)];
      revealedEliminated = { id: fakeId, name: playerName(room, fakeId) };
    } else {
      revealedEliminated = { id: eliminated, name: playerName(room, eliminated) };
    }
  }

  // ── Notify eliminated player of updated alive status ──────────────────────
  if (eliminated) {
    io.to(eliminated).emit('spPrivateState', {
      role:         sp.roles[eliminated],
      shadowAllies: [],
      isAlive:      false,
    });
  }

  // ── Update public game state ───────────────────────────────────────────────
  room.gameState.phase               = 'day-reveal';
  room.gameState.eliminatedThisRound = revealedEliminated;
  room.gameState.glitchActive        = !!glitchType;
  room.gameState.glitchType          = glitchType || null;
  room.gameState.glitchSwapPair      = swapPair;
  room.gameState.alivePlayers        = alivePlayers(room, sp);
  room.gameState.eliminatedPlayers   = eliminatedPlayers(room, sp);
  room.gameState.phaseEndsAt         = Date.now() + PHASE_MS['day-reveal'];

  console.log('[sp:%s] night resolved | eliminated=%s | glitch=%s', code, eliminated ?? 'none', glitchType ?? 'none');
  broadcastState(room, code, io);

  // Check win after night elimination
  const winner = getWinner(sp);
  if (winner) { finalizeGame(room, code, winner, io); return; }

  schedulePhase(sp, code, PHASE_MS['day-reveal'], () => startDiscussion(room, code, io));
}

// ── Discussion phase ───────────────────────────────────────────────────────────
function startDiscussion(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  sp.dayVotes = {};
  room.gameState.phase       = 'discussion';
  room.gameState.votes       = {};
  room.gameState.phaseEndsAt = Date.now() + PHASE_MS['discussion'];

  broadcastState(room, code, io);
  schedulePhase(sp, code, PHASE_MS['discussion'], () => startVoting(room, code, io));
}

// ── Voting phase ───────────────────────────────────────────────────────────────
function startVoting(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  sp.dayVotes = {};
  room.gameState.phase       = 'voting';
  room.gameState.votes       = {};
  room.gameState.phaseEndsAt = Date.now() + PHASE_MS['voting'];

  broadcastState(room, code, io);
  schedulePhase(sp, code, PHASE_MS['voting'], () => resolveVoting(room, code, io));
}

function checkVotingComplete(room, code, io) {
  const sp = spData[code];
  if (!sp || room.gameState.phase !== 'voting') return;
  if (Object.keys(sp.dayVotes).length >= sp.alive.size) {
    clearTimer(sp);
    resolveVoting(room, code, io);
  }
}

function resolveVoting(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  const tally = {};
  for (const targetId of Object.values(sp.dayVotes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  room.gameState.votes = tally;
  broadcastState(room, code, io);

  if (Object.keys(tally).length === 0) {
    // No votes — advance to next round
    setTimeout(() => advanceRound(room, code, io), 2000);
    return;
  }

  const maxVotes = Math.max(...Object.values(tally));
  const leaders  = Object.entries(tally).filter(([, c]) => c === maxVotes).map(([id]) => id);

  if (leaders.length === 1) {
    setTimeout(() => eliminateByVote(room, code, io, leaders[0]), 2000);
  } else {
    setTimeout(() => startRunoff(room, code, io, leaders), 2000);
  }
}

// ── Runoff voting ──────────────────────────────────────────────────────────────
function startRunoff(room, code, io, candidates) {
  const sp = spData[code];
  if (!sp) return;

  sp.runoffCandidates = candidates;
  sp.runoffVotes      = {};

  room.gameState.phase            = 'runoff-voting';
  room.gameState.runoffCandidates = candidates.map(id => ({ id, name: playerName(room, id) }));
  room.gameState.runoffVotes      = {};
  room.gameState.phaseEndsAt      = Date.now() + PHASE_MS['runoff-voting'];

  broadcastState(room, code, io);
  schedulePhase(sp, code, PHASE_MS['runoff-voting'], () => resolveRunoff(room, code, io));
}

function checkRunoffComplete(room, code, io) {
  const sp = spData[code];
  if (!sp || room.gameState.phase !== 'runoff-voting') return;
  if (Object.keys(sp.runoffVotes).length >= sp.alive.size) {
    clearTimer(sp);
    resolveRunoff(room, code, io);
  }
}

function resolveRunoff(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  const tally = {};
  for (const targetId of Object.values(sp.runoffVotes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  room.gameState.runoffVotes = tally;
  broadcastState(room, code, io);

  if (Object.keys(tally).length === 0) {
    setTimeout(() => advanceRound(room, code, io), 2000);
    return;
  }

  const maxVotes = Math.max(...Object.values(tally));
  const leaders  = Object.entries(tally).filter(([, c]) => c === maxVotes).map(([id]) => id);

  if (leaders.length === 1) {
    setTimeout(() => eliminateByVote(room, code, io, leaders[0]), 2000);
  } else {
    // Persistent tie — nobody eliminated
    console.log('[sp:%s] runoff tie — no elimination', code);
    setTimeout(() => advanceRound(room, code, io), 2500);
  }
}

// ── Day elimination ────────────────────────────────────────────────────────────
function eliminateByVote(room, code, io, targetId) {
  const sp = spData[code];
  if (!sp) return;

  sp.alive.delete(targetId);
  sp.dead.push(targetId);

  const role = sp.roles[targetId];

  room.gameState.dayEliminatedPlayer = { id: targetId, name: playerName(room, targetId), role };
  room.gameState.alivePlayers        = alivePlayers(room, sp);
  room.gameState.eliminatedPlayers   = eliminatedPlayers(room, sp);

  // Notify eliminated player
  io.to(targetId).emit('spPrivateState', { role, shadowAllies: [], isAlive: false });

  console.log('[sp:%s] day elimination | %s | role=%s', code, playerName(room, targetId), role);
  broadcastState(room, code, io);

  const winner = getWinner(sp);
  if (winner) { finalizeGame(room, code, winner, io); return; }

  setTimeout(() => advanceRound(room, code, io), 3000);
}

// ── Advance to next round (start next night) ───────────────────────────────────
function advanceRound(room, code, io) {
  const sp = spData[code];
  if (!sp) return;

  sp.round += 1;
  sp.glitch  = null;

  room.gameState.round             = sp.round;
  room.gameState.dayEliminatedPlayer = null;

  startNight(room, code, io);
}

// ── Handle player action ───────────────────────────────────────────────────────
// Returns true if the action was consumed (prevents generic relay).
function handlePlayerAction(socket, room, code, action, data, io) {
  const sp = spData[code];
  if (!sp) return false;

  const playerId = socket.id;
  const role     = sp.roles[playerId];
  const isAlive  = sp.alive.has(playerId);
  const gs       = room.gameState;

  // ── Request private state (reconnect support) ──────────────────────────────
  if (action === 'sp-request-private-state') {
    sendPrivate(room, code, playerId, sp, io);
    return true;
  }

  // ── Night: shadow vote ─────────────────────────────────────────────────────
  if (action === 'sp-shadow-vote' && gs.phase === 'night' && role === 'SHADOW' && isAlive) {
    const targetId = data?.targetId;
    if (!targetId || !sp.alive.has(targetId) || targetId === playerId) return true;
    if (sp.roles[targetId] === 'SHADOW') return true; // Can't kill own team
    if (sp.nightActions.shadowVotes[playerId]) return true; // Already voted

    sp.nightActions.shadowVotes[playerId] = targetId;
    gs.submittedNightActionIds = [...new Set([...gs.submittedNightActionIds, playerId])];
    broadcastState(room, code, io);
    console.log('[sp:%s] shadow vote | %s → %s', code, playerId, targetId);
    checkNightComplete(room, code, io);
    return true;
  }

  // ── Night: investigate ─────────────────────────────────────────────────────
  if (action === 'sp-investigate' && gs.phase === 'night' && role === 'INVESTIGATOR' && isAlive) {
    if (sp.nightActions.investigatorTarget !== null) return true;
    const targetId = data?.targetId;
    if (!targetId || !sp.alive.has(targetId) || targetId === playerId) return true;

    sp.nightActions.investigatorTarget = targetId;
    gs.submittedNightActionIds = [...new Set([...gs.submittedNightActionIds, playerId])];
    broadcastState(room, code, io);
    console.log('[sp:%s] investigate | %s → %s', code, playerId, targetId);
    checkNightComplete(room, code, io);
    return true;
  }

  // ── Night: guard ───────────────────────────────────────────────────────────
  if (action === 'sp-guard' && gs.phase === 'night' && role === 'GUARDIAN' && isAlive) {
    if (sp.nightActions.guardianTarget !== null) return true;
    const targetId = data?.targetId;
    if (!targetId || !sp.alive.has(targetId)) return true;

    sp.nightActions.guardianTarget = targetId;
    gs.submittedNightActionIds = [...new Set([...gs.submittedNightActionIds, playerId])];
    broadcastState(room, code, io);
    console.log('[sp:%s] guard | %s → %s', code, playerId, targetId);
    checkNightComplete(room, code, io);
    return true;
  }

  // ── Day vote ───────────────────────────────────────────────────────────────
  if (action === 'sp-day-vote' && gs.phase === 'voting' && isAlive) {
    if (sp.dayVotes[playerId]) return true;
    const targetId = data?.targetId;
    if (!targetId || !sp.alive.has(targetId) || targetId === playerId) return true;

    sp.dayVotes[playerId] = targetId;

    // Broadcast anonymous tally
    const tally = {};
    for (const tid of Object.values(sp.dayVotes)) tally[tid] = (tally[tid] || 0) + 1;
    gs.votes = tally;
    broadcastState(room, code, io);
    console.log('[sp:%s] day vote | %s → %s', code, playerId, targetId);
    checkVotingComplete(room, code, io);
    return true;
  }

  // ── Runoff vote ────────────────────────────────────────────────────────────
  if (action === 'sp-runoff-vote' && gs.phase === 'runoff-voting' && isAlive) {
    if (sp.runoffVotes[playerId]) return true;
    const targetId = data?.targetId;
    if (!targetId || !sp.runoffCandidates.includes(targetId)) return true;

    sp.runoffVotes[playerId] = targetId;

    const tally = {};
    for (const tid of Object.values(sp.runoffVotes)) tally[tid] = (tally[tid] || 0) + 1;
    gs.runoffVotes = tally;
    broadcastState(room, code, io);
    console.log('[sp:%s] runoff vote | %s → %s', code, playerId, targetId);
    checkRunoffComplete(room, code, io);
    return true;
  }

  // ── Chat (alive + dead ghosts can chat) ───────────────────────────────────
  if (action === 'sp-chat') {
    const text = (data?.text ?? '').trim().slice(0, 200);
    if (!text) return true;
    const p = room.players.find(q => q.id === playerId);
    io.to(code).emit('spChatMessage', {
      playerId,
      playerName: p?.name ?? '???',
      text,
      isGhost: !isAlive,
      timestamp: Date.now(),
    });
    return true;
  }

  return false;
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
function cleanupRoom(code) {
  const sp = spData[code];
  if (!sp) return;
  clearTimer(sp);
  delete spData[code];
  console.log('[sp:%s] cleaned up', code);
}

module.exports = { initGame, handlePlayerAction, cleanupRoom, spData };
