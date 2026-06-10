# AI Governance Operating Model & Assessment

> **Who has the right to approve, change, promote, fund, or retire an agent?**
> That's where AI governance begins — and this repo is the operating model, maturity journey, and tool design built around that question.

This expands the original six-control **Agent Governance** model into a full **AI governance** framework covering Microsoft 365 Copilot *and* agents, plus the design for a GitHub-deployable assessment app that places a tenant on the journey and generates the plan to move it forward.

## Contents

| Doc | What it is |
|-----|------------|
| [`docs/01-control-model.md`](docs/01-control-model.md) | The expanded model: **9 controls** (the original six, plus Security & Data Protection, Agent Identity & Credential Lifecycle, Incident Response & Kill Switch) · **2 cross-cutting spines** (risk tier, autonomy tier) · the config-vs-attestation measurement model · NIST AI RMF / ISO 42001 / EU AI Act crosswalk |
| [`docs/02-maturity-journey.md`](docs/02-maturity-journey.md) | The four-stage journey — **Get Ready → Adopt & Extend → Govern Agents → Frontier** — with entry diagnoses, exit gates, and how the app places a tenant on it |
| [`docs/03-assessment-catalog.md`](docs/03-assessment-catalog.md) | ~45 concrete checks (AGA-xxx) mapped to control, journey stage, license tier (foundational E3 vs. optimized E5), and measurement type (config / attestation / hybrid) |
| [`docs/04-app-design.md`](docs/04-app-design.md) | The assessment app: zerotrustassessment-pattern engine (read-only PowerShell module, snapshot-then-evaluate, declarative check pairs, single-file HTML report), rbacmap-style RBAC setup mapper, journey questionnaire, project plan generator, and the Agent Governance Register |

## The two ideas that make this different

1. **Oversight ≠ process integrity.** Logs, reports, and telemetry are the *evidence layer*; decision rights, approval paths, and governance cadence are the *decision layer*. Dashboards show evidence — operating models create governance.
2. **Config score × attestation completeness.** Roughly half of governance is readable from the tenant (Graph, Purview, admin centers). The other half — ownership, risk tier, value review, decision rights — no API will ever return. The tool measures the first half by scanning and the second half by converting judgments into recorded, time-bound attestations in a register. The gap between the two scores is the single most useful number you can show a customer.

## Grounding sources

- Microsoft Copilot Control System: [security & governance](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-control-system/security-governance) · [management controls](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-control-system/management-controls)
- [Zero Trust for Microsoft 365 Copilot](https://learn.microsoft.com/en-us/security/zero-trust/copilots/zero-trust-microsoft-365-copilot) (the seven steps, E3→E5)
- [Secure & Govern Copilot foundational deployment blueprint](https://learn.microsoft.com/en-us/microsoft-365/copilot/secure-govern-copilot-foundational-deployment-guidance)
- Design patterns: [microsoft/zerotrustassessment](https://github.com/microsoft/zerotrustassessment) · [rbacmap.com](https://rbacmap.com/)
