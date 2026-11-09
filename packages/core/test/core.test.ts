import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, parseUltrastar, lineAt, lineText, targets, shiftLyrics, timeMap, mapLyrics, addAnchor, nudgeAnchors, nudgeAt, sungEnd, wordFills, burnedLyrics, stageShowsLyrics } from '../src/lyrics.ts';
import { HOUSE_BAND, compile } from '../src/houseband.ts';
import { positionAt, play, pause, seek, clockOffset, correction, stopped } from '../src/timeline.ts';
import { addEntry, toggleVote, roundOf, moveEntry, skipThreshold, type QueueEntry } from '../src/queue.ts';
import { yin, freqToMidi, rms, PITCH_LAG } from '../src/pitch.ts';
import { scoreFull, scoreLite, pcDistance, type Frame } from '../src/scoring.ts';
import { MODES, withParts } from '../src/modes.ts';
import { romanize, needsRoman } from '../src/romanize.ts';

test('line-timed lyrics fill left to right at an estimated pace and end before a long gap', () => {
  const l = parseLrc('[00:10.00]aaaa bbbb\n[00:40.00]next', 50);
  const line = l.lines[0];
  const end = sungEnd(line, false);
  assert.ok(end > 10.5 && end < 12, `estimated ${end}`);
  assert.deepEqual(wordFills(line, 9, false), [0, 0]);
  const mid = wordFills(line, 10 + (end - 10) * 0.75, false);
  assert.ok(mid[0] === 1 && mid[1] > 0.4 && mid[1] < 0.6, `three quarters ${mid}`);
  assert.deepEqual(wordFills(line, end, false), [1, 1]);
  const short = parseLrc('[00:10.00]a very long line of lyrics here\n[00:11.00]next', 20).lines[0];
  assert.equal(sungEnd(short, false), 11, 'never past the next line');
});

test('LRC: line timing, multi-tags, offset, and no fake word timing', () => {
  const l = parseLrc('[ti:x]\n[offset:+500]\n[00:10.50][01:00.00]Hello world\n[00:12.00]Second line\n[00:14.00]', 70);
  assert.equal(l.lines.length, 3);
  assert.equal(l.lines[0].t, 10);
  assert.equal(l.lines[0].end, 11.5);
  assert.equal(l.lines[1].end, 13.5, 'a blank timed row closes the previous line');
  assert.equal(l.wordTimed, false);
  assert.equal(lineAt(l, 5), -1);
  assert.equal(lineAt(l, 12), 1);
});

test('Enhanced LRC gives word timing', () => {
  const l = parseLrc('[00:01.00]<00:01.00>Is <00:01.50>this <00:02.25>real', 4);
  assert.equal(l.wordTimed, true);
  assert.deepEqual(l.lines[0].words.map((w) => [w.text, w.t]), [['Is', 1], ['this', 1.5], ['real', 2.25]]);
  assert.equal(l.lines[0].words[2].d, 1.75);
});

test('UltraStar: beats to seconds, pitch, lines and duet parts', () => {
  const txt = '#TITLE:T\n#BPM:120\n#GAP:1000\nP1\n: 0 4 0 Hel\n: 4 4 2 lo\n- 10\n: 12 4 4 world\nP2\n* 20 8 7 yes\nE';
  const { meta, lyrics } = parseUltrastar(txt);
  assert.equal(meta.bpm, 120);
  assert.equal(lyrics.lines.length, 3);
  assert.equal(lyrics.lines[0].words[0].note, 60);
  assert.equal(lyrics.lines[0].words[1].t, 1 + 4 * (60 / 480));
  assert.equal(lyrics.lines[2].part, 2);
  assert.equal(lyrics.pitched, true);
  assert.equal(targets(lyrics, 1).length, 3);
});

test('every house band song compiles with one note per syllable', () => {
  for (const s of HOUSE_BAND) {
    const c = compile(s);
    assert.ok(c.duration > 30, s.slug);
    assert.ok(c.lyrics.lines.every((l) => l.words.length > 0 && l.end > l.t), s.slug);
    const ts = targets(c.lyrics);
    assert.ok(ts.every((t, i) => i === 0 || t.t >= ts[i - 1].t - 1e-9), `${s.slug} targets in order`);
  }
  const hb = compile(HOUSE_BAND.find((s) => s.slug === 'happy-birthday')!);
  assert.equal(lineText(hb.lyrics.lines[0]), 'Happy birthday to you');
  const sk = compile(HOUSE_BAND.find((s) => s.slug === 'sakura-sakura')!);
  assert.equal(lineText(sk.lyrics.lines[0]), 'さくら さくら');
  assert.equal(sk.lyrics.lines[0].words[0].roman, 'sa-');
});

