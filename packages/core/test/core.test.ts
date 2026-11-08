import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, parseUltrastar, lineAt, lineText, targets, shiftLyrics, timeMap, mapLyrics, addAnchor, nudgeAnchors } from '../src/lyrics.ts';
import { HOUSE_BAND, compile } from '../src/houseband.ts';
import { positionAt, play, pause, seek, clockOffset, correction, stopped } from '../src/timeline.ts';
import { addEntry, toggleVote, roundOf, moveEntry, skipThreshold, type QueueEntry } from '../src/queue.ts';
import { yin, freqToMidi } from '../src/pitch.ts';
import { scoreFull, scoreLite, pcDistance, type Frame } from '../src/scoring.ts';
import { MODES, withParts } from '../src/modes.ts';
import { romanize, needsRoman } from '../src/romanize.ts';

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

test('modes: duets split lines, battles pick the higher score', () => {
  const song = compile(HOUSE_BAND[1]);
  const d = withParts(song.lyrics);
  assert.deepEqual(d.lines.slice(0, 3).map((l) => l.part), [1, 2, 1]);
  assert.equal(d.lines.at(-1)!.part, 0);
  const r = MODES.battle.resolve([{ pid: 'a', name: 'Ann', total: 71 }, { pid: 'b', name: 'Bob', total: 80 }]);
  assert.deepEqual(r.winners, ['b']);
  assert.equal(shiftLyrics(song.lyrics, 1).lines[0].t, song.lyrics.lines[0].t + 1);
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
  const l = parseLrc('[01:00.00]First\n[02:40.00]Second\n[03:00.00]', 200);
  const m = mapLyrics(l, [[60, 24], [160, 134]]);
  assert.equal(m.lines[0].t, 24);
  assert.equal(m.lines[1].t, 134);
  assert.equal(m.lines[0].end, 134);
});
