import pino from 'pino';
import { env } from './env.ts';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Session and CSRF cookies are credentials: never in logs, in either direction.
  redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'req.headers["x-room-token"]', 'res.headers["set-cookie"]', 'password', 'recoveryCode', 'token'],
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
