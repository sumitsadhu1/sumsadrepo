import { test } from 'node:test';
import assert from 'node:assert';
import { encrypt, decrypt } from '../src/secrets.js';
import { ensureAccessKey, verifyKey, createSession, checkSession } from '../src/auth.js';
import {
  transformCaPolicies, transformApplications, transformSkus,
  transformDirectoryRoles, transformAuditQueries, transformSpoSettings, transformAuthorizationPolicy,
} from '../src/collectors.js';
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

test('FEEDBACK §14.1: E5 suite detection covers unbundled/EEA variants, excludes add-ons', () => {
  const e5 = (parts) => transformSkus(parts.map((p) => ({ skuPartNumber: p }))).licenses.e5;
  // Verified against the Microsoft licensing reference (product names & service plan IDs):
  assert.equal(e5(['Microsoft_365_E5_(no_Teams)']), true, 'the post-2024 unbundled SKU IS E5');
  assert.equal(e5(['Microsoft_365_E5_EEA_(no_Teams)_without_Audio_Conferencing']), true);
  assert.equal(e5(['SPE_E5_NOPSTNCONF']), true);
  assert.equal(e5(['Office_365_w/o_Teams_Bundle_E5']), true);
  assert.equal(e5(['ENTERPRISEPREMIUM_NOPSTNCONF']), true);
  assert.equal(e5(['M365EDU_A5_FACULTY']), true);
  // E5 Security add-on alone is NOT the optimized suite — must not unlock O-tier checks:
  assert.equal(e5(['IDENTITY_THREAT_PROTECTION_FOR_EMS_E5']), false);
  assert.equal(e5(['SPE_E3', 'FLOW_FREE']), false);
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

test('LIVE FINDING: blocked/failed collection can never fabricate a fail or a zero', () => {
  // Discovered live: with graph.microsoft.com unreachable, the scan reported
  // "CA baseline: fail" and "0 Copilot seats". All transforms must return null
  // on failed collection so the engine reports not-collected instead.
  assert.equal(transformCaPolicies(null), null);
  assert.equal(transformSkus(null), null);
  assert.equal(transformApplications(null), null);
  // and a snapshot missing those sections evaluates to not-collected, not fail
  const r = evaluate({ tenant: undefined, identity: undefined });
  assert.equal(r.find((x) => x.id === 'AGA-301').status, 'not-collected');
  assert.equal(r.find((x) => x.id === 'AGA-101').status, 'not-collected');
});

test('directory-roles transform: AI Administrator delegation measured, GA count in evidence', () => {
  const out = transformDirectoryRoles([
    { displayName: 'AI Administrator', members: [{ id: 'u1' }, { id: 'u2' }] },
    { displayName: 'Global Administrator', members: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }, { id: 'u5' }, { id: 'u6' }] },
  ]);
  assert.equal(out.aiAdminDelegated, true);
  assert.ok(out.evidence['AGA-203'][0].includes('2 member(s)'));
  assert.ok(out.evidence['AGA-203'][1].includes('review for least privilege'), 'GA > 5 must flag least-privilege review');

  const none = transformDirectoryRoles([{ displayName: 'Global Administrator', members: [{ id: 'u1' }] }]);
  assert.equal(none.aiAdminDelegated, false);
  assert.ok(none.evidence['AGA-203'][0].includes('not activated'));

  assert.equal(transformDirectoryRoles(null), null, 'collection failure must not fabricate a measurement');
});

test('audit transform: reachable API measures AGA-901 as proxy; failure stays not-collected', () => {
  const out = transformAuditQueries([]); // reachable, no saved queries — still proves the audit store answers
  assert.equal(out.auditCopilotInteractions, true);
  assert.ok(out.evidence['AGA-901'].some((e) => e.includes('Proxy measurement')), 'evidence must declare the proxy nature');
  assert.equal(transformAuditQueries(null), null);
});

test('context-only transforms attach evidence without flipping any check', () => {
  const spo = transformSpoSettings({ sharingCapability: 'externalUserSharingOnly', isResharingByExternalUsersEnabled: false });
  assert.ok(!('interimBrakes' in spo), 'must not fabricate an AGA-402 measurement');
  assert.ok(spo.evidence['AGA-402'].some((e) => e.includes('Context only')));

  const auth = transformAuthorizationPolicy({ allowInvitesFrom: 'adminsAndGuestInviters' });
  assert.ok(auth.evidence['AGA-410'][0].includes('adminsAndGuestInviters'));
  assert.equal(transformSpoSettings(null), null);
  assert.equal(transformAuthorizationPolicy(null), null);
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
