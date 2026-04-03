import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import socket, { ensureSocketConnected } from '../socket';
import { LocalUser, getProfileById } from '../storage/userStorage';
import { navigateTo } from '../navigation/navigationRef';
import { supabase } from '../lib/supabase';
import { usePresence } from '../hooks/usePresence';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Player = {
  id: string;
  name: string;
  score: number;
  eliminated?: boolean;
};

export type GameType =
  | 'lieDetector'
  | 'talentShow'
  | 'standOut'
  | 'numberGuessor'
  | 'pieCharts'
  | 'dealOrSteal';

type Room = {
  code: string;
  hostId: string;
  players: Player[];
  phase: string;
  gameState: any;
};

type GameContextType = {
  // User (persistent)
  currentUser: LocalUser | null;
  userLoaded: boolean;
  authError: string | null;
  setCurrentUser: (user: LocalUser | null) => void;

  // Single-device play
  players: Player[];
  selectedGame: GameType | null;
  currentPlayerIndex: number;
  currentRound: number;
  setPlayers: (players: Player[]) => void;
  setSelectedGame: (game: GameType | null) => void;
  advancePlayer: () => void;
  updateScore: (playerId: string, delta: number) => void;
  nextRound: () => void;
  resetScores: () => void;

  // Multiplayer state
  room: Room | null;
  isHost: boolean;
  isConnected: boolean;

  // Multiplayer actions
  createRoom: (playerName: string) => void;
  joinRoom: (code: string, playerName: string) => void;
  leaveRoom: () => void;
  cancelRoom: () => void;
  startGame: (game: GameType) => void;
  sendGameState: (gameState: any) => void;
  sendPlayerAction: (action: string, data: any) => void;
  updateRoomScores: (players: Player[]) => void;
};

