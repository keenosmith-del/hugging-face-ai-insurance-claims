import { Audit } from '../models/Audit';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { Request, Response, NextFunction, Router } from 'express';
import mongoose, { Schema } from 'mongoose';
const User = mongoose.model('User', new Schema({ username: { type: String, unique: true }, password: String, role: { type: String, enum: ['assessor', 'administrator'] } }));
const Session = mongoose.model('Session', new Schema({ digest: { type: String, unique: true }, userId: Schema.Types.ObjectId, expiresAt: { type: Date, expires: 0 } }));
export function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function verifyPassword(password: string, stored: string) { const [salt, hash] = stored.split(':'); const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return expected.length === actual.length && timingSafeEqual(expected, actual); }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function bootstrap() {
  const username = process.env.BOOTSTRAP_USERNAME, password = process.env.BOOTSTRAP_PASSWORD;
  if (username && password) {
    if (password.length < 12) throw new Error('Bootstrap password must contain at least 12 characters');
    await User.updateOne({ username }, { $setOnInsert: { username, password: hashPassword(password), role: 'administrator' } }, { upsert: true });
  }
}
export async function protect(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const session = await Session.findOne({ digest: digest(token), expiresAt: { $gt: new Date() } });
    const user = session && await User.findById(session.userId);
    if (!user) return res.status(401).json({ error: 'Sign in required' });
    res.locals.user = { id: String(user._id), username: user.username, role: user.role }; next();
  } catch (error) { next(error); }
}
export function administrator(_req: Request, res: Response, next: NextFunction) { if (res.locals.user.role !== 'administrator') return res.status(403).json({ error: 'Administrator permission required' }); next(); }
export const auth = Router();
const attempts = new Map<string, { count: number; until: number }>();
auth.post('/login', async (req, res, next) => {
  try {
    const key = req.ip || 'local', previous = attempts.get(key), now = Date.now();
    const entry = previous && previous.until > now ? previous : { count: 0, until: now + 60000 };
    attempts.set(key, entry); if (++entry.count > 10) return res.status(429).json({ error: 'Too many attempts; retry in one minute' });
    if (typeof req.body.username !== 'string' || typeof req.body.password !== 'string' || req.body.password.length > 1024) return res.status(400).json({ error: 'Invalid credentials format' });
    const user = await User.findOne({ username: req.body.username });
    if (!user || !verifyPassword(req.body.password, user.password!)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = randomBytes(32).toString('hex');
    await Session.create({ digest: digest(token), userId: user._id, expiresAt: new Date(now + 8 * 3600000) });
    await Audit.create({ actor: user.username, action: 'login', resource: 'session', statusCode: 200 });
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch (error) { next(error); }
});
auth.post('/logout', protect, async (req, res, next) => { try { await Session.deleteOne({ digest: digest(req.headers.authorization!.replace(/^Bearer /, '')) }); res.status(204).end(); } catch (error) { next(error); } });
auth.post('/users', protect, administrator, async (req, res, next) => {
  try { const { username, password, role } = req.body; if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 1024 || !['assessor','administrator'].includes(role)) return res.status(400).json({ error: 'Invalid user; password must contain at least 12 characters' }); const user = await User.create({ username, password: hashPassword(password), role }); await Audit.create({ actor: res.locals.user.username, action: 'create_user', resource: username, statusCode: 201 }); res.status(201).json({ id: user._id, username, role }); } catch (error) { next(error); }
});
