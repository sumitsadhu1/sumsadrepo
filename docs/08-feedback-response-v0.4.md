# Response to Consolidated Review (FEEDBACK.md) — v0.4 Disposition

Disposition of the UI-designer + M365 Solution Architect review dated 2026-06-11. The reviewer's §2 finding was reproduced against the engine before fixing (5/40 sparse passes → Stage 4 @ 100%) and is now locked down by regression tests.

## P0 — correctness (ALL FIXED in v0.4)

| Finding | Fix | Proof |
|---|---|---|
| §2.5.1 No coverage floor — `not-collected` silently excluded, sparse data inflates stage | `placeStage()` now requires ≥`gateCoverageMin` (80%, configurable in `stages.json`) of a gate's checks to be **measured**; unmeasured checks block the gate and are listed as blocking | `test/scoring.test.js` reproduces reviewer scenarios B & D: 1-check and 5-check sparse snapshots now stay **Stage 1** |
| §2.5.2 Stage verdict without coverage | Every stage chip shows "X/Y gate checks measured · N self-attested"; the "To reach Stage N" panel shows gate coverage vs minimum and lists not-yet-measured checks as blockers; report shows per-gate coverage | Live check: sparse live snapshot renders "gate1 coverage 20% → passed: false" |
| §2.5.3 Config score reads 100% on 2/40 measured | Score now always paired with coverage: "100% **of 2/24 measured**" + explicit PARTIAL COVERAGE warning in UI and report | `configCoverage {measured, inScope}` in scores; license-gated checks excluded from scope (unmeasurable), not-collected included (reduces coverage) |
| §2.5.4 Measured vs attested not separated | Config card badged **measured**; attestation card badged **self-attested** with "asserted by owners, not independently verifiable"; findings pills show `self-attested`; gate detail reports attest share (gate 3: 11/16) | UI + report + `gateDetail.attestCount` |

## P1 — credibility & scope

| Finding | Status |
|---|---|
| §3.3 RBAC on the tool's own actions | **Fixed** — server-enforced role permissions: `fix/apply` requires Global Admin / Security Admin / AI Governance Lead; `attest` requires Global Admin / AI Governance Lead / Compliance Admin / Agent Owner; plan updates require a plan-managing role. Operator/Solution Architect are read-and-analyse. UI hides actions the role lacks; server rejects regardless. |
| §3.5 Crosswalk hidden | **Fixed** — NIST/ISO/EU line rendered under each control in the per-control panel (was already in the report). |
| §3.6 Export weak | **Improved** — CSV findings export + full JSON export (assessment+plan+register) added alongside the print report. Branded PDF/PPT still open (P2). |
| §2.5.5 Live collectors for Stage-1/2 | **Open — the long pole.** Until built, the coverage floor + partial-coverage labels make a sparse live verdict honest instead of inflated. |

## P2/P3 — accepted into roadmap (not in v0.4)

- Copilot Chat vs licensed M365 Copilot modelling, pay-as-you-go agent economics (§3.2) — next catalog revision.
- Entra Agent ID / Agent 365 wiring for AGA-501/502/503 (§3.1) — to be validated against live docs first, per reviewer's own caution.
- Multi-customer portfolio view (§3.4).
- Visual identity ("audit instrument" restyle), full a11y/responsive pass (§4.3) — partial steps taken in v0.4: monospace for check IDs/scores/coverage, findings sorted failures-first with filter/search/status facets, Esc closes modals, empty-state coaching on Findings, auto re-assessment after questionnaire/register changes (removes the manual Save → Run loop, §4.4).

## Reviewer's confidence statement, revisited

The review put confidence in the readiness badge at ~20–30% self-administered because sparse data inflated the verdict. With the coverage floor, blocking unmeasured checks, paired coverage on every score, and measured/attested separation, **the badge can no longer overstate** — it can only understate until live collectors widen coverage. The remaining path above 80% confidence is exactly §2.5.5: real Stage-1/2 collectors.

---

# v0.5 — response to the re-review (verification update of 2026-06-11)

The re-review confirmed all P0/P1 fixes empirically and left two items. Both are addressed:

## RBAC denials now return 403 (was 400, flagged as cosmetic)

`server.js` attaches `status: 403` to permission-denial errors; the catch-all uses it. 401 remains "not signed in", 403 is now "signed in but not permitted", 400 is malformed/other.

