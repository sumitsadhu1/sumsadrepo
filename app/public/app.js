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
    <input id="login-key" type="password" placeholder="Access key" style="width:100%;margin-bottom:6px" autofocus>
    <input id="login-name" placeholder="Your name (actions are attributed)" style="width:100%;margin-bottom:6px">
    <select id="login-role" style="width:100%">
      <option>Global Admin</option><option>AI Governance Lead</option><option>Security Admin</option>
      <option>Compliance Admin</option><option>Agent Owner</option><option>Solution Architect</option><option>Operator</option>
    </select>
    <div class="modal-actions"><button class="primary" onclick="doLogin()">Sign in</button></div>
    <div id="login-err" class="muted"></div>`;
  $('#modal').classList.remove('hidden');
}

window.doLogin = async function () {
  try {
    await api('/api/login', { key: $('#login-key').value.trim(), name: $('#login-name').value.trim(), role: $('#login-role').value });
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
  S.audit = S.audit ?? []; S.history = S.history ?? []; // belt-and-braces vs null stores (§10.3)
  $('#mode-select').value = S.settings.mode;
  $('#tenant-name').textContent = S.assessment
    ? `${S.assessment.tenantName} — scanned ${new Date(S.assessment.at).toLocaleString()}`
    : 'No assessment yet — pick a tenant and click Run assessment';
  $('#whoami').textContent = S.identity ? `${S.identity.name} · ${S.identity.role}` : '';
  renderAll();
}

function renderAll() {
  renderOverview(); renderFindings(); renderPlan(); renderRegister(); renderQuestionnaire(); renderAudit(); renderSettings();
}

/* ---------- Overview ---------- */
function renderOverview() {
  const el = $('#tab-overview');
  if (!S.assessment) {
    el.innerHTML = `
      <div class="card"><h3>Welcome</h3>
        <p class="quote">"Who has the right to approve, change, promote, fund, or retire an agent?"</p>
        <p>This tool assesses <b>your Microsoft 365 tenant's</b> AI/agent governance — read-only, evidence-first, one customer at a time.</p></div>
      <div class="cards" style="grid-template-columns:1fr 1fr">
        <div class="card gap-callout"><h3>Assess your tenant (the real thing)</h3>
          <ol style="margin:6px 0 10px;padding-left:18px">
            <li>One-time setup: register a public-client app in Entra and grant the read-only scopes (guided steps in <b>Settings</b>)</li>
            <li>Sign in with a device code — credentials never touch this tool</li>
            <li><b>Run assessment</b> → honest stage placement with evidence and coverage</li>
            <li>Widen coverage with the <b>evidence pack</b>; record governance in <b>Questionnaire</b> + <b>Register</b></li>
          </ol>
          <button class="primary" onclick="goTab('settings')">Connect your tenant</button></div>
        <div class="card"><h3>Or explore with sample data first</h3>
          <p class="muted">Two sample tenants show the full journey without any setup: <b>Contoso</b> (early, everything to do) and <b>Fabrikam</b> (governing agents, close to frontier). The Configure pipeline (dry-run → approve → apply → audit) can be exercised safely here — your live tenant is never written to.</p>
          <button onclick="$('#mode-select').value='contoso';$('#mode-select').dispatchEvent(new Event('change'))">Try Contoso</button></div>
      </div>`;
    return;
  }
  const { scores, placement } = S.assessment;
  const stages = S.stages.stages.map((s) => {
    const cls = s.n < placement.stage ? 'passed' : s.n === placement.stage ? 'current' : '';
    const gd = placement.gateDetail[String(s.n)];
    const covLine = gd
      ? `<small class="mono">${gd.measured}/${gd.total} gate checks measured${gd.attestCount ? ` · ${gd.attestCount} self-attested` : ''}</small>`
      : '';
    return `<div class="stage-chip ${cls}"><b>Stage ${s.n} — ${esc(s.name)}</b><small>${esc(s.tagline)}</small>${covLine}</div>`;
  }).join('');
  const cc = scores.configCoverage, ac = scores.attestCoverage;
  const partialCfg = cc && cc.inScope > 0 && cc.measured < cc.inScope;
  const gap = (scores.configScore ?? 0) - (scores.attestScore ?? 0);
  // why this stage: what blocks the next gate
  const nextGate = placement.gateDetail[String(placement.stage)];
  const gateFailing = nextGate?.failing ?? [];          // defensive: older stored
  const gateNotCollected = nextGate?.notCollected ?? []; // assessments may lack these
  const byId = Object.fromEntries(S.assessment.results.map((r) => [r.id, r]));
  const tag = (id) => byId[id]?.type === 'attest' ? ' <span class="pill attestpill">attest</span>' : '';
  const whyStage = placement.stage < 4 && nextGate
    ? `<div class="card gap-callout"><h3>To reach Stage ${placement.stage + 1}</h3>
       <p class="muted mono">Gate coverage: ${nextGate.coverage}% measured (needs ≥${nextGate.coverageMin}%)</p>
       ${gateFailing.length
         ? `<p class="muted">Failing gate checks:</p>` + gateFailing.map((id) =>
             `<div>• <b class="mono">${id}</b> — ${esc(byId[id]?.title ?? '')}${tag(id)}</div>`).join('')
         : ''}
       ${gateNotCollected.length
         ? `<p class="muted">Not yet measured (these BLOCK the gate):</p>` + gateNotCollected.map((id) =>
             `<div>• <b class="mono">${id}</b> — ${esc(byId[id]?.title ?? '')}</div>`).join('')
         : ''}
       ${!gateFailing.length && !gateNotCollected.length ? '<p class="muted">Gate clear — re-run the assessment.</p>' : ''}
       </div>`
    : '<div class="card"><h3>Frontier</h3><p class="muted">No exit gate — steady state of earned autonomy.</p></div>';
  // belief vs evidence: surface the delta between self-assessed and measured stage
  const believed = Number(S.answers?.selfStage);
  const beliefCallout = believed && believed !== placement.stage ? `
    <div class="card ${believed > placement.stage ? 'gap-callout' : ''}"><h3>Belief vs evidence</h3>
      <p>You assessed yourselves at <b>Stage ${believed}</b> (Questionnaire); the measured placement is <b>Stage ${placement.stage}</b>.</p>
      <p class="muted">${believed > placement.stage
        ? 'The gap between perceived and measured readiness is itself a finding — the "To reach Stage ' + (placement.stage + 1) + '" list is what closes it.'
        : 'You are further along than you believed — consider raising your target stage.'}</p></div>` : '';
  // trend sparkline from history
  const hist = S.history.slice(-12);
  const spark = hist.length >= 2 ? (() => {
    const w = 420, h = 80, pad = 6;
    const x = (i) => pad + (i * (w - 2 * pad)) / (hist.length - 1);
    const y = (v) => h - pad - ((v ?? 0) * (h - 2 * pad)) / 100;
    const line = (key, color) =>
      `<polyline fill="none" stroke="${color}" stroke-width="2" points="${hist.map((p, i) => `${x(i)},${y(p[key])}`).join(' ')}"/>`;
    return `<div class="card"><h3>Trajectory (last ${hist.length} runs)</h3>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:460px">${line('configScore', '#0f6cbd')}${line('attestScore', '#b97e00')}</svg>
      <div class="muted"><span style="color:#0f6cbd">■</span> config &nbsp; <span style="color:#b97e00">■</span> attestation</div></div>`;
  })() : '';
  const bars = Object.entries(scores.perControl).map(([n, c]) => {
    const xw = S.stages.crosswalk?.[n];
    return `
    <div class="bar-row">
      <div class="bar-label">${n}. ${esc(c.name)}
        ${xw ? `<div class="muted xwline">${esc(xw.nist)} · ${esc(xw.iso)} · ${esc(xw.eu)}</div>` : ''}</div>
      <div class="bar config"><i style="width:${c.config ?? 0}%"></i><span>${c.config == null ? 'n/a' : c.config + '%'} measured</span></div>
      <div class="bar attest"><i style="width:${c.attest ?? 0}%"></i><span>${c.attest == null ? 'n/a' : c.attest + '%'} attested</span></div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="stageline">${stages}</div>
    <div class="cards">
      <div class="card"><h3>Config score <span class="pill mode">measured</span></h3>
        <div class="big mono">${scores.configScore ?? '—'}%</div>
        <div class="muted mono">of ${cc.measured}/${cc.inScope} checks measured</div>
        ${partialCfg ? '<div class="warn">⚠ Partial coverage — unmeasured checks block stage gates, they are never assumed to pass</div>' : ''}</div>
      <div class="card"><h3>Attestation completeness <span class="pill attestpill">self-attested</span></h3>
        <div class="big mono">${scores.attestScore ?? '—'}%</div>
        <div class="muted mono">of ${ac.measured}/${ac.inScope} governance signals recorded — asserted by owners, not independently verifiable</div></div>
      <div class="card gap-callout"><h3>The gap</h3><div class="big">${gap > 0 ? gap : 0} pts</div><div class="muted">config-ready but governance-untracked — the number most assessments miss</div></div>
      <div class="card"><h3>Unlockable (E5)</h3><div class="big">${scores.unlockable.length}</div><div class="muted">checks gated by licensing${scores.notCollected.length ? ` · ${scores.notCollected.length} not collected in this mode` : ''}</div></div>
    </div>
    ${beliefCallout}
    <div class="cards" style="grid-template-columns: 1fr 1fr">${whyStage}${spark}</div>
    <div class="card"><h3>Per-control: evidence layer vs decision layer</h3><div class="bars">${bars}</div></div>`;
}

/* ---------- Findings ---------- */
let findingsFilter = { text: '', status: 'all' };

function renderFindings() {
  const el = $('#tab-findings');
  if (!S.assessment) {
    el.innerHTML = '<div class="card"><h3>No assessment yet</h3><p class="muted">Pick a tenant mode (top right) and click <b>Run assessment</b>. Findings — with evidence — appear here.</p></div>';
    return;
  }
  const f = findingsFilter;
  const visible = S.assessment.results.filter((r) => {
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.text && !(r.id + ' ' + r.title + ' ' + r.controlName + ' ' + r.persona).toLowerCase().includes(f.text.toLowerCase())) return false;
    return true;
  });
  // failures first, then not-collected, then license-gated, then passes
  const order = { fail: 0, 'not-collected': 1, 'license-gated': 2, pass: 3 };
  visible.sort((a, b) => order[a.status] - order[b.status] || a.stage - b.stage || a.id.localeCompare(b.id));
  const rows = visible.map((r) => `
    <tr>
      <td><b class="mono">${r.id}</b><br><span class="muted">${esc(r.controlName)} · S${r.stage} · ${r.tier === 'O' ? 'E5' : 'E3'}</span></td>
      <td>${esc(r.title)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}
        ${r.evidence?.length ? `<ul class="evidence">${r.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</td>
      <td><span class="pill ${r.status}">${r.status}</span><br><span class="pill ${r.type === 'attest' ? 'attestpill' : 'mode'}">${r.type === 'attest' ? 'self-attested' : r.type}</span></td>
      <td class="row-actions">${r.status === 'fail' && r.canDemoFix && S.settings.mode !== 'live' && S.perms?.fix
        ? `<button class="small primary" onclick="openFix('${r.id}')">Fix…</button>` : ''}
        ${r.portal ? `<a href="${r.portal}" target="_blank"><button class="small">Portal</button></a>` : ''}</td>
    </tr>`).join('');
  el.innerHTML = `
    <div class="filterbar">
      <input id="f-text" placeholder="Filter by id, title, control, persona…" value="${esc(f.text)}">
      <select id="f-status">
        ${['all', 'fail', 'pass', 'not-collected', 'license-gated'].map((s) =>
          `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'all' ? 'All statuses' : s}</option>`).join('')}
      </select>
      <span class="muted mono">${visible.length} of ${S.assessment.results.length} checks</span>
      <span style="flex:1"></span>
      <button class="small" onclick="window.open('/api/export/findings.csv')">CSV</button>
      <button class="small" onclick="window.open('/api/export/assessment.json')">JSON</button>
    </div>
    <table><thead><tr><th>Check</th><th>Finding</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  $('#f-text').addEventListener('input', (e) => { findingsFilter.text = e.target.value; renderFindings(); $('#f-text').focus(); $('#f-text').setSelectionRange(99, 99); });
  $('#f-status').addEventListener('change', (e) => { findingsFilter.status = e.target.value; renderFindings(); });
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
  try {
    await api('/api/fix/apply', { checkId }); // approval is attributed to the signed-in identity server-side
    toast(checkId + ' applied — re-scan verified, plan updated');
  } catch (e) { toast(e.message); }
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
window.taskDone = async function (id) {
  try { await api('/api/plan/task', { taskId: id, status: 'done' }); } catch (e) { toast(e.message); }
  await refresh();
};

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
      <td>${d == null ? '<span class="pill fail">never</span>' : `<span class="pill ${stale ? 'fail' : 'pass'}">${d}d ago</span>`}
        ${a.lastAttestedBy ? `<br><span class="muted">by ${esc(a.lastAttestedBy)}</span>` : ''}
        ${d != null && !stale ? `<br><span class="muted">expires in ${90 - d}d</span>` : ''}
        ${a.attestNote ? `<br><span class="muted">"${esc(a.attestNote)}"</span>` : ''}</td>
      <td class="row-actions">${S.perms?.attest
        ? `<button class="small" onclick="attest('${a.id}', '${esc(a.name)}')">Attest</button>`
        : `<button class="small" disabled title="Attesting requires Global Admin, AI Governance Lead, Compliance Admin, or Agent Owner">Attest</button>`}
        ${S.perms?.fix ? `<button class="small" title="Remove this register entry" onclick="removeAgent('${a.id}', '${esc(a.name)}')">✕</button>` : ''}</td>
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
  await api('/api/assess', {});
  toast('Agent saved — assessment re-run automatically');
  await refresh();
  return false;
};
window.removeAgent = async function (id, name) {
  if (!confirm(`Remove "${name}" from the register? Its attestation history goes with it.`)) return;
  try {
    await api('/api/register/remove', { id });
    await api('/api/assess', {});
    toast('Removed — assessment re-run');
  } catch (e) { toast(e.message); }
  await refresh();
};

window.attest = function (id, name) {
  $('#modal-card').innerHTML = `
    <h2>Attest — ${esc(name)}</h2>
    <p class="muted">You are confirming, as <b>${esc(S.identity?.name)} (${esc(S.identity?.role)})</b>, that this agent's
    ownership, risk tier, and autonomy tier are accurate today. The attestation is timestamped, attributed to you, and expires in 90 days.</p>
    <textarea id="attest-note" placeholder="Optional evidence note or link (e.g. review meeting, ticket, document)" style="width:100%;min-height:70px"></textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="doAttest('${id}')">Attest</button>
    </div>`;
  $('#modal').classList.remove('hidden');
};
window.doAttest = async function (id) {
  const note = $('#attest-note').value.trim();
  closeModal();
  try {
    await api('/api/register/attest', { id, note });
    await api('/api/assess', {});
    toast('Attested — recorded with your identity; assessment re-run');
  } catch (e) { toast(e.message); }
  await refresh();
};

/* ---------- Questionnaire ---------- */
const ansVal = (a) => (a && typeof a === 'object') ? a.v : a; // attest answers are {v, by, at, note}

function answerStamp(a) {
  if (!a || typeof a !== 'object' || !a.at) {
    return (a !== undefined && a !== null) ? '<div class="muted mono">seeded/unattributed — re-save to attribute and date this attestation</div>' : '';
  }
  const age = Math.floor((Date.now() - Date.parse(a.at)) / 86400000);
  const expired = age > 90;
  return `<div class="muted mono ${expired ? 'warn' : ''}">
    ${expired ? 'EXPIRED — ' : ''}attested by ${esc(a.by ?? 'unknown')} on ${new Date(a.at).toLocaleDateString()}
    ${expired ? `(${age}d ago, limit 90d — re-affirm below)` : `(expires in ${90 - age}d)`}
    ${a.note ? ` · "${esc(a.note)}"` : ''}</div>`;
}

function renderQuestionnaire() {
  const el = $('#tab-questionnaire');
  const canAttest = !!S.perms?.attest;
  const blocks = S.questions.map((q) => {
    const raw = S.answers[q.id];
    const a = ansVal(raw);
    if (q.type === 'bool') {
      return `<div class="qq"><div class="q">${esc(q.question)}</div>
        <label><input type="radio" name="${q.id}" value="true" ${a === true ? 'checked' : ''} ${canAttest ? '' : 'disabled'}> Yes</label>
        <label><input type="radio" name="${q.id}" value="false" ${a === false ? 'checked' : ''} ${canAttest ? '' : 'disabled'}> No / don't know</label>
        ${canAttest ? `<input name="note-${q.id}" placeholder="Optional evidence note or link (policy doc, drill record, minutes…)" value="${esc(raw?.note ?? '')}" style="width:100%;margin-top:6px">` : ''}
        ${answerStamp(raw)}
        ${q.hint ? `<div class="muted">${esc(q.hint)}</div>` : ''}</div>`;
    }
    const opts = q.options.map((o) => `<label><input type="radio" name="${q.id}" value="${esc(o.value)}" ${String(a) === String(o.value) ? 'checked' : ''}> ${esc(o.label)}</label><br>`).join('');
    return `<div class="qq"><div class="q">${esc(q.question)}</div>${opts}</div>`;
  }).join('');
  el.innerHTML = `
    <div class="note">Governance answers ARE attestations: saved with your identity and timestamp, expiring after 90 days like register attestations. Add an evidence note where you can — an unevidenced "Yes" is the weakest signal this tool accepts.
    ${canAttest ? '' : '<br><b>Your role can set stages/targets but cannot change governance attestations</b> (requires Global Admin, AI Governance Lead, Compliance Admin, or Agent Owner).'}</div>
    <form onsubmit="return saveAnswers(event)">${blocks}
    <button class="primary">Save answers</button></form>`;
}

window.saveAnswers = async function (ev) {
  ev.preventDefault();
  const answers = {}, notes = {};
  for (const q of S.questions) {
    const v = ev.target.querySelector(`[name=${q.id}]:checked`)?.value;
    if (v === undefined) continue;
    answers[q.id] = q.type === 'bool' ? v === 'true' : (isNaN(Number(v)) ? v : Number(v));
    const n = ev.target.querySelector(`[name=note-${q.id}]`)?.value?.trim();
    if (n !== undefined) notes[q.id] = n;
  }
  try {
    await api('/api/answers', { answers, notes });
    await api('/api/assess', {});
    toast('Saved — attributed to you; assessment re-run automatically');
  } catch (e) { toast(e.message); }
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
        <h3>Workspace</h3>
        ${S.settings.mode === 'live'
          ? `<p class="muted">Clears this live tenant's plan, history, audit trail, answers, register, and evidence pack. Your sign-in token is kept — collect again to re-scan. Requires a fix-capable role.</p>
             <button onclick="resetWorkspace()">Clear live workspace</button>`
          : `<p class="muted">Demo tenants: Contoso (early journey) and Fabrikam (governing agents). Demo fixes persist; reset restores the original fixture and clears this tenant's plan, history, and audit.</p>
             <button onclick="resetWorkspace()">Reset current demo tenant</button>`}
      </div>
      <div class="card">
        <h3>Live tenant (read-only)</h3>
        <details style="margin-bottom:8px"><summary class="muted" style="cursor:pointer">One-time Entra setup (read-only) — click for steps</summary>
          <ol class="muted" style="padding-left:18px;margin:8px 0">
            <li><a href="https://entra.microsoft.com" target="_blank">Entra admin center</a> → App registrations → <b>New registration</b> (single tenant, no redirect URI)</li>
            <li>Authentication → enable <b>Allow public client flows</b></li>
            <li>API permissions → Microsoft Graph → <b>Delegated</b> → add:<br>
              <code>Organization.Read.All</code> <code>Policy.Read.All</code> <code>Application.Read.All</code> <code>Directory.Read.All</code> <code>AuditLogsQuery.Read.All</code> <code>SharePointTenantSettings.Read.All</code> <code>InformationProtectionPolicy.Read</code></li>
            <li><b>Grant admin consent</b>, then paste the Tenant ID and App (client) ID below</li>
          </ol></details>
        <p class="muted">Sign-in uses a device code — your credentials are entered at microsoft.com, never here. Live mode is read-only; configuration stays demo-only in this MVP.</p>
        <input id="live-tenant" placeholder="Tenant ID" value="${esc(live.tenantId || '')}" style="width:100%;margin-bottom:6px">
        <input id="live-client" placeholder="App (client) ID" value="${esc(live.clientId || '')}" style="width:100%;margin-bottom:6px">
        <button class="primary" onclick="liveStart()">Sign in with device code</button>
        <div id="live-status" class="muted" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <h3>Evidence pack</h3>
        <p class="muted">For surfaces Graph can't see (DAG, RCD/RAC, DLP, audit, retention): run
        <code>scripts/collect-evidence.ps1</code> as a SharePoint/Compliance admin, then import the
        JSON here. Pack values are <b>measured</b> posture with full provenance; packs expire after
        ${S.evidencePack?.maxAgeDays ?? 30} days.</p>
        ${renderPackStatus()}
        ${S.perms?.fix ? `
          <input id="pack-file" type="file" accept=".json,application/json" style="width:100%;margin-bottom:6px">
          <button class="primary" onclick="importPack()">Import evidence pack</button>
          ${S.evidencePack ? '<button onclick="clearPack()">Remove pack</button>' : ''}`
        : '<p class="warn">Importing measured evidence requires Global Admin, Security Admin, or AI Governance Lead.</p>'}
        <div id="pack-status" class="muted" style="margin-top:8px"></div>
      </div>
    </div>`;
}