test('timeline: play, pause, seek and clock offset', () => {
  let tl = play(stopped(), 1000);
  assert.equal(positionAt(tl, 3500), 2.5);
  tl = pause(tl, 3500);
  assert.equal(positionAt(tl, 99999), 2.5);
  tl = play(seek(tl, 4000, 30), 4000, 1500);
  assert.equal(positionAt(tl, 5500), 30, 'lead-in holds position until anchor');
  const { offset } = clockOffset([{ sent: 0, server: 600, received: 400 }, { sent: 1000, server: 1550, received: 1100 }]);
  assert.equal(offset, 500, 'shortest round trip wins');
  assert.equal(correction(1).seek, true);
  assert.equal(correction(0.01).rate, 1);
  assert.ok(correction(0.1).rate < 1, 'ahead of the timeline slows down');
  // A phone playing along with the stage: seek past 150 ms, nudge the speed below it, leave tiny drift alone.
  assert.deepEqual(correction(0.2, 0.15), { seek: true, rate: 1 });
  assert.deepEqual(correction(-0.2, 0.15), { seek: true, rate: 1 });
  assert.ok(correction(-0.1, 0.15).rate > 1 && !correction(-0.1, 0.15).seek, 'behind speeds up');
  assert.deepEqual(correction(0.02, 0.15), { seek: false, rate: 1 });
  assert.equal(correction(0.2).seek, false, 'the stage keeps its looser default');
});

test('queue: one per person per round, votes stay within a round, caps hold', () => {
  const q: QueueEntry[] = [];
  const e = (id: string, by: string): QueueEntry => ({ id, songKey: id, addedBy: by, singers: [by], mode: 'solo', votes: [], at: 0 });
  const rules = { maxPerPerson: 3 };
  for (const id of ['a1', 'a2', 'a3']) assert.equal(addEntry(q, e(id, 'ann'), rules).ok, true);
  assert.equal(addEntry(q, e('a4', 'ann'), rules).ok, false, 'cap');
  addEntry(q, e('b1', 'bob'), rules);
  addEntry(q, e('c1', 'cat'), rules);
  assert.deepEqual(q.map((x) => x.id), ['a1', 'b1', 'c1', 'a2', 'a3']);
  assert.equal(roundOf(q, 3), 1);
  toggleVote(q, 'c1', 'ann');
  toggleVote(q, 'c1', 'bob');
  assert.deepEqual(q.map((x) => x.id), ['c1', 'a1', 'b1', 'a2', 'a3'], 'votes lift within round 0 only');
  assert.equal(addEntry(q, e('c1', 'dan'), rules).ok, false, 'duplicate song');
  moveEntry(q, 'a3', 0);
  assert.equal(q[0].id, 'a3');
  assert.equal(skipThreshold(3, 0.6), 2);
  assert.equal(skipThreshold(10, 0.6), 6);
  assert.equal(skipThreshold(1, 0.6), 1, 'a lone listener can still skip');
  assert.equal(skipThreshold(2, 0.3), 2);
});

test('YIN finds a sung A4', () => {
  const sr = 44100, buf = new Float32Array(2048);
  for (let i = 0; i < buf.length; i++) buf[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / sr) + 0.2 * Math.sin((2 * Math.PI * 880 * i) / sr);
  const p = yin(buf, sr);
  assert.ok(p && Math.abs(freqToMidi(p.freq) - 69) < 0.1);
});

test('scoring is fair: octave and latency do not cost points, silence does', () => {
  const song = compile(HOUSE_BAND.find((s) => s.slug === 'twinkle-twinkle')!);
  const ts = targets(song.lyrics);
  const sing = (shift: number, octave: number, jitter = 0): Frame[] => {
    const f: Frame[] = [];
    for (const n of ts) for (let t = n.t; t < n.t + n.d; t += 0.05) f.push([t + shift, n.note + octave + (Math.sin(t * 13) * jitter)]);
    return f;
  };
  const perfect = scoreFull(sing(0, 0), ts);
  assert.ok(perfect.total >= 95, `perfect ${perfect.total}`);
  assert.ok(scoreFull(sing(0, -12), ts).total >= 95, 'an octave down is on pitch');
  const late = scoreFull(sing(0.25, 0), ts);
  assert.ok(late.total >= 93 && late.offsetMs === -250 || late.total >= 93, `latency absorbed ${late.total} ${late.offsetMs}`);
  const flat = scoreFull(sing(0, -2), ts);
  assert.ok(flat.pitch! < 20, 'two semitones off is wrong');
  const silent = scoreFull([], ts);
  assert.equal(silent.total, 0);
  assert.equal(pcDistance(60, 72), 0);
  const lite = scoreLite(sing(0, 0), song.lyrics.lines);
  assert.equal(lite.kind, 'lite');
  assert.equal(lite.pitch, null, 'lite scoring never claims pitch accuracy');
  assert.ok(lite.total > 80, `lite ${lite.total}`);
});

