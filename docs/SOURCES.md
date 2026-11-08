# Audio and lyrics sources

Research behind the audio and lyrics choices, as of November 2026. Ordinary commercial recordings
cannot legally be downloaded, stripped of vocals, or restreamed by a karaoke site, so Croon only
plays sources that come with their own permission to play.

## What Croon uses

| Source | What it gives | Terms that shape the product | Cost |
| --- | --- | --- | --- |
| **House band** (`packages/core/src/houseband.ts`) | Full-length backing tracks for public-domain songs, synthesised in the browser from written-out melody and chords | The songs and words are public domain; the arrangements are Croon's own. Each song page states why it is free to use. | Free |
| **YouTube IFrame Player API** | Full karaoke and instrumental videos uploaded by karaoke channels | YouTube API Services Terms: use the official player, never draw anything over it, keep it visible while it plays. Croon embeds from `youtube-nocookie.com` and puts lyrics beside or below the video. | Free |
| **YouTube Data API v3** (optional, `YOUTUBE_API_KEY`) | Search for a song's karaoke video from its page | Default quota 10,000 units a day; `search.list` costs 100 units, so about 100 searches a day. Results are cached in memory per song. | Free within quota |
| **YouTube oEmbed** | Confirms a pasted video exists and allows embedding (it answers 401 when the owner disabled embedding) | No key. Only a validated 11-character video id comes from the client. | Free |
| **The user's own files** | Any audio the user has the right to play, plus LRC or UltraStar lyrics | In solo mode the file never leaves the device. In a room it is held in that room's memory for the night so the stage can play it, then deleted. | Free |
| **LRCLIB** (`lrclib.net`) | Community-made synced lyrics (LRC, mostly line-timed, a few word-timed) | Keyless and free, asks for an identifying User-Agent. LRCLIB does not license the lyrics themselves: Croon fetches on demand, caches per song, and never exports them in bulk. A commercial launch should move to a licensed lyrics provider (below). | Free |
| **Deezer API** (imports) | Search and full discographies: titles, albums, years, genres, artwork, durations | Public and keyless, about 50 requests per 5 seconds. Used for metadata only; no audio. Imported songs are stored in `extra_songs`. | Free |
| **Chorus song bank** (`data/catalog.json`) | Metadata for 3,950 songs: title, artist, album, year, genre, language, artwork, duration, difficulty | Metadata and artwork URLs from Deezer's public API, gathered by the Chorus project. No audio is used from Deezer. | Free |

The catalogue is honest about gaps: a song with no attached karaoke video is shown greyed out as
"Needs a karaoke track" and cannot be played. Croon never plays an original recording and calls
it an instrumental; a video whose title does not say karaoke or instrumental is labelled
"Original recording (vocals included)".

Auto-find never re-searches a song that already has a video, stores every find, and pauses when YouTube reports the daily quota is spent, so a large import finishes over several days instead of failing. Without a key, the song page offers a "Search on YouTube" link and a paste box.

The karaoke videos attached at launch came from a one-off manual search pass over the most
popular songs in each scene. Each was checked through oEmbed for existence and embeddability.
Videos can disappear or have embedding turned off later; the player then says so instead of
failing silently.

## Evaluated and not used

| Provider | What it offers | Why not now |
| --- | --- | --- |
| Musixmatch API | Licensed lyrics; synced and word-level ("richsync") on paid plans | The free tier does not include synced lyrics; synced access is a commercial agreement with pricing on request. The right upgrade from LRCLIB for a commercial launch. |
| LyricFind | Licensed lyrics, including synced, for businesses | Business licensing only, no self-serve tier. |
| KaraFun, Singa, Stingray Karaoke | Licensed karaoke backing-track catalogues | Business licensing for venues and platforms; none offers a public developer API. The way to get licensed karaoke versions of commercial songs at scale. |
| Spotify Web API / Web Playback SDK | Metadata; playback of the original recording for Premium users | No instrumental or karaoke streams, and the developer terms restrict building other experiences on top of the stream. |
| Apple MusicKit JS | Full-length playback for Apple Music subscribers | Original recordings only; Apple's vocal reduction ("Apple Music Sing") is not exposed to developers. |
| Deezer API | Metadata and 30-second previews | Previews are the original recording and only 30 seconds. Used for metadata only. |
| UltraStar community song files | Notes and lyrics for many commercial songs | Rights status of the transcriptions is unclear and there is no audio. Croon reads the format when a user brings their own file. |
| Musopen, IMSLP, Mutopia, Wikimedia Commons, Internet Archive | Public-domain scores and some recordings | Useful for growing the house band. Recording rights vary by country and performance, so each would need checking one by one. The house band synthesises from the score instead. |

## Scoring data

Full pitch scoring needs the melody as notes. That exists for house band songs and for UltraStar
files a user brings. Songs with only line-timed lyrics get "lite" scoring (timing, steadiness,
completion), and every surface that shows a lite score says pitch was not judged.