function renderPackStatus() {
  const p = S.evidencePack;
  if (!p) return '<p class="muted">No evidence pack imported for this tenant mode.</p>';
  return `<p class="${p.expired ? 'warn' : ''}">
    ${p.expired ? 'EXPIRED — ' : ''}collected <b>${esc(new Date(p.collectedAt).toLocaleDateString())}</b>
    (${p.ageDays}d ago) by <span class="mono">${esc(p.collectedBy)}</span>,
    imported by ${esc(p.importedBy)} · feeds ${p.checks.map((c) => `<span class="mono">${esc(c)}</span>`).join(', ')}
    ${p.expired ? '— measurements ignored until a fresh pack is imported' : ''}</p>`;
}

window.importPack = async function () {
  const f = $('#pack-file').files[0];
  if (!f) { toast('Choose the evidence-pack.json file first'); return; }
  try {
    const pack = JSON.parse(await f.text());
    const r = await api('/api/evidence/import', { pack });
    toast(`Evidence pack imported — feeds ${r.summary.checks.join(', ')}; re-assessed`);
    if (r.droppedPaths?.length) $('#pack-status').textContent = 'Ignored unknown paths: ' + r.droppedPaths.join(', ');
    await refresh();
  } catch (e) { $('#pack-status').textContent = 'Import failed: ' + e.message; }
};

