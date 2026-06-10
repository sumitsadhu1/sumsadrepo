# Build Plan — From Design to a Functional Assessment + Configuration App with Built-in PM

This turns `04-app-design.md` into an engineering plan. The product grows from *assessment* (read-only) into *configuration* (gated writes) plus a *PM layer* that runs the customer's journey as trackable, auto-verified work. One principle holds everything together:

> **One declarative catalog drives all three engines.** Every catalog entry (an AGA check) knows how to *measure* itself, how to *fix* itself (automated, scripted, or guided-manual), and how to *verify* itself. Assessment runs the measure step, Configuration runs the fix step, and the PM tool tracks the gap between them.

---

## 1. Product architecture

```
GitHub repo (template)  ──azd up──►  Customer's own Azure subscription
                                     (single-tenant: their data never leaves)

┌────────────────────────────────────────────────────────────────────┐
│  Web App (React + Fluent UI — looks native to M365 admins)         │
│  Journey questionnaire · score dashboards · plan board · register  │
├────────────────────────────────────────────────────────────────────┤
│  API (TypeScript or .NET 8, Container Apps / App Service)          │
│  Auth (Entra) · catalog service · scoring · plan engine · audit    │
├──────────────────┬─────────────────────┬───────────────────────────┤
│  ASSESS engine   │  CONFIGURE engine   │  PM engine                │
│  Graph snapshot  │  remediation worker │  plan items ↔ check IDs   │
│  → local DB →    │  (Graph writes +    │  re-scan auto-verifies    │
│  evaluate checks │  PowerShell jobs)   │  attestations & cadence   │
├──────────────────┴─────────────────────┴───────────────────────────┤
│  Storage: Azure SQL/SQLite (snapshots, results, audit)             │
│  Register: Dataverse or SharePoint list (customer-owned, optional) │
│  Secrets: Key Vault · Jobs: Container Apps jobs (scheduled scans)  │
└────────────────────────────────────────────────────────────────────┘
```

**Deployment model:** `azd up` (Azure Developer CLI) from the GitHub template provisions infra + two Entra app registrations and prints the admin-consent URLs. No SaaS, no multi-tenant backend, opt-in telemetry only — the same trust posture as the read-only module, extended carefully to writes.

**Two app registrations, not one (the safety core of "configuration"):**

| App | Permissions | Used by | Standing access? |
|-----|-------------|---------|------------------|
| **AGA-Reader** | Read-only Graph + admin read APIs (the `Get-AgaGraphScope` list) | Assess engine, scheduled scans | Yes — reading is safe to leave on |
| **AGA-Operator** | The *minimal write set actually needed by enabled remediations* | Configure engine only | No — disabled by default; consent granted per remediation wave, certificate in Key Vault, every use audited |

A tenant can run Assess forever without ever consenting to Operator. That keeps the on-ramp identical to zerotrustassessment's trust model.

## 2. The catalog is the contract (schema)

Each check is one versioned YAML file; the three engines consume different sections of the same file:

```yaml
id: AGA-402
control: 4            # Security & Data Protection
stage: 1
tier: foundational     # license gate: skip-with-explanation if SKU absent
measure:
  type: config         # config | attest | hybrid
  collector: graph     # graph | spoadmin | ppadmin | sccpowershell | register
  query: ...           # what to snapshot
  evaluate: ...        # pass/fail expression over the snapshot
fix:
  mode: automated      # automated | scripted | guided
  action: enable-restricted-content-discovery
  writes: ["Sites.FullControl.All"]        # exact Operator permission used
  dryrun: true         # supports what-if preview
  rollback: documented # automated | documented | none (shown before approval)
verify: re-run measure # every fix verifies by re-measuring, never by assuming
pm:
  persona: oversharing-remediation-lead    # from the RBAC mapper
  effort: M
  depends_on: [AGA-401]
docs: AGA-402.md       # finding text, remediation guidance, portal deep links
```

**The three fix modes are an honest map of the Microsoft surface — this is the most important engineering reality in the plan:**

- **`automated`** — a public write API exists. Graph (Conditional Access policies, app/consent policies, agent/app management), SharePoint admin API (site access restrictions, RCD/RAC), Power Platform admin API (environments, environment groups, DLP policies, Copilot Studio governance settings).
- **`scripted`** — no REST API, but PowerShell works: Security & Compliance PowerShell (`New-DlpCompliancePolicy`, `Set-Label`, retention policies), SPO admin module, ExchangeOnlineManagement. The remediation worker runs these in a sandboxed container job with the Operator identity.
- **`guided`** — no programmatic path at all (much of Purview DSPM for AI one-clicks, Insider Risk policies, Communication Compliance, several M365 admin center Copilot toggles). The app does **not** pretend: it generates a PM task with the exact portal deep link, step-by-step instructions, the persona who holds the right role — and *verifies completion by re-scanning the readable state*. Guided ≠ untracked.

Roughly: expect ~40% automated, ~25% scripted, ~35% guided at launch — and the ratio improves over time purely by editing catalog files as Microsoft ships APIs (Purview Graph APIs are expanding). No engine changes needed.

## 3. The Configure engine — writes without fear

Every write follows one pipeline, no exceptions:

