// Questionnaire answers: the second attestation surface (the register is the first).
// v0.7: governance answers are no longer bare booleans — each is stamped with who
// answered, when, and an optional evidence note, and EXPIRES after ATTEST_DAYS just
// like register attestations (§7.2.4/§8.3: a Yes radio with no proof, no author and
// no age must not silently pass a gate-3 security control forever).
import { load, save, loadCatalog, loadFixture } from './store.js';
import { CHECKS } from './engine.js';

export const QUESTIONS = loadCatalog('questionnaire');
export const ANSWER_ATTEST_DAYS = 90;

const ATTEST_QS = QUESTIONS.filter((q) => q.attests);
const checkForPath = Object.fromEntries(CHECKS.map((c) => [c.measure.path, c.id]));

export function getAnswers(mode) {
  const existing = load('answers-' + mode, null);
  if (existing) return existing;
  let seed = {};
  if (mode !== 'live') {
    try { seed = structuredClone(loadFixture(mode).seed?.answers ?? {}); } catch {}
  }
  return save('answers-' + mode, seed);
}

// Normalise an answer that may be a legacy/seeded bare boolean.
export function norm(a) {
  if (a && typeof a === 'object') return a;
  if (typeof a === 'boolean') return { v: a, by: null, at: null, note: '' };
  return null;
}

// Saving governance answers is itself an attestation: changing one requires the
// attest decision-right; unchanged answers keep their original stamp (re-saving
// the form must not silently re-date someone else's attestation).
export function saveAnswers(mode, incoming, notes, identity, canAttest) {
  const cur = getAnswers(mode);
  const out = { ...cur };
  for (const q of QUESTIONS) {
    if (!(q.id in (incoming ?? {}))) continue;
    const val = incoming[q.id];
    if (!q.attests) { out[q.id] = val; continue; }
    const prev = norm(cur[q.id]);
    const note = String(notes?.[q.id] ?? prev?.note ?? '').slice(0, 300);
    const changed = !prev || prev.v !== val || (prev.note ?? '') !== note;
    if (!changed) continue;
    if (!canAttest) {
      const e = new Error(`Changing "${q.id}" is a governance attestation — your role lacks the attest decision-right`);
      e.status = 403;
      throw e;
    }
    // Append-only log (§14.2): conflicting attestations must never be silently
    // overwritten — the latest is authoritative, the history is the record.
    const entry = { v: val, by: identity, at: new Date().toISOString(), note };
    const log = [...(prev?.log ?? (prev ? [{ v: prev.v, by: prev.by, at: prev.at, note: prev.note }] : [])), entry].slice(-20);
    out[q.id] = { ...entry, log };
  }
  return save('answers-' + mode, out);
}

// A control is contested when the two most recent attestations disagree on the
// value — exactly the signal a governance forum needs surfaced, not hidden.
export function contestedInfo(a) {
  const log = a?.log;
  if (!log || log.length < 2) return null;
  const cur = log.at(-1), prev = log.at(-2);
  if (cur.v === prev.v) return null;
  return { from: prev, to: cur };
}

// The attestation layer the engine sees, plus evidence lines that make every
// governance verdict carry its provenance (or its absence) on its face.
export function governanceFromAnswers(mode) {
  const answers = getAnswers(mode);
  const governance = {};
  const evidence = {};
  for (const q of ATTEST_QS) {
    const key = q.attests.split('.')[1];
    const a = norm(answers[q.id]);
    const checkId = checkForPath[q.attests];
    if (!a) { governance[key] = false; continue; } // unanswered → fails, with the check's own guidance
    const age = a.at ? Math.floor((Date.now() - Date.parse(a.at)) / 86400000) : null;
    const expired = age != null && age > ANSWER_ATTEST_DAYS;
    governance[key] = a.v === true && !expired;
    if (!checkId) continue;
    if (expired) {
      evidence[checkId] = [`EXPIRED self-attestation — answered "${a.v ? 'Yes' : 'No'}" ${age}d ago by ${a.by ?? 'unknown'} (limit ${ANSWER_ATTEST_DAYS}d); re-affirm in the Questionnaire`];
    } else if (a.at) {
      evidence[checkId] = [
        `Self-attested "${a.v ? 'Yes' : 'No'}" by ${a.by ?? 'unknown'} on ${new Date(a.at).toLocaleDateString()} (expires in ${ANSWER_ATTEST_DAYS - (age ?? 0)}d)`,
        ...(a.note ? [`Evidence note: ${a.note}`] : []),
      ];
    } else {
      evidence[checkId] = [`Seeded/unattributed answer ("${a.v ? 'Yes' : 'No'}") — re-save in the Questionnaire to attribute and date it`];
    }
    const c = contestedInfo(a);
    if (c) {
      evidence[checkId] = [
        `CONTESTED: changed ${c.from.v ? 'Yes' : 'No'}→${c.to.v ? 'Yes' : 'No'} by ${c.to.by} on ${new Date(c.to.at).toLocaleDateString()} (previously ${c.from.v ? 'Yes' : 'No'} by ${c.from.by}) — bring to the governance forum`,
        ...(evidence[checkId] ?? []),
      ];
    }
  }
  return { governance, evidence };
}
