// Discography import against canned Deezer responses: no network, no database writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const envFile = new URL('../../../.env', import.meta.url);
for (const line of existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { discography, guessLanguage } = await import('../src/services/imports.ts');
const { sql } = await import('../src/db/client.ts');

const ARTIST = '9761322';
const me = { id: Number(ARTIST), name: 'ZAYN' };
const other = { id: 42, name: 'Someone Else' };
const track = (id: number, title: string, rank: number, artist = me) => ({ id, title, duration: 200, rank, artist, album: { id: 900 } });
const responses: Record<string, unknown> = {
  [`artist/${ARTIST}/albums?limit=100`]: { data: [{ id: 1, title: 'Mind Of Mine', record_type: 'album' }, { id: 2, title: 'Mind Of Mine (Deluxe)', record_type: 'album' }, { id: 3, title: 'Hits', record_type: 'compile' }] },
  'album/1': { id: 1, title: 'Mind Of Mine', release_date: '2016-03-25', genres: { data: [{ name: 'R&B' }] }, tracks: { data: [track(10, 'PILLOWTALK', 500), track(11, 'BeFoUr', 300), track(12, 'PILLOWTALK (Remix)', 900), track(13, 'Guest Verse', 100, other)] } },
  'album/2': { id: 2, title: 'Mind Of Mine (Deluxe)', release_date: '2016-03-25', genres: { data: [{ name: 'Pop' }] }, tracks: { data: [track(20, 'PILLOWTALK', 800), track(21, 'BLUE', 200), track(22, 'Like I Would - Radio Edit', 50)] } },
  'album/3': { id: 3, title: 'Hits', tracks: { data: [track(30, 'Should never be read', 1)] } },
  [`artist/${ARTIST}/top?limit=100`]: { data: [track(40, "I Don't Wanna Live Forever (Fifty Shades Darker)", 950), track(41, 'BLUE', 10), track(42, 'Dusk Till Dawn (Radio Edit)', 990)] },
  'album/900': { id: 900, title: 'Fifty Shades Darker', release_date: '2017-02-10', genres: { data: [{ name: 'Films/Games' }] } },
};

test('a discography keeps one original recording per song', async () => {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace('https://api.deezer.com/', '');
    asked.push(path);
    return new Response(JSON.stringify(responses[path] ?? { error: { message: `no fixture for ${path}` } }));
  }) as typeof fetch;
  try {
    const songs = await discography(ARTIST);
    const titles = songs.map((s) => s.title);
    assert.deepEqual(titles.sort(), ['BLUE', 'BeFoUr', 'Dusk Till Dawn', "I Don't Wanna Live Forever (Fifty Shades Darker)", 'Like I Would', 'PILLOWTALK'].sort());
    assert.equal(songs.find((s) => s.title === 'PILLOWTALK')!.id, '20', 'the most-played recording of a duplicate wins');
    assert.ok(!asked.includes('album/3'), 'compilations are not read');
    assert.ok(!titles.some((t) => /remix|radio edit/i.test(t)), 'remixes are dropped and edits keep their clean title');
    assert.ok(!titles.includes('Guest Verse'), "other artists' tracks on the album are left out");
    const ost = songs.find((s) => s.title.startsWith("I Don't Wanna"))!;
    assert.equal(ost.genre, 'Soundtrack');
    assert.equal(ost.year, 2017);
    assert.equal(songs.find((s) => s.title === 'BeFoUr')!.genre, 'R&B and Soul');
  } finally {
    globalThis.fetch = real;
    await sql.end();
  }
});

test('an album seeds its original songs only', async () => {
  const { albumSongs } = await import('../src/services/imports.ts');
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => new Response(JSON.stringify(responses[String(url).replace('https://api.deezer.com/', '')] ?? { error: { message: 'no fixture' } }))) as typeof fetch;
  try {
    const songs = await albumSongs('2');
    assert.deepEqual(songs.map((s) => s.title), ['PILLOWTALK', 'BLUE', 'Like I Would']);
    assert.equal(songs[0].album, 'Mind Of Mine (Deluxe)');
  } finally {
    globalThis.fetch = real;
  }
});

test('edits keep the song, other versions do not', async () => {
  const { songTitle } = await import('../src/services/imports.ts');
  assert.equal(songTitle('Dusk Till Dawn (feat. Sia) (Radio Edit)'), 'Dusk Till Dawn (feat. Sia)');
  assert.equal(songTitle('Like I Would - Radio Edit'), 'Like I Would');
  assert.equal(songTitle('PILLOWTALK (Remix)'), null);
  assert.equal(songTitle('Yellow - Live at Wembley'), null);
  assert.equal(songTitle('Alive'), 'Alive');
});

test('a video must be a karaoke take of this song by this artist', async () => {
  const { videoMatches } = await import('../src/services/imports.ts');
  assert.equal(videoMatches('ZAYN - Scripted | KARAOKE', 'The Mixed Genre', 'Scripted', 'ZAYN'), true);
  assert.equal(videoMatches('Sour Diesel - ZAYN Karaoke 【With Guide Melody】 Instrumental', 'EdKara', 'Sour Diesel', 'ZAYN'), true);
  assert.equal(videoMatches('Dusk Till Dawn Karaoke - Zayn ft. Sia', 'Sing King', 'Dusk Till Dawn (feat. Sia)', 'ZAYN'), true);
  assert.equal(videoMatches('Fatal || ZAYN || karaoke', 'TRENDINGMUSIC.KARAOKE', 'Fatal', 'ZAYN'), true, 'names artist and title');
  assert.equal(videoMatches('Fatal Karaoke | Saari Yaadein', 'Some Channel', 'Fatal', 'ZAYN'), false, 'no artist: refused');
  assert.equal(videoMatches('dRuNk Instrumental', 'ZackyV', 'dRuNk', 'ZAYN'), false, 'one-word title and no artist: refused');
  assert.equal(videoMatches('With or Without You (KARAOKE) | U2', 'Sing King', 'With Or Without You (Remastered 2007)', 'U2'), true, 'qualifiers on the catalogue title are ignored');
  assert.equal(videoMatches('San Sanana - KARAOKE - Asoka 2001', 'Sur', 'San Sanana', 'Anu Malik'), true, 'a specific title needs no artist (composer credits differ)');
  assert.equal(videoMatches('Zayn-YOU WISH YOU KNEW-KARAOKE/Instrumentals [ACAPELLA]', 'Nepop_nep', 'You Wish You Knew', 'ZAYN'), false, 'vocals-only uploads are refused');
  assert.equal(videoMatches('ZAYN - PILLOWTALK (Official Video)', 'ZAYN', 'PILLOWTALK', 'ZAYN'), false, 'not a karaoke take');
  assert.equal(videoMatches('Tum Hi Ho Karaoke | Arijit Singh', 'Sur Karaoke', 'Tum Hi Ho', 'Arijit Singh, Mithoon'), true);
});

test('language is guessed from the script', () => {
  assert.equal(guessLanguage('Tum Hi Ho'), 'en'); // romanised Hindi cannot be told apart; editable later
  assert.equal(guessLanguage('तुम ही हो'), 'hi');
  assert.equal(guessLanguage('사랑해'), 'ko');
  assert.equal(guessLanguage('さくら'), 'ja');
  assert.equal(guessLanguage('Corazón'), 'es');
});
