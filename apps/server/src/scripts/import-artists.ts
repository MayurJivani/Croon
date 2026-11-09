// Imports whole discographies from the command line, the same way the library's "Import
// discography" button does, for seeding a deployment without a signed-in user.
//
//   node --env-file=../../.env src/scripts/import-artists.ts 9761322 134790 ...
//   node src/scripts/import-artists.ts --file artists.json        ([{ "id": "9761322", "name": "ZAYN" }])
//   ... --videos                                                    also search karaoke videos (YouTube quota)
//
// Songs already in the catalogue are skipped, lyrics already cached are not fetched again, and a
// rerun picks up where an interrupted one stopped.
import { readFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import { sql } from '../db/client.ts';
import { loadCatalogState, catalogRaw } from '../services/catalog.ts';
import { discography, saveExtra, autoFind } from '../services/imports.ts';
import { lyricsFor } from '../services/lyrics.ts';

setDefaultResultOrder('ipv4first');
const args = process.argv.slice(2);
const videos = args.includes('--videos');
const fileAt = args.indexOf('--file');
const artists: { id: string; name?: string }[] = fileAt >= 0
  ? JSON.parse(readFileSync(args[fileAt + 1], 'utf8'))
  : args.filter((a) => /^\d+$/.test(a)).map((id) => ({ id }));
if (!artists.length) {
  console.error('usage: import-artists.ts <deezer artist id>... | --file artists.json [--videos]');
  process.exit(1);
}

await loadCatalogState();
const keys: string[] = [];
for (const [i, a] of artists.entries()) {
  try {
    const songs = await discography(a.id);
    let added = 0;
    for (const raw of songs) {
      const key = `dz:${raw.id}`;
      keys.push(key);
      if (!catalogRaw(key)) {
        await saveExtra(raw, null);
        added++;
      }
    }
    console.log(`[${i + 1}/${artists.length}] ${a.name ?? a.id}: ${songs.length} songs, ${added} new`);
  } catch (err) {
    console.log(`[${i + 1}/${artists.length}] ${a.name ?? a.id}: failed (${(err as Error).message})`);
  }
}

const cached = new Set((await sql<{ song_key: string }[]>`select song_key from lyrics_cache`).map((r) => r.song_key));
let lyrics = 0, found = 0;
for (const [i, key] of keys.entries()) {
  if (!cached.has(key)) {
    const l = await lyricsFor(key).catch(() => null);
    if (l?.synced) lyrics++;
    await new Promise((r) => setTimeout(r, 900)); // LRCLIB asks for gentle traffic
  }
  if (videos) {
    const r = await autoFind(key, null).catch(() => null);
    if (r?.video === 'attached') found++;
    if (r?.video === 'quota') {
      console.log('YouTube quota used up; rerun with --videos tomorrow to continue.');
      break;
    }
  }
  if ((i + 1) % 100 === 0) console.log(`lyrics: ${i + 1}/${keys.length} checked, ${lyrics} newly found`);
}
const synced = (await sql<{ n: number }[]>`select count(*)::int as n from lyrics_cache where synced is not null and song_key in ${sql(keys.length ? keys : [''])}`)[0].n;
console.log(`done: ${keys.length} songs, ${synced} with synced lyrics${videos ? `, ${found} videos attached` : ''}`);
await sql.end();