// ── Context ───────────────────────────────────────────────────────────────────

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  // ── User ──────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [userLoaded, setUserLoaded]   = useState(false);
  const [authError, setAuthError]     = useState<string | null>(null);

  // ── Single-device play ────────────────────────────────────────────────────
  const [players, setPlayers]               = useState<Player[]>([]);
  const [selectedGame, setSelectedGame]     = useState<GameType | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentRound, setCurrentRound]     = useState(1);

  // ── Multiplayer ───────────────────────────────────────────────────────────
  const [room, setRoom]           = useState<Room | null>(null);
  const [isHost, setIsHost]       = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // ── Presence tracking (app-level online status) ───────────────────────────
  usePresence(currentUser);

  // ── Auth bootstrap: restore or create session, then load profile ──────────
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        // 1. Restore existing session from AsyncStorage
        let { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        // 2. No session → create anonymous one
        if (!session?.user) {
          const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
          if (anonErr || !anonData.session) throw anonErr ?? new Error('Anonymous sign-in failed');
          session = anonData.session;
        }

        // 3. Fetch profile from public.users
        //    Returns null if no row or row has no username → needs onboarding
        const user = await getProfileById(session.user.id);

        if (active) {
          if (user) setCurrentUser(user);
          setUserLoaded(true);
        }
      } catch (e: any) {
        if (active) {
          setAuthError(e?.message ?? 'Failed to initialize session.');
          setUserLoaded(true);
        }
      }
    })();

    return () => { active = false; };
  }, []);

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[Socket] connecting to', process.env.EXPO_PUBLIC_BACKEND_URL);
    socket.connect();

    socket.on('connect', () => {
      console.log('[Socket] connected id=', socket.id);
      setIsConnected(true);
    });
    socket.on('disconnect', (reason) => {
      console.log('[Socket] disconnected reason=', reason);
      setIsConnected(false);
    });
    socket.on('connect_error', (err) => {
      console.error('[Socket] connect_error:', err.message);
    });
    socket.on('reconnect_attempt', (n) => {
      console.log('[Socket] reconnect attempt', n);
    });

    socket.on('roomCreated', ({ room: r }: { code: string; room: Room }) => {
      setRoom(r);
      setIsHost(true);
      setPlayers(r.players);
    });

    socket.on('roomUpdated', (r: Room) => {
      setRoom(r);
      setPlayers(r.players);
    });

    socket.on('gameStarted', (r: Room) => {
      setRoom(r);
      setSelectedGame(r.gameState.game);

      switch (r.gameState.game) {
        case 'lieDetector':
          navigateTo('LieDetector');
          break;
        case 'talentShow':
          navigateTo('TalentShow');
          break;
        case 'standOut':
          navigateTo('StandOut');
          break;
        case 'numberGuessor':
          navigateTo('NumberGuessor');
          break;
        case 'pieCharts':
          navigateTo('PieCharts');
          break;
        case 'dealOrSteal':
          navigateTo('DealOrSteal');
          break;
        default:
          break;
      }
    });

    socket.on('gameStateUpdated', (gameState: any) => {
      setRoom(prev => prev ? { ...prev, gameState } : prev);
    });

    socket.on('scoresUpdated', (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
    });

    // Host was reassigned (previous host left or disconnected)
    socket.on('hostChanged', ({ newHostId, room: r }: { newHostId: string; room: Room }) => {
      setRoom(r);
      setPlayers(r.players);
      if (newHostId === socket.id) {
        setIsHost(true);
      }
    });

    // Room was cancelled by the host — all non-host players get kicked
    socket.on('roomCancelled', (_data: { code: string }) => {
      setRoom(null);
      setIsHost(false);
      setPlayers([]);
      navigateTo('MainTabs');
    });

    // We successfully left a room voluntarily
    socket.on('leftRoom', (_data: { code: string }) => {
      setRoom(null);
      setIsHost(false);
      setPlayers([]);
      navigateTo('MainTabs');
    });

    socket.on('error', ({ message }: { message: string }) => {
      console.error('Socket error:', message);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('reconnect_attempt');
      socket.off('roomCreated');
      socket.off('roomUpdated');
      socket.off('gameStarted');
      socket.off('gameStateUpdated');
      socket.off('scoresUpdated');
      socket.off('hostChanged');
      socket.off('roomCancelled');
      socket.off('leftRoom');
      socket.off('error');
    };
  }, []);

  // ── Room cleanup helper ────────────────────────────────────────────────────
  // Silently exits any current room before creating/joining a new one.
  const exitCurrentRoom = useCallback(() => {
    if (!room) return;
    if (isHost) {
      socket.emit('cancelRoom', { code: room.code });
    } else {
      socket.emit('leaveRoom', { code: room.code });
    }
    setRoom(null);
    setIsHost(false);
    setPlayers([]);
  }, [room, isHost]);

  // ── Multiplayer actions ────────────────────────────────────────────────────

  const createRoom = useCallback((playerName: string) => {
    console.log('[createRoom] emit — connected:', socket.connected, 'existingRoom:', room?.code ?? 'none');
    if (room) exitCurrentRoom();
    ensureSocketConnected()
      .then(() => socket.emit('createRoom', { playerName }, (ack: { ok: boolean; message?: string }) => {
        if (!ack.ok) console.error('[createRoom] server rejected:', ack.message);
      }))
      .catch((err) => console.error('[createRoom] could not connect:', err.message));
  }, [room, exitCurrentRoom]);

  const joinRoom = useCallback((code: string, playerName: string) => {
    // Clear any existing room (e.g. user was hosting and switched to join)
    if (room) exitCurrentRoom();
    ensureSocketConnected()
      .then(() => socket.emit('joinRoom', { code, playerName }, (ack: { ok: boolean; message?: string }) => {
        if (!ack.ok) console.error('[joinRoom] server rejected:', ack.message);
      }))
      .catch((err) => console.error('[joinRoom] could not connect:', err.message));
  }, [room, exitCurrentRoom]);

  const leaveRoom = useCallback(() => {
    if (!room) return;
    socket.emit('leaveRoom', { code: room.code });
    // State is cleared when the server echoes back 'leftRoom'
  }, [room]);

  const cancelRoom = useCallback(() => {
    if (!room || !isHost) return;
    socket.emit('cancelRoom', { code: room.code });
    // Server emits 'roomCancelled' to all, which clears state for everyone
    // including us (handled by the 'roomCancelled' listener above)
  }, [room, isHost]);

  const startGame = useCallback((game: GameType) => {
    if (!room) {
      console.warn('[startGame] no room in context — emit skipped');
      return;
    }
    console.log('[startGame] emit — code:', room.code, 'game:', game, 'connected:', socket.connected);
    ensureSocketConnected()
      .then(() => socket.emit('startGame', { code: room.code, game }, (ack: { ok: boolean; message?: string }) => {
        if (!ack.ok) console.error('[startGame] server rejected:', ack.message);
      }))
      .catch((err) => console.error('[startGame] could not connect:', err.message));
  }, [room]);

  const sendGameState = useCallback((gameState: any) => {
    if (!room) {
      console.warn('[sendGameState] no room in context — emit skipped');
      return;
    }
    console.log('[sendGameState] emit — code:', room.code, 'phase:', gameState?.phase ?? '?', 'connected:', socket.connected);
    ensureSocketConnected()
      .then(() => socket.emit('updateGameState', { code: room.code, gameState }))
      .catch((err) => console.error('[sendGameState] could not connect:', err.message));
  }, [room]);

  const sendPlayerAction = useCallback((action: string, data: any) => {
    if (!room) return;
    ensureSocketConnected()
      .then(() => socket.emit('playerAction', { code: room.code, action, data }))
      .catch((err) => console.error('[sendPlayerAction] could not connect:', err.message));
  }, [room]);

  const updateRoomScores = useCallback((updatedPlayers: Player[]) => {
    if (!room) return;
    ensureSocketConnected()
      .then(() => socket.emit('updateScores', { code: room.code, players: updatedPlayers }))
      .catch((err) => console.error('[updateRoomScores] could not connect:', err.message));
  }, [room]);

  // ── Single-device helpers ─────────────────────────────────────────────────

  const advancePlayer = () => {
    setCurrentPlayerIndex(prev => (prev + 1) % players.length);
  };

  const updateScore = (playerId: string, delta: number) => {
    const updated = players.map(p =>
      p.id === playerId ? { ...p, score: p.score + delta } : p
    );
    setPlayers(updated);
    updateRoomScores(updated);
  };

  const nextRound = () => {
    setCurrentRound(prev => prev + 1);
    setPlayers(prev => prev.map(p => ({ ...p, eliminated: false })));
  };

  const resetScores = () => {
    const reset = players.map(p => ({ ...p, score: 0 }));
    setPlayers(reset);
    updateRoomScores(reset);
  };

  // ── Provider ──────────────────────────────────────────────────────────────
  return (
    <GameContext.Provider value={{
      currentUser,
      userLoaded,
      authError,
      setCurrentUser,

      players,
      selectedGame,
      currentPlayerIndex,
      currentRound,
      setPlayers,
      setSelectedGame,
      advancePlayer,
      updateScore,
      nextRound,
      resetScores,

      room,
      isHost,
      isConnected,

      createRoom,
      joinRoom,
      leaveRoom,
      cancelRoom,
      startGame,
      sendGameState,
      sendPlayerAction,
      updateRoomScores,
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
};
