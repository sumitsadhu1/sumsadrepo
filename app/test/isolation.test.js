// v0.7 regressions for the live-testing findings (FEEDBACK §7/§8):
// data isolation per tenant mode, questionnaire attestation rigor, and
// plan/overview agreement on gate blockers.
import { test } from 'node:test';
import assert from 'node:assert';
import { saveAnswers, governanceFromAnswers, getAnswers } from '../src/answers.js';
import { canDo, permsFor } from '../src/auth.js';
import { generatePlan, verifyPlan, getPlan } from '../src/plan.js';
import { evaluate } from '../src/engine.js';
import { fixApply, resetWorkspace } from '../src/collectors.js';
import { load, save } from '../src/store.js';

test('§7.2.4: questionnaire answers are stamped, permission-gated, and expire', () => {
  const M = 'test-ans';
  save('answers-' + M, {});

  // a non-attest role cannot change a governance answer
  assert.throws(
    () => saveAnswers(M, { killSwitchTested: true }, {}, 'SA (Solution Architect)', false),
    /attest decision-right/);

  // an attest role's answer is attributed, dated, and carries the note
  saveAnswers(M, { killSwitchTested: true, targetStage: 4 }, { killSwitchTested: 'Drill 2026-06-01, ticket OPS-441' }, 'Maya (AI Governance Lead)', true);
  const a = getAnswers(M).killSwitchTested;
  assert.equal(a.v, true);
  assert.equal(a.by, 'Maya (AI Governance Lead)');
  assert.ok(a.at);
  const { governance, evidence } = governanceFromAnswers(M);
  assert.equal(governance.killSwitchTested, true);
  assert.match(evidence['AGA-601'][0], /Self-attested "Yes" by Maya/);
  assert.match(evidence['AGA-601'][1], /OPS-441/);

  // non-attest answers (targetStage) save without the attest right
  saveAnswers(M, { targetStage: 3 }, {}, 'SA (Solution Architect)', false);
  assert.equal(getAnswers(M).targetStage, 3);

  // re-saving the same value does NOT re-date someone else's attestation
  saveAnswers(M, { killSwitchTested: true }, { killSwitchTested: 'Drill 2026-06-01, ticket OPS-441' }, 'Raj (Global Admin)', true);
  assert.equal(getAnswers(M).killSwitchTested.by, 'Maya (AI Governance Lead)');

  // a stale attestation stops passing and says why
  const old = new Date(Date.now() - 120 * 86400000).toISOString();
  save('answers-' + M, { killSwitchTested: { v: true, by: 'Maya (AI Governance Lead)', at: old, note: '' } });
  const g2 = governanceFromAnswers(M);
  assert.equal(g2.governance.killSwitchTested, false, 'expired Yes must not pass');
  assert.match(g2.evidence['AGA-601'][0], /EXPIRED self-attestation/);

  save('answers-' + M, null);
});

test('§14.2: conflicting attestations are logged and surfaced as CONTESTED, never silently overwritten', () => {
  const M = 'test-contest';
  save('answers-' + M, {});
  saveAnswers(M, { killSwitchTested: true }, { killSwitchTested: 'Drill OPS-1142' }, 'Marcus (Compliance Admin)', true);
  saveAnswers(M, { killSwitchTested: false }, {}, 'Owen (Agent Owner)', true);
  const a = getAnswers(M).killSwitchTested;
  assert.equal(a.v, false, 'latest is authoritative');
  assert.equal(a.log.length, 2, 'both attestations on record');
  assert.equal(a.log[0].by, 'Marcus (Compliance Admin)');
  const { governance, evidence } = governanceFromAnswers(M);
  assert.equal(governance.killSwitchTested, false);
  assert.match(evidence['AGA-601'][0], /CONTESTED: changed Yes→No by Owen \(Agent Owner\)/);
  assert.match(evidence['AGA-601'][0], /previously Yes by Marcus/);
  save('answers-' + M, null);
});

