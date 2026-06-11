// Secrets at rest: AES-256-GCM with a machine-local key file (0600).
// Access tokens are never persisted — only the refresh token, encrypted.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './store.js';

function keyFile() { return path.join(dataDir(), '.secret'); }

export function machineKey() {
  const f = keyFile();
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32), { mode: 0o600 });
  return fs.readFileSync(f);
}

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', machineKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decrypt(blob) {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', machineKey(), Buffer.from(blob.iv, 'base64'));
    d.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64')), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}
