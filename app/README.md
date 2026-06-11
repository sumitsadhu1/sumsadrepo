# Agent Governance Assessment — runnable MVP

A working end-to-end slice of the app designed in [`../docs/04-app-design.md`](../docs/04-app-design.md) and [`../docs/05-build-plan.md`](../docs/05-build-plan.md): assessment, scoring, stage placement, plan generation with auto-verification, the Agent Governance Register with attestations, and the Configure pipeline (dry-run → approve → apply → verify → audit) in demo form.

**Zero runtime dependencies.** Node.js 18+ is the only requirement — no `npm install`.

## Run it

```bash
cd app
npm start          # or: node server.js
# open http://localhost:3000
```

On first start the console prints a one-time **access key** — enter it in the browser to sign in (session cookie, 12h). Lost it? Delete `app/data/auth.json` and restart.

**Security posture (v0.2):**
- UI requires the access key; all API routes return 401 without a session.
- Binds to `127.0.0.1` only (set `HOST=0.0.0.0` to override — a warning is printed).
- Graph access tokens live in memory only; the refresh token is persisted **encrypted** (AES-256-GCM, key file `data/.secret` with 0600 perms) and rotated on refresh.
- Live mode remains read-only; Graph calls retry on throttling and follow paging.

Run the engine tests:

```bash
npm test
```

## Test script (10 minutes, no tenant needed)

1. **Pick "Demo: Contoso"** (top right) → click **Run assessment**. You land at **Stage 1 — Get Ready** with a low config score: this is the "not Copilot/AI ready" bucket.
2. Open **Questionnaire** → answer honestly-pessimistic (mostly "No") → set target stage to **Stage 4** → Save → **Run assessment** again. Attestation score appears (0% — nothing is recorded yet). Note the **gap** card on Overview.
3. Open **Plan** → **Generate plan**. You get a phased plan (Stage 1 work first: oversharing brakes, labels, CA baseline, audit), each task tagged with persona, fix mode (`automated` / `scripted` / `guided` / `attest` / `license`), and dependencies.
4. Open **Findings** → click **Fix…** on `AGA-301` (CA baseline). You get a **dry-run diff** (current → intended), then **Approve & apply**. The engine applies the change to the demo tenant, **re-scans automatically**, and the plan task auto-closes (see "auto-verified" on the Plan tab; the change itself is in the **Audit** tab with before/after and approver).
5. Fix a few more (AGA-402, 303, 304, 305…) and watch the config score and stage placement move. This is the whole product thesis in miniature: *findings → governed change → evidence → progress*.
6. Open **Register** → add 2–3 agents with owners, risk/autonomy tiers, identity mode, value hypothesis → click **Attest** → **Run assessment**. ATTEST checks (AGA-201/202/307/501/703…) flip to pass and the attestation score climbs — the layer no config scan can see.
7. Switch to **Demo: Fabrikam** → Run assessment. A Stage-3 tenant with a pre-seeded register and questionnaire: gates 1–2 pass, gate 3 is blocked by real gaps (shadow agents, orphaned identities, credential rotation, cost attribution — and the kill-switch drill has never been run). Fix the four config gaps, answer the kill-switch question Yes, re-assess: **Stage 4 — Frontier**.
8. **Settings → Reset current demo tenant** restores the original fixture so you can demo repeatedly.

## Live mode (your real tenant, read-only)

1. In [Entra admin center](https://entra.microsoft.com) → App registrations → **New registration**: single tenant, no redirect URI needed; under **Authentication** enable **Allow public client flows**.
2. API permissions → Microsoft Graph → **Delegated** → add `Organization.Read.All`, `Policy.Read.All`, `Application.Read.All`, `InformationProtectionPolicy.Read` → grant admin consent.
3. In the app: **Settings → Live tenant** → paste Tenant ID + App (client) ID → **Sign in with device code** → enter the code at microsoft.com/devicelogin.
4. **Run assessment.** Live collectors currently cover: licensing (Copilot seats, E3/E5/SAM — with per-SKU evidence), Conditional Access baseline + risk policies (with policy names as evidence), app/agent identities (ownerless identities and long-lived secrets, named), and sensitivity labels (best effort). Checks the consented scopes can't prove report honestly as **not collected** — live mode never writes anything.

## What's real vs. demo in this MVP

| Capability | Status |
|---|---|
| Declarative check catalog (40 checks), scoring, stage gates | Real — `catalog/checks.json` drives everything |
| Config-vs-attestation two-layer scoring, the gap metric | Real |
| Plan generation, re-scan auto-close, drift reopen | Real |
| Register, attestations, expiry staleness | Real (JSON store; Dataverse in the roadmap) |
| Configure pipeline (dry-run → approve → apply → verify → audit) | Real pipeline, **demo targets only** — live writes are deliberately out of MVP scope (see Reader/Operator design in docs/05) |
| Live tenant collection | Real for licensing + Conditional Access; remaining collectors are the Phase-1 backlog |

## Layout

```
server.js            zero-dep HTTP server + API routes
catalog/             checks.json · stages.json · questionnaire.json  ← the product
src/engine.js        evaluate · score · stage placement
src/plan.js          plan generation · evidence-driven task state
src/register.js      the Agent Governance Register + attestation stats
src/collectors.js    demo state + fixes · live Graph device-code collector
public/              the UI (vanilla JS, no build step)
fixtures/            contoso (Stage 1) · fabrikam (Stage 3) demo tenants
test/                node --test engine tests
data/                runtime state (gitignored)
```
