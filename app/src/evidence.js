// Evidence Pack: measured config collected out-of-band by scripts/collect-evidence.ps1
// (SharePoint Online Management Shell + Security & Compliance PowerShell — surfaces
// Microsoft exposes nowhere in Graph). The pack is a third snapshot source with its
// own provenance: every value it contributes is labelled with who collected it, when,
// and who imported it. Packs expire after PACK_MAX_AGE_DAYS — an expired pack stops
// contributing values (its checks fall back to not-collected) but leaves a dated
// note in evidence so the regression is visible, not silent.
import { load, save } from './store.js';
import { setPath } from './engine.js';

export const PACK_SCHEMA = 'aga-evidence-pack/v1';
export const PACK_MAX_AGE_DAYS = 30;

// The only snapshot paths a pack may set, the check each one feeds, and the
// value type enforced at import. Anything else in a pack is dropped and reported.
export const PACK_PATHS = {
  'sharepoint.dagReportLastRunDays': { check: 'AGA-401', type: 'number' },
  'sharepoint.interimBrakes': { check: 'AGA-402', type: 'boolean' },
  'sharepoint.siteLifecycleManagement': { check: 'AGA-409', type: 'boolean' },
  'teams.protectionReviewed': { check: 'AGA-410', type: 'boolean' },
  'purview.sensitivityLabelsPublished': { check: 'AGA-403', type: 'boolean' },
  'purview.dlpPoliciesActive': { check: 'AGA-404', type: 'boolean' },
  'purview.auditCopilotInteractions': { check: 'AGA-901', type: 'boolean' },
  'purview.retentionForAiInteractions': { check: 'AGA-903', type: 'boolean' },
};

const MAX_EVIDENCE_LINES = 10;
const MAX_LINE_LEN = 300;

export function validatePack(raw) {
  const errors = [];
  const dropped = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Pack is not a JSON object'] };
  if (raw.schema !== PACK_SCHEMA) errors.push(`Unsupported schema "${raw.schema}" — expected ${PACK_SCHEMA}`);
  const collectedAt = Date.parse(raw.collectedAt);
  if (Number.isNaN(collectedAt)) errors.push('collectedAt missing or not an ISO date');
  if (!raw.collectedBy || typeof raw.collectedBy !== 'string') errors.push('collectedBy (UPN of the collecting admin) is required');

  const values = {};
  for (const [path, value] of Object.entries(raw.values ?? {})) {
    const spec = PACK_PATHS[path];
    if (!spec) { dropped.push(path); continue; }
    if (typeof value !== spec.type) { errors.push(`${path}: expected ${spec.type}, got ${typeof value}`); continue; }
    values[path] = value;
  }
  if (!Object.keys(values).length) errors.push('Pack contains no recognised measurements');

  const evidence = {};
  const allowedChecks = new Set(Object.values(PACK_PATHS).map((p) => p.check));
  for (const [checkId, lines] of Object.entries(raw.evidence ?? {})) {
    if (!allowedChecks.has(checkId) || !Array.isArray(lines)) continue;
    evidence[checkId] = lines.filter((l) => typeof l === 'string').slice(0, MAX_EVIDENCE_LINES)
      .map((l) => l.slice(0, MAX_LINE_LEN));
  }

  if (errors.length) return { ok: false, errors, dropped };
  return {
    ok: true,
    dropped,
    pack: {
      schema: PACK_SCHEMA,
      collectedAt: new Date(collectedAt).toISOString(),
      collectedBy: raw.collectedBy.slice(0, 120),
      tool: typeof raw.tool === 'string' ? raw.tool.slice(0, 80) : 'unknown',
      values,
      evidence,
    },
  };
}

export function importPack(mode, raw, importedBy) {
  const v = validatePack(raw);
  if (!v.ok) {
    const e = new Error('Evidence pack rejected: ' + v.errors.join('; '));
    e.status = 400;
    throw e;
  }
  save('evidence-pack-' + mode, { ...v.pack, importedBy, importedAt: new Date().toISOString() });
  return { summary: packSummary(mode), droppedPaths: v.dropped };
}

export function clearPack(mode) {
  save('evidence-pack-' + mode, null);
}

function ageDays(pack) {
  return Math.floor((Date.now() - Date.parse(pack.collectedAt)) / 86400000);
}

export function packSummary(mode) {
  const pack = load('evidence-pack-' + mode, null);
  if (!pack) return null;
  const age = ageDays(pack);
  return {
    collectedAt: pack.collectedAt,
    collectedBy: pack.collectedBy,
    importedBy: pack.importedBy,
    importedAt: pack.importedAt,
    tool: pack.tool,
    ageDays: age,
    maxAgeDays: PACK_MAX_AGE_DAYS,
    expired: age > PACK_MAX_AGE_DAYS,
    checks: [...new Set(Object.keys(pack.values).map((p) => PACK_PATHS[p].check))].sort(),
  };
}

// Merge the pack into a snapshot. Pack values OVERRIDE collector values for the
// paths they measure (the pack is admin-collected primary source for surfaces
// Graph cannot see) — but only while the pack is fresh. Evidence from both
// sources is kept; pack lines are prefixed with full provenance.
export function applyPack(mode, snapshot) {
  const pack = load('evidence-pack-' + mode, null);
  if (!pack) return snapshot;
  const age = ageDays(pack);
  const when = new Date(pack.collectedAt).toLocaleDateString();
  snapshot.evidence = snapshot.evidence ?? {};

  if (age > PACK_MAX_AGE_DAYS) {
    for (const path of Object.keys(pack.values)) {
      const check = PACK_PATHS[path].check;
      snapshot.evidence[check] = [
        `EXPIRED evidence pack (collected ${when}, ${age}d old > ${PACK_MAX_AGE_DAYS}d limit) — measurement ignored; re-run scripts/collect-evidence.ps1`,
        ...(snapshot.evidence[check] ?? []),
      ];
    }
    return snapshot;
  }

  for (const [path, value] of Object.entries(pack.values)) {
    const check = PACK_PATHS[path].check;
    setPath(snapshot, path, value);
    snapshot.evidence[check] = [
      `Measured via evidence pack — collected ${when} (${age}d ago) by ${pack.collectedBy}, imported by ${pack.importedBy}`,
      ...(pack.evidence?.[check] ?? []),
      ...(snapshot.evidence[check] ?? []),
    ].slice(0, MAX_EVIDENCE_LINES + 2);
  }
  return snapshot;
}