test('calibration: a fake mic that answers N ms late is measured within 20 ms', () => {
  // A fake microphone: the song's melody as a sine wave, sung N ms behind the targets. It goes through
  // what a phone's Mic does: a 2048-sample window read 25 times a second, YIN, frames stamped PITCH_LAG of a window back.
  const sr = 48000, win = 2048;
  const ts = targets(compile(HOUSE_BAND.find((s) => s.slug === 'twinkle-twinkle')!).lyrics).filter((n) => n.t < 24);
  const end = ts.at(-1)!.t + ts.at(-1)!.d + 1;
  const measure = (lateMs: number) => {
    const pcm = new Float32Array(Math.ceil((end + 0.5) * sr));
    for (const n of ts) {
      const hz = 440 * 2 ** ((n.note - 69) / 12), a = Math.round((n.t + lateMs / 1000) * sr), b = Math.round((n.t + n.d + lateMs / 1000) * sr);
      for (let i = Math.max(0, a); i < b; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * hz * (i - a)) / sr) * Math.min(1, (i - a) / 480, (b - i) / 480);
    }
    const frames: Frame[] = [];
    for (let at = win / sr + 0.013; at < end; at += 0.04) {
      const buf = pcm.subarray(Math.round(at * sr) - win, Math.round(at * sr));
      const p = rms(buf) < 0.006 ? null : yin(buf, sr);
      frames.push([at - (win * PITCH_LAG) / sr, p && p.clarity > 0.82 ? freqToMidi(p.freq) : null]);
    }
    return scoreFull(frames, ts).offsetMs;
  };
  const got = [-125, -60, 0, 25, 75, 120, 175, 260, 330].map((n) => [n, measure(n)]);
  for (const [n, m] of got) assert.ok(Math.abs(m - n) <= 20, `late ${n} ms measured as ${m} ms: ${JSON.stringify(got)}`);
});

test('modes: duets split by verse, keep marked parts, battles pick the higher score', () => {
  const song = compile(HOUSE_BAND[1]);
  const d = withParts(song.lyrics);
  assert.ok(d.lines.some((l) => l.part === 1) && d.lines.some((l) => l.part === 2), 'both singers get lines');
  assert.equal(d.lines.at(-1)!.part, 0);
  // Unmarked: four lines a verse, a long pause hands over early, the last line is together.
  const lrc = parseLrc('[00:00]a\n[00:02]b\n[00:04]c\n[00:06]d\n[00:08]e\n[00:10]f\n[00:20]g\n[00:22]h\n[00:24]end', 30);
  assert.deepEqual(withParts(lrc).lines.map((l) => l.part), [1, 1, 1, 1, 2, 2, 1, 1, 0]);
  assert.deepEqual(withParts(parseLrc('[00:00]a\n[00:02]b\n[00:04]c', 6)).lines.map((l) => l.part), [1, 2, 0], 'too short to hand over by verse');
  // UltraStar duet: P1 listed before P2, P3 and a line under both singers are sung together.
  const us = parseUltrastar('#BPM:120\nP1\n: 0 4 0 one\n- 8\n: 40 4 0 both\nP2\n: 20 4 2 two\n- 30\n: 40 4 0 both\nP3\n: 60 4 0 all\nE');
  const dp = withParts(us.lyrics);
  assert.deepEqual(dp.lines.map((l) => [lineText(l), l.part]), [['one', 1], ['two', 2], ['both', 0], ['all', 0]]);
  assert.deepEqual(targets(dp, 2).map((t) => t.note), [62, 60, 60], 'singer 2 is scored on their line and the shared ones');
  const r = MODES.battle.resolve([{ pid: 'a', name: 'Ann', total: 71 }, { pid: 'b', name: 'Bob', total: 80 }]);
  assert.deepEqual(r.winners, ['b']);
  assert.equal(shiftLyrics(song.lyrics, 1).lines[0].t, song.lyrics.lines[0].t + 1);
});

