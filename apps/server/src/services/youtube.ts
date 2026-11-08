// Karaoke videos. Only a video id ever comes from the client; every URL fetched here is built from
// fixed YouTube hosts, so there is no client-controlled fetch target (OWASP A10).
import { env } from '../env.ts';
import type { Source } from '../../../../packages/core/src/protocol.ts';

type Yt = Extract<Source, { kind: 'youtube' }>;
const ID = /^[A-Za-z0-9_-]{11}$/;

/** Pulls an 11-character video id out of anything a person might paste. */
export function videoIdFrom(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1, 12);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)?.[1] ?? null;
  return id && ID.test(id) ? id : null;
}

/** What a video says it is, from its title. "original" means vocals are in it, and the UI says so. */
export function labelFor(title: string): Yt['label'] {
  const t = title.toLowerCase();
  if (/karaoke|sing ?along|singalong/.test(t)) return 'karaoke';
  if (/instrumental|backing track|minus ?one|no vocals/.test(t)) return 'instrumental';
  return 'original';
}

/** Confirms a video exists and may be embedded (oEmbed answers 401 when embedding is off). */
export async function verifyVideo(id: string): Promise<Yt | null> {
  if (!ID.test(id)) return null;
  const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const o = (await r.json()) as { title?: string; author_name?: string };
  if (!o.title) return null;
  return { kind: 'youtube', videoId: id, videoTitle: o.title.slice(0, 200), channel: (o.author_name ?? 'YouTube').slice(0, 100), label: labelFor(o.title) };
}

export const searchAvailable = () => !!env.YOUTUBE_API_KEY;

/** Karaoke video search through the YouTube Data API (100 quota units a call; results are cached by the caller). */
export async function searchKaraoke(title: string, artist: string): Promise<Yt[]> {
  if (!env.YOUTUBE_API_KEY) return [];
  const q = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '6', q: `${title} ${artist} karaoke`, key: env.YOUTUBE_API_KEY });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string } }[] };
  return (j.items ?? []).map((i) => ({ kind: 'youtube' as const, videoId: i.id.videoId, videoTitle: i.snippet.title, channel: i.snippet.channelTitle, label: labelFor(i.snippet.title) }));
}
