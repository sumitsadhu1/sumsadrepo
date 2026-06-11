// Agent Governance Assessment — zero-dependency Node.js server.
// Run: node server.js   →   http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, save, loadCatalog, loadFixture } from './src/store.js';
import { evaluate, score, placeStage, STAGES } from './src/engine.js';
import { getRegister, upsertAgent, attestAgent } from './src/register.js';
import { getPlan, generatePlan, verifyPlan, setTaskStatus } from './src/plan.js';
import {
  getSettings, saveSettings, buildSnapshot, resetDemo,
  fixPreview, fixApply, deviceCodeStart, deviceCodePoll, liveCollect,
} from './src/collectors.js';
import { ensureAccessKey, verifyKey, createSession, getSession, canDo, permsFor } from './src/auth.js';
import { renderReport } from './src/report.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Permission denials must surface as 403, not a generic 400.
const forbid = (msg) => Object.assign(new Error(msg), { status: 403 });
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // localhost-only unless explicitly overridden
const QUESTIONS = loadCatalog('questionnaire');

// Answers are scoped per tenant mode; demo tenants may carry seeded answers in their fixture.
function getAnswers() {
  const mode = getSettings().mode;
  const existing = load('answers-' + mode, null);
  if (existing) return existing;
  let seed = {};
  if (mode !== 'live') {
    try { seed = structuredClone(loadFixture(mode).seed?.answers ?? {}); } catch {}
  }
  return save('answers-' + mode, seed);
}

function governanceFromAnswers() {
  const answers = getAnswers();
  const gov = {};
  for (const q of QUESTIONS) if (q.attests) gov[q.attests.split('.')[1]] = answers[q.id] === true;
  return gov;
}

function runAssessment() {
  const settings = getSettings();
  const snapshot = buildSnapshot(settings, governanceFromAnswers());
  const results = evaluate(snapshot);
  const scores = score(results);
  const placement = placeStage(results);
  const assessment = {
    at: new Date().toISOString(),
    mode: settings.mode,
    tenantName: snapshot.tenantName,
    results, scores, placement,
  };
  save('last-assessment', assessment);
  verifyPlan(results);
  const history = load('history', []);
  history.push({ at: assessment.at, mode: settings.mode, configScore: scores.configScore, attestScore: scores.attestScore, stage: placement.stage });
  save('history', history);
  return assessment;
}

