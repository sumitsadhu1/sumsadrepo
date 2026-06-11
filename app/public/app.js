/* Agent Governance Assessment — UI (vanilla JS, no build step) */
let S = null; // server state

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await res.json();
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Sign in required'); }
  if (!res.ok) throw new Error(j.error || 'Request failed');
  return j;
}

function showLogin() {
  $('#modal-card').innerHTML = `
    <h2>Sign in</h2>
    <p class="muted">Enter the access key printed in the server console when it first started.
    (Lost it? Delete <code>app/data/auth.json</code> and restart the server.)</p>
    <input id="login-key" type="password" placeholder="Access key" style="width:100%" autofocus>
    <div class="modal-actions"><button class="primary" onclick="doLogin()">Sign in</button></div>
    <div id="login-err" class="muted"></div>`;
  $('#modal').classList.remove('hidden');
}

window.doLogin = async function () {
  try {
    await api('/api/login', { key: $('#login-key').value.trim() });
    closeModal();
    await refresh();
  } catch (e) {
    $('#login-err').textContent = e.message;
  }
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

async function refresh() {
  S = await api('/api/state');
  $('#mode-select').value = S.settings.mode;
  $('#tenant-name').textContent = S.assessment
    ? `${S.assessment.tenantName} — scanned ${new Date(S.assessment.at).toLocaleString()}`
    : 'No assessment yet — pick a tenant and click Run assessment';
  renderAll();
}

function renderAll() {
  renderOverview(); renderFindings(); renderPlan(); renderRegister(); renderQuestionnaire(); renderAudit(); renderSettings();
}

/* ---------- Overview ---------- */
function renderOverview() {
  const el = $('#tab-overview');
  if (!S.assessment) {
    el.innerHTML = `<div class="card"><h3>Welcome</h3>
      <p class="quote">"Who has the right to approve, change, promote, fund, or retire an agent?"</p>
      <p>Pick a tenant mode (two demo tenants, or your live tenant) and click <b>Run assessment</b>.
      Then answer the <b>Questionnaire</b> — it records what no tenant API can see — and generate your <b>Plan</b>.</p></div>`;
    return;
  }
  const { scores, placement } = S.assessment;
  const stages = S.stages.stages.map((s) => {
    const cls = s.n < placement.stage ? 'passed' : s.n === placement.stage ? 'current' : '';
    return `<div class="stage-chip ${cls}"><b>Stage ${s.n} — ${esc(s.name)}</b><small>${esc(s.tagline)}</small></div>`;
  }).join('');
  const gap = (scores.configScore ?? 0) - (scores.attestScore ?? 0);
  const bars = Object.entries(scores.perControl).map(([n, c]) => `
    <div class="bar-row">
      <div class="bar-label">${n}. ${esc(c.name)}</div>
      <div class="bar config"><i style="width:${c.config ?? 0}%"></i><span>${c.config == null ? 'n/a' : c.config + '%'} config</span></div>
      <div class="bar attest"><i style="width:${c.attest ?? 0}%"></i><span>${c.attest == null ? 'n/a' : c.attest + '%'} attest</span></div>
    </div>`).join('');
  el.innerHTML = `
    <div class="stageline">${stages}</div>
    <div class="cards">
      <div class="card"><h3>Config score</h3><div class="big">${scores.configScore ?? '—'}%</div><div class="muted">objective, from the tenant scan</div></div>
      <div class="card"><h3>Attestation completeness</h3><div class="big">${scores.attestScore ?? '—'}%</div><div class="muted">governance recorded &amp; current</div></div>
      <div class="card gap-callout"><h3>The gap</h3><div class="big">${gap > 0 ? gap : 0} pts</div><div class="muted">config-ready but governance-untracked — the number most assessments miss</div></div>
      <div class="card"><h3>Unlockable (E5)</h3><div class="big">${scores.unlockable.length}</div><div class="muted">checks gated by licensing${scores.notCollected.length ? ` · ${scores.notCollected.length} not collected in this mode` : ''}</div></div>
    </div>
    <div class="card"><h3>Per-control: evidence layer vs decision layer</h3><div class="bars">${bars}</div></div>`;
}

/* ---------- Findings ---------- */
function renderFindings() {
  const el = $('#tab-findings');
  if (!S.assessment) { el.innerHTML = '<p class="muted">Run an assessment first.</p>'; return; }
  const rows = S.assessment.results.map((r) => `
    <tr>
      <td><b>${r.id}</b><br><span class="muted">${esc(r.controlName)} · S${r.stage} · ${r.tier === 'O' ? 'E5' : 'E3'}</span></td>
      <td>${esc(r.title)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}
        ${r.evidence?.length ? `<ul class="evidence">${r.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</td>
      <td><span class="pill ${r.status}">${r.status}</span><br><span class="pill mode">${r.type}</span></td>
      <td class="row-actions">${r.status === 'fail' && r.canDemoFix && S.settings.mode !== 'live'
        ? `<button class="small primary" onclick="openFix('${r.id}')">Fix…</button>` : ''}
        ${r.portal ? `<a href="${r.portal}" target="_blank"><button class="small">Portal</button></a>` : ''}</td>
    </tr>`).join('');
  el.innerHTML = `<table><thead><tr><th>Check</th><th>Finding</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- Configure pipeline (demo): dry-run → approve → apply → verify ---------- */
window.openFix = async function (checkId) {
  const { preview } = await api('/api/fix/preview', { checkId });
  if (!preview) { toast('No automated fix available — see guided steps in the Plan'); return; }
  $('#modal-card').innerHTML = `
    <h2>Dry run — ${esc(preview.checkId)}</h2>
    <p>${esc(preview.summary)}</p>
    <div class="diff">
      <div>setting: <b>${esc(preview.setting)}</b></div>
      <div class="del">- current:  ${esc(JSON.stringify(preview.current))}</div>
      <div class="add">+ intended: ${esc(JSON.stringify(preview.intended))}</div>
    </div>
    <p class="muted">Mode: ${esc(preview.mode)} · Rollback: ${esc(preview.rollback)} · Execution is followed by automatic re-scan verification. Every apply is recorded in the Audit tab.</p>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="applyFix('${esc(preview.checkId)}')">Approve &amp; apply</button>
    </div>`;
  $('#modal').classList.remove('hidden');
};

window.applyFix = async function (checkId) {
  closeModal();
  await api('/api/fix/apply', { checkId, approvedBy: 'you' });
  toast(checkId + ' applied — re-scan verified, plan updated');
  await refresh();
};

window.closeModal = () => $('#modal').classList.add('hidden');

/* ---------- Plan ---------- */
function renderPlan() {
  const el = $('#tab-plan');
  const target = S.answers.targetStage || 4;
  const head = `<div class="cards"><div class="card"><h3>Plan</h3>
    <p class="muted">Generated from the gap between current state and target stage. Tasks auto-close when a re-scan proves the check passes, and reopen on drift.</p>
    <button class="primary" onclick="genPlan()">Generate / regenerate plan (target: Stage ${target})</button></div></div>`;
  if (!S.plan) { el.innerHTML = head + '<p class="muted">No plan yet.</p>'; return; }
  const stageName = (n) => S.stages.stages.find((s) => s.n === n)?.name ?? n;
  const phases = [...new Set(S.plan.tasks.map((t) => t.phase))].sort();
  const blocks = phases.map((p) => {
    const rows = S.plan.tasks.filter((t) => t.phase === p).map((t) => `
      <tr>
        <td><b>${esc(t.checkId)}</b><br><span class="muted">${esc(t.control)}</span></td>
        <td>${esc(t.title)}<br><span class="muted">${esc(t.action)}</span>
          ${t.dependsOn.length ? `<br><span class="muted">after: ${t.dependsOn.join(', ')}</span>` : ''}</td>
        <td>${esc(t.persona)}<br><span class="muted">effort ${esc(t.effort)}</span></td>
        <td><span class="pill mode">${esc(t.mode)}</span></td>
        <td><span class="pill ${t.status}">${t.status}</span>${t.autoVerified ? '<br><span class="muted">auto-verified</span>' : ''}</td>
        <td class="row-actions">
          ${t.status !== 'done' ? `<button class="small" onclick="taskDone('${t.id}')">Mark done</button>` : ''}
          ${t.portal ? `<a href="${t.portal}" target="_blank"><button class="small">Portal</button></a>` : ''}
        </td>
      </tr>`).join('');
    const open = S.plan.tasks.filter((t) => t.phase === p && t.status !== 'done').length;
    return `<div class="phase-block"><h3>Phase: Stage ${p} — ${esc(stageName(p))} <span class="muted">(${open} open)</span></h3>
      <table><thead><tr><th>Check</th><th>Task</th><th>Persona</th><th>Mode</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('');
  el.innerHTML = head + blocks;
}

window.genPlan = async function () {
  try { await api('/api/plan/generate', {}); toast('Plan generated'); await refresh(); $('[data-tab=plan]').click(); }
  catch (e) { toast(e.message); }
};
window.taskDone = async function (id) { await api('/api/plan/task', { taskId: id, status: 'done' }); await refresh(); };

/* ---------- Register ---------- */
function renderRegister() {
  const el = $('#tab-register');
  const days = (iso) => iso ? Math.round((Date.now() - Date.parse(iso)) / 86400000) : null;
  const rows = S.register.agents.map((a) => {
    const d = days(a.lastAttested);
    const stale = d == null || d > 90;
    return `<tr>
      <td><b>${esc(a.name)}</b><br><span class="muted">${esc(a.id)}</span></td>
      <td>${esc(a.businessOwner || '—')} / ${esc(a.technicalOwner || '—')}<br>${esc(a.dataOwner || '—')} / ${esc(a.securityOwner || '—')}</td>
      <td>${esc(a.riskTier || '—')} · ${esc(a.autonomyTier || '—')}<br><span class="muted">${esc(a.identityMode || 'identity mode?')}</span></td>
      <td>${esc(a.valueHypothesis || '—')}</td>
      <td>${d == null ? '<span class="pill fail">never</span>' : `<span class="pill ${stale ? 'fail' : 'pass'}">${d}d ago</span>`}</td>
      <td><button class="small" onclick="attest('${a.id}')">Attest</button></td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="note">The register holds what no tenant API returns: owners, tiers, value hypotheses, attestations. ATTEST checks read from here — fill it and re-run the assessment.</div>
    <form class="inline-form" onsubmit="return addAgent(event)">
      <input name="name" placeholder="Agent name *" required>
      <input name="businessOwner" placeholder="Business owner">
      <input name="technicalOwner" placeholder="Technical owner">
      <input name="dataOwner" placeholder="Data owner">
      <input name="securityOwner" placeholder="Security owner">
      <select name="riskTier"><option value="">Risk tier…</option><option>low</option><option>medium</option><option>high</option></select>
      <select name="autonomyTier"><option value="">Autonomy…</option><option>suggest</option><option>act-with-approval</option><option>autonomous</option></select>
      <select name="identityMode"><option value="">Identity mode…</option><option>on-behalf-of</option><option>own-identity</option></select>
      <input name="valueHypothesis" placeholder="Value hypothesis">
      <button class="primary">Add / update agent</button>
    </form>
    <table><thead><tr><th>Agent</th><th>Owners (biz/tech, data/sec)</th><th>Tiers</th><th>Value hypothesis</th><th>Attested</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No agents registered yet.</td></tr>'}</tbody></table>`;
}

window.addAgent = async function (ev) {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target).entries());
  await api('/api/register/agent', f);
  ev.target.reset();
  toast('Agent saved — re-run the assessment to update ATTEST checks');
  await refresh();
  return false;
};
window.attest = async function (id) { await api('/api/register/attest', { id }); toast('Attested'); await refresh(); };

/* ---------- Questionnaire ---------- */
function renderQuestionnaire() {
  const el = $('#tab-questionnaire');
  const blocks = S.questions.map((q) => {
    const a = S.answers[q.id];
    if (q.type === 'bool') {
      return `<div class="qq"><div class="q">${esc(q.question)}</div>
        <label><input type="radio" name="${q.id}" value="true" ${a === true ? 'checked' : ''}> Yes</label>
        <label><input type="radio" name="${q.id}" value="false" ${a === false ? 'checked' : ''}> No / don't know</label>
        ${q.hint ? `<div class="muted">${esc(q.hint)}</div>` : ''}</div>`;
    }
    const opts = q.options.map((o) => `<label><input type="radio" name="${q.id}" value="${esc(o.value)}" ${String(a) === String(o.value) ? 'checked' : ''}> ${esc(o.label)}</label><br>`).join('');
    return `<div class="qq"><div class="q">${esc(q.question)}</div>${opts}</div>`;
  }).join('');
  el.innerHTML = `
    <div class="note">Answers seed the attestation layer (governance signals no API can read) and set your target stage. After saving, re-run the assessment.</div>
    <form onsubmit="return saveAnswers(event)">${blocks}
    <button class="primary">Save answers</button></form>`;
}

window.saveAnswers = async function (ev) {
  ev.preventDefault();
  const out = {};
  for (const q of S.questions) {
    const v = ev.target.querySelector(`[name=${q.id}]:checked`)?.value;
    if (v === undefined) continue;
    out[q.id] = q.type === 'bool' ? v === 'true' : (isNaN(Number(v)) ? v : Number(v));
  }
  await api('/api/answers', out);
  toast('Saved — re-run the assessment to apply');
  await refresh();
  return false;
};

/* ---------- Audit ---------- */
function renderAudit() {
  const el = $('#tab-audit');
  const rows = [...S.audit].reverse().map((a) => `
    <tr><td>${new Date(a.at).toLocaleString()}</td><td><b>${esc(a.checkId)}</b></td>
    <td>${esc(a.setting)}</td><td>${esc(JSON.stringify(a.before))} → ${esc(JSON.stringify(a.after))}</td>
    <td>${esc(a.approvedBy)}</td><td>${esc(a.environment)}</td></tr>`).join('');
  const hist = [...S.history].reverse().slice(0, 12).map((h) => `
    <tr><td>${new Date(h.at).toLocaleString()}</td><td>${esc(h.mode)}</td><td>Stage ${h.stage}</td>
    <td>${h.configScore ?? '—'}%</td><td>${h.attestScore ?? '—'}%</td></tr>`).join('');
  el.innerHTML = `
    <h3>Configuration changes (who approved, what changed)</h3>
    <table><thead><tr><th>When</th><th>Check</th><th>Setting</th><th>Before → after</th><th>Approved by</th><th>Env</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No changes applied yet.</td></tr>'}</tbody></table>
    <h3 style="margin-top:24px">Assessment history (trajectory)</h3>
    <table><thead><tr><th>When</th><th>Mode</th><th>Stage</th><th>Config</th><th>Attest</th></tr></thead>
    <tbody>${hist || '<tr><td colspan="5" class="muted">No runs yet.</td></tr>'}</tbody></table>`;
}

/* ---------- Settings ---------- */
function renderSettings() {
  const el = $('#tab-settings');
  const live = S.settings.live || {};
  el.innerHTML = `
    <div class="cards">
      <div class="card">
        <h3>Demo tenants</h3>
        <p class="muted">Contoso (early journey) and Fabrikam (governing agents). Demo fixes persist; reset restores the original fixture.</p>
        <button onclick="resetDemo()">Reset current demo tenant</button>
      </div>
      <div class="card">
        <h3>Live tenant (read-only)</h3>
        <p class="muted">Create an Entra app registration (public client), grant delegated <b>Organization.Read.All</b> and <b>Policy.Read.All</b>, then sign in with a device code. Live mode never writes — configuration stays demo-only in this MVP.</p>
        <input id="live-tenant" placeholder="Tenant ID" value="${esc(live.tenantId || '')}" style="width:100%;margin-bottom:6px">
        <input id="live-client" placeholder="App (client) ID" value="${esc(live.clientId || '')}" style="width:100%;margin-bottom:6px">
        <button class="primary" onclick="liveStart()">Sign in with device code</button>
        <div id="live-status" class="muted" style="margin-top:8px"></div>
      </div>
    </div>`;
}

window.resetDemo = async function () { await api('/api/demo/reset', {}); toast('Demo tenant reset — re-run the assessment'); await refresh(); };

window.liveStart = async function () {
  const tenantId = $('#live-tenant').value.trim(), clientId = $('#live-client').value.trim();
  if (!tenantId || !clientId) { toast('Tenant ID and client ID required'); return; }
  await api('/api/settings', { live: { tenantId, clientId } });
  try {
    const r = await api('/api/live/start', { tenantId, clientId });
    $('#live-status').innerHTML = `Go to <a href="${esc(r.verificationUri)}" target="_blank">${esc(r.verificationUri)}</a> and enter code <b>${esc(r.userCode)}</b>. Waiting…`;
    const timer = setInterval(async () => {
      try {
        const p = await api('/api/live/poll', {});
        if (!p.pending) {
          clearInterval(timer);
          $('#live-status').textContent = 'Signed in. Collecting…';
          await api('/api/live/collect', {});
          await api('/api/settings', { mode: 'live' });
          $('#live-status').textContent = 'Live snapshot collected. Run assessment.';
          await refresh();
        }
      } catch (e) { clearInterval(timer); $('#live-status').textContent = 'Error: ' + e.message; }
    }, 5000);
  } catch (e) { $('#live-status').textContent = 'Error: ' + e.message; }
};

/* ---------- wiring ---------- */
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  $('#tab-' + b.dataset.tab).classList.add('active');
}));

$('#mode-select').addEventListener('change', async (e) => {
  await api('/api/settings', { mode: e.target.value });
  toast('Tenant mode: ' + e.target.value + ' — run assessment');
  await refresh();
});

$('#btn-assess').addEventListener('click', async () => {
  $('#btn-assess').disabled = true;
  try { await api('/api/assess', {}); toast('Assessment complete'); await refresh(); }
  catch (e) { toast(e.message); }
  finally { $('#btn-assess').disabled = false; }
});

refresh().catch(() => {}); // 401 → login overlay is already shown
