import { test } from 'node:test';
import assert from 'node:assert';
import { createSession, getSession } from '../src/auth.js';
import { attestAgent, upsertAgent, getRegister } from '../src/register.js';
import { renderReport } from '../src/report.js';

test('sessions carry identity', () => {
  const tok = createSession('Maya R.', 'AI Governance Lead');
  const s = getSession('aga_session=' + tok);
  assert.equal(s.name, 'Maya R.');
  assert.equal(s.role, 'AI Governance Lead');
});

test('attestations are attributed, timestamped, and carry evidence notes', () => {
  upsertAgent('contoso', { id: 'agt-test-1', name: 'Test Agent' });
  attestAgent('contoso', 'agt-test-1', 'Raj (Global Admin)', 'Reviewed in gov forum 2026-06');
  const a = getRegister('contoso').agents.find((x) => x.id === 'agt-test-1');
  assert.equal(a.lastAttestedBy, 'Raj (Global Admin)');
  assert.equal(a.attestNote, 'Reviewed in gov forum 2026-06');
  assert.ok(Date.now() - Date.parse(a.lastAttested) < 5000);
});

test('executive report renders scores, crosswalk, and evidence', () => {
  const html = renderReport({
    assessment: {
      tenantName: 'Contoso', at: new Date().toISOString(),
      scores: {
        configScore: 60, attestScore: 20, unlockable: ['AGA-405'], notCollected: [],
        perControl: { 1: { name: 'Visibility / Inventory', config: 50, attest: 0 } },
      },
      placement: { stage: 2, gateDetail: {} },
      results: [{ id: 'AGA-301', status: 'fail', title: 'CA baseline', persona: 'Identity admin', evidence: ['No enabled policy requires MFA for All users'] }],
    },
    plan: { targetStage: 4, tasks: [{ status: 'todo' }, { status: 'done' }] },
    register: { agents: [{ name: 'A1', lastAttested: new Date().toISOString(), lastAttestedBy: 'Maya (Lead)' }] },
    history: [{ at: new Date().toISOString(), stage: 2, configScore: 60, attestScore: 20 }],
    generatedBy: 'Raj (Global Admin)',
  });
  assert.ok(html.includes('Stage 2'));
  assert.ok(html.includes('40 pts'), 'governance gap should be computed');
  assert.ok(html.includes('NIST AI RMF'));
  assert.ok(html.includes('No enabled policy requires MFA'));
  assert.ok(html.includes('Raj (Global Admin)'));
});
