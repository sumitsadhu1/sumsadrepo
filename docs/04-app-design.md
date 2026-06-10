# App Design — "Agent Governance Assessment" (working name: AGA)

A GitHub-distributed tool a customer downloads/deploys themselves, connects to their tenant **read-only**, answers a short journey questionnaire, and receives: a stage placement, a blended readiness score, a least-privilege RBAC setup map, and a sequenced, trackable project plan to their declared target stage.

Design lineage is deliberate and named:

- **microsoft/zerotrustassessment** → the assessment engine pattern (module + snapshot + declarative checks + single-file HTML report + workshop/roadmap duality).
- **rbacmap.com** → the role↔task navigator pattern, reused for governance-persona RBAC setup and per-agent least-privilege recommendations.
- **The two-layer measurement model** (config vs. attestation) → the part no existing assessment ships: the Agent Governance Register.

---

## 1. Architecture (zerotrustassessment pattern, adapted)

```
┌─────────────────────────────────────────────────────────────────┐
│  AgentGovernanceAssessment (PowerShell 7 module, PS Gallery +    │
│  GitHub releases)                                                │
│                                                                  │
│  Connect-AgaAssessment   →  delegated interactive OR cert-based  │
│                             app-only; ALL scopes read-only       │
│  Invoke-AgaAssessment    →  1) journey questionnaire (or -Answers│
│                                file for re-runs)                 │
│                             2) EXPORT: tenant snapshot → local DB│
│                             3) EVALUATE: checks as queries over  │
│                                the snapshot (never live calls)   │
│                             4) SCORE + PLAN: stage placement,    │
│                                blended score, project plan       │
│  Output: single-file interactive HTML report (React, bundled)    │
│          + results JSON + plan export (Planner/DevOps/CSV)       │
└─────────────────────────────────────────────────────────────────┘
            │ optional, write happens only HERE, with consent
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agent Governance Register (deployed INTO the customer tenant:   │
│  Dataverse table or SharePoint list, ideally extending the       │
│  existing agent inventory) + Power Automate approval flows for   │
│  promotion / funding / connector gates + attestation reminders   │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions inherited from zerotrustassessment:**

| Decision | Rationale |
|----------|-----------|
| PowerShell 7 module, `Connect-/Invoke-/Disconnect-` verbs | Familiar, auditable, runs where the admin already works; no SaaS to trust |
| Single function returning the full read-only scope list (`Get-AgaGraphScope`) | The trust signal that makes security teams willing to run it — every scope inspectable before consent |
| Snapshot-then-evaluate (export to local DB, checks query the snapshot) | Fast, re-runnable, throttle-safe; the snapshot never leaves the machine |
| One check = `Test-Assessment.AGA-<ID>.ps1` + paired `.md` with `%TestResult%` substitution | Checks and remediation docs live side by side in source control; catalog queryable without execution |
| Declarative attribute metadata per check (Control, Stage, MeasurementType, RiskLevel, UserImpact, ImplementationCost, MinimumLicense, framework mappings) | Drives filtering, license gating, scoring, and the crosswalk (NIST AI RMF / ISO 42001 / EU AI Act fields generalize zerotrustassessment's SFI-pillar field) |
| License/connected-service gating: skip-with-explanation, never fail | An E3 tenant isn't "failing" E5 checks; it's capped at foundational — and the report says exactly which checks a license upgrade unlocks |
| Single-file HTML report with admin-portal deep links | Email-able to the CISO; no hosting required |
| Assessment + workshop duality | The scan is the evidence; the generated project plan is the customer conversation |

**Safe tenant connection ("connects to their tenant in a safe manner"):**

- Delegated mode: interactive sign-in, least-privilege read scopes, nothing persisted but the local snapshot.
- App-only mode: customer creates the app registration themselves (the tool prints the exact manifest), certificate auth, read-only application permissions — for scheduled re-runs.
- Read scopes (representative): `Directory.Read.All`, `Application.Read.All`, `Policy.Read.All`, `Policy.Read.ConditionalAccess`, `Policy.Read.PermissionGrant`, `RoleManagement.Read.All`, `AuditLog.Read.All`, `Reports.Read.All`, `Sites.Read.All`, plus Copilot/agent and Power Platform admin read APIs as they reach GA.
- The **only** write path is the optional register deployment, separately consented, into the customer's own tenant. The tool itself never phones home; telemetry is opt-in.

## 2. The journey questionnaire (grounding what no API can see)

Asked at first run; stored as an answers file so re-runs diff against intent:

1. **Where are you?** (self-assessed bucket 1–4 — then contrasted with the scan's placement; the delta is the first finding)
2. **Where do you want to go, by when?** (target stage + horizon)
3. **The decision-rights question:** *today*, who has the right to approve, change, promote, fund, or retire an agent? ("nobody/don't know" is a valid and common answer — it seeds the Stage 3 plan)
4. Policy & people: AI acceptable-use policy? Executive sponsor? Governance forum? IR owner?
5. Ambition shape: Copilot adoption only, or agents? Maker population size? Autonomy appetite (suggest / approve / autonomous)? Regulatory context (EU AI Act exposure, sector rules)?

Questionnaire answers populate the initial **attestation** records — they are the seed of the register, not a throwaway survey.

## 3. Stage placement & blended score

- **Config score** per control = weighted pass-rate of `CONFIG`/`HYBRID` checks (license-gated checks excluded from denominator, listed as "unlockable").
- **Attestation completeness** per control = register fields filled × currency (unexpired) × approval state.
- **Stage placement** = rule table over both (see `02-maturity-journey.md` §"Stage placement"): licensing caps the ceiling (foundational vs. optimized), config decides 1↔2, management-controls posture decides 2↔3, register health decides 3↔4 — questionnaire resolves ties and intent.
- Headline visual: a 2×2 of config score vs. attestation completeness, per control and overall. The off-diagonal gap is the pitch: *"90% config-ready, 30% governance-tracked."*

## 4. RBAC setup mapper (the rbacmap.com-inspired feature)

Two distinct uses of the same engine — a curated catalog mapping **governance tasks → least-privilege roles** across Entra, M365 admin center, SharePoint, Purview, Power Platform, and Defender:

**A. Persona setup ("who runs this program"):** for each governance persona the plan requires — AI program lead, AI Administrator (connector management via delegated Entra role, not Global Admin), oversharing remediation lead (SharePoint admin + SAM), data security lead (Purview role groups), agent platform admin (Power Platform admin), auditor (read-only Purview Audit/eDiscovery) — the mapper outputs the *smallest role set* that covers the persona's tasks at the customer's current stage, flags Global Administrator usage, and emits a setup checklist (and, where possible, the PIM-eligible assignment script). Stage-aware: Stage 1 needs the remediation personas; Stage 3 adds gate approvers and the IR owner.

**B. Per-agent least privilege (feeds check AGA-306):** given an agent's declared purpose and its actual connectors/knowledge sources/permissions from the snapshot, recommend the minimal set — the agent-permission analog of rbacmap's Role Builder ("which roles does this task actually need" → "which permissions does this agent actually need"). Divergence = finding; accepted divergence = recorded exception in the register.

## 5. Project plan generator & tracking

From (current stage, target stage, license tier, failed checks, missing attestations) the tool emits a sequenced plan:

- **Sequencing follows the published Microsoft paths** — Zero Trust steps 1–7 ordering for Stage 1 work; blueprint pillars (remediate oversharing → guardrails → regulations); management-controls before agent scale-out — then layers register/attestation milestones, which Microsoft's guidance doesn't cover.
- Every task carries: check ID(s) it clears, persona (from the RBAC mapper), license prerequisite ("requires E5 Purview — or accept this compensating control"), effort band, and verification ("re-run scan; AGA-402 passes").
- **First-Then dependency view** (workshop-style), exportable to Planner / Azure DevOps / GitHub Issues / CSV.
- **Tracking = re-runs.** Each `Invoke-AgaAssessment` re-run diffs against the last snapshot and the plan: checks newly passing auto-close tasks; regressions reopen them; attestation expiries surface as new tasks. The HTML report shows trajectory, not just position.

## 6. The register component (optional deploy, the differentiator)

Deployed from the repo into the customer tenant on request (solution package):

- **Dataverse table (or SharePoint list)** — one row per agent: owners (RACI ×4), risk tier, autonomy tier, identity mode, approval status, value hypothesis, budget owner, last-reviewed, attestation expiries, retirement date.
- **Power Automate flows** — attestation reminders + expiry amber-flagging; promotion/funding/connector approval flows whose outcomes write back as evidence rows.
- **Cadence pack** — governance-forum agenda auto-generated from register state: new agents awaiting tier, expiring attestations, over-budget agents, agents missing value review, incidents.

The scan reads the register on subsequent runs — closing the loop between the config layer and the governance layer in one report.

## 7. Repo layout (proposed)

```
/src/powershell/           module: public cmdlets, private/{export,db,checks-engine,license,rbacmap}
/src/powershell/tests/     Test-Assessment.AGA-<ID>.ps1 + .md pairs (catalog in 03-assessment-catalog.md)
/src/report/               React single-file report viewer
/src/register/             Dataverse/SharePoint solution + flows (optional deploy)
/catalog/rbac/             governance task ↔ role mapping data (versioned YAML)
/catalog/plans/            stage-transition plan templates
/docs/                     this framework (01–04)
```

## 8. Build order (MVP → frontier)

1. **MVP:** module + scopes + snapshot + ~25 highest-signal CONFIG checks (Stage 1/2 boundary: oversharing, labels, CA, audit, connector/sharing/DLP-publish posture) + questionnaire + HTML report with stage placement and plan.
2. **v2:** full catalog, license gating, RBAC persona mapper, plan export + re-run diffing.
3. **v3:** register deployment + attestation machinery + blended score (the differentiator).
4. **v4:** per-agent least-privilege recommender, kill-switch drill harness, agent-identity lifecycle checks, continuous mode (scheduled app-only re-runs).
