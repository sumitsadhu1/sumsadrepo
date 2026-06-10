// Collectors produce the snapshot the engine evaluates.
// demo: fixture-backed, persisted so demo "fixes" survive restarts; reset restores the fixture.
// live: real Microsoft Graph via device-code flow (read-only scopes), covering a subset of
//       checks honestly — everything else reports "not collected".
import { load, save, loadFixture } from './store.js';
import { CHECKS, getPath, setPath } from './engine.js';
import { registerStats } from './register.js';

export function getSettings() {
  return load('settings', { mode: 'contoso', live: { tenantId: '', clientId: '' } });
}

export function saveSettings(s) {
  return save('settings', s);
}

// ---------- demo mode ----------

export function demoState(fixtureName) {
  const key = 'demo-' + fixtureName;
  const existing = load(key, null);
  if (existing) return existing;
  return save(key, loadFixture(fixtureName));
}

export function resetDemo(fixtureName) {
  // null out scoped stores so they re-seed lazily from the fixture
  save('register-' + fixtureName, null);
  save('answers-' + fixtureName, null);
  return save('demo-' + fixtureName, loadFixture(fixtureName));
}

// The Configure pipeline in demo form: dry-run shows the diff, apply mutates, verify = re-scan.
export function fixPreview(fixtureName, checkId) {
  const check = CHECKS.find((c) => c.id === checkId);
  if (!check?.fix?.demoEffect) return null;
  const snap = demoState(fixtureName);
  return {
    checkId,
    mode: check.fix.mode,
    summary: check.fix.summary,
    setting: check.fix.demoEffect.path,
    current: getPath(snap, check.fix.demoEffect.path),
    intended: check.fix.demoEffect.value,
    rollback: check.fix.mode === 'automated' ? 'automated' : 'documented',
  };
}

export function fixApply(fixtureName, checkId, approvedBy) {
  const check = CHECKS.find((c) => c.id === checkId);
  if (!check?.fix?.demoEffect) return null;
  const key = 'demo-' + fixtureName;
  const snap = demoState(fixtureName);
  const before = getPath(snap, check.fix.demoEffect.path);
  setPath(snap, check.fix.demoEffect.path, check.fix.demoEffect.value);
  save(key, snap);
  const audit = load('audit', []);
  audit.push({
    at: new Date().toISOString(), checkId, mode: check.fix.mode,
    setting: check.fix.demoEffect.path, before, after: check.fix.demoEffect.value,
    approvedBy: approvedBy || 'demo-user', environment: fixtureName,
  });
  save('audit', audit);
  return { ok: true, before, after: check.fix.demoEffect.value };
}

// ---------- snapshot assembly (both modes) ----------

export function buildSnapshot(settings, governance) {
  let base;
  if (settings.mode === 'live') base = load('live-snapshot', { tenantName: 'Live tenant (not yet scanned)' });
  else base = demoState(settings.mode);
  return { ...structuredClone(base), registerStats: registerStats(settings.mode), governance };
}

// ---------- live mode: device-code flow + Graph, zero dependencies ----------

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Organization.Read.All Policy.Read.All offline_access';

export async function deviceCodeStart(tenantId, clientId) {
  const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPES }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error_description || j.error);
  save('device-flow', { tenantId, clientId, device_code: j.device_code, interval: j.interval || 5 });
  return { userCode: j.user_code, verificationUri: j.verification_uri, message: j.message };
}

export async function deviceCodePoll() {
  const flow = load('device-flow', null);
  if (!flow) throw new Error('No device flow in progress');
  const r = await fetch(`https://login.microsoftonline.com/${flow.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: flow.clientId,
      device_code: flow.device_code,
    }),
  });
  const j = await r.json();
  if (j.error === 'authorization_pending') return { pending: true };
  if (j.error) throw new Error(j.error_description || j.error);
  save('live-token', { access_token: j.access_token, obtained: Date.now() });
  return { pending: false };
}

async function graphGet(token, path) {
  const r = await fetch(GRAPH + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return r.json();
}

// Collect what the consented read-only scopes can prove; leave the rest undefined
// so the engine reports "not collected" instead of guessing.
export async function liveCollect() {
  const tok = load('live-token', null);
  if (!tok) throw new Error('Not signed in — run the device-code flow first');
  const t = tok.access_token;

  const [org, skus, caPolicies] = await Promise.all([
    graphGet(t, '/organization'),
    graphGet(t, '/subscribedSkus'),
    graphGet(t, '/identity/conditionalAccess/policies'),
  ]);

  const skuList = skus?.value ?? [];
  const has = (frag) => skuList.some((s) => (s.skuPartNumber || '').toUpperCase().includes(frag));
  const copilotSeats = skuList
    .filter((s) => (s.skuPartNumber || '').toUpperCase().includes('COPILOT'))
    .reduce((sum, s) => sum + (s.prepaidUnits?.enabled ?? 0), 0);

  const pols = (caPolicies?.value ?? []).filter((p) => p.state === 'enabled');
  const mfaAll = pols.some((p) =>
    p.grantControls?.builtInControls?.includes('mfa') &&
    p.conditions?.users?.includeUsers?.includes('All'));
  const legacyBlocked = pols.some((p) =>
    p.grantControls?.builtInControls?.includes('block') &&
    (p.conditions?.clientAppTypes ?? []).some((x) => ['exchangeActiveSync', 'other'].includes(x)));
  const riskCA = pols.some((p) =>
    (p.conditions?.signInRiskLevels?.length ?? 0) > 0 || (p.conditions?.userRiskLevels?.length ?? 0) > 0);

  const snapshot = {
    tenantName: (org?.value?.[0]?.displayName || 'Live tenant') + ' (live scan)',
    scannedAt: new Date().toISOString(),
    tenant: { licenses: { copilotSeats, e3: has('ENTERPRISEPACK') || has('E3') || has('SPE_E3'), e5: has('ENTERPRISEPREMIUM') || has('SPE_E5') || has('E5'), sam: has('SHAREPOINTADVANCED') } },
    identity: { caBaseline: mfaAll && legacyBlocked, riskBasedCAandPIM: riskCA },
    // sharepoint/purview/teams/agents/finops intentionally absent → "not collected".
  };
  return save('live-snapshot', snapshot);
}
