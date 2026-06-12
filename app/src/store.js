// JSON-file persistence under app/data/ (gitignored). One file per concern.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// AGA_DATA_DIR lets tests (and parallel instances) use an isolated store —
// the suite must never write through the live app's data, where it could
// clobber real state such as the encrypted sign-in token.
const DATA = process.env.AGA_DATA_DIR ? path.resolve(process.env.AGA_DATA_DIR) : path.join(ROOT, 'data');

export function dataDir() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  return DATA;
}

export function load(name, fallback) {
  const f = path.join(dataDir(), name + '.json');
  if (!fs.existsSync(f)) return structuredClone(fallback);
  try {
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    // A stored null means "cleared" (e.g. workspace reset) — callers must get
    // their fallback, never a null that breaks .push()/spread (§10.3).
    return v === null ? structuredClone(fallback) : v;
  } catch { return structuredClone(fallback); }
}

export function save(name, value) {
  fs.writeFileSync(path.join(dataDir(), name + '.json'), JSON.stringify(value, null, 2));
  return value;
}

export function loadFixture(name) {
  const f = path.join(ROOT, 'fixtures', name + '.json');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function loadCatalog(name) {
  const f = path.join(ROOT, 'catalog', name + '.json');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
