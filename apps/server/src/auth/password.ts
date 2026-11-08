// Passwords and recovery codes. scrypt from node's own crypto (no native build in an alpine image),
// tuned to roughly 100ms a hash. Recovery codes substitute for a password, so they are hashed like one.
// Pattern from Noggin/server/auth.js; policy from Chorus/apps/server/src/utils/passwordPolicy.ts.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const P = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, P.keylen, { N: P.N, r: P.r, p: P.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${P.N}$${P.r}$${P.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  try {
    const expected = Buffer.from(key, 'base64');
    const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** A hash that never matches, so unknown usernames cost the same time as wrong passwords. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

// No I, O, 0 or 1: the code gets written on paper and read back.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode(): string {
  return [...randomBytes(20)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
export const tidyRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop', 'qwerty123', 'iloveyou', 'admin123', 'letmein1', 'welcome1', 'abc12345', 'football', 'sunshine', 'princess', 'karaoke1', 'karaoke123', 'croon123', 'singing1']);

/** Every reason a password is too guessable (all at once, so the form is not a guessing game). */
export function passwordProblems(password: string, username = ''): string[] {
  const out: string[] = [];
  const lower = password.toLowerCase();
  if (password.length < 8) out.push('Use at least 8 characters');
  if (password.length > 128) out.push('Keep it under 128 characters');
  if (password !== password.trim()) out.push('Remove the space at the start or end');
  if (COMMON.has(lower) || lower.includes('croon')) out.push('That one is too easy to guess');
  if (/^(.)\1+$/.test(password)) out.push('Use more than one repeated character');
  let up = true, down = true;
  for (let i = 1; i < lower.length; i++) {
    const d = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  if (lower.length >= 4 && (up || down)) out.push('Avoid a straight run like 12345678');
  const u = username.toLowerCase();
  if (u.length >= 3 && lower.includes(u)) out.push('Do not build it out of your username');
  return out;
}
