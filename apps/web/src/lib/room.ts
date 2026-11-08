// The room connection: one Socket.IO client, the server clock offset, and the latest snapshot.
// Reconnects rejoin with the saved token, so a phone that sleeps comes back as the same person.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { clockOffset, type ClockSample } from '../../../../packages/core/src/timeline.ts';
import type { Avatar, LiveMsg, RoomView } from '../../../../packages/core/src/protocol.ts';

export type Reply = { ok?: boolean; error?: string; [k: string]: unknown };
const tokenKey = (code: string, stage: boolean) => `croon:${stage ? 'stage' : 'seat'}:${code}`;
export const saveHostToken = (code: string, token: string) => {
  try {
    localStorage.setItem(tokenKey(code, false), token);
  } catch {
    /* private mode: the host simply rejoins as a guest */
  }
};
export const roomToken = (code: string, stage: boolean) => readToken(code, stage);
const readToken = (code: string, stage: boolean) => {
  try {
    return localStorage.getItem(tokenKey(code, stage)) ?? undefined;
  } catch {
    return undefined;
  }
};

export function useRoom(code: string | null, me: { name: string; avatar: Avatar } | null, opts: { stage?: boolean } = {}) {
  const [view, setView] = useState<RoomView | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline' | 'kicked' | 'closed'>('connecting');
  const sock = useRef<Socket | null>(null);
  const offset = useRef(0);
  const liveSubs = useRef(new Set<(m: LiveMsg) => void>());
  const meRef = useRef(me);
  meRef.current = me;
  const stage = !!opts.stage;

  const syncClock = useCallback(async (s: Socket) => {
    const samples: ClockSample[] = [];
    for (let i = 0; i < 6; i++) {
      const sent = performance.timeOrigin + performance.now();
      const server = await new Promise<number>((r) => s.timeout(3000).emit('time', null, (err: unknown, t: number) => r(err ? NaN : t)));
      if (Number.isFinite(server)) samples.push({ sent, server, received: performance.timeOrigin + performance.now() });
    }
    if (samples.length) offset.current = clockOffset(samples).offset;
  }, []);

  useEffect(() => {
    if (!code || (!me && !stage)) return;
    const s = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    sock.current = s;
    const join = () => {
      const m = meRef.current ?? { name: 'Stage', avatar: { glyph: 'mic', color: '#f2e8dc' } };
      s.emit('join', { code, name: m.name, avatar: m.avatar, token: readToken(code, stage), stage }, (r: Reply & { pid?: string; token?: string; view?: RoomView }) => {
        if (r.error) {
          setError(r.error);
          setStatus('offline');
          return;
        }
        try {
          localStorage.setItem(tokenKey(code, stage), r.token!);
        } catch {
          /* ignore */
        }
        setPid(r.pid!);
        setView(r.view!);
        setError(null);
        setStatus('live');
      });
      void syncClock(s);
    };
    s.on('connect', join);
    s.on('disconnect', () => setStatus((st) => (st === 'kicked' || st === 'closed' ? st : 'offline')));
    s.on('room', (v: RoomView) => setView(v));
    s.on('live', (m: LiveMsg) => liveSubs.current.forEach((f) => f(m)));
    s.on('kicked', () => {
      setStatus('kicked');
      s.close();
    });
    s.on('closed', () => {
      setStatus('closed');
      s.close();
    });
    // Phones drift; re-sync the clock every half minute.
    const t = setInterval(() => s.connected && void syncClock(s), 30_000);
    return () => {
      clearInterval(t);
      s.close();
    };
  }, [code, stage, !!me, syncClock]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback(<T extends Reply = Reply>(ev: string, data: unknown = {}) =>
    new Promise<T>((r) => {
      if (!sock.current?.connected) return r({ error: 'Reconnecting… try again in a moment.' } as T);
      sock.current.timeout(8000).emit(ev, data, (err: unknown, res: T) => r(err ? ({ error: 'The room did not answer. Try again.' } as T) : res));
    }), []);
  const live = useCallback((t: number, m: number | null) => sock.current?.volatile.emit('live', { t, m }), []);
  const onLive = useCallback((f: (m: LiveMsg) => void) => {
    liveSubs.current.add(f);
    return () => void liveSubs.current.delete(f);
  }, []);
  /** Server time now, from this device's clock and the measured offset. */
  const serverNow = useCallback(() => performance.timeOrigin + performance.now() + offset.current, []);

  return { view, pid, error, status, emit, live, onLive, serverNow };
}
