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
// Access tokens live in memory only; the refresh token is persisted encrypted
// (AES-256-GCM, key file with 0600 perms). Tokens are auto-refreshed on expiry.

import { encrypt, decrypt } from './secrets.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';
const SCOPES = [
  'Organization.Read.All',          // licensing
  'Policy.Read.All',                // conditional access
  'Application.Read.All',           // agent/app identities, credentials
  'InformationProtectionPolicy.Read', // sensitivity labels (best effort)
  'offline_access',
].join(' ');

let mem = { accessToken: null, expiresAt: 0 };

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

function storeTokens(flowOrCreds, j) {
  mem = { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in - 120) * 1000 };
  if (j.refresh_token) {
    save('live-token-enc', encrypt({
      tenantId: flowOrCreds.tenantId, clientId: flowOrCreds.clientId, refresh_token: j.refresh_token,
    }));
  }
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
  storeTokens(flow, j);
  return { pending: false };
}

async function ensureToken() {
  if (mem.accessToken && Date.now() < mem.expiresAt) return mem.accessToken;
  const blob = load('live-token-enc', null);
  const creds = blob && decrypt(blob);
  if (!creds) throw new Error('Not signed in — run the device-code flow first');
  const r = await fetch(`https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: creds.clientId,
      refresh_token: creds.refresh_token, scope: SCOPES,
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error('Session expired — sign in again (' + j.error + ')');
  storeTokens(creds, j);
  return mem.accessToken;
}

// GET with 429/503 backoff; follows @odata.nextLink up to maxPages.
async function graphGetAll(token, url, maxPages = 10) {
  const out = [];
  let next = url.startsWith('http') ? url : GRAPH + url;
  for (let page = 0; next && page < maxPages; page++) {
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(next, { headers: { Authorization: 'Bearer ' + token, ConsistencyLevel: 'eventual' } });
      if (r.status !== 429 && r.status !== 503) break;
      const wait = Number(r.headers.get('retry-after') || 2 ** attempt) * 1000;
      await new Promise((res) => setTimeout(res, wait));
    }
    if (!r.ok) return out.length ? out : null;
    const j = await r.json();
    out.push(...(j.value ?? []));
    next = j['@odata.nextLink'] ?? null;
  }
  return out;
}

// ---- pure transforms (unit-tested) ----

export function transformCaPolicies(policies) {
  const pols = (policies ?? []).filter((p) => p.state === 'enabled');
  const mfaAll = pols.filter((p) =>
    p.grantControls?.builtInControls?.includes('mfa') &&
    p.conditions?.users?.includeUsers?.includes('All'));
  const legacyBlocked = pols.filter((p) =>
    p.grantControls?.builtInControls?.includes('block') &&
    (p.conditions?.clientAppTypes ?? []).some((x) => ['exchangeActiveSync', 'other'].includes(x)));
  const riskCA = pols.filter((p) =>
    (p.conditions?.signInRiskLevels?.length ?? 0) > 0 || (p.conditions?.userRiskLevels?.length ?? 0) > 0);
  return {
    caBaseline: mfaAll.length > 0 && legacyBlocked.length > 0,
    riskBasedCAandPIM: riskCA.length > 0,
    evidence: {
      'AGA-301': [
        ...mfaAll.map((p) => `MFA-for-all policy: "${p.displayName}"`),
        ...legacyBlocked.map((p) => `Legacy-auth block: "${p.displayName}"`),
        ...(mfaAll.length ? [] : ['No enabled policy requires MFA for All users']),
        ...(legacyBlocked.length ? [] : ['No enabled policy blocks legacy authentication']),
      ],
      'AGA-302': riskCA.length
        ? riskCA.map((p) => `Risk-based policy: "${p.displayName}"`)
        : ['No enabled sign-in/user-risk policies found'],
    },
  };
}

const LONG_LIVED_DAYS = 730;

export function transformApplications(apps) {
  const list = apps ?? [];
  const orphaned = list.filter((a) => (a.owners ?? []).length === 0);
  const horizon = Date.now() + LONG_LIVED_DAYS * 86400000;
  const longLived = list.filter((a) =>
    (a.passwordCredentials ?? []).some((c) => !c.endDateTime || Date.parse(c.endDateTime) > horizon));
  return {
    appCount: list.length,
    orphanedAgentIdentities: orphaned.length,
    credentialRotation: list.length > 0 && longLived.length === 0,
    evidence: {
      'AGA-502': orphaned.length
        ? orphaned.slice(0, 10).map((a) => `Ownerless app identity: "${a.displayName}"`)
        : [`All ${list.length} app identities have owners`],
      'AGA-503': longLived.length
        ? longLived.slice(0, 10).map((a) => `Secret valid > ${LONG_LIVED_DAYS}d: "${a.displayName}"`)
        : [`No app secrets valid beyond ${LONG_LIVED_DAYS} days (${list.length} apps checked)`],
    },
  };
}

export function transformSkus(skuList) {
  const skus = skuList ?? [];
  const has = (frag) => skus.some((s) => (s.skuPartNumber || '').toUpperCase().includes(frag));
  const copilotSkus = skus.filter((s) => (s.skuPartNumber || '').toUpperCase().includes('COPILOT'));
  const copilotSeats = copilotSkus.reduce((sum, s) => sum + (s.prepaidUnits?.enabled ?? 0), 0);
  return {
    licenses: {
      copilotSeats,
      e3: has('ENTERPRISEPACK') || has('SPE_E3') || has('M365_E3'),
      e5: has('ENTERPRISEPREMIUM') || has('SPE_E5') || has('M365_E5'),
      sam: has('SHAREPOINTADVANCED'),
    },
    evidence: {
      'AGA-101': copilotSkus.length
        ? copilotSkus.map((s) => `${s.skuPartNumber}: ${s.prepaidUnits?.enabled ?? 0} seats (${s.consumedUnits ?? 0} assigned)`)
        : ['No Copilot SKUs found in subscribedSkus'],
    },
  };
}

// Collect what the consented read-only scopes can prove; leave the rest undefined
// so the engine reports "not collected" instead of guessing.
export async function liveCollect() {
  const t = await ensureToken();

  const [org, skus, caPolicies, apps, labels] = await Promise.all([
    graphGetAll(t, '/organization'),
    graphGetAll(t, '/subscribedSkus'),
    graphGetAll(t, '/identity/conditionalAccess/policies'),
    graphGetAll(t, '/applications?$expand=owners($select=id)&$select=id,displayName,passwordCredentials&$top=100', 20),
    graphGetAll(t, GRAPH_BETA + '/security/informationProtection/sensitivityLabels'), // best effort
  ]);

  const lic = transformSkus(skus);
  const ca = transformCaPolicies(caPolicies);
  const appx = transformApplications(apps);

  const snapshot = {
    tenantName: (org?.[0]?.displayName || 'Live tenant') + ' (live scan)',
    scannedAt: new Date().toISOString(),
    tenant: { licenses: lic.licenses },
    identity: { caBaseline: ca.caBaseline, riskBasedCAandPIM: ca.riskBasedCAandPIM },
    agents: apps ? {
      orphanedAgentIdentities: appx.orphanedAgentIdentities,
      credentialRotation: appx.credentialRotation,
    } : undefined,
    purview: labels !== null ? {
      sensitivityLabelsPublished: (labels ?? []).length > 0,
    } : undefined,
    evidence: {
      ...lic.evidence,
      ...ca.evidence,
      ...(apps ? appx.evidence : {}),
      ...(labels?.length ? { 'AGA-403': labels.slice(0, 10).map((l) => `Label: "${l.name ?? l.displayName}"`) } : {}),
    },
    // sharepoint/teams/finops + remaining purview intentionally absent → "not collected".
  };
  return save('live-snapshot', snapshot);
}
