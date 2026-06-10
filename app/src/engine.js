// Assess engine: evaluate the declarative catalog against a snapshot,
// score config vs attestation per control, and place the tenant on the journey.
import { loadCatalog } from './store.js';

export const CHECKS = loadCatalog('checks');
export const STAGES = loadCatalog('stages');

export function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ?? (o[k] = {});
  o[keys.at(-1)] = value;
}

const OPS = {
  eq: (a, b) => a === b,
  gte: (a, b) => typeof a === 'number' && a >= b,
  lte: (a, b) => typeof a === 'number' && a <= b,
};

// Snapshot = collector output + registerStats + governance (attestation layers).
// Status per check: pass | fail | license-gated | not-collected
export function evaluate(snapshot) {
  const e5 = !!getPath(snapshot, 'tenant.licenses.e5');
  return CHECKS.map((c) => {
    if (c.tier === 'O' && !e5) {
      return { ...meta(c), status: 'license-gated', actual: null,
        note: 'Requires an E5/A5/G5 (optimized) license — listed as unlockable, excluded from scores.' };
    }
    const actual = getPath(snapshot, c.measure.path);
    if (actual === undefined || actual === null) {
      return { ...meta(c), status: 'not-collected', actual: null,
        note: 'Not collected in this mode — excluded from scores.' };
    }
    const pass = OPS[c.measure.op](actual, c.measure.value);
    return { ...meta(c), status: pass ? 'pass' : 'fail', actual };
  });
}

function meta(c) {
  return {
    id: c.id, control: c.control, controlName: STAGES.controls[String(c.control)],
    title: c.title, stage: c.stage, tier: c.tier, type: c.measure.type,
    fixMode: c.fix?.mode ?? 'guided', fixSummary: c.fix?.summary ?? '', portal: c.fix?.portal ?? null,
    persona: c.pm?.persona ?? '', effort: c.pm?.effort ?? 'M',
    expected: { op: c.measure.op, value: c.measure.value, path: c.measure.path },
    canDemoFix: !!c.fix?.demoEffect,
  };
}

function rate(results) {
  const applicable = results.filter((r) => r.status === 'pass' || r.status === 'fail');
  if (!applicable.length) return null;
  return Math.round((100 * applicable.filter((r) => r.status === 'pass').length) / applicable.length);
}

export function score(results) {
  const config = results.filter((r) => r.type === 'config' || r.type === 'hybrid');
  const attest = results.filter((r) => r.type === 'attest');
  const perControl = {};
  for (const n of Object.keys(STAGES.controls)) {
    const cn = Number(n);
    perControl[n] = {
      name: STAGES.controls[n],
      config: rate(config.filter((r) => r.control === cn)),
      attest: rate(attest.filter((r) => r.control === cn)),
    };
  }
  return {
    configScore: rate(config),
    attestScore: rate(attest),
    perControl,
    unlockable: results.filter((r) => r.status === 'license-gated').map((r) => r.id),
    notCollected: results.filter((r) => r.status === 'not-collected').map((r) => r.id),
  };
}

// Stage = 1 + number of consecutive exit gates passed.
// A gate passes when every applicable (non-gated, collected) check in it passes.
export function placeStage(results) {
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  let stage = 1;
  const gateDetail = {};
  for (const g of ['1', '2', '3']) {
    const ids = STAGES.gates[g];
    const applicable = ids.filter((id) => ['pass', 'fail'].includes(byId[id]?.status));
    const failing = applicable.filter((id) => byId[id].status === 'fail');
    gateDetail[g] = { total: ids.length, applicable: applicable.length, failing };
    if (applicable.length > 0 && failing.length === 0 && Number(g) === stage) stage = Number(g) + 1;
  }
  return { stage, gateDetail };
}
