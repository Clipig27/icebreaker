import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import socket, { ensureSocketConnected } from '../socket';
import { LocalUser, getProfileById } from '../storage/userStorage';
import { navigateTo, resetToMain, goBack, replaceWith, getCurrentRouteName } from '../navigation/navigationRef';
import { supabase } from '../lib/supabase';
import { usePresence } from '../hooks/usePresence';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Player = {
  id: string;
  name: string;
  score: number;
  eliminated?: boolean;
  persistentId?: string | null;
};

export type GameType =
  | 'lieDetector'
  | 'talentShow'
  | 'standOut'
  | 'numberGuessor'
  | 'pieCharts'
  | 'dealOrSteal'
  | 'shadowProtocol';

type Room = {
  code: string;
  hostId: string;
  players: Player[];
  phase: string;
  hostScreen?: string;
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
  hostMessage: string | null;

  // Multiplayer actions
  createRoom: (playerName: string) => void;
  joinRoom: (code: string, playerName: string) => void;
  leaveRoom: () => void;
  cancelRoom: () => void;
  startGame: (game: GameType) => void;
  sendGameState: (gameState: any) => void;
  sendPlayerAction: (action: string, data: any) => void;
  updateRoomScores: (players: Player[]) => void;
  setHostScreen: (screen: string) => void;
  kickPlayer: (playerId: string) => void;
  endGame: () => void;
  restartGame: () => void;
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
  const [hostMessage, setHostMessage] = useState<string | null>(null);
  const hostMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs so socket callbacks always see the latest values without re-creating them
  const currentUserRef    = useRef<LocalUser | null>(null);
  const isHostRef         = useRef(false);
  const prevHostScreenRef = useRef<string | undefined>(undefined);

  const HOST_SCREEN_MESSAGES: Record<string, string> = {
    selecting:   'Host is picking a game...',
    playing:     'Host started a game!',
    lobby:       'Host is in the lobby',
    restarting:  'Host is restarting...',
    ended:       'Host ended the game',
  };

  function showHostMessage(msg: string) {
    if (hostMessageTimerRef.current) clearTimeout(hostMessageTimerRef.current);
    setHostMessage(msg);
    hostMessageTimerRef.current = setTimeout(() => setHostMessage(null), 3500);
  }
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

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
      // Re-register persistentId so stableId() works after a reconnect
      const pid = currentUserRef.current?.id;
      if (pid) {
        socket.emit('registerPersistentId', { persistentId: pid });
      }
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
      const prevHostScreen = prevHostScreenRef.current;
      prevHostScreenRef.current = r.hostScreen;

      setRoom(r);
      setPlayers(r.players);
      const myStableId = currentUserRef.current?.id ?? socket.id;
      const iAmHost = r.hostId === myStableId;
      setIsHost(iAmHost);

      // Show host status messages to non-hosts when hostScreen changes
      if (!iAmHost && r.hostScreen && r.hostScreen !== prevHostScreen) {
        const msg = HOST_SCREEN_MESSAGES[r.hostScreen];
        if (msg) showHostMessage(msg);
      }

      // If host navigated away from a live game, send non-hosts back one screen (to JoinRoom)
      if (!iAmHost && prevHostScreen === 'playing' && r.hostScreen !== 'playing') {
        goBack();
      }
    });

    socket.on('gameStarted', (r: Room) => {
      prevHostScreenRef.current = r.hostScreen ?? 'playing';
      setRoom(r);
      setPlayers(r.players);
      const myStableId = currentUserRef.current?.id ?? socket.id;
      setIsHost(r.hostId === myStableId);
      setSelectedGame(r.gameState.game);

      const GAME_ROUTE: Record<string, string> = {
        lieDetector:    'LieDetector',
        talentShow:     'TalentShow',
        standOut:       'StandOut',
        numberGuessor:  'NumberGuessor',
        pieCharts:      'PieCharts',
        dealOrSteal:    'DealOrSteal',
        shadowProtocol: 'ShadowProtocol',
      };

      const target = GAME_ROUTE[r.gameState.game];
      if (!target) return;

      // If already on this game screen (restart scenario), force a full remount
      // so local component state resets. Otherwise just navigate to it.
      if (getCurrentRouteName() === target) {
        replaceWith(target);
      } else {
        navigateTo(target);
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
      const myStableId = currentUserRef.current?.id ?? socket.id;
      setIsHost(newHostId === myStableId);
    });

    // Room was cancelled by the host — all non-host players get kicked
    socket.on('roomCancelled', (_data: { code: string }) => {
      setRoom(null);
      setIsHost(false);
      setPlayers([]);
      resetToMain();
    });

    // We successfully left a room voluntarily
    socket.on('leftRoom', (_data: { code: string }) => {
      setRoom(null);
      setIsHost(false);
      setPlayers([]);
      resetToMain();
    });

    // We were kicked by the host
    socket.on('playerKicked', (_data: { code: string }) => {
      setRoom(null);
      setIsHost(false);
      setPlayers([]);
      resetToMain();
    });

    // Host ended the current game — host goes to GameSelect, non-hosts wait in JoinRoom
    socket.on('gameEnded', (r: Room) => {
      prevHostScreenRef.current = r.hostScreen;
      setRoom(r);
      setPlayers(r.players);
      const myStableId = currentUserRef.current?.id ?? socket.id;
      const iAmHost = r.hostId === myStableId;
      setIsHost(iAmHost);
      if (iAmHost) {
        navigateTo('GameSelect');
      } else {
        showHostMessage('Host ended the game — waiting for next...');
        goBack();
      }
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
      socket.off('playerKicked');
      socket.off('gameEnded');
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
    const persistentId = currentUserRef.current?.id ?? socket.id;
    if (room) exitCurrentRoom();
    ensureSocketConnected()
      .then(() => socket.emit('createRoom', { playerName, persistentId }, (ack: { ok: boolean; message?: string }) => {
        if (!ack.ok) console.error('[createRoom] server rejected:', ack.message);
      }))
      .catch((err) => console.error('[createRoom] could not connect:', err.message));
  }, [room, exitCurrentRoom]);

  const joinRoom = useCallback((code: string, playerName: string) => {
    // Clear any existing room (e.g. user was hosting and switched to join)
    const persistentId = currentUserRef.current?.id ?? socket.id;
    if (room) exitCurrentRoom();
    ensureSocketConnected()
      .then(() => socket.emit('joinRoom', { code, playerName, persistentId }, (ack: { ok: boolean; message?: string }) => {
        if (!ack.ok) console.error('[joinRoom] server rejected:', ack.message);
      }))
      .catch((err) => console.error('[joinRoom] could not connect:', err.message));
  }, [room, exitCurrentRoom]);

  const leaveRoom = useCallback(() => {
    if (!room) return;
    socket.emit('leaveRoom', { code: room.code });
    // Navigate immediately — don't wait for server echo (which may not arrive if disconnected)
    setRoom(null);
    setIsHost(false);
    setPlayers([]);
    resetToMain();
  }, [room]);

  const cancelRoom = useCallback(() => {
    if (!room || !isHost) return;
    socket.emit('cancelRoom', { code: room.code });
    // Navigate immediately — don't wait for server echo
    setRoom(null);
    setIsHost(false);
    setPlayers([]);
    resetToMain();
  }, [room, isHost]);

  const startGame = useCallback((game: GameType) => {
    if (!room) {
      console.warn('[startGame] no room in context — emit skipped');
      return;
    }
    const persistentId = currentUserRef.current?.id ?? socket.id;
    console.log('[startGame] emit — code:', room.code, 'game:', game, 'persistentId:', persistentId, 'connected:', socket.connected);
    ensureSocketConnected()
      .then(() => socket.emit('startGame', { code: room.code, game, persistentId }, (ack: { ok: boolean; message?: string }) => {
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

  const setHostScreen = useCallback((screen: string) => {
    if (!room) return;
    socket.emit('setHostScreen', { code: room.code, screen });
  }, [room]);

  const kickPlayer = useCallback((playerId: string) => {
    if (!room || !isHost) return;
    socket.emit('kickPlayer', { code: room.code, playerId });
  }, [room, isHost]);

  const endGame = useCallback(() => {
    if (!room || !isHost) return;
    socket.emit('endGame', { code: room.code });
  }, [room, isHost]);

  const restartGame = useCallback(() => {
    if (!room || !isHost) return;
    socket.emit('restartGame', { code: room.code });
  }, [room, isHost]);

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
      hostMessage,

      createRoom,
      joinRoom,
      leaveRoom,
      cancelRoom,
      startGame,
      sendGameState,
      sendPlayerAction,
      updateRoomScores,
      setHostScreen,
      kickPlayer,
      endGame,
      restartGame,
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