## Live collectors — wave 1 of §2.5.5 (the long pole)

New read-only Graph collectors, each with a pure unit-tested transform, endpoints verified against Microsoft Learn (v1.0):

| Check | Collector | Honesty notes |
|---|---|---|
| **AGA-203** AI Administrator delegated | `GET /directoryRoles?$expand=members` (`Directory.Read.All`) | Measures: AI Administrator role active with members. Evidence includes Global Admin member count with a least-privilege flag when > 5. |
| **AGA-901** Purview Audit captures Copilot interactions | `GET /security/auditLog/queries` (`AuditLogsQuery.Read.All`) | **Labelled a proxy measurement in its own evidence**: the audit search API answers only when the unified audit store is on, and Copilot/agent interactions are recorded automatically while auditing is enabled. Consent missing → not collected, never guessed. |
| AGA-402 (context only) | `GET /admin/sharepoint/settings` (`SharePointTenantSettings.Read.All`) | Tenant sharing capability + external-resharing posture attached as evidence; **the check stays not-collected** because Graph does not expose RCD/RAC state. |
| AGA-410 (context only) | `GET /policies/authorizationPolicy` (already-consented `Policy.Read.All`) | Guest-invite posture as evidence; check stays not-collected (Teams tier protection has no Graph surface). |

Gate-1 measured coverage in a fully-consented live scan rises from 2/8 to 3/8 — still below the 80% floor, so a live tenant still reads **Stage 1, partial coverage**, which is the correct verdict. The remaining gate-1 checks (DAG reports, RCD/RAC, DLP, site lifecycle, Teams tiers) have **no Microsoft Graph surface**: closing them requires the SharePoint admin REST API and Security & Compliance PowerShell, which is wave 2.

Tests: 23/23 (3 new transform tests assert that collection failures return `null` — a failed collector can never fabricate a measurement, and context-only transforms never flip a check).

---

# v0.6 — live collectors wave 2: the evidence pack (§2.5.5 closed for gate 1)

Wave 1 hit the ceiling of what Graph exposes. The remaining gate-1 checks (DAG, RCD/RAC, DLP, site lifecycle, Teams tiers, retention) live behind SharePoint Online Management Shell and Security & Compliance PowerShell — surfaces a zero-dependency Node server cannot reach. v0.6 closes the gap with the same pattern zerotrustassessment uses: **out-of-band collection, in-band validation**.

## How it works

1. `scripts/collect-evidence.ps1` (read-only, every cmdlet a `Get-*`, names verified against Microsoft Learn: `Get-SPODataAccessGovernanceInsight`, `Get-SPOSite … RestrictContentOrgWideSearch/RestrictedAccessControl`, `Get-LabelPolicy`, `Get-DlpCompliancePolicy`, `Get-AdminAuditLogConfig`, `Get-RetentionCompliancePolicy`) runs where the admin already has the modules and roles, and writes `evidence-pack.json`. Sections fail independently → skipped sections stay *not collected*, never guessed.
2. The app imports the pack (`POST /api/evidence/import`) behind the **fix permission** — injecting measured posture carries the same weight as applying a fix. Validation enforces schema, collector identity, value types, and a path whitelist: a pack **cannot** set paths outside its charter (e.g. it cannot flip the CA baseline).
3. Pack values overlay the snapshot with **provenance as the first evidence line** on every check they feed: collected-when/by-whom, imported-by-whom. Packs **expire after 30 days**: an expired pack contributes nothing and leaves a dated EXPIRED note where its measurements used to be — regressions are visible, not silent.
4. AGA-409/410 have no API surface at all (admin-center only — verified, no Get cmdlet exists). The script records them as **operator-verified** entries, which require a named policy reference and are labelled as such in evidence. This is the reviewer's own "facilitated, config hand-verified" mode, made structured and attributable.

## What it changes

Gate 1 is 10 checks. Graph wave 1 measures AGA-301/203 (plus 403 best-effort); the questionnaire answers AGA-204; the pack measures the remaining seven. **All 10 gate-1 checks are now measurable — a tenant can clear Stage 1 on evidence**, which was mathematically impossible before wave 2 (max 6/10 < 80% floor). The pack also feeds AGA-903 in gate 2.

