import pino from 'pino';
import { env } from './env.ts';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'password', 'recoveryCode', 'token'],
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
