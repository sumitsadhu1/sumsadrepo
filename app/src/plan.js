// PM engine: a plan whose state is derived from evidence.
// Tasks bind to check IDs; re-assessment auto-closes passing tasks and reopens regressions.
import { load, save } from './store.js';
import { CHECKS, STAGES } from './engine.js';

export function getPlan() {
  return load('plan', null);
}

export function generatePlan(results, targetStage) {
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const candidates = results
    .filter((r) => r.stage <= targetStage && (r.status === 'fail' || r.status === 'license-gated'))
    .sort((a, b) => a.stage - b.stage || a.control - b.control);

  const existing = getPlan();
  const keepStatus = Object.fromEntries((existing?.tasks ?? []).map((t) => [t.checkId, t]));

  const tasks = candidates.map((r) => {
    const check = CHECKS.find((c) => c.id === r.id);
    const prev = keepStatus[r.id];
    return {
      id: 'task-' + r.id,
      checkId: r.id,
      title: r.title,
      phase: r.stage,
      control: r.controlName,
      persona: r.persona,
      effort: r.effort,
      mode: r.status === 'license-gated' ? 'license' : r.fixMode,
      action: r.status === 'license-gated'
        ? 'Unlockable: requires E5/optimized licensing — or record an accepted compensating control.'
        : r.fixSummary,
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
  return save('plan', plan);
}

// Called after every assessment run: evidence drives task state.
export function verifyPlan(results) {
  const plan = getPlan();
  if (!plan) return null;
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const now = new Date().toISOString();
  for (const t of plan.tasks) {
    const r = byId[t.checkId];
    if (!r) continue;
    if (r.status === 'pass' && t.status !== 'done') {
      t.status = 'done';
      t.autoVerified = true;
      t.history.push({ at: now, event: 'auto-closed: check passes on re-scan' });
    } else if (r.status === 'fail' && t.status === 'done' && t.autoVerified) {
      t.status = 'todo';
      t.history.push({ at: now, event: 'reopened: configuration drift — check failing again' });
    }
  }
  return save('plan', plan);
}

export function setTaskStatus(taskId, status, by) {
  const plan = getPlan();
  const t = plan?.tasks.find((x) => x.id === taskId);
  if (!t) return null;
  t.status = status;
  t.autoVerified = false;
  t.history.push({ at: new Date().toISOString(), event: `manually set to ${status} by ${by || 'unknown'}` });
  return save('plan', plan);
}
