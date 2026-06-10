# Assessment Catalog — What We Check, Where It Lives, and How It's Measured

This catalog grounds the nine controls in the concrete Microsoft surface: the **Copilot Control System** (security & governance · management controls · measurement & reporting), the **Zero Trust for Microsoft 365 Copilot** seven steps, and the **Secure & Govern Copilot foundational blueprint** (remediate oversharing · set up guardrails · meet regulations).

Every check carries:

- **Measurement type** — `CONFIG` (readable from the tenant), `ATTEST` (recorded, time-bound attestation in the register), or `HYBRID` (config proves capability exists; attestation proves it's operated).
- **License tier** — `F` foundational (A3/E3/G3 + SharePoint Advanced Management, which is included with the Copilot license) or `O` optimized (A5/E5/G5 Purview / Defender). License gating follows the zerotrustassessment pattern: checks are *skipped with explanation*, not failed, when the SKU is absent.
- **Stage** — the journey stage where the check first becomes blocking (see `02-maturity-journey.md`).

Check IDs are stable and numbered by control (`AGA-<control><seq>`), one file pair per check in the tool (`Test-Assessment.AGA-101.ps1` + `.md`).

---

## Control 1 — Visibility / Inventory

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-101 | Copilot license posture: seats purchased vs. assigned; pay-as-you-go billing configured deliberately (M365 admin center) | CONFIG | F | 1 |
| AGA-102 | Agent inventory enumerable: agents visible in M365 admin center (Copilot → Agents / integrated apps) and Power Platform Copilot hub | CONFIG | F | 2 |
| AGA-103 | Shadow-agent sweep: Copilot Studio agents per environment vs. register entries; orphaned/ownerless agents flagged | HYBRID | F | 3 |
| AGA-104 | Connector inventory: enabled Copilot connectors and their access permissions reviewed (Microsoft Search admin / M365 admin center) | CONFIG | F | 2 |
| AGA-105 | Grounding-source map: knowledge sources per agent (SharePoint, OneDrive, web, Graph connectors) recorded in register | HYBRID | F | 3 |
| AGA-106 | Inventory freshness: register last-refreshed date within SLA; % agents auto-discovered but unregistered | ATTEST | — | 3 |

## Control 2 — Ownership & Accountability (RACI)

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-201 | Every production agent has business, technical, data, and security owner recorded | ATTEST | — | 3 |
| AGA-202 | Owner attestation currency: re-confirmation within cadence; expired attestations flagged amber | ATTEST | — | 3 |
| AGA-203 | Admin RBAC least privilege: AI Administrator role delegated for connector management (vs. Global Admin use); Power Platform / SharePoint / Purview roles mapped to named people | HYBRID | F | 1 |
| AGA-204 | Executive sponsor and governance forum exist, with minutes on cadence | ATTEST | — | 1 |

## Control 3 — Access & Action Control

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-301 | Conditional Access baseline: MFA all users, MFA admins, legacy auth blocked | CONFIG | F | 1 |
| AGA-302 | Risk-based CA and PIM for privileged roles | CONFIG | O | 1 |
| AGA-303 | Connector allow/block decisions configured (enable or block specific connectors) | CONFIG | F | 2 |
| AGA-304 | Agent sharing limits: Editor/Viewer sharing controls; block/limit sharing rules at managed environment or environment-group level | CONFIG | F | 2 |
| AGA-305 | Copilot Studio DLP policies block publishing to unsanctioned channels | CONFIG | F | 2 |
| AGA-306 | Per-agent least privilege: agent's connectors/tools/knowledge sources vs. its declared purpose (RBAC-mapper recommendation accepted or exception recorded) | HYBRID | F | 3 |
| AGA-307 | Autonomy tier recorded per agent; autonomy never exceeds risk-tier ceiling without recorded exception | ATTEST | — | 3 |

## Control 4 — Security & Data Protection

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-401 | Data Access Governance reports run within last 90 days; site access reviews sent for overshared sites | CONFIG | F | 1 |
| AGA-402 | Interim brakes where needed: Restricted SharePoint Search / Restricted Content Discovery / restricted access control on high-risk sites | CONFIG | F | 1 |
| AGA-403 | Sensitivity labels published; SharePoint/OneDrive Office-file labeling enabled; container labels (sites/Teams) at E5; auto-labeling at E5 | CONFIG | F/O | 1 |
| AGA-404 | DLP policies active for files/email; oversharing notifications on | CONFIG | F | 1 |
| AGA-405 | DSPM for AI: default policies on; data risk assessments targeted at specific locations; policy suggestions acted on | CONFIG | O | 2 |
| AGA-406 | DLP for Microsoft 365 Copilot: sensitive files excluded from Copilot/agent processing | CONFIG | O | 3 |
| AGA-407 | Insider Risk Management AI policies (risky AI use, prompt-injection attempts) + adaptive protection for high-risk users | CONFIG | O | 3 |
| AGA-408 | Label inheritance verified: Copilot/agent outputs inherit sensitivity labels and protections | CONFIG | F | 2 |
| AGA-409 | Stale-content hygiene: site lifecycle management active (inactive/ownerless sites archived); retention policies delete what's not needed | CONFIG | F | 1 |
| AGA-410 | Teams three-tier protection (baseline/sensitive/highly sensitive) and external-sharing posture reviewed | CONFIG | F | 1 |

## Control 5 — Agent Identity & Credential Lifecycle

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-501 | Every agent's identity mode explicit: on-behalf-of user vs. own identity (Entra Agent ID / non-human identity) | HYBRID | F | 3 |
| AGA-502 | Non-human identities inventoried; no orphaned agent identities (owner left, identity lives on) | CONFIG | F | 3 |
| AGA-503 | Agent credentials/secrets have expiry and rotation; no standing secrets beyond policy | CONFIG | F | 3 |
| AGA-504 | Consent and permission grants to agent identities reviewed on cadence (Graph consent policies) | HYBRID | F | 3 |

## Control 6 — Incident Response & Kill Switch

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-601 | Kill-switch capability proven: disable agent + revoke connector tested within target time (a drill, like a backup restore) | HYBRID | F | 3 |
| AGA-602 | IR runbook for agent misbehavior: who pulls the plug, escalation path, rollback plan — named and attested | ATTEST | — | 3 |
| AGA-603 | Detection feeds exist: IRM/Defender alerts for risky AI use routed to the team that owns the runbook | CONFIG | O | 3 |
| AGA-604 | Post-incident loop: incidents minuted in register; autonomy tier auto-demoted on incident | ATTEST | — | 4 |

## Control 7 — FinOps & Value Realization

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-701 | Consumption visible: Copilot Credits / pay-as-you-go metering and Copilot Studio message capacity monitored (M365 + Power Platform admin centers) | CONFIG | F | 2 |
| AGA-702 | Cost attribution: consumption attributable per agent / environment / business unit; budget owner named | HYBRID | F | 3 |
| AGA-703 | Value hypothesis recorded per agent at approval; reviewed on cadence against outcomes | ATTEST | — | 3 |
| AGA-704 | Portfolio decisions evidenced: fund/retire decisions reference value review (two missed reviews → retirement candidate) | ATTEST | — | 4 |

## Control 8 — Lifecycle Governance

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-801 | Environment strategy: dev/test/prod separation for agents (managed environments; ALM via Power Platform solutions) | CONFIG | F | 3 |
| AGA-802 | Promotion gates run as approval workflows; approval evidence retained (who, when, on what basis) | HYBRID | F | 3 |
| AGA-803 | Risk tier assigned at intake; gate rigor inherits from tier (not one-size-fits-all) | ATTEST | — | 3 |
| AGA-804 | Retirement works: retired agents actually disabled, identities cleaned up, register closed out | HYBRID | F | 3 |

## Control 9 — Oversight + Process Integrity

| ID | Check | Type | Tier | Stage |
|----|-------|------|------|-------|
| AGA-901 | Purview Audit captures Copilot and agent interactions (verified by sample query) | CONFIG | F | 1 |
| AGA-902 | eDiscovery proven against AI interactions: prompts/responses searchable, holdable | CONFIG | F | 2 |
| AGA-903 | Retention/deletion policies applied to Copilot & agent interactions and Teams recordings/transcripts | CONFIG | F | 2 |
| AGA-904 | Communication Compliance policies cover AI interactions; Compliance Manager tracks AI regulatory assessments | CONFIG | O | 3 |
| AGA-905 | Governance cadence operating: forum meets on rhythm, agenda driven by register, decisions minuted back | ATTEST | — | 3 |
| AGA-906 | Decision rights documented: who may approve, change, promote, fund, retire — per risk tier | ATTEST | — | 3 |

---

## The pattern (and why both columns matter)

Controls 1, 3, 4, 5 and the *oversight* half of 9 are strongly config-measurable — a scan proves them. Controls 2, 7, 8 and the *process-integrity* half of 9 are governance signals — **exactly what a config scan will never tell you, and where governance actually lives**. The trap is treating those as "unmeasurable, therefore unmanaged." The fix is the register + attestation + workflow-gate machinery from `02-maturity-journey.md`, which turns judgments into recorded, time-bound, queryable evidence.

**Scoring:** each agent and the tenant get a config score (weighted pass-rate of CONFIG/HYBRID checks, license-gated checks excluded) and an attestation completeness score (fields filled × currency × approval state). Report both, and the gap.
