import { test } from 'node:test';
import assert from 'node:assert';
import { evaluate, score, placeStage, CHECKS, setPath } from '../src/engine.js';
import { loadFixture } from '../src/store.js';

const gov = (v) => ({
  sponsorAndForum: v, aiPolicy: v, irRunbook: v, killSwitchTested: v,
  promotionGates: v, cadenceOperating: v, decisionRights: v,
});
const stats = (v) => ({
  agentCount: v ? 5 : 0, ownersCompletePct: v ? 100 : 0, attestationsCurrentPct: v ? 100 : 0,
  autonomyTieredPct: v ? 100 : 0, identityModePct: v ? 100 : 0, valueHypothesisPct: v ? 100 : 0,
  freshnessOk: v,
});

test('catalog is well-formed', () => {
  assert.ok(CHECKS.length >= 35);
  for (const c of CHECKS) {
    assert.match(c.id, /^AGA-\d{3}$/);
    assert.ok([1,2,3,4,5,6,7,8,9].includes(c.control), c.id);
    assert.ok(['config','attest','hybrid'].includes(c.measure.type), c.id);
    assert.ok(['eq','gte','lte'].includes(c.measure.op), c.id);
  }
});

test('contoso (early journey) fails broadly and lands at Stage 1', () => {
  const snap = { ...loadFixture('contoso'), registerStats: stats(false), governance: gov(false) };
  const results = evaluate(snap);
  const s = score(results);
  const p = placeStage(results);
  assert.equal(p.stage, 1);
  assert.ok(s.configScore < 30, 'config score should be low: ' + s.configScore);
  assert.equal(s.attestScore, 0);
  // E5-gated checks are skipped, not failed
  assert.ok(s.unlockable.includes('AGA-405'));
});

test('fabrikam (governing) clears gates 1-2 and lands at Stage 3', () => {
  const snap = { ...loadFixture('fabrikam'), registerStats: stats(true), governance: gov(true) };
  const results = evaluate(snap);
  const p = placeStage(results);
  assert.equal(p.stage, 3, JSON.stringify(p.gateDetail));
  // gate 3 blocked by real config gaps in the fixture
  assert.ok(p.gateDetail['3'].failing.length > 0);
});

test('fixing the config gaps moves fabrikam to Stage 4', () => {
  const snap = { ...loadFixture('fabrikam'), registerStats: stats(true), governance: gov(true) };
  setPath(snap, 'agents.unregisteredAgents', 0);
  setPath(snap, 'agents.orphanedAgentIdentities', 0);
  setPath(snap, 'agents.credentialRotation', true);
  setPath(snap, 'finops.costAttribution', true);
  const p = placeStage(evaluate(snap));
  assert.equal(p.stage, 4, JSON.stringify(p.gateDetail));
});

test('missing snapshot sections report not-collected, never fail', () => {
  const snap = { tenant: { licenses: { e5: true } }, registerStats: stats(false), governance: gov(false) };
  const results = evaluate(snap);
  const dag = results.find((r) => r.id === 'AGA-401');
  assert.equal(dag.status, 'not-collected');
});