window.clearPack = async function () {
  await api('/api/evidence/clear', {});
  toast('Evidence pack removed — re-assessed');
  await refresh();
};

window.resetWorkspace = async function () {
  try {
    const r = await api('/api/workspace/reset', {});
    toast('Cleared: ' + r.cleared + ' — re-run the assessment');
  } catch (e) { toast(e.message); }
  await refresh();
};

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

window.goTab = (t) => document.querySelector(`[data-tab=${t}]`)?.click();

/* ---------- wiring ---------- */
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  $('#tab-' + b.dataset.tab).classList.add('active');
}));

$('#mode-select').addEventListener('change', async (e) => {
  try {
    await api('/api/settings', { mode: e.target.value });
    toast('Tenant mode: ' + e.target.value + ' — run assessment');
    await refresh();
  } catch (err) {
    // 401 after a server restart: api() has already shown the login overlay
    if (err.message !== 'Sign in required') toast(err.message);
  }
});

$('#btn-report').addEventListener('click', () => window.open('/api/report', '_blank'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

$('#btn-assess').addEventListener('click', async () => {
  $('#btn-assess').disabled = true;
  try { await api('/api/assess', {}); toast('Assessment complete'); await refresh(); }
  catch (e) { toast(e.message); }
  finally { $('#btn-assess').disabled = false; }
});

refresh().catch(() => {}); // 401 → login overlay is already shown
