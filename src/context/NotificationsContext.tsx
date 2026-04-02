import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { getUnreadCount } from '../storage/notificationStorage';

type NotificationsContextType = {
  unreadCount: number;
  refreshUnreadCount: () => void;
};

const NotificationsContext = createContext<NotificationsContextType>({
  unreadCount: 0,
  refreshUnreadCount: () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(() => {
    getUnreadCount()
      .then(n => setUnreadCount(n))
      .catch((err) => console.warn('[notif] getUnreadCount failed:', err?.message ?? err));
  }, []);

  useEffect(() => {
    // Short delay so Supabase auth session has time to hydrate on first load
    const t = setTimeout(refreshUnreadCount, 1_500);
    return () => clearTimeout(t);
  }, [refreshUnreadCount]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
