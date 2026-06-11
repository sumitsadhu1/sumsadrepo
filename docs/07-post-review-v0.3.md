# Post-Review v0.3 — Global Admin & Solution Architect Walkthrough

Re-review after closing the v0.2 review gaps. Two personas walk every step; each step gets a **Functionality index (F)** and **Usability index (U)** out of 10. Verified against the running app, not the spec.

**What shipped in v0.3:** attributed attestations (signed-in identity + timestamp + 90-day expiry + evidence note), identity-attributed approvals in the fix pipeline and task changes, "To reach Stage N" transparency panel, trajectory sparkline, board-ready executive report (print → PDF) with NIST/ISO/EU crosswalk, sign-in now requires name + role.

## Step-by-step scores

| # | Step | Raj (Global Admin) F / U | Maya (Solution Architect) F / U | Notes |
|---|------|--------------------------|------------------------------|-------|
| 1 | Install & first run | 9 / 9 | 9 / 8 | Zero deps, one command, access key printed once. Maya: no container/azd packaging yet. |
| 2 | Sign-in | 7 / 8 | 6 / 8 | Name+role now mandatory and attributed. But identity is **self-asserted** — anyone with the access key can claim "Global Admin". Real fix is Entra SSO (P1, unchanged). |
| 3 | Tenant selection | 8 / 9 | 8 / 8 | Two demo stories + live mode in one dropdown is clean. Maya: no multi-tenant switcher for partner scenarios. |
| 4 | Run assessment | 9 / 9 | 9 / 9 | Instant on demo; honest license-gated / not-collected states. |
| 5 | Overview | 8 / 9 | 9 / 9 | "To reach Stage N: clear these checks" removes the stage-opacity complaint; trend sparkline shows trajectory. The 2×2 gap card remains the best artifact. |
| 6 | Findings + evidence | 7 / 8 | 7 / 8 | Evidence lists with object names where collectors support it. Demo-tenant checks still mostly boolean-with-sentence; live CA/app-identity checks cite real policy/app names. |
| 7 | Fix pipeline | 8 / 9 | 8 / 8 | Dry-run diff → approve → auto re-scan → audit row now shows *who* approved ("Raj (Global Admin)"). Maya: no dual-approval option; requester can self-approve. |
| 8 | Plan | 8 / 8 | 7 / 7 | Auto-close/reopen on evidence works. Missing: dates, assignees (people, not personas), export to Planner/DevOps. |
| 9 | Register & attest | 8 / 8 | 8 / 8 | Attestation modal states what you're asserting; records identity, timestamp, expiry countdown, evidence note. The "attestation theater" finding is materially addressed at MVP level. |
| 10 | Questionnaire | 7 / 8 | 7 / 7 | Seeds attestation layer well. Maya: answers should eventually migrate into per-item attestations with owners, not one form. |
| 11 | Executive report | 8 / 8 | 8 / 7 | One click → print-ready report: stage, scores, gap, per-control + crosswalk, top gaps with evidence, trajectory, generated-by. Maya: no branding/theming, no PPT. |
| 12 | Live mode | 6 / 7 | 6 / 7 | Tokens encrypted, auto-refresh, throttling/paging. Coverage ~9/40 checks — the remaining production blocker. |
| 13 | Architecture (Maya) | — | 9 / 8 | Catalog-as-contract held up through three feature waves with no engine rewrites — the design is proven. Wants: TypeScript types or JSON Schema for the catalog, CI workflow, packaging. |

**Overall: Functionality 7.8/10 · Usability 8.1/10** (v0.2 was ~6.5/7.0). Demo/workshop use: ready. Production single-tenant assessment: blocked only by live-collector coverage and verified identity.

## Remaining gaps (none are new — all tracked)

1. **Live coverage ~25%** of checks — needs Purview/SPO PowerShell sidecar + Power Platform admin API collectors (P0, the long pole).
2. **Identity is asserted, not verified** — Entra SSO for the app (P1); also enables per-role permissions (e.g., only owners attest their agents) and dual-approval.
3. **Plan lacks dates/assignees/export** (P2).
4. **Report theming/PPT** (P2).
5. Engineering hygiene: catalog JSON Schema + CI on GitHub Actions (quick win, recommended next).
