# The Expanded Control Model — From Agent Governance to AI Governance

> **Before you approve another agent — or another Copilot seat — ask:**
> **Who has the right to approve, change, promote, fund, or retire it?**
> That's where AI governance begins. Everything below exists to answer that question with evidence.

## Why the model expanded

The original six-control model governed *agents*. Expanding scope to **AI governance including Microsoft 365 Copilot** surfaces four gaps that were previously folded into other controls or missing entirely:

1. **Security & data protection** was buried inside "Access & Action Control" — but in a Copilot context, *oversharing of grounding content* is the #1 enterprise blocker, and agent-specific risks (prompt injection, exfiltration through connectors) deserve their own visibility.
2. **Identity** had no pillar. "Ownership" covers the *human*; nothing covered the *agent's own identity* (Entra Agent ID, non-human identity, credential lifecycle, on-behalf-of vs. autonomous identity).
3. **Autonomy level** was implicit. How much an agent can do *without* a human in the loop is the question boards actually fear.
4. **Incident response / kill switch** had no home. Detection (oversight) and authority (process integrity) are not the same as *who pulls the plug, how fast, and what's the rollback*.

## The model: 9 controls · 2 spines · 1 question

### Layer 1 — Foundation: *know, own, restrict*

| # | Control | What it asserts |
|---|---------|-----------------|
| 1 | **Visibility / Inventory** | A reliable, refreshed inventory of Copilot surfaces, agents, connectors, and grounding sources across every Microsoft 365 surface. Decisions based on fact, not anecdote. |
| 2 | **Ownership & Accountability (RACI)** | Named accountability for value, performance, change approval, and lifecycle decisions. A production agent has a **business owner, technical owner, data owner, and security owner** — a RACI, not a single throat to choke. |
| 3 | **Access & Action Control** | Least-privilege access across users, data, connectors, tools, channels, and autonomous actions. |

### Layer 2 — Protection: *secure, identify, respond* *(new layer)*

| # | Control | What it asserts |
|---|---------|-----------------|
| 4 | **Security & Data Protection** | Oversharing prevention and remediation for grounding content; sensitivity labeling and DLP for AI interactions; defenses against prompt injection and data exfiltration through connectors. |
| 5 | **Agent Identity & Credential Lifecycle** | Every agent has a known identity. Acting on-behalf-of a user vs. holding its own identity (Entra Agent ID / non-human identity) is explicit, and agent credentials have a managed lifecycle. |
| 6 | **Incident Response & Kill Switch** | When an agent (or Copilot experience) misbehaves: who pulls the plug, how fast, what's the rollback. The kill switch (disable agent, revoke connector, block user cohort) is a *testable capability*, not a hope. |

### Layer 3 — Scale: *fund, govern, prove*

| # | Control | What it asserts |
|---|---------|-----------------|
| 7 | **FinOps & Value Realization** | Consumption reporting, attribution, budget ownership (single currency: Copilot Credits) — **plus** a value/outcome realization loop. Governance that only proves spend, not benefit, loses the CFO. Every agent carries a value hypothesis that is periodically reviewed. |
| 8 | **Lifecycle Governance** | Stages, gates, environments, promotion paths, and retirement — with rigor inherited from the risk tier. Not one-size-fits-all. |
| 9 | **Oversight + Process Integrity** | Oversight is the **evidence layer** (logs, reports, telemetry, audit evidence, observability). Process integrity is the **decision layer** (decision rights, approval paths, business rules, authority to change outcomes, governance cadence). *Oversight enables governance. It doesn't replace it.* |

### The two cross-cutting spines

The spines are not controls — they are **classifications every agent and Copilot workload carries**, and the nine controls inherit their rigor from them.

**Spine A — Risk Tier** (drives *how much* of each control applies)

| Tier | Example | Inventory rigor | Access tightness | Oversight cadence |
|------|---------|----------------|------------------|-------------------|
| Low | Personal productivity agent, no connectors, maker-only audience | Auto-discovered, annual attestation | Default DLP | Quarterly sample review |
| Medium | Team agent with read connectors to business data | Registered with owners + value hypothesis | Connector allow-list, scoped grounding | Monthly review |
| High | Autonomous or write-action agent touching regulated data, customer-facing | Full register entry, RACI complete, approval workflow | Per-action approval, isolated environment, tested kill switch | Continuous monitoring + monthly forum |

**Spine B — Autonomy Tier** (drives human-in-the-loop requirements)

1. **Suggest** — agent recommends; human acts.
2. **Act with approval** — agent executes after explicit human approval per action or batch.
3. **Act autonomously** — agent executes within pre-approved boundaries; humans audit after the fact.

An agent's autonomy tier may never exceed what its risk tier permits (e.g., high-risk + act-autonomously requires explicit board-visible exception).

## The two-layer measurement model

Every control decomposes into two kinds of signals — this is the heart of the assessment tool:

- **Config-measurable** — readable from the tenant (Graph API, admin center state, Purview, Power Platform admin). Controls 1, 3, 4, 5 and the *oversight* half of 9 are strongly config-measurable. A scan can prove them.
- **Governance signals (attestation-based)** — *not* readable from any tenant API: who owns the agent, whether the risk tier is right, whether value was reviewed, whether the funding decision was made. Controls 2, 7, 8 and the *process-integrity* half of 9 live here. These are managed by converting judgments into **recorded, time-bound attestations** with a system of record and an operating rhythm (see `02-maturity-journey.md` and the Agent Governance Register in the app design).

> The gap between a tenant's **config score** and its **attestation completeness** is the single most useful number you can show a customer — it's the part most maturity assessments miss entirely.

## Framework crosswalk (credibility anchor)

| This model | NIST AI RMF | ISO/IEC 42001 | EU AI Act |
|------------|-------------|----------------|-----------|
| 1 Visibility / Inventory | MAP 1 (context & inventory) | §7.5, A.4 (AI system inventory) | Art. 9 (risk mgmt system input) |
| 2 Ownership & Accountability | GOVERN 2 (roles & responsibilities) | §5.3 (roles), A.3 | Art. 26 (deployer obligations) |
| 3 Access & Action Control | MANAGE 2 | A.5 (resources), A.9 (use) | Art. 14 (human oversight measures) |
| 4 Security & Data Protection | MEASURE 2.7 (security & resilience) | A.7 (data), §8 (controls) | Art. 10 (data governance), Art. 15 (robustness/cybersecurity) |
| 5 Agent Identity & Credential Lifecycle | GOVERN 1.6, MANAGE 3 | A.5.4 | Art. 12 (record-keeping of system identity) |
| 6 Incident Response & Kill Switch | MANAGE 4 (incident response) | A.10.4 (repair/decommission) | Art. 14(4)(e) (stop button), Art. 73 (serious incident reporting) |
| 7 FinOps & Value Realization | MAP 3 (benefits/costs) | §9.1 (performance evaluation) | — (commercial, not regulatory) |
| 8 Lifecycle Governance | MAP 4, MANAGE 1 | A.6 (AI system life cycle) | Art. 9 (continuous lifecycle risk mgmt) |
| 9 Oversight + Process Integrity | GOVERN 4, MEASURE 1 | §9.2–9.3 (audit, mgmt review) | Art. 12 (logging), Art. 14 (oversight) |
| Spine A Risk Tier | Core RMF risk framing | §6.1 (risk assessment) | Art. 6 + Annex III (risk classification) |
| Spine B Autonomy Tier | MAP 1.5 (degree of autonomy) | A.8 (use guidance) | Art. 14 (human oversight design) |
