import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

export type User = { id: string; username: string; displayName: string; avatar: { glyph: string; color: string } };
type Ctx = { user: User | null; seeder: boolean; ready: boolean; setUser(u: User | null): void; refresh(): Promise<void>; logout(): Promise<void> };
const SessionCtx = createContext<Ctx>(null as never);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [seeder, setSeeder] = useState(false);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: User | null; seeder?: boolean }>('/auth/me');
      setUserState(me.user);
      setSeeder(!!me.seeder);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  // Signing in or out changes who may seed, so the server is asked again.
  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    setSeeder(false);
    if (u) void refresh();
  }, [refresh]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, [setUser]);
  return <SessionCtx.Provider value={{ user, seeder, ready, setUser, refresh, logout }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
