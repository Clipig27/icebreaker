import { io } from 'socket.io-client';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

if (!BACKEND_URL) {
  console.error('[Socket] EXPO_PUBLIC_BACKEND_URL is not set — socket will not connect');
}

// autoConnect: false is intentional — GameContext calls socket.connect() on mount.
// This prevents the socket from connecting before the app is ready.
const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ['websocket'],
});

/**
 * Resolves immediately if already connected.
 * Otherwise calls socket.connect(), resolves on 'connect', rejects on
 * 'connect_error' or after a 5-second timeout.
 * Safe to call concurrently — a `settled` flag ensures the promise is
 * resolved/rejected exactly once and all listeners are cleaned up on
 * every exit path.
 */
export function ensureSocketConnected(): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    const onConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('[Socket] connection timed out after 5 s'));
    }, 5_000);

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    if (!socket.connected) socket.connect();
  });
}

export default socket;
