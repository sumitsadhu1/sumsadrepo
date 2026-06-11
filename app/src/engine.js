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
  const evidenceFor = (id) => snapshot.evidence?.[id] ?? null;
  return CHECKS.map((c) => {
    if (c.tier === 'O' && !e5) {
      return { ...meta(c), status: 'license-gated', actual: null, evidence: evidenceFor(c.id),
        note: 'Requires an E5/A5/G5 (optimized) license — listed as unlockable, excluded from scores.' };
    }
    const actual = getPath(snapshot, c.measure.path);
    if (actual === undefined || actual === null) {
      return { ...meta(c), status: 'not-collected', actual: null, evidence: evidenceFor(c.id),
        note: 'Not collected in this mode — excluded from scores.' };
    }
    const pass = OPS[c.measure.op](actual, c.measure.value);
    return { ...meta(c), status: pass ? 'pass' : 'fail', actual, evidence: evidenceFor(c.id) };
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

// Coverage = measured / in-scope. License-gated checks are out of scope (the tenant
// cannot measure them); not-collected checks are IN scope and reduce coverage —
// sparse data must read as partial, never as complete.
function coverage(results) {
  const inScope = results.filter((r) => r.status !== 'license-gated');
  const measured = inScope.filter((r) => r.status === 'pass' || r.status === 'fail');
  return { measured: measured.length, inScope: inScope.length };
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
    configCoverage: coverage(config),
    attestScore: rate(attest),
    attestCoverage: coverage(attest),
    perControl,
    unlockable: results.filter((r) => r.status === 'license-gated').map((r) => r.id),
    notCollected: results.filter((r) => r.status === 'not-collected').map((r) => r.id),
  };
}

// Stage = 1 + number of consecutive exit gates passed.
// A gate passes only when (a) at least gateCoverageMin of its checks were actually
// MEASURED (not-collected blocks the gate — unmeasured is not a pass), and
// (b) no measured check fails. Each gate also reports how much of it rests on
// self-attestation so the verdict can't silently launder asserted governance
// into the appearance of evidence.
export function placeStage(results) {
  const minCov = STAGES.gateCoverageMin ?? 0.8;
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  let stage = 1;
  const gateDetail = {};
  for (const g of ['1', '2', '3']) {
    const ids = STAGES.gates[g];
    const measured = ids.filter((id) => ['pass', 'fail'].includes(byId[id]?.status));
    const failing = measured.filter((id) => byId[id].status === 'fail');
    const notCollected = ids.filter((id) => byId[id]?.status === 'not-collected');
    const attestIds = ids.filter((id) => byId[id]?.type === 'attest');
    const cov = ids.length ? measured.length / ids.length : 0;
    const passed = cov >= minCov && failing.length === 0;
    gateDetail[g] = {
      total: ids.length,
      measured: measured.length,
      coverage: Math.round(cov * 100),
      coverageMin: Math.round(minCov * 100),
      failing,
      notCollected,
      attestCount: attestIds.length,
      passed,
    };
    if (passed && Number(g) === stage) stage = Number(g) + 1;
  }
  return { stage, gateDetail };
}
