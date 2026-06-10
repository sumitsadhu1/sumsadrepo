# The AI Governance Maturity Journey — Four Stages, One Path

Organizations arrive in one of four buckets. The journey model gives each bucket a name, an honest entry diagnosis, a focused set of controls to work, and an **exit gate** that must be passed before moving on. The assessment app (see `04-app-design.md`) places the tenant on this map automatically — partly from tenant configuration, partly from attestations the tenant *cannot* express in configuration.

```
Stage 1            Stage 2              Stage 3               Stage 4
GET READY    →     ADOPT & EXTEND  →    GOVERN AGENTS    →    FRONTIER
(Not Copilot/      (Copilot ready;      (Establish agent      (Governance established;
 AI ready)          drive adoption,      governance)           scale autonomy safely)
                    start agents)
```

Two numbers travel with the tenant through every stage:

- **Config score** — objective, from the tenant scan (Graph / admin APIs).
- **Attestation completeness** — are the governance fields filled, current, and approved in the Agent Governance Register.

A tenant can be 90% config-ready and 30% governance-tracked. **That gap is the most important number in this model.**

---

## Stage 1 — Get Ready (Not Copilot / AI ready)

**Who you are:** No Copilot licensing (or unassigned), no oversharing assessment ever run, labels absent or unused, MFA/Conditional Access gaps, no AI usage policy. AI is happening anyway — in the shadows.

**The work** follows Microsoft's Zero Trust for Microsoft 365 Copilot sequence (seven steps, each with an E3 "get started" and E5 "next steps" tier) and the *Secure and Govern Copilot* foundational blueprint (remediate oversharing → set up guardrails → meet regulations):

1. **Data protection first.** Run Data Access Governance reports; apply interim brakes (Restricted SharePoint Search, Restricted Content Discovery, restricted access control on high-risk sites); start sensitivity labels + DLP; archive/delete stale sites (site lifecycle management).
2. **Identity and access.** MFA for all, block legacy auth, common Conditional Access policies (E3/P1); risk-based CA and PIM at E5/P2.
3. **App protection, device management, threat protection.** Intune APP + enrollment + compliance; Defender baseline at E3, Defender XDR at E5.
4. **Secure collaboration.** Teams three-tier protection (baseline / sensitive / highly sensitive); review external sharing.
5. **Minimum user permissions (JEA).** Site access reviews, SAM oversharing detection.
6. **Compliance start.** Purview Audit on, retention policies, Compliance Manager baseline assessment.
7. **Decide the operating roles.** Who is the AI Administrator? Which Purview/SharePoint/Power Platform roles are delegated, at least privilege? (This is where the RBAC mapper feature earns its keep.)

**What the tenant can't tell you (attestations begin here):** an approved AI acceptable-use policy, an executive sponsor, a named AI governance forum — none of these are config. They get recorded in the register from day one.

**Exit gate → Stage 2:** Oversharing assessment run and high-risk sites remediated or restricted · sensitivity labels published · MFA/CA baseline enforced · Purview Audit enabled · AI usage policy attested by a named owner · Copilot licensing plan approved.

---

## Stage 2 — Adopt & Extend (Copilot ready; increase adoption, start using agents)

**Who you are:** Copilot deployed (or deploying); adoption is the KPI; first agents are appearing — some sanctioned, some not. Pay-as-you-go and Copilot Studio may already be on without anyone deciding they should be.

**The work** shifts to the Copilot Control System's *management controls* pillar plus adoption discipline:

1. **Licensing & metering under control.** License assignment strategy; pay-as-you-go configured deliberately; Copilot Studio message capacity managed in the Power Platform admin center. Copilot Credits become the single cost currency.
2. **Adoption with measurement.** Copilot Dashboard / usage reports reviewed on cadence; adoption targets owned by business units, not IT.
3. **First-agent guardrails *before* first agents.** Enable/block connectors deliberately; agent sharing limits (Editor/Viewer roles, managed-environment rules); Copilot Studio DLP policies to block unsanctioned publishing channels; agent inventory visible in the Microsoft 365 admin center and Power Platform Copilot hub.
4. **Turn on the AI evidence pipeline.** DSPM for AI default policies; audit of Copilot/agent interactions verified; eDiscovery tested against a Copilot interaction.
5. **Stand up the register.** Every sanctioned agent gets an entry: business owner, technical owner, data owner, risk tier, autonomy tier, value hypothesis. Attestation cadence starts (stale = amber flag).