const routes = {
  'GET /api/state': (_b, who) => ({
    identity: who,
    perms: permsFor(who?.role),
    settings: getSettings(),
    stages: STAGES,
    questions: QUESTIONS,
    answers: getAnswers(),
    assessment: load('last-assessment', null),
    plan: getPlan(),
    register: getRegister(getSettings().mode),
    audit: load('audit', []),
    history: load('history', []),
  }),
  'POST /api/settings': (b) => ({ settings: saveSettings({ ...getSettings(), ...b }) }),
  'POST /api/answers': (b) => ({ answers: save('answers-' + getSettings().mode, b) }),
  'POST /api/assess': () => ({ assessment: runAssessment(), plan: getPlan() }),
  'POST /api/plan/generate': (b) => {
    const a = load('last-assessment', null);
    if (!a) throw new Error('Run an assessment first');
    const target = b.targetStage || getAnswers().targetStage || 4;
    return { plan: generatePlan(a.results, Number(target)) };
  },
  'POST /api/plan/task': (b, who) => {
    if (!canDo(who?.role, 'plan')) throw forbid(`Role "${who?.role}" cannot update plan tasks — requires a plan-managing role`);
    return { plan: setTaskStatus(b.taskId, b.status, who?.name) };
  },
  'POST /api/register/agent': (b) => ({ register: upsertAgent(getSettings().mode, b) }),
  'POST /api/register/attest': (b, who) => {
    if (!canDo(who?.role, 'attest')) throw forbid(`Role "${who?.role}" cannot attest — attestation is a decision-right (Global Admin, AI Governance Lead, Compliance Admin, Agent Owner)`);
    return { register: attestAgent(getSettings().mode, b.id, `${who?.name} (${who?.role})`, b.note) };
  },
  'POST /api/demo/reset': () => {
    const s = getSettings();
    if (s.mode === 'live') throw new Error('Reset applies to demo tenants only');
    resetDemo(s.mode);
    return { ok: true };
  },
  'POST /api/fix/preview': (b) => {
    const s = getSettings();
    if (s.mode === 'live') throw new Error('Configuration is demo-only in this MVP — live mode is read-only by design');
    return { preview: fixPreview(s.mode, b.checkId) };
  },
  'POST /api/fix/apply': (b, who) => {
    if (!canDo(who?.role, 'fix')) throw forbid(`Role "${who?.role}" cannot approve configuration changes — requires Global Admin, Security Admin, or AI Governance Lead`);
    const s = getSettings();
    if (s.mode === 'live') throw new Error('Configuration is demo-only in this MVP — live mode is read-only by design');
    const r = fixApply(s.mode, b.checkId, `${who?.name} (${who?.role})`);
    return { result: r, assessment: runAssessment(), plan: getPlan() };
  },
  'GET /api/export/findings.csv': () => {
    const a = load('last-assessment', null);
    if (!a) throw new Error('Run an assessment first');
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['id', 'control', 'stage', 'tier', 'type', 'status', 'title', 'persona', 'evidence']
      .join(',')];
    for (const r of a.results) {
      rows.push([r.id, r.controlName, r.stage, r.tier, r.type, r.status, q(r.title), q(r.persona), q((r.evidence ?? []).join(' | '))].join(','));
    }
    return { __raw: rows.join('\n'), __type: 'text/csv', __name: 'findings.csv' };
  },
  'GET /api/export/assessment.json': () => {
    const a = load('last-assessment', null);
    if (!a) throw new Error('Run an assessment first');
    return { __raw: JSON.stringify({ assessment: a, plan: getPlan(), register: getRegister(getSettings().mode) }, null, 2), __type: 'application/json', __name: 'assessment.json' };
  },
  'POST /api/live/start': async (b) => deviceCodeStart(b.tenantId, b.clientId),
  'POST /api/live/poll': async () => deviceCodePoll(),
  'POST /api/live/collect': async () => ({ snapshot: await liveCollect() }),
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = req.method + ' ' + url.pathname;

  if (key === 'POST /api/login') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
    const name = String(body.name || '').trim().slice(0, 60);
    if (verifyKey(body.key) && name) {
      const role = String(body.role || 'Operator').slice(0, 40);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `aga_session=${createSession(name, role)}; HttpOnly; SameSite=Strict; Path=/`,
      });
      res.end(JSON.stringify({ ok: true, identity: { name, role } }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: name ? 'Invalid access key' : 'Your name is required — actions are attributed' }));
    }
    return;
  }

  const identity = getSession(req.headers.cookie);
  if (url.pathname.startsWith('/api/') && !identity) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"error":"Sign in with the access key (printed when the server first started)"}');
    return;
  }

  if (key === 'GET /api/report') {
    const html = renderReport({
      assessment: load('last-assessment', null),
      plan: getPlan(),
      register: getRegister(getSettings().mode),
      history: load('history', []),
      generatedBy: `${identity.name} (${identity.role})`,
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (routes[key]) {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString() || '{}';
      try { body = JSON.parse(raw); } catch { body = {}; }
    }
    try {
      const out = await routes[key](body, identity);
      if (out && out.__raw !== undefined) {
        res.writeHead(200, { 'Content-Type': out.__type, 'Content-Disposition': `attachment; filename="${out.__name}"` });
        res.end(out.__raw);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      }
    } catch (e) {
      res.writeHead(e.status || 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // static files
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(ROOT, 'public', path.normalize(file).replace(/^([.][.][/\\])+/, ''));
  if (full.startsWith(path.join(ROOT, 'public')) && fs.existsSync(full) && fs.statSync(full).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(fs.readFileSync(full));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}).listen(PORT, HOST, () => {
  console.log(`Agent Governance Assessment running → http://localhost:${PORT}`);
  const freshKey = ensureAccessKey();
  if (freshKey) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log(`  │  ACCESS KEY (shown once):  ${freshKey}      │`);
    console.log('  └──────────────────────────────────────────────┘');
    console.log('  Enter it in the browser to sign in. Lost it? Delete app/data/auth.json and restart.');
  }
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn(`  WARNING: bound to ${HOST} — the UI is reachable from the network. Use only behind trusted access.`);
  }
});
