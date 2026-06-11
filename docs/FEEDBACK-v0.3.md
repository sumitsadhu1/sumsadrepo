# Agent Governance Assessment — Consolidated Review & Fix Backlog

**Reviewer perspective:** UI designer + M365 Solution Architect (FastTrack), currently onboarding customers to Copilot Chat, Microsoft 365 Copilot, and Agent 365.
**Review date:** 2026-06-11
**Branch reviewed:** `claude/determined-allen-52zkct`
**App version:** 0.3.0 (`app/package.json`)
**Method:** Code read of the full app (7 tabs, 40-check catalog, 9 controls, 4 stages, engine/collectors), plus a live smoke-test of the assessment loop and an empirical probe of the scoring engine (results below are reproduced, not asserted).

> Note for the developer: findings are evidence-backed and reference real files/lines. The **CRITICAL** items in §2 are correctness bugs that cause the tool to over-report readiness — fix these before any customer-facing use.

---

## 0. TL;DR verdict

- **Functionally** more comprehensive than most "Copilot readiness" checklists — the two-layer (config vs attestation) scoring, the 40-check catalog, and the dry-run → approve → apply → verify → audit loop are genuinely strong.
- **But** it currently **over-reports readiness**: a tenant with only 5 of 40 checks passing and **zero governance attested** is badged **Stage 4 — Frontier at 100%** (proven in §2). This is a structural scoring flaw, not a tuning issue.
- **The mental model is Copilot Studio / Power Platform-era, not Agent 365-era.** Copilot Chat vs licensed M365 Copilot is not modelled.
- **The UI is professional but generic** — it reads as a template/AI-generated dashboard with no owned visual identity.

**Best use today:** a *facilitated* FastTrack assessment + roadmap instrument. **Not yet** an unattended, customer-self-serve "am I ready?" oracle.

---

## 1. Functional assessment — 12 use cases

Assessed against the real workflows this tool would support in a Copilot/Agent onboarding engagement.