**What the tenant can't tell you:** whether adoption targets exist and who owns them; whether the value hypothesis for Copilot itself ("hours saved," "cycle time") was ever written down and reviewed. Attest it or it didn't happen.

**Exit gate → Stage 3:** Connector allow/block decisions made and recorded · sharing limits configured · DSPM for AI active · agent inventory reviewed monthly · register populated for 100% of sanctioned agents · adoption and value review held at least once with minutes in the register.

---

## Stage 3 — Govern Agents (Establish agent governance)

**Who you are:** Agents are multiplying across Copilot Studio, declarative agents, and makers you've never met. The question is no longer "can we build agents?" but **"who has the right to approve, change, promote, fund, or retire an agent?"**

**The work** operationalizes all nine controls (see `01-control-model.md`) through five mechanisms:

1. **Agent Governance Register as system of record** — every agent carries owners (RACI), risk tier, autonomy tier, approval status, value hypothesis, last-reviewed and retirement dates. "You can't measure it" becomes "you can query it."
2. **Attestation instead of measurement** — owners re-confirm accountability, risk tier, and value on a cadence; attestations are time-stamped and expire; staleness surfaces automatically.
3. **Gates as workflow** — promotion (ALM across dev/test/prod environments), funding, and connector approval run as approval flows, so the *act of deciding* becomes auditable evidence: who approved, when, on what basis.
4. **Governance cadence tied to the register** — monthly for high-risk tiers, quarterly for the rest; fixed agenda: new agents awaiting tiering, expiring attestations, agents over budget, agents with no value review, incidents. Decisions minuted back into the register.
5. **Blended readiness score** — config score × attestation completeness, per agent and tenant-wide.

Plus the Stage-3-specific config work: agent identity (Entra Agent ID / non-human identity hygiene), DLP for Copilot and agents (block sensitive files from processing), Insider Risk Management AI policies, adaptive protection, Communication Compliance, and a **tested kill switch** — prove you can disable an agent and revoke a connector inside the target time, the way you'd prove a backup restore.

**Exit gate → Stage 4:** All nine controls have an owner and an operating rhythm · 100% of production agents tiered with current attestations · promotion/funding gates produce workflow evidence · kill-switch drill performed · blended readiness score above the threshold you set (recommend ≥80/80).

---

## Stage 4 — Frontier (Governance established; scale autonomy safely)

**Who you are:** Governance is no longer the bottleneck — it's the enabler. You now raise autonomy tiers deliberately instead of discovering them accidentally.

**The work:**

1. **Autonomy expansion by evidence.** Agents earn promotion from *suggest* → *act-with-approval* → *act-autonomously* based on register history: incident-free runtime, value delivered vs. hypothesis, attestation currency. Demotion is automatic on incident.
2. **Agent-to-agent and cross-boundary governance.** Multi-agent orchestration, MCP/connector ecosystems, agents calling agents — inventory, identity, and access control extend to non-human-to-non-human interactions.
3. **Continuous governance.** Attestation and config drift checked continuously, not at review time; the governance forum shifts from approving agents to tuning risk appetite.
4. **Value realization as a portfolio.** The CFO sees Copilot Credits *and* realized value per agent; retirement is routine for agents that miss their hypothesis twice.
5. **External assurance.** The framework crosswalk (NIST AI RMF / ISO 42001 / EU AI Act) backs audit and regulatory responses with register evidence.

**There is no exit gate.** Frontier is a steady state of earned autonomy — the operating model from the original deck, running at full speed: *dashboards show evidence; operating models create governance.*

---

## Stage placement — how the app decides

| Signal | Source | Stage influence |
|--------|--------|-----------------|
| Licensing (E3/E5, Copilot seats, SAM, Purview SKUs) | Graph / admin APIs | Caps which controls are even possible (foundational vs. optimized) |
| Zero-trust step completion (labels, CA, DLP, audit…) | Tenant scan | Stage 1 ↔ 2 boundary |
| Management-control posture (connectors, sharing, capacity, DLP-publish) | Tenant scan | Stage 2 ↔ 3 boundary |
| Register existence + attestation completeness | App's own register | Stage 3 placement and 3 ↔ 4 boundary |
| Questionnaire (ambition, policy, forum, sponsorship) | Human input | Resolves what no API can see |

The output is never just "you are Stage 2." It is: *you are Stage 2 on config, Stage 1 on attestation, your license caps you at foundational controls, and here is the sequenced project plan to your declared target.*
