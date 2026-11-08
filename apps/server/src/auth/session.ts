// Cookie sessions backed by the sessions table (Chorus pattern). Every visitor gets a session so
// CSRF has a stable identifier; signing in rotates it to stop fixation.
import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { sql } from '../db/client.ts';
import { env } from '../env.ts';
import { logger } from '../logger.ts';

export type Session = { id: string; userId: string | null };
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

export const COOKIE = env.NODE_ENV === 'production' ? '__Host-croon_sid' : 'croon_sid';
const TTL_MS = 30 * 24 * 3600 * 1000;
const digest = (t: string) => createHash('sha256').update(t).digest('hex');

/** Secure tracks how the request actually arrived, so a plain-http LAN deploy keeps its cookie. */
export const isHttps = (req: Request) => req.secure || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';

async function issue(req: Request, res: Response, userId: string | null): Promise<Session> {
  const token = randomBytes(32).toString('hex');
  const id = digest(token);
  await sql`insert into sessions (id, user_id, expires_at) values (${id}, ${userId}, ${new Date(Date.now() + TTL_MS)})`;
  // Production sits behind Cloudflare, which always serves https, and the __Host- prefix requires Secure.
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' || isHttps(req), path: '/', maxAge: TTL_MS });
  return { id, userId };
}

export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 128) return null;
  const [row] = await sql<{ id: string; user_id: string | null }[]>`select id, user_id from sessions where id = ${digest(token)} and expires_at > now()`;
  return row ? { id: row.id, userId: row.user_id } : null;
}

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await sessionFromToken(req.cookies?.[COOKIE]);
    req.session = s ?? (await issue(req, res, null));
    next();
  } catch (err) {
    next(err);
  }
}

/** Sign in: replace the session (fixation), caller regenerates the CSRF token. */
export async function bindUser(req: Request, res: Response, userId: string) {
  await sql`delete from sessions where id = ${req.session.id}`;
  req.session = await issue(req, res, userId);
}

export async function signOut(req: Request, res: Response) {
  await sql`delete from sessions where id = ${req.session.id}`;
  req.session = await issue(req, res, null);
}

/** Ends every session of a user except, optionally, the current one (after a password reset). */
export const endOtherSessions = (userId: string, keep?: string) => sql`delete from sessions where user_id = ${userId} and id <> ${keep ?? ''}`;

export function startSessionSweep() {
  const sweep = () => sql`delete from sessions where expires_at < now()`.then((r) => r.count && logger.info({ removed: r.count }, 'expired sessions swept')).catch((err) => logger.error({ err }, 'session sweep failed'));
  void sweep();
  setInterval(sweep, 6 * 3600 * 1000).unref();
}
