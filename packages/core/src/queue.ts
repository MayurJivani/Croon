// The singing queue, run like a lounge: one song per person per round, so whoever queues ten songs
// first still waits their turn behind everyone who queued one. Votes reorder only within a round.
// Pure functions over a plain array so the rules are testable without a room.

export type QueueEntry = {
  id: string;
  songKey: string;
  addedBy: string;
  singers: string[];
  mode: string;
  votes: string[];
  at: number;
};

export type QueueRules = { maxPerPerson: number };

/** Which round an entry belongs to: how many of its owner's entries sit ahead of it. */
export function roundOf(q: QueueEntry[], i: number): number {
  let n = 0;
  for (let k = 0; k < i; k++) if (q[k].addedBy === q[i].addedBy) n++;
  return n;
}

export type AddResult = { ok: true; index: number } | { ok: false; error: string };

export function addEntry(q: QueueEntry[], e: QueueEntry, rules: QueueRules): AddResult {
  const mine = q.filter((x) => x.addedBy === e.addedBy).length;
  if (mine >= rules.maxPerPerson) return { ok: false, error: `You can hold ${rules.maxPerPerson} songs in the queue at once.` };
  if (q.some((x) => x.songKey === e.songKey)) return { ok: false, error: 'That song is already in the queue.' };
  // Insert after the last entry whose round is at most this one's round.
  let at = 0;
  for (let i = 0; i < q.length; i++) if (roundOf(q, i) <= mine) at = i + 1;
  q.splice(at, 0, e);
  return { ok: true, index: at };
}

/** Toggles a vote, then lets the entry climb past same-round entries with fewer votes. */
export function toggleVote(q: QueueEntry[], id: string, voter: string): boolean {
  let i = q.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const e = q[i];
  e.votes = e.votes.includes(voter) ? e.votes.filter((v) => v !== voter) : [...e.votes, voter];
  while (i > 0 && roundOf(q, i - 1) === roundOf(q, i) && q[i - 1].votes.length < e.votes.length && q[i - 1].addedBy !== e.addedBy) {
    [q[i - 1], q[i]] = [q[i], q[i - 1]];
    i--;
  }
  while (i < q.length - 1 && roundOf(q, i + 1) === roundOf(q, i) && q[i + 1].votes.length > e.votes.length && q[i + 1].addedBy !== e.addedBy) {
    [q[i + 1], q[i]] = [q[i], q[i + 1]];
    i++;
  }
  return true;
}

/** Host-only manual reorder. */
export function moveEntry(q: QueueEntry[], id: string, to: number): boolean {
  const i = q.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const [e] = q.splice(i, 1);
  q.splice(Math.max(0, Math.min(q.length, to)), 0, e);
  return true;
}

export function removeEntry(q: QueueEntry[], id: string): QueueEntry | null {
  const i = q.findIndex((x) => x.id === id);
  return i < 0 ? null : q.splice(i, 1)[0];
}

/** Votes needed to skip: a clear majority of the people who could vote, at least two when two can vote. */
export const skipThreshold = (voters: number, ratio: number) => Math.min(Math.max(1, voters), Math.max(2, Math.ceil(voters * ratio)));
