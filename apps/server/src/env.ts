import { z } from 'zod';

const schema = z.object({
  // Defaults to production so a deploy that forgets NODE_ENV gets secure cookies and no stacks.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4398),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a postgres:// URL'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters: openssl rand -hex 32'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Optional. Without it, karaoke videos can only be attached by pasting a link.
  YOUTUBE_API_KEY: z.string().optional().transform((v) => v || undefined),
  // Optional, for English lyric translations (cached per song). Either works; Google wins if both are set.
  GOOGLE_TRANSLATE_API_KEY: z.string().optional().transform((v) => v || undefined),
  DEEPL_API_KEY: z.string().optional().transform((v) => v || undefined),
  // Reverse proxies in front (Caddy, cloudflared), so rate limits see the visitor.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Pre-fetch synced lyrics for playable songs at startup so lyric search has text to search.
  WARM_LYRICS: z.enum(['0', '1']).default('1').transform((v) => v === '1'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const i of parsed.error.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
