import { test } from 'node:test';
import assert from 'node:assert';
import { encrypt, decrypt } from '../src/secrets.js';
import { ensureAccessKey, verifyKey, createSession, checkSession } from '../src/auth.js';
import { transformCaPolicies, transformApplications, transformSkus } from '../src/collectors.js';
import { evaluate } from '../src/engine.js';

test('secrets: encrypt/decrypt round-trips; tampering fails closed', () => {
  const blob = encrypt({ refresh_token: 'rt-123', tenantId: 't' });
  assert.ok(!JSON.stringify(blob).includes('rt-123'), 'token must not appear in ciphertext blob');
  assert.deepEqual(decrypt(blob).refresh_token, 'rt-123');
  const tampered = { ...blob, data: blob.data.slice(0, -4) + 'AAAA' };
  assert.equal(decrypt(tampered), null);
});

test('auth: key verifies, wrong key rejected, sessions work', () => {
  const key = ensureAccessKey(); // fresh data dir in CI; may be null if auth.json exists
  if (key) {
    assert.ok(verifyKey(key));
    assert.ok(!verifyKey('wrong-key'));
  }
  const tok = createSession();
  assert.ok(checkSession('aga_session=' + tok));
  assert.ok(!checkSession('aga_session=' + 'f'.repeat(48)));
  assert.ok(!checkSession(''));
});

test('CA transform: detects MFA-for-all + legacy block with evidence', () => {
  const out = transformCaPolicies([
    { state: 'enabled', displayName: 'Require MFA', grantControls: { builtInControls: ['mfa'] }, conditions: { users: { includeUsers: ['All'] } } },
    { state: 'enabled', displayName: 'Block legacy', grantControls: { builtInControls: ['block'] }, conditions: { clientAppTypes: ['exchangeActiveSync', 'other'] } },
    { state: 'disabled', displayName: 'Old risk policy', conditions: { signInRiskLevels: ['high'] } },
  ]);
  assert.equal(out.caBaseline, true);
  assert.equal(out.riskBasedCAandPIM, false); // disabled policy must not count
  assert.ok(out.evidence['AGA-301'].some((e) => e.includes('Require MFA')));
});

test('applications transform: orphans and long-lived secrets flagged with evidence', () => {
  const out = transformApplications([
    { displayName: 'Good App', owners: [{ id: 'u1' }], passwordCredentials: [{ endDateTime: new Date(Date.now() + 30 * 86400000).toISOString() }] },
    { displayName: 'Orphan App', owners: [], passwordCredentials: [] },
    { displayName: 'Eternal App', owners: [{ id: 'u2' }], passwordCredentials: [{ endDateTime: '2299-12-31T00:00:00Z' }] },
  ]);
  assert.equal(out.orphanedAgentIdentities, 1);
  assert.equal(out.credentialRotation, false);
  assert.ok(out.evidence['AGA-502'][0].includes('Orphan App'));
  assert.ok(out.evidence['AGA-503'][0].includes('Eternal App'));
});

test('sku transform: copilot seats summed, tiers detected', () => {
  const out = transformSkus([
    { skuPartNumber: 'Microsoft_365_Copilot', prepaidUnits: { enabled: 100 }, consumedUnits: 80 },
    { skuPartNumber: 'SPE_E5', prepaidUnits: { enabled: 500 } },
  ]);
  assert.equal(out.licenses.copilotSeats, 100);
  assert.equal(out.licenses.e5, true);
  assert.ok(out.evidence['AGA-101'][0].includes('80 assigned'));
});

test('evidence flows through evaluation onto results', () => {
  const snap = {
    tenant: { licenses: { e5: false, copilotSeats: 100 } },
    evidence: { 'AGA-101': ['Microsoft_365_Copilot: 100 seats'] },
  };
  const r = evaluate(snap).find((x) => x.id === 'AGA-101');
  assert.equal(r.status, 'pass');
  assert.deepEqual(r.evidence, ['Microsoft_365_Copilot: 100 seats']);
});