```
Plan task → Dry-run (what-if diff: current vs. intended state)
         → Approval (workflow; approver = persona from RBAC mapper; evidence recorded)
         → Execute (Operator app, scoped permission, idempotent)
         → Verify (re-run the check's measure step)
         → Audit (who approved, who ran, before/after state, rollback pointer)
```

- **Dry-run is mandatory and is the default UI state.** The customer always sees the diff before anything is touched.
- **Batch as "remediation waves"** aligned to plan phases (e.g., "Stage 1 oversharing brakes": AGA-401/402/409 together), each wave a single approval with one consolidated diff.
- **Rollback honesty:** each action declares `automated` rollback (the engine can revert), `documented` (manual steps shown at approval time), or `none` (extra confirmation required).
- This pipeline is itself your governance model eating its own cooking: gates-as-workflow, decisions leaving traces — the app demonstrates Control 9 in its own behavior.

## 4. The PM engine — a plan that closes itself

Not a generic task tracker: every work item is bound to catalog IDs, and **state is derived from evidence, not honor**.

- **Plan generation:** (current stage, target stage, license tier, failed checks, missing attestations) → phases → waves → tasks. Sequencing from the published Microsoft paths (Zero Trust steps 1–7, blueprint pillars, management-controls-before-scale) + catalog `depends_on`.
- **Task anatomy:** linked check IDs · persona (RBAC mapper says exactly which role the assignee needs, flags if they lack it) · fix mode (automated tasks offer the **Fix** button into the Configure pipeline; guided tasks carry portal links + instructions) · license prerequisite ("requires E5 — or accept compensating control X") · effort band.
- **Auto-verification:** scheduled re-scans close tasks whose checks now pass, *reopen* tasks on regression (config drift is a first-class event), and spawn tasks when attestations expire. Burndown = config-score gap over time; the 2×2 (config × attestation) is the executive home page.
- **Cadence support:** governance-forum agenda auto-generated from register + plan state (new agents awaiting tier, expiring attestations, over-budget agents, stalled waves, incidents); decisions minute back into the register.
- **Integrations, not lock-in:** two-way sync to Planner (M365-native customers) and Azure DevOps/GitHub Issues (engineering-led customers); CSV/PPT export for steering committees. The app stays the source of truth because only it can auto-verify.

## 5. Register & attestation (the differentiator, now a feature)

- Dataverse table (or SharePoint list fallback) deployed as a solution package into the customer tenant — customer owns the data; the app reads/writes it via the customer's consent.
- Attestation flows (Power Automate): reminders, expiry → amber flag → PM task; owner re-confirmation in one click from Teams/email.
- Approval flows for promotion/funding/connector gates write their outcomes back as register evidence rows — which the Assess engine then *measures* (ATTEST checks stop being unmeasurable).

## 6. Build phases (each ends usable)

| Phase | Scope | Outcome | Est. |
|-------|-------|---------|------|
| **0 — Foundations** | Monorepo, azd infra template, Entra app registrations + consent flow, catalog schema + loader, CI/CD (GitHub Actions), 5 canary checks end-to-end | `azd up` → sign in → scan runs → JSON results | 2–3 wks |
| **1 — Assess MVP** | Snapshot collectors (Graph, SPO admin, PP admin), ~25 Stage-1/2 CONFIG checks, questionnaire, scoring + stage placement, report UI, license gating | Sellable assessment: stage placement + 2×2 score + findings | 6–8 wks |
| **2 — PM layer** | Plan generator, task board, re-scan auto-verify/reopen, Planner + DevOps export, cadence agenda | Assessment becomes a *program*: living plan, burndown | 4–6 wks |
| **3 — Configure** | Operator app + consent UX, remediation worker (Graph writes + PowerShell jobs), dry-run/approve/execute/verify/audit pipeline, first ~15 automated/scripted fixes (Stage-1 oversharing brakes, CA baseline, DLP-publish, sharing limits), guided-task generation for the rest | "Fix it from the finding" with full audit trail | 6–8 wks |
| **4 — Register + RBAC mapper** | Dataverse solution, attestation + gate flows, ATTEST checks live, blended score complete; persona mapper + per-agent least-privilege recommender | The full two-layer model operational | 4–6 wks |
| **5 — Frontier** | Continuous mode (scheduled scans + drift alerts), agent-identity lifecycle checks, kill-switch drill harness, multi-customer mode for partners (one deployment, many tenants), catalog marketplace (community checks via PR) | Steady-state governance platform | ongoing |

Team shape: 1 full-stack + 1 M365/Graph platform engineer (the PowerShell/Purview depth matters more than UI polish), part-time designer from Phase 1, you as catalog owner — the catalog *is* the product; code is the player piano.

## 7. Risks to design around (known now, cheap now, expensive later)

1. **API coverage gaps** (Purview especially) — solved structurally by the three fix modes; never block the plan on an API that doesn't exist, and never fake a write.
2. **Write trust** — solved by Reader/Operator split, default-off Operator, dry-run-first, per-wave consent. Lead with this in the README; it's the adoption gate for security teams.
3. **Graph throttling on large tenants** — snapshot architecture already absorbs this (batch, delta queries where available, resumable export jobs).
4. **Catalog drift vs. Microsoft's pace** — checks are versioned files with CI validation against schema; a monthly "catalog release" rhythm, independent of app releases.
5. **Preview/licensed APIs** (Copilot agent admin APIs are evolving fast) — collectors declare capability requirements and degrade to guided mode, same as license gating.
