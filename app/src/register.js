// The Agent Governance Register: the system of record for what no tenant API returns.
// registerStats turns "you can't measure it" into "you can query it".
// Register data is scoped per tenant mode so each demo tenant tells its own story.
import { load, save, loadFixture } from './store.js';

const ATTEST_DAYS = 90;

function seedFor(mode) {
  if (mode === 'live') return { agents: [] };
  try {
    const agents = structuredClone(loadFixture(mode).seed?.agents ?? []);
    // fixtures use "now" so seeded attestations are always current at first load
    for (const a of agents) if (a.lastAttested === 'now') a.lastAttested = new Date().toISOString();
    return { agents };
  } catch { return { agents: [] }; }
}

export function getRegister(mode) {
  const existing = load('register-' + mode, null);
  if (existing) return existing;
  return save('register-' + mode, seedFor(mode));
}

export function saveRegister(mode, reg) {
  return save('register-' + mode, reg);
}

export function upsertAgent(mode, agent) {
  const reg = getRegister(mode);
  const i = reg.agents.findIndex((a) => a.id === agent.id);
  if (i >= 0) reg.agents[i] = { ...reg.agents[i], ...agent };
  else reg.agents.push({ id: 'agt-' + Date.now().toString(36), ...agent });
  return saveRegister(mode, reg);
}

export function removeAgent(mode, id) {
  const reg = getRegister(mode);
  reg.agents = reg.agents.filter((a) => a.id !== id);
  return saveRegister(mode, reg);
}

export function attestAgent(mode, id, by, note) {
  const reg = getRegister(mode);
  const a = reg.agents.find((x) => x.id === id);
  if (a) {
    a.lastAttested = new Date().toISOString();
    a.lastAttestedBy = by || 'unknown';
    if (note) a.attestNote = note;
  }
  return saveRegister(mode, reg);
}

export function registerStats(mode) {
  const { agents } = getRegister(mode);
  const n = agents.length;
  const pct = (f) => (n === 0 ? 0 : Math.round((100 * agents.filter(f).length) / n));
  const current = (a) => a.lastAttested && (Date.now() - Date.parse(a.lastAttested)) / 86400000 <= ATTEST_DAYS;
  return {
    agentCount: n,
    ownersCompletePct: pct((a) => a.businessOwner && a.technicalOwner && a.dataOwner && a.securityOwner),
    attestationsCurrentPct: pct(current),
    autonomyTieredPct: pct((a) => !!a.autonomyTier && !!a.riskTier),
    identityModePct: pct((a) => !!a.identityMode),
    valueHypothesisPct: pct((a) => !!a.valueHypothesis),
    freshnessOk: n > 0 && agents.every(current),
  };
}