| # | Use case | Status today | Verdict |
|---|---|---|---|
| 1 | Tenant readiness before Copilot rollout | Stage-1 gate: CA baseline, DAG, RCD, labels, DLP, lifecycle, audit (AGA-301/401/402/403/404/409/410/901) | **Strong** |
| 2 | Oversharing remediation (the #1 real blocker) | DAG reports, interim brakes (RCD/RAC/Restricted Search), label publish, lifecycle | **Strong design / live execution is demo-only** |
| 3 | Identity & access baseline | CA + legacy-auth block, risk-CA+PIM, AI Administrator delegation | **Strong** |
| 4 | Data protection / Purview for Copilot | DLP, labels, label inheritance, DSPM for AI, DLP for M365 Copilot, retention, eDiscovery | **Strong** |
| 5 | Agent inventory / shadow-agent discovery | AGA-102/103 exist but inventory is self-asserted/demo — no real discovery collector | **Partial** |
| 6 | Agent register / RACI ownership | 4 owners, risk+autonomy tiers, identity mode, value hypothesis, 90-day attest expiry | **Strong as a register / gap on Agent-365 wiring** |
| 7 | Remediation roadmap | Phased by stage, persona, effort, `dependsOn`, auto-close on re-scan, reopen on drift | **Strong** |
| 8 | Change execution + audit trail | Dry-run diff → approve → apply → auto-verify → audit with approver | **Strong (demo targets only)** |
| 9 | Exec / CISO posture briefing | "Export report" = browser print-to-PDF only; no branding, CSV, or JSON export | **Partial** |
| 10 | Compliance mapping (NIST / ISO 42001 / EU AI Act) | Crosswalk **exists in `app/catalog/stages.json` but is never rendered in the UI** | **Data strong / surfacing gap** |
| 11 | FinOps / value realization | Consumption, cost attribution, value hypothesis checks — but no real cost/Copilot-Credits data | **Partial** |
| 12 | Live tenant scan | Read-only; only **licensing + Conditional Access** collectors are real, the rest report "not collected" | **Partial (by current MVP design)** |

(A 13th — progress tracking via the trajectory sparkline + history — is **Strong**.)

---

## 2. Scoring correctness — CRITICAL

This section is the most important. The stage badge and headline scores can be **misleading** because of how the engine treats unmeasured checks.

### 2.1 Root cause — `placeStage()` ignores unmeasured checks

In `app/src/engine.js`, a stage gate passes when there are **no failing checks among the *applicable* ones**, and "applicable" excludes both `not-collected` and `license-gated`:

```js
// app/src/engine.js — placeStage()
const applicable = ids.filter((id) => ['pass', 'fail'].includes(byId[id]?.status));
const failing = applicable.filter((id) => byId[id].status === 'fail');
if (applicable.length > 0 && failing.length === 0 && Number(g) === stage) stage = Number(g) + 1;
```

Consequences:
- **Sparse data inflates the stage.** The fewer checks collected, the easier every gate clears — the opposite of correct behaviour.
- **A gate can pass on a single collected+passing check.** There is no minimum-coverage floor.
- The live collectors only cover **licensing + Conditional Access** (`app/src/collectors.js` `SCOPES`; confirmed in `app/README.md`), so a real self-serve live scan clears gates on a handful of measured checks and silently ignores 30+ unmeasured ones.

### 2.2 Empirical proof (reproduced against the real engine)

Synthetic snapshots fed through the actual `evaluate()` + `placeStage()`:

| Scenario | Checks passing | Stage badge | Config score |
|---|---|---|---|
| A. Nothing measured | 0 / 40 | **Stage 1** | null |
| B. Only CA baseline = true | 1 / 40 | **Stage 2** | 100% |
| C. One pass in gate 1 + one pass in gate 2 | 2 / 40 | **Stage 3 ("Agent Ready")** | 100% |
| D. + three Stage-3 config checks | **5 / 40** | **Stage 4 ("Frontier")**, **0 attestations** | 100% |

**5 green checks out of 40, no governance attested → "Frontier ready" at 100%.** This must not ship as-is.

### 2.3 The config-score denominator is misleading

In `app/src/engine.js`, `rate()` divides passes by *applicable* (pass+fail) checks only. So **config score reads 100% when only 2 of 40 checks were measured**. Placed next to a stage badge, this actively misleads a reader into thinking the tenant is fully configured.

### 2.4 "Frontier ready" is ~70% self-asserted by construction

The Stage-3 exit gate (between Agent-Ready and Frontier) is 16 checks in `app/catalog/stages.json`; **11 are pure `attest`** (kill-switch drilled? decision rights documented? owners attested?) and only a few are objective `config`. Attest checks read from the register/questionnaire the user fills in themselves, so the tool **cannot independently verify** them. Clearing that gate currently means "we ticked our own governance boxes."

### 2.5 Required fixes (CRITICAL)

1. **Add a coverage floor to `placeStage()`** — a gate must NOT pass unless ≥ *N%* (suggest 80%) of its checks are *collected*. `not-collected` should **block** a gate, not be silently excluded. Make the threshold configurable in `stages.json`.
2. **Surface coverage everywhere a stage is shown** — render "**X of Y gate checks measured**" next to every stage badge. Never show a stage verdict without its coverage.
3. **Fix the headline config-score framing** — either show coverage alongside the % ("100% of 2 measured"), or compute against total applicable-in-scope, so a 2/40 scan cannot read as 100%.
4. **Visually separate "measured" vs "attested"** in the verdict so self-assertion cannot be mistaken for evidence.
5. **Build out the live collectors** for the Stage-1/2 config checks (oversharing/DAG, labels, DLP, connectors, audit) so the objective layer is real, not demo. Until then, label the live verdict as "partial coverage."

> Reviewer confidence in the readiness badge **as-is**: ~20–30% if self-administered; ~45–55% if TSME-facilitated with the register/questionnaire filled honestly and config hand-verified. The §2.5 fixes are what move it above 80%.

---

## 3. Product / domain gaps (for the reviewer's mandate)

1. **Agent 365 vocabulary is absent.** The model is Copilot Studio + Power Platform + M365 admin. The register is a local JSON store, **not wired to Entra Agent ID / Agent 365**. ⚠️ Before positioning this as "Agent 365-aligned," validate the register/identity checks (AGA-501/502/503) against current Entra Agent ID + Agent 365 capabilities and naming — these were **not** verified against live Microsoft docs in this review.
2. **Copilot Chat vs licensed M365 Copilot is not modelled.** One generic licensing check (AGA-101) + a Credits mention (AGA-701). The free/metered **Copilot Chat** tier and pay-as-you-go agent economics are not first-class — thin if "onboard Copilot Chat" is the engagement.
3. **The governance tool does not govern itself.** Login lets you pick a role (Global Admin, AI Governance Lead, Operator…) in `app/public/app.js` (`showLogin`/`doLogin`) but it is **attribution-only** — any signed-in user can apply fixes and attest. A tool preaching least-privilege and decision-rights should enforce RBAC on its own actions (e.g., only certain roles approve `fix/apply`, only owners attest).
4. **No multi-customer / portfolio view.** One tenant at a time (2 demo fixtures + 1 live). No cross-customer comparison or persistence for a consultant running many engagements.
5. **Compliance crosswalk is built but hidden.** `app/catalog/stages.json` has a NIST AI RMF / ISO 42001 / EU AI Act crosswalk per control that is **never surfaced in the UI** — a quick, high-value win for CISO/compliance conversations.
6. **Export is weak.** "Export report" opens `/api/report` for browser print-to-PDF only. No branded PDF, CSV of findings, or JSON export for a customer leave-behind.

---

## 4. UI / UX feedback

### 4.1 What works (keep)
- 7-tab IA mirrors the real assessment flow.
- The **"gap" callout** (config-ready but governance-untracked) is the single best idea in the product — protect and amplify it.
- Stage chips with "to reach Stage N, clear these checks" is good wayfinding.
- The diff → approve → apply → audit modal is clear and credible.
- Status pills carry **text**, not colour alone (good for accessibility).
- M365-native Segoe/blue palette feels familiar.

### 4.2 Why it reads as generic / "AI-made"
All of these are in `app/public/styles.css`:
1. `grid-template-columns: repeat(auto-fit, minmax(230px, 1fr))` — the most common LLM dashboard layout (a row of equal white cards).
2. `--blue: #0f6cbd` — the default Fluent sample blue; no owned brand colour.
3. Segoe UI system stack — inherits the OS, zero type personality.
4. Uniform 10px radius + flat 1px hairline borders + white-on-grey everywhere — no depth or hierarchy.
5. Big-number stat cards with uppercase muted letter-spaced titles — the stock "metric card" cliché.
6. Centered 1180px column, symmetric padding — safe and anonymous.
7. Toast / pill / tab-underline / modal are unmodified default components.

Nothing is broken — it's the *median* of everything, so it feels machine-averaged.

### 4.3 Direction to make it distinctive AND professional
This is a **governance / readiness instrument** — design should express rigor and evidence, not SaaS-marketing gloss.
- **Own a palette.** Drop the default blue. Keep chrome near-monochrome (ink/paper/graphite) and let **only the data carry colour** (pass/fail/gated/attest). Restraint reads as serious.
- **Typography with intent.** A characterful heading face + a **monospace for scores, check IDs, diffs, timestamps**. Mono on the numbers signals "audit instrument," which is the actual product.
- **Make the stage journey the spine.** Stage 1→4 should be a persistent rail the whole app hangs off, not chips that appear only on Overview.
- **A signature "gap" visualization.** Give the config-vs-attestation gap one bespoke dual-track viz that becomes the brand mark, instead of two generic bars.
- **Asymmetry + density.** Left rail for nav + stage state; denser evidence tables; intentional whitespace. Kill the "row of identical cards" reflex.
- **Texture of credibility.** Treat evidence citations, "measured vs attested," and timestamps as first-class typographic elements, not muted afterthoughts.

### 4.4 Usability fixes
- Every change requires a manual **Save → Run assessment**; make scoring reactive or auto-prompt the re-run.
- The 40-row **Findings** table has no filter / sort / search / severity ranking — add these.
- Add accessibility pass: modal focus trap + `Esc` to close, ARIA roles, visible focus rings.
- Despite the viewport meta tag, the single 1180px column is not genuinely responsive — verify tablet/mobile.
- Add empty-state coaching on tabs that currently render bare "run an assessment first" text.

---

## 5. Prioritized fix backlog

### P0 — correctness (must fix before customer-facing use)
- [ ] Coverage floor in `placeStage()` so `not-collected` blocks a gate (§2.5.1).
- [ ] Show "X of Y gate checks measured" next to every stage badge (§2.5.2).
- [ ] Fix config-score denominator / framing so 2/40 cannot read as 100% (§2.5.3).
- [ ] Visually separate measured vs attested in the verdict (§2.5.4).

### P1 — credibility & scope
- [ ] Enforce role-based permissions on `fix/apply` and `attest` (§3.3).
- [ ] Surface the NIST/ISO/EU crosswalk in the UI (§3.5) — data already exists.
- [ ] Build live collectors for Stage-1/2 config checks (§2.5.5).
- [ ] Real export: branded PDF + CSV findings + JSON (§3.6).

### P2 — domain alignment
- [ ] Model Copilot Chat vs M365 Copilot licensing + pay-as-you-go agent economics (§3.2).
- [ ] Validate & wire agent-identity checks to Entra Agent ID / Agent 365 (§3.1) — verify naming against live docs first.
- [ ] Multi-customer / portfolio view (§3.4).

### P3 — UI distinctiveness & usability
- [ ] Restyle toward an "audit instrument" identity (§4.3).
- [ ] Findings filter / sort / search / severity (§4.4).
- [ ] Accessibility + responsive pass (§4.4).

---

## 6. Verification notes for the reviewer's claims
- Live loop smoke-test: Contoso → Stage 1, 17% config / 0% attest, 40 results; Fabrikam → Stage 3, 79% config / 92% attest, 3 agents. Matches the documented thesis.
- The §2.2 table was produced by running synthetic snapshots through the app's own `evaluate()` + `placeStage()` (not hand-calculated). The developer can reproduce by importing `app/src/engine.js` and evaluating sparse snapshots.
