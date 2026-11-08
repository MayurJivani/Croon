# How Croon works

## Shape

An npm workspace in the Chorus app shape:

- `packages/core` holds everything both sides need and nothing that touches a network: the lyric
  model and parsers (LRC, enhanced LRC, UltraStar), the house band songs and their compiler, the
  shared playback timeline, the queue rules, YIN pitch detection, scoring, game modes and the
  realtime protocol schemas. The server imports it by relative path (Node runs the TypeScript
  directly with type stripping); the web app imports it through Vite.
- `apps/server`: Express 5, Socket.IO, Postgres through the `postgres` tagged-template client
  with plain SQL migrations (Pressure's migrator). Drizzle was left out: the schema is small and
  the tagged client already makes every query parameterised.
- `apps/web`: Vite and React, Motion for animation, plain CSS with tokens.

## One clock for the whole room

Nobody streams audio to anybody. The server keeps a timeline per room:
`{ playing, anchorAt (server ms), anchorPos (song seconds) }`. The song position at any moment is
`anchorPos + (serverNow - anchorAt) / 1000`.

- Every client measures its offset from the server clock with six round trips, keeping the one
  with the shortest round trip (Cristian's method), and re-measures every 30 seconds.
- Play is scheduled 1.2 seconds ahead (`anchorAt` in the future) so every device starts on the
  same beat instead of whenever the message arrives.
- Only one device plays audio: the stage screen, or the host's device when no stage is connected.
  It checks its drift four times a second. Under 40 ms it does nothing; up to 350 ms it nudges
  playback rate (files) or re-schedules (house band); past that it seeks.
- Phones render lyrics from the timeline, so a phone that joins late or wakes from sleep is
  immediately at the right line. A reconnect rejoins with a seat token kept in localStorage and
  gets the same identity, queue entries and scores.

## The house band

Each public-domain song is written as melody tokens (`G4:.75 G4:.25 | A4:1 …`), one syllable
string per verse, and one chord per bar. `compile()` turns that into word-timed lyrics with a pitch
target per syllable (melismas become several targets on one word) and a list of band events in the
song's style (waltz, pop, swing, ballad, sparse). The browser schedules those events on the Web
Audio clock with a 200 ms lookahead. A test checks that every verse has exactly one note per
syllable, which is what keeps the timing exact.

## Lyrics

The display re-renders React only when the current line changes. The wipe itself is written to a
CSS variable on each word every animation frame, read from the audio clock, and drawn with a
`clip-path` over a second copy of the word. Line-timed lyrics never fake a word wipe: the classic
and word-by-word styles fall back to whole-line highlighting, and the player says why.

## Scoring, and why it is fair

The singer's own device turns microphone audio into pitch frames (YIN, 25 a second) after a noise
gate set by a two-second calibration. Audio never leaves the device. Frames go to the server, which
does the scoring, so a saved score is computed, never claimed.

- Pitch is compared octave-agnostically, so a low voice singing a high line is on pitch.
- Before scoring, the scorer tries constant offsets from -400 to +400 ms and keeps the best, so a
  Bluetooth speaker or a slow phone microphone costs nothing. The correction is shown to the singer.
- No voice counts as a missed note, never as a wrong one.
- Repeated pitches carry no onset information in legato singing, so they are left out of timing.
- Leaderboards rank the average of each singer's best per song over at least three songs, so
  singing well beats singing a lot.

Songs without melody data get lite scoring (timing, steadiness, completion) and every reveal says
pitch was not judged.

## The queue

One song per person per round: a new entry slots in after the last entry of its round, so somebody
queueing ten songs still waits behind everyone who queued one. Votes lift an entry only within its
round. Guests hold up to N songs (host setting); duplicates are refused; vote-skip needs a share
of the listeners (singers cannot vote on their own song); the host can reorder, remove, kick and
promote. Kicked seats are banned by token digest.

## Game modes

A mode is one entry in `packages/core/src/modes.ts`: how many singers, whether lines are split
into parts, whether the song is hidden, who picks the song, whether scores feed team totals, and
how scores resolve into a headline and winners. Rooms, queue and stage only read that shape, so a
new mode is one object.

## Security

Session cookies backed by a table of SHA-256 token digests, rotated on sign-in; CSRF double-submit
on every write; Zod on every route and every socket event; scrypt (~100 ms) for passwords and the
recovery code that replaces email reset (Noggin's design); rate limits on auth, search, writes and
room creation, plus a token bucket per socket; same-site origin check on sockets; Helmet CSP with
each loosened directive commented (YouTube player, Deezer artwork); `Permissions-Policy` allows the
microphone on this origin only. Only a validated video id ever reaches an outbound URL.

## Testing

- `packages/core/test/core.test.ts`: parsers, house band compilation, timeline and clock offset,
  queue fairness, YIN, scoring fairness (octave, latency, silence, lite never claiming pitch), modes.
- `apps/server/test/rooms.test.ts`: the real app on a random port against Postgres. Accounts and
  recovery, CSRF refusal, library search including lyrics, and a room driven by four Socket.IO
  clients: fair queue order, host-only controls, one shared timeline, a late joiner, reconnect
  keeping the seat, server-side scoring saved to the database, vote-skip and kick. Events too.
