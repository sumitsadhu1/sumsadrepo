// Board-ready executive report: a self-contained HTML page (print → PDF).
import { STAGES } from './engine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderReport({ assessment, plan, register, history, generatedBy }) {
  if (!assessment) return '<html><body><p>No assessment yet — run one first.</p></body></html>';
  const { scores, placement, results } = assessment;
  const stage = STAGES.stages.find((s) => s.n === placement.stage);
  const gap = Math.max(0, (scores.configScore ?? 0) - (scores.attestScore ?? 0));
  const failing = results.filter((r) => r.status === 'fail');
  const topGaps = failing.slice(0, 12);
  const openTasks = plan ? plan.tasks.filter((t) => t.status !== 'done').length : null;
  const doneTasks = plan ? plan.tasks.filter((t) => t.status === 'done').length : null;

  const controlRows = Object.entries(scores.perControl).map(([n, c]) => {
    const x = STAGES.crosswalk?.[n] ?? {};
    return `<tr><td>${n}. ${esc(c.name)}</td>
      <td>${c.config == null ? 'n/a' : c.config + '%'}</td>
      <td>${c.attest == null ? 'n/a' : c.attest + '%'}</td>
      <td class="xw">${esc(x.nist ?? '')}</td><td class="xw">${esc(x.iso ?? '')}</td><td class="xw">${esc(x.eu ?? '')}</td></tr>`;
  }).join('');

  const gapRows = topGaps.map((r) => `
    <tr><td><b>${r.id}</b></td><td>${esc(r.title)}</td><td>${esc(r.persona)}</td>
    <td>${r.evidence?.length ? r.evidence.slice(0, 3).map(esc).join('<br>') : '—'}</td></tr>`).join('');

  const trendRows = history.slice(-8).map((h) =>
    `<tr><td>${new Date(h.at).toLocaleDateString()}</td><td>Stage ${h.stage}</td><td>${h.configScore ?? '—'}%</td><td>${h.attestScore ?? '—'}%</td></tr>`).join('');

  const att = register.agents.length
    ? `${register.agents.length} agents registered; ${register.agents.filter((a) => a.lastAttested).length} attested (most recent by ${esc(register.agents.filter((a) => a.lastAttestedBy).at(-1)?.lastAttestedBy ?? '—')})`
    : 'No agents registered yet';

  return `<!doctype html><html><head><meta charset="utf-8"><title>AI Governance Assessment — Executive Report</title>
<style>
body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#1b1b1b;max-width:900px;margin:32px auto;padding:0 24px}
h1{font-size:22px;margin-bottom:2px} h2{font-size:15px;margin-top:26px;border-bottom:2px solid #0f6cbd;padding-bottom:4px}
.meta{color:#6b7280;font-size:12px} .kpis{display:flex;gap:14px;margin:18px 0}
.kpi{flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px}
.kpi b{font-size:26px;display:block} .kpi span{color:#6b7280;font-size:12px}
.gap{border-left:4px solid #b97e00}
table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}
th,td{border:1px solid #e5e7eb;padding:6px 9px;text-align:left;vertical-align:top}
th{background:#f4f6f8;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.xw{font-size:11px;color:#6b7280}
.quote{font-style:italic;color:#6b7280}
@media print {.noprint{display:none}}
</style></head><body>
<p class="noprint" style="background:#e8f1fb;padding:8px 12px;border-radius:8px">Use your browser's <b>Print → Save as PDF</b> to export this report.</p>
<h1>AI Governance Assessment — Executive Report</h1>
<div class="meta">${esc(assessment.tenantName)} · generated ${new Date().toLocaleString()} by ${esc(generatedBy)} · assessment of ${new Date(assessment.at).toLocaleString()}</div>
<p class="quote">"Who has the right to approve, change, promote, fund, or retire an agent?"</p>
<div class="kpis">
  <div class="kpi"><b>Stage ${placement.stage}</b><span>${esc(stage?.name)} — ${esc(stage?.tagline)}<br>
    ${Object.entries(placement.gateDetail).map(([g, d]) => `Gate ${g}: ${d.measured}/${d.total} measured${d.passed ? ' ✓' : ''}`).join(' · ')}</span></div>
  <div class="kpi"><b>${scores.configScore ?? '—'}%</b><span>Config score — MEASURED evidence, of ${scores.configCoverage?.measured ?? '?'}/${scores.configCoverage?.inScope ?? '?'} checks collected${(scores.configCoverage && scores.configCoverage.measured < scores.configCoverage.inScope) ? ' (PARTIAL COVERAGE)' : ''}</span></div>
  <div class="kpi"><b>${scores.attestScore ?? '—'}%</b><span>Attestation completeness — SELF-ATTESTED by owners, not independently verified</span></div>
  <div class="kpi gap"><b>${gap} pts</b><span>Governance gap (config-ready but untracked)</span></div>
</div>
${plan ? `<p><b>Plan:</b> targeting Stage ${plan.targetStage} — ${doneTasks} tasks done, ${openTasks} open.</p>` : ''}
<p><b>Register:</b> ${att}.</p>
<h2>Per-control posture & framework crosswalk</h2>
<table><tr><th>Control</th><th>Config</th><th>Attest</th><th>NIST AI RMF</th><th>ISO/IEC 42001</th><th>EU AI Act</th></tr>${controlRows}</table>
<h2>Top gaps (${failing.length} failing checks total)</h2>
<table><tr><th>Check</th><th>Finding</th><th>Owner persona</th><th>Evidence</th></tr>${gapRows || '<tr><td colspan="4">None — all applicable checks pass.</td></tr>'}</table>
<h2>Trajectory</h2>
<table><tr><th>Date</th><th>Stage</th><th>Config</th><th>Attest</th></tr>${trendRows || '<tr><td colspan="4">First run.</td></tr>'}</table>
<p class="meta">Unlockable with E5/optimized licensing: ${scores.unlockable.join(', ') || 'none'} · Not collected in this mode: ${scores.notCollected.join(', ') || 'none'}</p>
<p class="quote">Dashboards show evidence. Operating models create governance.</p>
</body></html>`;
}
