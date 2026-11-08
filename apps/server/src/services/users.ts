// Accounts. Usernames are public handles; there is no email, so the way back into an account is
// the recovery code shown once at sign-up (Noggin's design: no SMTP to run for a party app).
import { z } from 'zod';
import { sql } from '../db/client.ts';
import { hashPassword, verifyPassword, newRecoveryCode, tidyRecoveryCode, passwordProblems, DUMMY_HASH } from '../auth/password.ts';
import { HttpError } from '../middleware/http.ts';
import { AVATAR_GLYPHS, AVATAR_COLORS } from '../../../../packages/core/src/protocol.ts';

export const usernameSchema = z.string().trim().min(3, 'Usernames are 3 to 20 characters').max(20, 'Usernames are 3 to 20 characters').regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only');
export const avatarSchema = z.object({ glyph: z.enum(AVATAR_GLYPHS), color: z.enum(AVATAR_COLORS as [string, ...string[]]) });

export type PublicUser = { id: string; username: string; displayName: string; avatar: { glyph: string; color: string } };
type Row = { id: string; username: string; display_name: string; avatar: PublicUser['avatar']; password_hash: string; recovery_hash: string };
const pub = (r: Row): PublicUser => ({ id: r.id, username: r.username, displayName: r.display_name, avatar: r.avatar });
const RESERVED = new Set(['admin', 'croon', 'host', 'stage', 'moderator', 'system', 'support']);

export async function register(o: { username: string; displayName?: string; password: string; avatar?: PublicUser['avatar'] }) {
  if (RESERVED.has(o.username.toLowerCase())) throw new HttpError(409, 'That username is taken.');
  const problems = passwordProblems(o.password, o.username);
  if (problems.length) throw new HttpError(400, problems.join('. ') + '.');
  const code = newRecoveryCode();
  const [pw, rc] = await Promise.all([hashPassword(o.password), hashPassword(tidyRecoveryCode(code))]);
  const avatar = o.avatar ?? { glyph: AVATAR_GLYPHS[Math.floor(Math.random() * AVATAR_GLYPHS.length)], color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] };
  try {
    const [row] = await sql<Row[]>`insert into users (username, display_name, avatar, password_hash, recovery_hash)
      values (${o.username}, ${o.displayName?.trim() || o.username}, ${sql.json(avatar)}, ${pw}, ${rc}) returning *`;
    return { user: pub(row), recoveryCode: code };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'That username is taken.');
    throw err;
  }
}

export async function login(username: string, password: string) {
  const [row] = await sql<Row[]>`select * from users where lower(username) = lower(${username})`;
  // Hash even when the user does not exist, so timing does not reveal which usernames are real.
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, 'That username and password do not match.');
  return pub(row);
}

/** Resets the password with the recovery code and issues a new code (the old one is spent). */
export async function recover(username: string, recoveryCode: string, newPassword: string) {
  const [row] = await sql<Row[]>`select * from users where lower(username) = lower(${username})`;
  const ok = await verifyPassword(tidyRecoveryCode(recoveryCode), row?.recovery_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, 'That username and recovery code do not match.');
  const problems = passwordProblems(newPassword, row.username);
  if (problems.length) throw new HttpError(400, problems.join('. ') + '.');
  const code = newRecoveryCode();
  const [pw, rc] = await Promise.all([hashPassword(newPassword), hashPassword(tidyRecoveryCode(code))]);
  await sql`update users set password_hash = ${pw}, recovery_hash = ${rc} where id = ${row.id}`;
  return { user: pub(row), recoveryCode: code };
}

export async function changePassword(userId: string, current: string, next: string) {
  const [row] = await sql<Row[]>`select * from users where id = ${userId}`;
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new HttpError(401, 'Your current password is not right.');
  const problems = passwordProblems(next, row.username);
  if (problems.length) throw new HttpError(400, problems.join('. ') + '.');
  await sql`update users set password_hash = ${await hashPassword(next)} where id = ${userId}`;
}

export async function getUser(id: string | null): Promise<PublicUser | null> {
  if (!id) return null;
  const [row] = await sql<Row[]>`select * from users where id = ${id}`;
  return row ? pub(row) : null;
}

export async function userByName(username: string) {
  const [row] = await sql<(Row & { created_at: Date })[]>`select * from users where lower(username) = lower(${username})`;
  return row ? { ...pub(row), joined: row.created_at } : null;
}

export async function updateProfile(userId: string, o: { username?: string; displayName?: string; avatar?: PublicUser['avatar'] }) {
  if (o.username && RESERVED.has(o.username.toLowerCase())) throw new HttpError(409, 'That username is taken.');
  try {
    const [row] = await sql<Row[]>`update users set
      username = coalesce(${o.username ?? null}, username),
      display_name = coalesce(${o.displayName?.trim() || null}, display_name),
      avatar = coalesce(${o.avatar ? sql.json(o.avatar) : null}, avatar)
      where id = ${userId} returning *`;
    return pub(row);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'That username is taken.');
    throw err;
  }
}
