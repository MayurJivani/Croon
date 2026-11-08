import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

export type User = { id: string; username: string; displayName: string; avatar: { glyph: string; color: string } };
type Ctx = { user: User | null; ready: boolean; setUser(u: User | null): void; refresh(): Promise<void>; logout(): Promise<void> };
const SessionCtx = createContext<Ctx>(null as never);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setUser((await api<{ user: User | null }>('/auth/me')).user);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);
  return <SessionCtx.Provider value={{ user, ready, setUser, refresh, logout }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
