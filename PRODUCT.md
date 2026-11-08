# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Chorus app shape (user's choice): npm workspace with `apps/web` (Vite + React SPA) and `apps/server` (Express + TypeScript), Postgres, session cookies backed by a database table, CSRF double-submit, Zod-validated routes. Real-time rooms over Socket.IO with a server-authoritative playback timeline. Deploys like the other FRC projects (Docker image, Jinx).

## Users

Primary: a group of friends in a living room. One screen (TV, projector or laptop) is the stage; everyone else joins on their phone by scanning a QR code, queues songs, votes, and uses the phone as a remote and as the scoring microphone. Secondary: a solo singer at home chasing a personal best, and a host running an organised event (venue night, office party) who may never sing.

## Product Purpose

Croon turns any gathering into a karaoke night with real, full-length songs, accurately timed lyrics, a fair queue, and optional scoring and party modes. Success: a group plays song after song without anyone fiddling with the laptop, every phone stays in sync with the stage, and people come back to beat their scores.

## Positioning

A karaoke lounge in a browser that is honest about its audio. It never pretends a commercial recording is an instrumental: every track says what it is (house band arrangement, karaoke video from a named channel, or the user's own file). Its built-in house band plays public-domain songs from note data, so those songs get exact word timing and true pitch scoring that a video-only karaoke site cannot offer.

## Operating Context

- The stage screen is watched from a sofa, several metres away, in a dim room. Phones are held in one hand, often while singing.
- Rooms are private, joined by a four-letter code, invitation link or QR code. Guests should not need an account to join; accounts add history, favourites, playlists and leaderboards.
- Audio plays on the device that owns the speakers (normally the stage). Phones never stream audio to each other; everyone follows a shared timeline from the server.
- Microphones are phone or laptop microphones in a noisy room with the backing track audible. Scoring must be calibrated, optional, and labelled as an estimate.

## Capabilities and Constraints

- Audio sources, all full-length:
  - House band: public-domain songs synthesised in the browser from note data (melody, harmony, rhythm), with syllable timing and pitch targets.
  - YouTube karaoke videos through the official IFrame player. Each video is labelled with its channel and whether it is a karaoke, instrumental or original video. Search needs a `YOUTUBE_API_KEY`; without one, links can be pasted and are checked through YouTube oEmbed.
  - The user's own audio files, played locally, with LRC or UltraStar lyrics loaded alongside or fetched from LRCLIB.
- Catalogue metadata (title, artist, album, year, genre, language, duration, artwork, difficulty) is reused from the Chorus song bank (`FRC/Chorus/data/song-bank/songs.json`, 3,950 songs across Bollywood, Punjabi, K-pop, J-pop, Latin, rock, hip-hop and more). A catalogue song is only playable once it has a verified audio source; otherwise it says so.
- Synced lyrics from LRCLIB (keyless, line-level, occasionally word-level). Fetched on demand, cached, never redistributed in bulk.
- No commercial audio is downloaded, stored, stripped of vocals or proxied.
- Microphone audio is analysed on the device and never uploaded or stored; only score summaries leave the device.
- Password recovery uses a one-time recovery code shown at signup (Noggin pattern), because there is no SMTP.

## Brand Commitments

- Name: Croon.
- Dark-only interface, by the user's instruction.
- FRC writing rules apply: no em dashes in copy, emoji sparingly.

## Evidence on Hand

- Chorus song bank metadata and artwork URLs (Deezer CDN).
- No testimonials, user counts, partners or licensing deals exist. Do not invent any.

## Product Principles

1. The song is the show: playback and lyric timing come before every visual.
2. Say what the audio is. Never fake an instrumental, a source, or a score.
3. The stage screen is for the room, the phone is for the person.
4. Nobody waits on a form: guests join a room in two taps.
5. Fair fun over hard competition: scoring is optional, calibrated, and never rewards equipment.

## Accessibility & Inclusion

Lyrics must stay legible at distance and on small phones (adjustable size and position). Respect `prefers-reduced-motion`; motion never obscures lyrics. Scripts include Devanagari, Gurmukhi, Hangul, Kana and Latin, so typography needs real coverage for them.
