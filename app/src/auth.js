// App access control: a generated access key (scrypt-hashed at rest) exchanged
// for an HttpOnly session cookie. Sessions live in memory only.
// Lost the key? Delete data/auth.json and restart — a new key is printed once.
import crypto from 'node:crypto';
import { load, save } from './store.js';

const sessions = new Map();
const SESSION_HOURS = 12;

export function ensureAccessKey() {
  if (load('auth', null)) return null;
  const key = crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(key, salt, 32).toString('hex');
  save('auth', { salt, hash });
  return key; // shown once on first start
}

export function verifyKey(key) {
  const a = load('auth', null);
  if (!a || typeof key !== 'string') return false;
  const h = crypto.scryptSync(key, a.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
}

export function createSession() {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, Date.now() + SESSION_HOURS * 3600_000);
  return t;
}

export function checkSession(cookieHeader) {
  const m = /aga_session=([a-f0-9]{48})/.exec(cookieHeader || '');
  if (!m) return false;
  const exp = sessions.get(m[1]);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(m[1]); return false; }
  return true;
}