test('videos with their own lyrics get no stage overlay', () => {
  const yt = (videoTitle: string, label: 'karaoke' | 'instrumental' | 'original', channel = 'Some Channel') => ({ kind: 'youtube' as const, videoId: 'x', videoTitle, channel, label });
  assert.equal(burnedLyrics(yt('Song (Karaoke Version)', 'karaoke')), true);
  assert.equal(burnedLyrics(yt('Song - Instrumental with Lyrics', 'instrumental')), true);
  assert.equal(burnedLyrics(yt('Song (Official Lyric Video)', 'original')), true);
  assert.equal(burnedLyrics(yt('Song (Instrumental)', 'instrumental', 'Sing King Karaoke')), true, 'a karaoke channel');
  assert.equal(burnedLyrics(yt('Song (Instrumental)', 'instrumental')), false);
  assert.equal(burnedLyrics(yt('Song Karaoke (No Lyrics)', 'karaoke')), false, 'says it has none');
  assert.equal(burnedLyrics({ kind: 'house', slug: 'x' }), false);
  const song = (src: Parameters<typeof burnedLyrics>[0]) => ({ sources: src ? [src] : [], hasBurnedLyrics: burnedLyrics(src) });
  assert.equal(stageShowsLyrics(song(yt('Song (Karaoke Version)', 'karaoke')), true), false, 'burned in: no overlay even with the setting on');
  assert.equal(stageShowsLyrics(song(yt('Song (Instrumental)', 'instrumental')), true), true);
  assert.equal(stageShowsLyrics(song(yt('Song (Instrumental)', 'instrumental')), false), false, 'the host turned it off');
  assert.equal(stageShowsLyrics(song({ kind: 'house', slug: 'x' }), false), true, 'audio always shows lyrics');
});

test('romanisation reads the way lyric sheets are written', () => {
  assert.equal(romanize('तुम ही हो'), 'tum hi ho');
  assert.equal(romanize('दिलवाले दुल्हनिया ले जाएंगे'), 'dilvaale dulhaniya le jaaenge');
  assert.equal(romanize('कल हो ना हो'), 'kal ho na ho');
  assert.equal(romanize('ਸਤ ਸ੍ਰੀ ਅਕਾਲ'), 'sat sri akaal');
  assert.equal(romanize('사랑해요'), 'saranghaeyo');
  assert.equal(romanize('ありがとう カラオケ'), 'arigatou karaoke');
  assert.equal(romanize('がっこう'), 'gakkou');
  assert.equal(romanize('வணக்கம்'), 'vanakkam');
  assert.equal(romanize('Already Latin'), 'Already Latin');
  assert.equal(needsRoman('Tum hi ho'), false);
  assert.equal(romanize('君の名は'), '君no名ha', 'kanji pass through, kana around them still romanise');
});

test('sync points: one is an offset, two stretch, bad taps cannot tangle the map', () => {
  assert.equal(timeMap([])(10), 10);
  assert.equal(timeMap([[60, 24]])(100), 64, 'a single point is a plain offset (a shorter intro)');
  const f = timeMap([[60, 24], [160, 134]]);
  assert.equal(f(110), 79, 'between points the lyrics stretch to fit the edit');
  assert.equal(f(200), 174, 'after the last point it runs at normal speed from there');
  assert.equal(f(30), -6, 'before the first point too');
  let a = addAnchor([], 60, 24);
  a = addAnchor(a, 160, 134);
  a = addAnchor(a, 161, 140);
  assert.deepEqual(a, [[60, 24], [161, 140]], 'a tap near an existing point replaces it');
  a = addAnchor(a, 100, 150);
  assert.deepEqual(a, [[60, 24], [100, 150]], 'a point that would run time backwards drops the conflicting one');
  assert.deepEqual(nudgeAnchors([[60, 24]], -0.25), [[60, 23.75]]);
  assert.deepEqual(nudgeAnchors([], 1), [[0, 1]]);
  const local = nudgeAt([[60, 24], [160, 134]], 110, 0.5);
  assert.deepEqual(local, [[60, 24], [110, 79.5], [160, 134]], 'a nudge at one line adds a point there');
  assert.equal(timeMap(local)(60), 24, 'and leaves the other sections where they were');
  assert.deepEqual(nudgeAt([], 30, -0.25), [[30, 29.75]]);
  const l = parseLrc('[01:00.00]First\n[02:40.00]Second\n[03:00.00]', 200);
  const m = mapLyrics(l, [[60, 24], [160, 134]]);
  assert.equal(m.lines[0].t, 24);
  assert.equal(m.lines[1].t, 134);
  assert.equal(m.lines[0].end, 134);
});