test('§13.2 P1-b: Compliance Admin can import evidence packs; sign-out perms intact', () => {
  assert.ok(canDo('Compliance Admin', 'evidence'), 'the role told to collect evidence can load it');
  assert.ok(canDo('Security Admin', 'evidence'));
  assert.ok(!canDo('Agent Owner', 'evidence'));
  assert.ok(!canDo('Operator', 'evidence'));
  assert.equal(permsFor('Compliance Admin').evidence, true);
  assert.equal(permsFor('Compliance Admin').fix, false, 'evidence right must not leak the fix right');
});

test('§7.2.1: AGA-907 consumes governance.aiPolicy — the orphan is wired', () => {
  const r = evaluate({ tenant: { licenses: {} }, governance: { aiPolicy: true } }).find((x) => x.id === 'AGA-907');
  assert.equal(r.status, 'pass');
  assert.equal(evaluate({ tenant: { licenses: {} }, governance: { aiPolicy: false } }).find((x) => x.id === 'AGA-907').status, 'fail');
});

test('§8.1 B5: not-collected gate blockers appear in the plan as measure tasks and close when measured', () => {
  const M = 'test-plan';
  save('plan-' + M, null);
  const sparse = evaluate({ tenant: { licenses: { e5: false } }, identity: { caBaseline: true } });
  const plan = generatePlan(M, sparse, 2);
  const dag = plan.tasks.find((t) => t.checkId === 'AGA-401');
  assert.ok(dag, 'unmeasured gate blocker AGA-401 must be a plan task');
  assert.equal(dag.mode, 'measure');
  assert.match(dag.action, /evidence pack/);

  // once measured (even as failing), the measure task auto-closes
  const measured = evaluate({ tenant: { licenses: { e5: false } }, identity: { caBaseline: true }, sharepoint: { dagReportLastRunDays: 400 } });
  verifyPlan(M, measured);
  const after = getPlan(M).tasks.find((t) => t.checkId === 'AGA-401');
  assert.equal(after.status, 'done');
  assert.match(after.history.at(-1).event, /now measured \(fail\)/);
  save('plan-' + M, null);
});

test('§10.3: a reset workspace never serves null stores — assess and render must survive a reset', () => {
  resetWorkspace('live'); // writes cleared markers to every live-* store
  const h = load('history-live', []);
  assert.ok(Array.isArray(h), 'history must come back as the fallback array, not null');
  h.push({ stage: 1 }); // the exact op that 400d POST /api/assess in §10.3
  assert.deepEqual(load('audit-live', []), [], 'audit must be spreadable after reset');
  assert.equal(load('last-assessment-live', null), null, 'null fallback callers still see null');
  save('live-snapshot', null);
});

test('§7.1/§8.1 B1+B2: audit, plan, history, assessment are per-mode; reset clears only that mode', () => {
  // a demo fix writes to that tenant's audit only
  save('audit-contoso', []);
  save('audit-live', [{ at: new Date().toISOString(), checkId: 'X', setting: 's', approvedBy: 'live-admin', environment: 'live' }]);
  fixApply('contoso', 'AGA-301', 'Tester (Global Admin)');
  assert.equal(load('audit-contoso', []).length, 1);
  assert.equal(load('audit-live', []).length, 1, 'live audit untouched by demo fix');

  // resetting contoso clears contoso's stores, not live's
  save('history-contoso', [{ stage: 1 }]);
  save('history-live', [{ stage: 2 }]);
  const r = resetWorkspace('contoso');
  assert.match(r.cleared, /contoso/);
  assert.equal(load('audit-contoso', null), null);
  assert.equal(load('history-contoso', null), null);
  assert.equal(load('history-live', [])[0].stage, 2, 'live history survives a demo reset');

  // live reset clears live workspace but never the encrypted sign-in token
  save('live-token-enc', { iv: 'x', data: 'y', tag: 'z' });
  resetWorkspace('live');
  assert.equal(load('history-live', null), null);
  assert.deepEqual(load('live-token-enc', null), { iv: 'x', data: 'y', tag: 'z' });
  save('live-token-enc', null);
  save('audit-live', null);
});
