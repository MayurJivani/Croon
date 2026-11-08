import { createServer } from 'node:http';
import { setDefaultResultOrder } from 'node:dns';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { createApp } from './app.ts';
import { attachRealtime } from './realtime.ts';
import { loadCatalogState } from './services/catalog.ts';
import { warmLyrics } from './services/lyrics.ts';
import { startSessionSweep } from './auth/session.ts';
import { sql } from './db/client.ts';

// Some networks advertise IPv6 they cannot route; outbound calls (LRCLIB, YouTube) go IPv4 first.
setDefaultResultOrder('ipv4first');

await loadCatalogState();
startSessionSweep();
const http = createServer(createApp());
attachRealtime(http);
http.listen(env.PORT, env.HOST, () => logger.info({ port: env.PORT }, 'croon listening'));
if (env.WARM_LYRICS) void warmLyrics().catch((err) => logger.warn({ err }, 'lyrics warm stopped'));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    logger.info({ sig }, 'shutting down');
    http.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
