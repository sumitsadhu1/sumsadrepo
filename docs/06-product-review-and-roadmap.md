# Product Review & Roadmap — MVP Assessment (v0.1)

Two-persona review of the runnable MVP (`app/`), an honest production-readiness verdict, and the re-planned roadmap. This document drives the next build phases.

## Review A — AI Governance Stakeholder (CAIO / risk owner)

**Strengths:** Config-vs-attestation scoring with the gap as the headline number; stage gates with named exit criteria; plan tasks that re-verify themselves by re-scan.

**Failures:**
1. **Findings carry no evidence.** A boolean "fail" with one sentence can't go to an audit committee. Need affected objects, counts, policy names, portal links.
2. **The attestation layer is honor-system theater — violating the product's own thesis.** Radio buttons with no identity, no evidence artifact, no approval chain. *Oversight ≠ process integrity* applies to this app too.
3. **No board-ready output.** No PDF/PPT export, no trend visualization, no framework-crosswalk view in product.
4. **Single-player.** Governance is multi-stakeholder; one anonymous session can't represent four owners, gate approvers, and a forum.

## Review B — Global Admin

**Strengths:** Zero dependencies (fully auditable), read-only by design, device-code flow with narrow delegated scopes, license-gated checks skip honestly, data stays local.

**Failures:**
1. **Live mode hollow:** 2 collectors ≈ 5/40 checks on a real tenant. A *full assessment* of a real environment is not possible.
2. **Token stored in plaintext** on disk; **the web UI has no authentication**; localhost binding not enforced. Disqualifying for a security tool.
3. **Tenant-level booleans where reality is granular** (which DLP policies? simulation or enforce? which sites?). Partial credit matters.
4. **No operational hardening:** no token refresh, no throttling/paging, no structured logs.

## Verdict

**Not production ready for a full assessment — correctly so for this phase.** The MVP proved the hard part: the catalog→engines contract works end to end (assess → plan → fix → verify → attest → re-score). Usable today for facilitated demos and framework workshops; not for unattended self-assessment of a real tenant.

## Roadmap (re-planned from review)

| Pri | Work | Addresses | Status |
|----|------|-----------|--------|
| P0 | Live collector buildout (Purview, SharePoint admin, Power Platform, agent inventory; PowerShell sidecar for non-Graph surfaces). Target ≥70% of F-tier checks live | Admin #1 | **Started** — applications/credentials, sensitivity labels collectors added; throttling + paging added |
| P0 | Security hardening: token encrypted at rest + in-memory access token + refresh, app access-key auth, localhost-only binding | Admin #2, #4 | **Done (v0.2)** — Entra SSO for the app itself remains P1 |
| P1 | Evidence-grade findings: objects/counts/links per check, drill-down, partial credit | Stakeholder #1, Admin #3 | **Started** — evidence pipeline + UI display in v0.2 |
| P1 | Real attestations: signed-in identity, evidence attachments, visible expiry, approval chains | Stakeholder #2 | **v0.3** — attributed attestations w/ identity, timestamp, expiry, notes; Entra-verified identity + approval chains still open |
| P2 | Executive output: PDF/PPT export, trend charts, crosswalk view | Stakeholder #3 | **v0.3** — HTML report (print→PDF) w/ crosswalk + trajectory; PPT/theming open |
| P2 | Multi-user + roles; Dataverse register; Planner/DevOps sync | Stakeholder #4 | Open |
| P3 | Operator write path (only after app auth is Entra-grade) | — | Blocked by P1 |

**Definition of production-ready (v1):** a Global Admin runs it against a real tenant and ≥70% of foundational checks return evidence-backed results; every attestation carries identity + timestamp; tokens never on disk in plaintext; stakeholder can export a board-ready report.
