// Regression tests for the FEEDBACK.md §2 scoring-correctness findings.
// These reproduce the reviewer's exact inflation scenarios and assert they are fixed.
import { test } from 'node:test';
import assert from 'node:assert';
import { evaluate, score, placeStage } from '../src/engine.js';
import { canDo, permsFor } from '../src/auth.js';
import { loadFixture } from '../src/store.js';

const fullGov = (v) => ({
  sponsorAndForum: v, aiPolicy: v, irRunbook: v, killSwitchTested: v,
  promotionGates: v, cadenceOperating: v, decisionRights: v,
});
const fullStats = (v) => ({
  agentCount: v ? 5 : 0, ownersCompletePct: v ? 100 : 0, attestationsCurrentPct: v ? 100 : 0,
  autonomyTieredPct: v ? 100 : 0, identityModePct: v ? 100 : 0, valueHypothesisPct: v ? 100 : 0,
  freshnessOk: v,
});

test('FEEDBACK §2.2 scenario D: 5/40 sparse passes can no longer reach Stage 4', () => {
  const snap = {
    tenant: { licenses: { e5: false } },
    identity: { caBaseline: true },
    agents: { unregisteredAgents: 0, orphanedAgentIdentities: 0, credentialRotation: true, inventoryVisible: true },
  };
  const r = evaluate(snap);
  const p = placeStage(r);
  assert.equal(r.filter((x) => x.status === 'pass').length, 5);
  assert.equal(p.stage, 1, 'sparse data must NOT clear gates: ' + JSON.stringify(p.gateDetail['1']));
  assert.ok(p.gateDetail['1'].coverage < p.gateDetail['1'].coverageMin);
  assert.ok(p.gateDetail['1'].notCollected.length > 0, 'unmeasured gate checks must be reported as blocking');
});

test('FEEDBACK §2.2 scenario B: single passing CA check stays Stage 1', () => {
  const r = evaluate({ tenant: { licenses: { e5: false } }, identity: { caBaseline: true } });
  assert.equal(placeStage(r).stage, 1);
});

test('FEEDBACK §2.3: config score now carries coverage so 100%-of-2 cannot mislead', () => {
  const r = evaluate({ tenant: { licenses: { e5: false } }, identity: { caBaseline: true } });
  const s = score(r);
  assert.equal(s.configScore, 100); // the rate itself is still honest about what was measured
  assert.ok(s.configCoverage.measured <= 3, 'few measured');
  assert.ok(s.configCoverage.inScope >= 20, 'many in scope');
  assert.ok(s.configCoverage.measured < s.configCoverage.inScope, 'coverage gap must be visible');
});

test('gateDetail reports self-attestation share (FEEDBACK §2.4)', () => {
  const snap = { ...loadFixture('fabrikam'), registerStats: fullStats(true), governance: fullGov(true) };
  const p = placeStage(evaluate(snap));
  assert.ok(p.gateDetail['3'].attestCount >= 8, 'gate 3 is mostly attest checks and must say so');
});

test('full-coverage demo tenants still place correctly (no regression)', () => {
  const contoso = { ...loadFixture('contoso'), registerStats: fullStats(false), governance: fullGov(false) };
  assert.equal(placeStage(evaluate(contoso)).stage, 1);
  const fab = { ...loadFixture('fabrikam'), registerStats: fullStats(true), governance: fullGov(true) };
  assert.equal(placeStage(evaluate(fab)).stage, 3);
});

test('RBAC: roles gate fix and attest actions (FEEDBACK §3.3)', () => {
  assert.ok(canDo('Global Admin', 'fix'));
  assert.ok(canDo('Security Admin', 'fix'));
  assert.ok(!canDo('Operator', 'fix'));
  assert.ok(!canDo('Solution Architect', 'fix'));
  assert.ok(canDo('Agent Owner', 'attest'));
  assert.ok(!canDo('Security Admin', 'attest'));
  assert.deepEqual(permsFor('Operator'), { fix: false, attest: false, plan: false, evidence: false });
});
