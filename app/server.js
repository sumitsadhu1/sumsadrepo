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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
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
  'GET /api/state': () => ({
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
  'POST /api/plan/task': (b) => ({ plan: setTaskStatus(b.taskId, b.status) }),
  'POST /api/register/agent': (b) => ({ register: upsertAgent(getSettings().mode, b) }),
  'POST /api/register/attest': (b) => ({ register: attestAgent(getSettings().mode, b.id) }),
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
  'POST /api/fix/apply': (b) => {
    const s = getSettings();
    if (s.mode === 'live') throw new Error('Configuration is demo-only in this MVP — live mode is read-only by design');
    const r = fixApply(s.mode, b.checkId, b.approvedBy);
    return { result: r, assessment: runAssessment(), plan: getPlan() };
  },
  'POST /api/live/start': async (b) => deviceCodeStart(b.tenantId, b.clientId),
  'POST /api/live/poll': async () => deviceCodePoll(),
  'POST /api/live/collect': async () => ({ snapshot: await liveCollect() }),
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = req.method + ' ' + url.pathname;

  if (routes[key]) {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString() || '{}';
      try { body = JSON.parse(raw); } catch { body = {}; }
    }
    try {
      const out = await routes[key](body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
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
}).listen(PORT, () => {
  console.log(`Agent Governance Assessment running → http://localhost:${PORT}`);
});
