// Evidence pack: validation, provenance, expiry, and the wave-2 headline —
// gate 1 can now clear on measured evidence (Graph wave 1 + pack), which was
// mathematically impossible before (FEEDBACK §2.5.5).
import { test } from 'node:test';
import assert from 'node:assert';
import { validatePack, applyPack, importPack, clearPack, packSummary, PACK_SCHEMA, PACK_MAX_AGE_DAYS } from '../src/evidence.js';
import { evaluate, placeStage } from '../src/engine.js';
import { save } from '../src/store.js';

const MODE = 'test-pack';

function freshPack(overrides = {}) {
  return {
    schema: PACK_SCHEMA,
    collectedAt: new Date().toISOString(),
    collectedBy: 'admin@contoso.com',
    tool: 'collect-evidence.ps1/0.6.0',
    values: {
      'sharepoint.dagReportLastRunDays': 7,
      'sharepoint.interimBrakes': true,
      'sharepoint.siteLifecycleManagement': true,
      'teams.protectionReviewed': true,
      'purview.sensitivityLabelsPublished': true,
      'purview.dlpPoliciesActive': true,
      'purview.auditCopilotInteractions': true,
      'purview.retentionForAiInteractions': true,
    },
    evidence: { 'AGA-404': ['3 DLP polic(ies) in Enable mode', 'DLP policy: PII baseline'] },
    ...overrides,
  };
}

test('validatePack: schema, identity, and types are enforced; unknown paths dropped', () => {
  assert.equal(validatePack(null).ok, false);
  assert.equal(validatePack({ ...freshPack(), schema: 'wrong/v9' }).ok, false);
  assert.equal(validatePack({ ...freshPack(), collectedBy: '' }).ok, false, 'anonymous packs must be rejected');

  const typed = validatePack(freshPack({ values: { 'purview.dlpPoliciesActive': 'yes' } }));
  assert.equal(typed.ok, false, 'string where boolean expected must be rejected');

  const v = validatePack(freshPack({ values: { 'purview.dlpPoliciesActive': true, 'agents.unregisteredAgents': 0, 'identity.caBaseline': true } }));
  assert.equal(v.ok, true);
  assert.deepEqual(v.dropped.sort(), ['agents.unregisteredAgents', 'identity.caBaseline'],
    'packs must not be able to set paths outside their charter (e.g. flip CA baseline)');
  assert.equal(Object.keys(v.pack.values).length, 1);
});

test('applyPack: values land with provenance as the first evidence line', () => {
  save('evidence-pack-' + MODE, { ...validatePack(freshPack()).pack, importedBy: 'Lead (AI Governance Lead)', importedAt: new Date().toISOString() });
  const snap = applyPack(MODE, { evidence: { 'AGA-404': ['pre-existing line'] } });
  assert.equal(snap.purview.dlpPoliciesActive, true);
  assert.equal(snap.sharepoint.dagReportLastRunDays, 7);
  assert.match(snap.evidence['AGA-404'][0], /Measured via evidence pack — collected .* by admin@contoso\.com, imported by Lead/);
  assert.ok(snap.evidence['AGA-404'].includes('DLP policy: PII baseline'));
  assert.ok(snap.evidence['AGA-404'].includes('pre-existing line'), 'collector evidence must be kept, not replaced');
  clearPack(MODE);
});

test('expired pack: measurements ignored, expiry visible in evidence', () => {
  const old = new Date(Date.now() - (PACK_MAX_AGE_DAYS + 5) * 86400000).toISOString();
  save('evidence-pack-' + MODE, { ...validatePack(freshPack({ collectedAt: old })).pack, importedBy: 'x', importedAt: old });
  const snap = applyPack(MODE, {});
  assert.equal(snap.purview, undefined, 'expired pack must contribute no values');
  assert.match(snap.evidence['AGA-404'][0], /EXPIRED evidence pack/);
  assert.equal(packSummary(MODE).expired, true);
  clearPack(MODE);
});

test('importPack: rejects with 400-class error and records importer', () => {
  assert.throws(() => importPack(MODE, { schema: 'nope' }, 'who'), /Evidence pack rejected/);
  const r = importPack(MODE, freshPack(), 'Admin (Global Admin)');
  assert.equal(r.summary.importedBy, 'Admin (Global Admin)');
  assert.ok(r.summary.checks.includes('AGA-401') && r.summary.checks.includes('AGA-901'));
  clearPack(MODE);
});

test('WAVE 2 HEADLINE: gate 1 clears on measured evidence only (no self-attestation theater)', () => {
  save('evidence-pack-' + MODE, { ...validatePack(freshPack()).pack, importedBy: 'Lead', importedAt: new Date().toISOString() });
  // Live Graph wave 1 measures AGA-301 + AGA-203; the questionnaire answers
  // AGA-204 + AGA-907; the pack measures the remaining seven gate-1 config checks.
  const snap = applyPack(MODE, {
    tenant: { licenses: { e5: false } },
    identity: { caBaseline: true, aiAdminDelegated: true },
    governance: { sponsorAndForum: true, aiPolicy: true },
  });
  const p = placeStage(evaluate(snap));
  const g1 = p.gateDetail['1'];
  assert.equal(g1.measured, 11, 'all 11 gate-1 checks measured: ' + JSON.stringify(g1));
  assert.equal(g1.passed, true);
  assert.equal(p.stage, 2, 'a real tenant can now exit Get Ready on evidence');
  clearPack(MODE);

  // And without the pack the same tenant honestly stays Stage 1 (coverage floor).
  const sparse = evaluate({
    tenant: { licenses: { e5: false } },
    identity: { caBaseline: true, aiAdminDelegated: true },
    governance: { sponsorAndForum: true, aiPolicy: true },
  });
  assert.equal(placeStage(sparse).stage, 1);
});
