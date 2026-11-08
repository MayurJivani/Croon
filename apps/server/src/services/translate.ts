// English lyrics for every song: synced lyrics are translated line by line through Google Cloud
// Translation or DeepL (whichever key is configured), once per song, and cached for everyone.
// Lines are sent as an array and come back aligned, so a translation sits under its own line.
import { env } from '../env.ts';
import { sql } from '../db/client.ts';
import { HttpError } from '../middleware/http.ts';
import { parseLrc, lineText } from '../../../../packages/core/src/lyrics.ts';
import { lyricsFor } from './lyrics.ts';
import { songMeta } from './catalog.ts';

export const translationProvider = () => (env.GOOGLE_TRANSLATE_API_KEY ? 'google' : env.DEEPL_API_KEY ? 'deepl' : null);

async function google(lines: string[], to: string): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 100) { // the API takes up to 128 strings a request
    const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY!)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ q: lines.slice(i, i + 100), target: to, format: 'text' }),
    });
    if (!r.ok) throw new HttpError(502, 'The translation service refused the request. Try again later.');
    const j = (await r.json()) as { data: { translations: { translatedText: string }[] } };
    out.push(...j.data.translations.map((t) => t.translatedText));
  }
  return out;
}

async function deepl(lines: string[], to: string): Promise<string[]> {
  const host = env.DEEPL_API_KEY!.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 50) { // DeepL takes up to 50 texts a request
    const r = await fetch(`https://${host}/v2/translate`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}` }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ text: lines.slice(i, i + 50), target_lang: to.toUpperCase() }),
    });
    if (!r.ok) throw new HttpError(502, r.status === 456 ? 'This month\'s translation allowance is used up.' : 'The translation service refused the request. Try again later.');
    const j = (await r.json()) as { translations: { text: string }[] };
    out.push(...j.translations.map((t) => t.text));
  }
  return out;
}

/** Cached translation, or null when nothing has been made yet. */
export async function cachedTranslation(key: string, lang = 'en'): Promise<string[] | null> {
  const [row] = await sql<{ lines: string[] }[]>`select lines from lyric_translations where song_key = ${key} and lang = ${lang}`;
  return row?.lines ?? null;
}

/** Translates a song's synced lyrics, aligned line for line with the parsed LRC. */
export async function translateSong(key: string, lang = 'en'): Promise<string[]> {
  const song = songMeta(key);
  if (!song) throw new HttpError(404, 'Song not found.');
  const l = await lyricsFor(key);
  if (!l.synced) throw new HttpError(404, 'This song has no synced lyrics to translate.');
  const provider = translationProvider();
  if (!provider) throw new HttpError(501, 'English translation is not set up on this server yet.');
  const lines = parseLrc(l.synced, song.duration).lines.map(lineText);
  const out = provider === 'google' ? await google(lines, lang) : await deepl(lines, lang);
  await sql`insert into lyric_translations (song_key, lang, lines, provider) values (${key}, ${lang}, ${sql.json(out)}, ${provider})
    on conflict (song_key, lang) do update set lines = excluded.lines, provider = excluded.provider, created_at = now()`;
  return out;
}
