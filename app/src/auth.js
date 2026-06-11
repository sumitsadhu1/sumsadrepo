// App access control: a generated access key (scrypt-hashed at rest) exchanged
// for an HttpOnly session cookie. Sessions are in-memory and carry an identity
// (name + role) so attestations, approvals, and task changes are attributed.
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

export function createSession(name, role) {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, { exp: Date.now() + SESSION_HOURS * 3600_000, name, role });
  return t;
}

export function getSession(cookieHeader) {
  const m = /aga_session=([a-f0-9]{48})/.exec(cookieHeader || '');
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (Date.now() > s.exp) { sessions.delete(m[1]); return null; }
  return { name: s.name, role: s.role };
}

export function checkSession(cookieHeader) {
  return getSession(cookieHeader) !== null;
}

// The governance tool governs itself: actions are permissioned by role,
// not just attributed. Approving a change and attesting governance are
// decision-rights, so they are restricted; read/analyse is open to all roles.
const ROLE_PERMS = {
  'Global Admin': ['fix', 'attest', 'plan'],
  'Security Admin': ['fix', 'plan'],
  'AI Governance Lead': ['fix', 'attest', 'plan'],
  'Compliance Admin': ['attest', 'plan'],
  'Agent Owner': ['attest'],
  'Solution Architect': ['plan'],
  'Operator': [],
};

export function canDo(role, action) {
  return (ROLE_PERMS[role] ?? []).includes(action);
}

export function permsFor(role) {
  return { fix: canDo(role, 'fix'), attest: canDo(role, 'attest'), plan: canDo(role, 'plan') };
}
