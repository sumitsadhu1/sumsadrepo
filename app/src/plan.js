// PM engine: a plan whose state is derived from evidence.
// Tasks bind to check IDs; re-assessment auto-closes passing tasks and reopens regressions.
// v0.7: scoped per tenant mode (§7.1 — a demo plan must never be verified against
// live results), and not-collected checks become MEASURE tasks (§8.1 B5 — the Plan
// and the Overview must agree on what blocks the next gate).
import { load, save } from './store.js';
import { CHECKS, STAGES } from './engine.js';

export function getPlan(mode) {
  return load('plan-' + mode, null);
}

function measureAction(r) {
  return r.type === 'attest'
    ? 'Not yet recorded — answer it in the Questionnaire / Register (attributed, expires in 90 days).'
    : 'Not yet measured — connect the live collector for this area or import an evidence pack (scripts/collect-evidence.ps1). Unmeasured checks block the stage gate.';
}

export function generatePlan(mode, results, targetStage) {
  const candidates = results
    .filter((r) => r.stage <= targetStage && ['fail', 'license-gated', 'not-collected'].includes(r.status))
    .sort((a, b) => a.stage - b.stage || a.control - b.control);

  const existing = getPlan(mode);
  const keepStatus = Object.fromEntries((existing?.tasks ?? []).map((t) => [t.checkId, t]));

  const tasks = candidates.map((r) => {
    const check = CHECKS.find((c) => c.id === r.id);
    const prev = keepStatus[r.id];
    const mode_ = r.status === 'license-gated' ? 'license' : r.status === 'not-collected' ? 'measure' : r.fixMode;
    return {
      id: 'task-' + r.id,
      checkId: r.id,
      title: r.title,
      phase: r.stage,
      control: r.controlName,
      persona: r.persona,
      effort: r.effort,
      mode: mode_,
      action: r.status === 'license-gated'
        ? 'Unlockable: requires E5/optimized licensing — or record an accepted compensating control.'
        : r.status === 'not-collected' ? measureAction(r) : r.fixSummary,
      portal: r.portal,
      dependsOn: check?.dependsOn ?? [],
      status: prev?.status === 'done' ? 'done' : 'todo',
      autoVerified: prev?.autoVerified ?? false,
      history: prev?.history ?? [],
    };
  });

  const plan = {
    targetStage,
    generatedAt: new Date().toISOString(),
    phases: STAGES.stages.filter((s) => s.n <= targetStage).map((s) => s.n),
    tasks,
  };
  return save('plan-' + mode, plan);
}

// Called after every assessment run: evidence drives task state.
export function verifyPlan(mode, results) {
  const plan = getPlan(mode);
  if (!plan) return null;
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const now = new Date().toISOString();
  for (const t of plan.tasks) {
    const r = byId[t.checkId];
    if (!r) continue;
    if (t.mode === 'measure') {
      // A measure task is done once the check IS measured; if it measures as
      // failing, regenerating the plan turns it into a fix task.
      if (['pass', 'fail'].includes(r.status) && t.status !== 'done') {
        t.status = 'done';
        t.autoVerified = true;
        t.history.push({ at: now, event: `auto-closed: now measured (${r.status})` });
      } else if (r.status === 'not-collected' && t.status === 'done' && t.autoVerified) {
        t.status = 'todo';
        t.history.push({ at: now, event: 'reopened: no longer measured (collector/pack coverage regressed)' });
      }
      continue;
    }
    if (r.status === 'pass' && t.status !== 'done') {
      t.status = 'done';
      t.autoVerified = true;
      t.history.push({ at: now, event: 'auto-closed: check passes on re-scan' });
    } else if (r.status === 'fail' && t.status === 'done' && t.autoVerified) {
      t.status = 'todo';
      t.history.push({ at: now, event: 'reopened: configuration drift — check failing again' });
    }
  }
  return save('plan-' + mode, plan);
}

export function setTaskStatus(mode, taskId, status, by) {
  const plan = getPlan(mode);
  const t = plan?.tasks.find((x) => x.id === taskId);
  if (!t) return null;
  t.status = status;
  t.autoVerified = false;
  t.history.push({ at: new Date().toISOString(), event: `manually set to ${status} by ${by || 'unknown'}` });
  return save('plan-' + mode, plan);
}
