// Applies db/migrations/*.sql in order, once each. Safe to run on every start.
import { readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = new URL('./migrations/', import.meta.url);
try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(new URL(name, dir), 'utf8'));
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`applied ${name}`);
  }
} finally {
  // An open pool keeps the process alive, and the start command chains the server after this.
  await sql.end({ timeout: 5 });
}