Verified live against the running server: an Operator gets 403 on import; a Lead's import re-assesses immediately with provenance on every fed check; gate 1 reports 10/10 measured **and still fails on the demo tenant whose measured values fail** — the pack widens coverage, it cannot manufacture passes. Tests: 28/28, including the headline regression test ("gate 1 clears on measured evidence only") and its inverse (same tenant without the pack stays Stage 1).

---

# v0.7 — response to the live-testing findings (FEEDBACK §7–§8)

Triage: everything in §7.1/§7.2/§8.1/§8.2 that touches data integrity or the evidence model is **accepted and fixed**; "remove demo tenants" is **rejected** (agreeing with the reviewer's own note — demo is the only place the Configure pipeline can run); U5 and the standing P2/P3 items stay deferred.

| Finding | Fix |
|---|---|
| §7.1 / B1+B2 — reset broken in live mode; plan/history/audit/last-assessment global → cross-tenant bleed; demo plans verified against live results | **All stores now per-mode** (`plan-<mode>`, `history-<mode>`, `audit-<mode>`, `last-assessment-<mode>`); `runAssessment`/exports/report read only the current mode. `POST /api/workspace/reset` works in **every** mode: demo re-seeds the fixture; live clears the workspace but never the encrypted sign-in token (live reset gated behind the fix permission — clearing an audit trail is destructive). UI button is mode-aware and errors surface as toasts. |
| B3 — render crash on stale assessment shape | Defensive `?? []` on `gateDetail.failing/notCollected` in `renderOverview`. |
| B4 — unhandled errors after server restart | Mode-select / apply / task handlers wrapped; 401 path falls through to the login overlay without a pageerror. |
| B5 — Plan and Overview disagreed on next steps | `generatePlan` now emits **measure** tasks for not-collected checks (action: connect collector / import evidence pack / record attestation); `verifyPlan` auto-closes them once the check is measured (even as failing) and reopens on coverage regression. Plan and "To reach Stage N" now name the same blockers. |
| §7.2.1 — `aiPolicy` orphaned | New check **AGA-907** (Control 9, Stage 1, gate 1): "AI acceptable-use policy approved and communicated." Catalog is 41 checks; gate 1 is 11. |
| §7.2.2 — dead inputs | `decisionRightsKnown` (promise the code didn't keep) and `autonomyAppetite` (register owns autonomy) **removed** from the questionnaire. |
| §7.2.3 / §8.3 — self-stage discarded | **Belief vs evidence** card on Overview whenever self-assessed ≠ measured stage, in both directions. |
| §7.2.4 / §8.3 — questionnaire attestations had no identity/age/evidence | Governance answers are now stamped `{value, by, at, note}`; **expire after 90 days** (an expired Yes fails the check with an EXPIRED evidence line); changing one **requires the attest decision-right** (server-enforced 403); optional evidence note per answer; unchanged answers keep the original stamp (re-saving cannot re-date someone else's attestation); seeded fixture answers display as "seeded/unattributed". Evidence lines (who/when/note) flow into findings and the report. |
| U1 contrast, U2 microcopy, U3 register delete, U4 reset visibility | Bar labels on white chips (WCAG); disabled Attest button with role tooltip; register entries deletable behind the fix permission with confirm; workspace card is mode-aware. |

Tests: 32/32 — new `test/isolation.test.js` locks in per-mode audit/plan/history isolation, reset semantics (live token survives), answer stamping/expiry/permission, AGA-907 wiring, and measure-task lifecycle.

---

# Scope decision (2026-06-12, product owner): one customer at a time, self-serve

The tool's scope is a **single customer running it against their own tenant** — download, run locally, connect read-only, work the journey. Consequences for the open backlog:

- **§3.4 multi-customer / portfolio view — CLOSED (out of scope).** One instance per customer/engagement; all state local to that instance.
- **§9.4 concurrent-use caveat (global tenant mode) — by design.** A single customer workspace assumes one operating team on one instance; no per-session tenant switching is needed.
- **Self-serve onboarding shipped (v0.7.3):** first-run Overview presents the "connect your tenant" path as primary (with the sample tenants as the no-setup alternative); the full Entra one-time setup steps are inline in Settings; the mode selector reads "Your tenant (live, read-only)" first; README opens with a customer quickstart.
- The reviewer's "best use today: facilitated instrument" caution still applies to *interpretation* — but the §2/§10 honesty fixes (coverage floors, anti-fabrication, provenance) are what make unattended self-serve verdicts safe: the tool can understate, never overstate.
