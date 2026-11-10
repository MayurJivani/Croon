import { Router } from 'express';
import { z } from 'zod';
import { asyncH, authLimiter, generateCsrfToken, requireAuth, validate, writeLimiter } from '../middleware/http.ts';
import { bindUser, signOut, endOtherSessions } from '../auth/session.ts';
import { register, login, recover, getUser, isSeeder, updateProfile, changePassword, usernameSchema, avatarSchema } from '../services/users.ts';

export const authRouter = Router();
const password = z.string().min(1).max(200);

authRouter.get('/me', asyncH(async (req, res) => res.json({ user: await getUser(req.session.userId), seeder: await isSeeder(req.session.userId) })));

authRouter.post('/register', authLimiter, validate(z.object({ username: usernameSchema, displayName: z.string().trim().max(32).optional(), password, avatar: avatarSchema.optional() })), asyncH(async (req, res) => {
  const { user, recoveryCode } = await register(req.body);
  await bindUser(req, res, user.id);
  res.status(201).json({ user, recoveryCode, csrfToken: generateCsrfToken(req, res, { overwrite: true }) });
}));

authRouter.post('/login', authLimiter, validate(z.object({ username: z.string().trim().min(1).max(40), password })), asyncH(async (req, res) => {
  const user = await login(req.body.username, req.body.password);
  await bindUser(req, res, user.id);
  res.json({ user, csrfToken: generateCsrfToken(req, res, { overwrite: true }) });
}));

authRouter.post('/recover', authLimiter, validate(z.object({ username: z.string().trim().min(1).max(40), recoveryCode: z.string().min(10).max(60), newPassword: password })), asyncH(async (req, res) => {
  const { user, recoveryCode } = await recover(req.body.username, req.body.recoveryCode, req.body.newPassword);
  await bindUser(req, res, user.id);
  await endOtherSessions(user.id, req.session.id);
  res.json({ user, recoveryCode, csrfToken: generateCsrfToken(req, res, { overwrite: true }) });
}));

authRouter.post('/logout', asyncH(async (req, res) => {
  await signOut(req, res);
  res.json({ ok: true, csrfToken: generateCsrfToken(req, res, { overwrite: true }) });
}));

authRouter.patch('/me', requireAuth, writeLimiter, validate(z.object({ username: usernameSchema.optional(), displayName: z.string().trim().min(1).max(32).optional(), avatar: avatarSchema.optional() })), asyncH(async (req, res) => {
  res.json({ user: await updateProfile(req.session.userId!, req.body) });
}));

authRouter.post('/password', requireAuth, authLimiter, validate(z.object({ current: password, next: password })), asyncH(async (req, res) => {
  await changePassword(req.session.userId!, req.body.current, req.body.next);
  await endOtherSessions(req.session.userId!, req.session.id);
  res.json({ ok: true });
}));
