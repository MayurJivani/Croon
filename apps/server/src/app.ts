import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { sessionMiddleware } from './auth/session.ts';
import { doubleCsrfProtection, generateCsrfToken, errorHandler } from './middleware/http.ts';
import { authRouter } from './routes/auth.ts';
import { songsRouter } from './routes/songs.ts';
import { meRouter } from './routes/me.ts';
import { roomsRouter } from './routes/rooms.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The YouTube IFrame Player API loads its script from youtube.com and serves the player from youtube-nocookie.
          scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
          frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
          // Album art from Deezer's CDN (catalogue metadata) and video thumbnails from YouTube.
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.dzcdn.net', 'https://i.ytimg.com'],
          // Guest audio files play from blob: URLs made from the room's file endpoint.
          mediaSrc: ["'self'", 'blob:'],
          // Socket.IO is same-origin; 'self' matches same-origin ws/wss in current browsers.
          connectSrc: ["'self'"],
          // Motion writes inline transform styles.
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  // Scoring needs the microphone on this origin and nowhere else.
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    next();
  });
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => !req.url?.startsWith('/api') } }));
  app.use(cookieParser());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', express.json({ limit: '96kb' }), sessionMiddleware);
  app.get('/api/csrf-token', (req, res) => res.json({ csrfToken: generateCsrfToken(req, res) }));
  app.use('/api', doubleCsrfProtection);
  app.use('/api/auth', authRouter);
  app.use('/api/songs', songsRouter);
  app.use('/api', meRouter);
  app.use('/api', roomsRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const web = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(web)) {
    app.use(express.static(web, { index: false, maxAge: '1y', immutable: true }));
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(`${web}index.html`);
    });
  }
  app.use(errorHandler);
  return app;
}
