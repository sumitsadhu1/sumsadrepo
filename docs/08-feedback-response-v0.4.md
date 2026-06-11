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
