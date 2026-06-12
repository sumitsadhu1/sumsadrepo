# Agent Governance Assessment — Comprehensive Test Plan

**App version:** 0.8.0 · **Branch:** `claude/determined-allen-52zkct` *(§17 covers the v0.8 additions; the §2 matrix reflects v0.8 permissions)*
**Audience:** developer/QA executing manual UI tests + API checks; automated suite included.
**Conventions:** every case has an ID, steps, and an **Expected** outcome. `[UI]` = browser, `[API]` = curl/REST, `[AUTO]` = covered by `npm test` (verify it still passes, don't re-test by hand). Traceability column maps to FEEDBACK.md sections.

## 0. Setup

```bash
git clone -b claude/determined-allen-52zkct https://github.com/sumitsadhu1/sumsadrepo.git
cd sumsadrepo/app
node server.js          # Node 18+, zero dependencies → http://localhost:3000
```

- First start prints a one-time **access key**. Lost it → delete `app/data/auth.json`, restart.
- `npm test` runs the automated suite against an isolated `.data-test/` directory — it must **never** touch `app/data/` (see TC-16.2).
- For API cases: log in with `curl -c cookies.txt -X POST localhost:3000/api/login -d '{"key":"<KEY>","name":"<You>","role":"<Role>"}'`, then pass `-b cookies.txt`.

**Roles used throughout:** Global Admin (GA), Security Admin (SEC), AI Governance Lead (LEAD), Compliance Admin (COMP), Agent Owner (OWNER), Solution Architect (SA), Operator (OP).

---

## 1. Authentication & session

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-1.1 | First-run key `[UI]` | Fresh `data/` → start server | Console shows the key exactly once; UI demands it before anything renders | — |
| TC-1.2 | Wrong key `[UI]` | Enter wrong key | 401 + "Invalid access key"; no session cookie set | — |
| TC-1.3 | Name required `[UI]` | Valid key, empty name | Rejected: "Your name is required — actions are attributed" | §3.3 |
| TC-1.4 | No session → 401 `[API]` | `GET /api/state` without cookie | 401 JSON error (never 200, never stack trace) | — |
| TC-1.5 | Server restart `[UI]` | Sign in → restart server → click any control | Login overlay appears; **no unhandled console pageerror**; after re-login the app works | §8.1 B4 |
| TC-1.6 | Session cookie flags `[API]` | Inspect `Set-Cookie` on login | `HttpOnly; SameSite=Strict; Path=/` | — |
| TC-1.7 | Localhost binding | `curl http://<LAN-IP>:3000` from another machine | Connection refused (server binds 127.0.0.1 unless HOST is overridden, which prints a warning) | — |

## 2. RBAC — server-enforced, UI-mirrored

Run the **matrix** below per role: attempt each action via UI (control should be hidden/disabled) **and** via API (server must still reject — UI hiding alone is a FAIL).

| Action / Role | GA | SEC | LEAD | COMP | OWNER | SA | OP |
|---|---|---|---|---|---|---|---|
| Apply fix (`POST /api/fix/apply`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Attest agent (`/api/register/attest`) | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Change governance answer (`/api/answers` with an `attests` question) | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Plan task update (`/api/plan/task`) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Import/clear evidence pack | ✅ | ✅ | ✅ | ✅ (v0.8) | ❌ | ❌ | ❌ |
| Remove register entry | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Clear **live** workspace | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Read state / findings / report / exports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

| ID | Case | Expected | Trace |
|---|---|---|---|
| TC-2.1 | Every ❌ cell via API | **HTTP 403** (not 400, not 200) with a message naming the required roles | §3.3, v0.4 note |
| TC-2.2 | Every ❌ cell via UI | Control hidden or disabled-with-tooltip (e.g. Register's Attest button disabled with "Requires …" title); no dead-end click | §8.2 U2 |
| TC-2.3 | Non-attest answers for SA/OP `[API]` | SA **can** save `selfStage`/`targetStage` (planning inputs) while a governance bool in the same payload → 403; unchanged governance values in payload do NOT trigger 403 | §7.2.4 |
| TC-2.4 | `[AUTO]` | `test/scoring.test.js` RBAC cases + `test/isolation.test.js` permission case pass | — |

## 3. Scoring & stage placement — the honesty core

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-3.1 | Contoso baseline `[UI]` | Demo: Contoso → Run assessment | **Stage 1**; low config score shown as "X% **of M/N measured**"; attest 0% | §6 |
| TC-3.2 | Fabrikam baseline `[UI]` | Demo: Fabrikam → Run assessment | **Stage 3**; gate 3 blocked by AGA-103/502/503/601/702 | §6 |
| TC-3.3 | Fabrikam → Frontier loop `[UI]` | Fix the 4 config gaps; answer kill-switch **Yes** (with a note) | **Stage 4**; each step visibly moves score/stage | §8.4 |
| TC-3.4 | Coverage floor `[AUTO]` | `test/scoring.test.js` | 5/40 sparse passes stay **Stage 1**; gate coverage < floor blocks; not-collected listed as blocking | §2.5.1 |
| TC-3.5 | Coverage on every verdict `[UI]` | Any assessment | Every stage chip shows "X/Y gate checks measured · N self-attested"; config card shows "of M/N measured" + PARTIAL COVERAGE warning when M<N | §2.5.2/3 |
| TC-3.6 | Measured vs attested separation `[UI]` | Overview + Findings | Config badged **measured**; attestation badged **self-attested** ("asserted by owners, not independently verifiable"); attest findings carry the `self-attested` pill | §2.5.4 |
| TC-3.7 | Gate blockers named `[UI]` | Any stage < 4 | "To reach Stage N" lists failing checks AND "Not yet measured (these BLOCK the gate)" with check IDs | §2.5.2 |
| TC-3.8 | License gating | Contoso (no E5) | O-tier checks (e.g. AGA-405) show `license-gated`/unlockable — **never** fail; excluded from scores | §6 |
| TC-3.9 | Anti-fabrication `[AUTO]` | `test/security.test.js` "LIVE FINDING" | Null/blocked collection → `not-collected`, never a fabricated fail or zero | §10.1 |

## 4. Overview tab

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-4.1 | Empty state | Fresh tenant, no assessment | Welcome card with guidance (no bare text, no crash) | §4.4 |
| TC-4.2 | Belief vs evidence — overclaim | Questionnaire: selfStage=4 on Contoso → assess | Callout card: "You assessed yourselves at Stage 4; the measured placement is Stage 1" with gap framing | §7.2.3, §8.3 |
| TC-4.3 | Belief vs evidence — underclaim | selfStage=1 on a Stage-3 Fabrikam | Positive-tone callout ("further along than you believed") | §7.2.3 |
| TC-4.4 | Belief matches | selfStage == measured stage | **No** callout renders | — |
| TC-4.5 | Trajectory sparkline | Run ≥2 assessments | Sparkline renders config+attest lines; history scoped to the current tenant only | §7.1 |
| TC-4.6 | Bar label contrast | Per-control bars | "% measured/attested" labels readable on white chips over the bar (WCAG AA spot-check with a contrast tool) | §8.2 U1 |
| TC-4.7 | Crosswalk | Per-control bars | NIST AI RMF · ISO 42001 · EU AI Act line under each control name | §3.5 |

## 5. Findings tab

| ID | Case | Steps | Expected |
|---|---|---|---|
| TC-5.1 | Sort order | Default view | Failures first, then not-collected, license-gated, passes |
| TC-5.2 | Text filter | Type "purview" | Live count updates ("N of 41 checks"); matches id/title/control/persona |
| TC-5.3 | Status filter | Select each status | Only that status listed; count correct |
| TC-5.4 | Evidence lines | Expand any measured/fed check | Specific evidence (policy names, counts, provenance lines) — not generic text |
| TC-5.5 | Fix button visibility | Compare GA vs SA, demo vs live | Fix… only for failing+demo-fixable+fix-capable role+demo mode |
| TC-5.6 | Note on excluded checks | not-collected / license-gated rows | Each carries its explanatory note ("Not collected in this mode…", "Requires E5…") |

## 6. Configure pipeline (demo only, by design)

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-6.1 | Dry-run diff | Contoso, GA → Fix AGA-301 | Modal: setting path, `- current` / `+ intended`, mode, rollback note | §8.4 |
| TC-6.2 | Approve & apply | Approve | Toast; check flips to pass; assessment auto re-runs; plan task auto-closes "auto-verified" | §8.4 |
| TC-6.3 | Audit trail | Audit tab | Entry: when, check, setting, before→after, **approved by name (role)**, environment | §8.4 |
| TC-6.4 | Live mode block | Switch to live → `POST /api/fix/preview` & `apply` | Rejected: "Configuration is demo-only… live mode is read-only by design" | — |
| TC-6.5 | Drift reopen | After a fix auto-closes a task: reset demo tenant → assess → regenerate plan logic | Auto-closed task reopens with "configuration drift" history entry on re-scan fail | §6 |

## 7. Plan tab

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-7.1 | Generate | Set targetStage in Questionnaire → Generate plan | Phased by stage ≤ target; tasks carry persona, effort, mode pill, dependsOn | §6 |
| TC-7.2 | **Plan = Overview agreement** | On a sparse/live tenant compare "To reach Stage N" blockers vs Plan tasks | **Every** not-collected gate blocker appears as a `measure` task ("connect the live collector or import an evidence pack…"); counts agree | §8.1 B5 |
| TC-7.3 | Measure task lifecycle `[AUTO]` | `test/isolation.test.js` B5 case | Measure task auto-closes once the check is measured (even as *fail*); reopens if coverage regresses | §8.1 B5 |
| TC-7.4 | Manual done + attribution | Mark a task done as LEAD | History records "manually set to done by <name>" | — |
| TC-7.5 | Attest-mode tasks | Plan on a tenant with unanswered governance | Attest checks appear with action pointing at Questionnaire/Register, not at a portal | — |

## 8. Register tab

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-8.1 | Add agent | Fill all fields → Add | Row appears; assessment auto re-runs; register ATTEST checks move | — |
| TC-8.2 | Attest with note | Attest → add evidence note | "Xd ago" pill turns green; "by <name (role)>"; note shown; "expires in Nd" | §7.2.4 |
| TC-8.3 | 90-day staleness | Hand-edit a `lastAttested` to 91+ days ago (data file) → assess | Pill red/stale; `registerStats.attestationsCurrentPct` drops; AGA-202/106 react | §6 |
| TC-8.4 | Delete entry | As GA: ✕ → confirm. As COMP/OWNER: | GA: row removed + re-assess. Others: no ✕ button; API remove → 403 | §8.2 U3 |
| TC-8.5 | Incomplete owners | Add agent with missing owners | `ownersCompletePct` < 100; AGA-201 fails with that math | — |

## 9. Questionnaire — attestations with teeth

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-9.1 | Stamping | As LEAD answer kill-switch **Yes** + note → Save | Under the question: "attested by <name (role)> on <date> (expires in 90d) · "<note>"" | §7.2.4 |
| TC-9.2 | Evidence flows | Findings → AGA-601 | Evidence: `Self-attested "Yes" by … on … (expires in 90d)` + `Evidence note: …` | §8.3 |
| TC-9.3 | Expiry | Hand-edit answer `at` to 120d ago → assess | AGA-601 **fails**; evidence line `EXPIRED self-attestation — … re-affirm in the Questionnaire`; UI shows EXPIRED warning | §7.2.4 |
| TC-9.4 | Permission gate | As SA open Questionnaire | Governance radios disabled + explanation; selfStage/targetStage still editable; API change attempt → 403 | §7.2.4 |
| TC-9.5 | Stamp preservation | LEAD answers; GA re-saves same values | Stamp still shows LEAD (re-saving must not re-date someone else's attestation) `[AUTO]` | §7.2.4 |
| TC-9.6 | Seeded answers | Fresh Fabrikam | Marked "seeded/unattributed — re-save to attribute"; still count until re-saved | — |
| TC-9.7 | AGA-907 wired | Toggle aiPolicy Yes/No → assess | AGA-907 pass/fail tracks the answer; sits in gate 1 | §7.2.1 |
| TC-9.8 | No dead inputs | Inspect questionnaire | Every question is consumed: selfStage (belief delta), targetStage (plan), 7 governance bools (checks). `decisionRightsKnown`/`autonomyAppetite` are gone | §7.2.2 |

## 10. Evidence pack

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-10.1 | Import happy path | As GA: Settings → choose valid pack JSON → Import | Toast lists fed checks; auto re-assess; pack status line (collected by/when, age, feeds AGA-…) | §2.5.5 |
| TC-10.2 | Provenance on findings | Findings → e.g. AGA-404 | First evidence line: `Measured via evidence pack — collected <date> by <upn>, imported by <who>` | — |
| TC-10.3 | RBAC | As COMP/SA/OP | Import controls replaced by explanation; API → 403 | — |
| TC-10.4 | Validation | Import `{"schema":"nope"}`; a pack with `"identity.caBaseline": true`; a string where boolean expected | 400 with reason; out-of-charter paths **dropped and reported**; type mismatch rejected `[AUTO]` | — |
| TC-10.5 | 30-day expiry | Import a pack with `collectedAt` 31+ days ago (edit JSON) → assess | Fed checks revert to not-collected; evidence shows `EXPIRED evidence pack … re-run scripts/collect-evidence.ps1`; status line shows EXPIRED | — |
| TC-10.6 | Gate-1 clearance `[AUTO]` | `test/evidence.test.js` headline | Graph wave-1 + pack + questionnaire = 11/11 gate-1 measured → Stage 2 possible; same tenant without pack stays Stage 1 | §2.5.5 |
| TC-10.7 | Pack can't fabricate | Import a full pack into Contoso (whose measured values fail) | Gate 1 reads 10–11/11 measured and **still fails** on the failing checks | — |
| TC-10.8 | Collector script (needs real tenant + modules) | Run `scripts/collect-evidence.ps1 -SpoAdminUrl … -CollectedBy …` | Read-only; sections skip gracefully without modules/licenses; AGA-409/410 prompts **require a named reference**; output imports cleanly | — |
| TC-10.9 | Remove pack | GA → Remove pack | Fed checks revert to not-collected after auto re-assess | — |

## 11. Live tenant mode (requires a real tenant)

Entra prerequisites: public-client app registration; delegated `Organization.Read.All, Policy.Read.All, Application.Read.All, Directory.Read.All, AuditLogsQuery.Read.All, SharePointTenantSettings.Read.All, InformationProtectionPolicy.Read`; admin consent.

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-11.1 | Device-code flow | Settings → IDs → Sign in | Code + link shown; after browser sign-in, "collecting…" then snapshot | — |
| TC-11.2 | Honest live verdict | Run assessment | Stage with partial-coverage labelling; unmeasured checks block gates; **no** fabricated values | §8.4, §10.1 |
| TC-11.3 | Evidence specificity | Findings | Named CA policies, per-SKU seat counts, GA member count w/ least-privilege flag, named ownerless apps, secret-lifetime findings | §8.4 |
| TC-11.4 | Context-only evidence | AGA-402 / AGA-410 | Sharing posture / guest-invite lines present but status stays **not-collected** | — |
| TC-11.5 | Read-only guarantee | Review Entra sign-in/audit logs after a scan | Only reads; no writes from the app's service principal | — |
| TC-11.6 | Blocked network honesty | Re-run collect with Graph unreachable (e.g. block egress) | Checks report not-collected; **no** "0 seats"/"no policies" fabrications; server logs name the failed collectors | §10.1 |
| TC-11.7 | Cold-start refresh | Restart server → immediately Run assessment (live) | Token auto-refreshes (one transparent retry); no `fetch failed` surfaced on first try | §10.4 |
| TC-11.8 | Token security | Inspect `data/` | `live-token-enc.json` is ciphertext (no `eyJ…`/plaintext token); `.secret` is mode 0600; access token never on disk | — |

## 12. Workspace isolation & reset ⚠ regression-prone — run ALL

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-12.1 | Per-mode stores | Work in Contoso (fix, plan, assess) → switch to Fabrikam, then live | Each tenant shows **only its own** plan/audit/history/assessment; live shows empty workspace, never demo leftovers | §7.1, B2 |
| TC-12.2 | Demo reset | Contoso: make changes → Settings → Reset | Fixture restored; plan/history/audit/answers/register/pack cleared **for Contoso only**; Fabrikam + live untouched | §7.1 |
| TC-12.3 | Live reset | Live mode, GA → Clear live workspace | Workspace cleared; **sign-in token survives** (re-collect works without re-auth); OP/SA/COMP → 403 | §7.1, §9.1 |
| TC-12.4 | **Post-reset all-tab smoke** | Immediately after ANY reset: open all 7 tabs, then Run assessment, then all 7 tabs again | **Zero console pageerrors**; assess returns 200; Audit shows "No changes applied yet", trajectory renders | **§9.2/§10.3** |
| TC-12.5 | Reset feedback | Click reset in any mode | Toast confirms what was cleared; never silent | §8.1 B1 |
| TC-12.6 | `[AUTO]` | `test/isolation.test.js` | Per-mode isolation, token survival, null-store regression all pass | §10.3 |

## 13. Exports & executive report

| ID | Case | Steps | Expected |
|---|---|---|---|
| TC-13.1 | CSV | Findings → CSV | Valid CSV (quotes escaped), one row per check incl. status + evidence |
| TC-13.2 | JSON | Findings → JSON | `{assessment, plan, register}` for the **current tenant only** |
| TC-13.3 | Report | Export report | Stage + per-gate coverage, scores with measured/attested framing + PARTIAL COVERAGE, gap, per-control crosswalk table, top gaps w/ evidence, trajectory, register summary, **generated by <name (role)>** |
| TC-13.4 | Print | Browser print of report | Single clean page-flow document (print CSS, no nav chrome) |

## 14. Resilience & error handling

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-14.1 | Stale assessment shape | Place an old-shape `last-assessment-<mode>.json` (no `notCollected` in gateDetail) → load Overview | Renders defensively, no crash | §8.1 B3 |
| TC-14.2 | Malformed POST body | `POST /api/assess` with invalid JSON | Treated as `{}` or 400 — never a crash/500 | — |
| TC-14.3 | Unknown route / path traversal | `GET /api/nope`; `GET /../../etc/passwd` | 404 both; static serving confined to `public/` | — |
| TC-14.4 | Shared workspace (by design) | Two browsers, different roles; one switches tenant | Single-customer scope: both sessions share one workspace/tenant mode by design — verify no data corruption; both views stay consistent after refresh | §9.4 + scope decision |

## 15. Accessibility & visual

| ID | Case | Expected | Trace |
|---|---|---|---|
| TC-15.1 | Esc closes any modal | Fix dialog + Attest dialog | §4.4 |
| TC-15.2 | Status conveyed by text, not colour alone | All pills carry words (pass/fail/self-attested/…) | §4.1 |
| TC-15.3 | Bar-label contrast ≥ WCAG AA | Checked with a contrast tool on Overview bars | §8.2 U1 |
| TC-15.4 | Keyboard pass | Tab through login, questionnaire, findings filter; everything reachable & operable | §4.4 (partial — full ARIA pass is open P3) |
| TC-15.5 | Disabled-with-reason controls | Attest (no right), import (no right) show explanatory tooltip/text | §8.2 U2 |

## 16. Automated suite & data hygiene

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-16.1 | Full suite | `npm test` | **34/34 pass** (scoring, engine, security, governance, evidence, isolation) | — |
| TC-16.2 | Test/data isolation | `diff -r` snapshot of `app/data/` before vs after `npm test` | **Byte-identical**; suite writes only `.data-test/`; a live sign-in token survives the suite | §9.3/§10.2 |
| TC-16.3 | Clean clone | Fresh clone → `node server.js` with **no npm install** | Starts and serves; zero runtime dependencies hold | — |

---

## Appendix A — persona walkthroughs (scripted end-to-end passes)

Run each as a continuous session; they exercise the integration seams the unit cases don't.

1. **Priya — Solution Architect (facilitated assessment):** sign in SA → Contoso → assess → set selfStage=3/target=4 → confirm belief-vs-evidence callout → generate plan → confirm she **cannot** fix/attest/import (UI + 403) but can mark plan tasks → export CSV for the workshop.
2. **Raj — Global Admin (govern → frontier):** Fabrikam → assess (Stage 3) → fix AGA-103/502/503/702 via dry-run→approve → attest kill-switch with drill note → Stage 4 → verify audit attribution and report "generated by Raj (Global Admin)".
3. **Maya — AI Governance Lead (register lifecycle):** add agent with full RACI → attest with note → simulate 91-day staleness → watch AGA-202 fail → re-attest → remove a mistaken entry.
4. **Sam — Operator (exec viewer):** read every tab, open report, download exports; verify all eight mutation paths 403; verify nothing in the UI invites an action he can't take.
5. **Eve — negative persona (abuse attempts) `[API]`:** replay each 403 with a forged role in the body (server must use session role, not body), oversized payloads, pack with out-of-charter paths (`identity.caBaseline`), expired pack replay, path traversal. All rejected; no 500s.

## Appendix B — known-open items (do NOT file as new bugs)

- Copilot Chat vs licensed M365 Copilot modelling; Entra Agent ID / Agent 365 wiring; branded PDF/PPT export; "audit instrument" visual restyle; full ARIA/responsive pass. All tracked in `docs/08-feedback-response-v0.4.md` dispositions.
- **Out of scope by product decision (do not test for):** multi-customer portfolio views and per-session tenant switching — the tool is single-customer, one instance per engagement.

---

## 17. v0.8 additions (E5 SKU, attestation log, self-service ergonomics)

| ID | Case | Steps | Expected | Trace |
|---|---|---|---|---|
| TC-17.1 | E5 unbundled SKU | Live tenant with `Microsoft_365_E5_(no_Teams)` (or fixture) → assess | `tenant.licenses.e5 = true`; AGA-302/405/406/904 are scored, **not** "unlockable"; E5 Security add-on alone must NOT count `[AUTO ×8]` | §14.1 |
| TC-17.2 | Contested attestation | Role A answers a governance question Yes (note), role B changes it to No → assess | Latest (No) scores; the check's evidence leads with `CONTESTED: changed Yes→No by …(previously …)`; questionnaire shows the CONTESTED banner + "2 attestations on record" `[AUTO]` | §14.2 |
| TC-17.3 | Sign out | Header → Sign out → any action | Session destroyed server-side (API → 401), cookie expired, login overlay shown | §13.2 P1-a |
| TC-17.4 | Disconnect tenant | Settings (fix-capable, connected) → Disconnect → confirm | `live-token-enc` + snapshot deleted; status shows "Not connected"; re-scan requires fresh device-code | §13.2 P1-a |
| TC-17.5 | Compliance imports pack | As Compliance Admin import a valid pack | **200**, re-assess runs; as Agent Owner/Operator → 403; Compliance still cannot fix (perm must not leak) `[AUTO]` | §13.2 P1-b |
| TC-17.6 | GUID validation + AADSTS hints | Enter `not-a-guid` tenant ID; then a valid GUID with public-client flows disabled | Local friendly message without calling Microsoft; AADSTS7000218 surfaced with the "enable Allow public client flows" hint (code still visible) | §13.2 P2-a |
| TC-17.7 | Denial affordance consistency | Walk every mutating control as Operator | Only two patterns exist: disabled-with-tooltip or hidden-with-reason; **no** enabled control that 403s on click | §13.2 P2-b, §15.1 |
| TC-17.8 | Run-over-run delta | Assess, change something (fix/attest), assess again | Overview shows "Since last run: AGA-xxx fail→pass …"; trajectory table has a What-changed column; identical runs read "no change" | §12 UX2 |
| TC-17.9 | Plan default target | Fresh tenant, no targetStage answered → Generate plan | Target = current stage + 1 (not 4); banner notes the default | §12 UX3 |
| TC-17.10 | Expandable controls | Overview → click a control row | Expands in place: "X/Y measured, Z passing" + each check with pill + first evidence line; collapse works; no layout break | §12 UX4 |
| TC-17.11 | Connection status | Live mode, connected vs disconnected | Header shows "✓ tenant connected" / "not connected — sign in under Settings"; Settings shows token-on-file + last-collected time | §12 UX1 |
| TC-17.12 | Help tab | Open Help as every role | Renders all sections; answers match actual behavior (spot-check the AADSTS7000218 and CONTESTED entries) | §12 UX5 |
