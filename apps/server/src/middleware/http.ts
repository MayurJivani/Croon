// Request plumbing shared by every route: CSRF, validation, auth gate, rate limits, errors.
import type { NextFunction, Request, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { ZodType } from 'zod';
import { env } from '../env.ts';
import { logger } from '../logger.ts';

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req) => req.session.id,
  cookieName: env.NODE_ENV === 'production' ? '__Host-croon.csrf' : 'croon_csrf',
  cookieOptions: { sameSite: 'lax', path: '/', secure: env.NODE_ENV === 'production', httpOnly: false },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function validate(schema: ZodType, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req[target]);
    if (!r.success) {
      res.status(400).json({ error: r.error.issues[0]?.message ?? 'Invalid request', details: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      return;
    }
    // Express 5's req.query is a getter; replace it with the parsed value.
    Object.defineProperty(req, target, { value: r.data, enumerable: true, configurable: true, writable: true });
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Sign in to do that.' });
    return;
  }
  next();
}

/** The visitor's address. Behind cloudflared and Caddy only Cloudflare's header names them. */
export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  return ipKeyGenerator(env.TRUST_PROXY > 0 && typeof cf === 'string' && cf ? cf : (req.ip ?? ''));
}

const limiter = (windowMs: number, limit: number, error: string) =>
  rateLimit({ windowMs, limit: env.NODE_ENV === 'test' ? 100_000 : limit, standardHeaders: true, legacyHeaders: false, keyGenerator: clientIp, message: { error } });

export const authLimiter = limiter(15 * 60_000, 10, 'Too many attempts. Try again in a few minutes.');
export const searchLimiter = limiter(60_000, 90, 'Too many searches. Slow down a little.');
export const writeLimiter = limiter(60_000, 40, 'Too many changes at once. Slow down a little.');
export const roomLimiter = limiter(10 * 60_000, 12, 'Too many rooms created. Try again soon.');

export const asyncH = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : typeof (err as { status?: number })?.status === 'number' ? (err as { status: number }).status : 500;
  if (status >= 500) logger.error({ err, path: req.path }, 'unhandled error');
  const message = err instanceof HttpError ? err.message : status === 403 ? 'Your session expired. Reload the page and try again.' : status < 500 && err instanceof Error ? err.message : 'Something went wrong on our side.';
  res.status(status).json({ error: message });
}
