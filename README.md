# Croon

![Node](https://img.shields.io/badge/node-24%2B-1c1716) ![React](https://img.shields.io/badge/react-19-1c1716) ![Socket.IO](https://img.shields.io/badge/socket.io-4-1c1716) ![Postgres](https://img.shields.io/badge/postgres-17-1c1716)

A karaoke lounge in the browser. Put a room on the TV, everyone joins from their phone, and the queue rotates so everybody sings.

- **Full songs, honestly labelled.** A house band plays public-domain songs live in the browser, karaoke channels' videos play through YouTube's own player, and you can bring your own file. Nothing pretends an original recording is an instrumental.
- **Lyrics timed to the word** where the data allows (house band, UltraStar, enhanced LRC), line by line where it does not, in five display styles.
- **One clock for the room.** The server owns the playback timeline; every phone and the stage follow it, so late joiners and sleepy phones land on the right line.
- **Fair scoring.** Pitch and timing from the phone's microphone, scored on the server, octave-agnostic and corrected for device delay. Audio never leaves the phone.
- **Party modes:** duet, battle, group, random challenge, blind karaoke, party roulette, team battle.
- **Host mode** for organised nights, with a projector stage screen and a leaderboard that outlives the night.

How it works: [HOW-IT-WORKS.md](HOW-IT-WORKS.md). Where the audio and lyrics come from: [docs/SOURCES.md](docs/SOURCES.md).

## Run it

```bash
docker compose up -d db
cp .env.example .env   # then set CSRF_SECRET to the output of: openssl rand -hex 32
npm install
npm run migrate -w apps/server
npm run dev            # web on :5198, server on :4398
```

`npm test` runs the core and end-to-end tests (needs the database), `npm run lint` and `npm run typecheck` check the rest. `npm run build` builds the web app; the server serves it from `apps/web/dist` in production.
