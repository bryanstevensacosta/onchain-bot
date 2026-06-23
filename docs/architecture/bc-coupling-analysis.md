# BC Coupling Analysis & Recommendations

> Analysis of the risk-evaluation pipeline (`classification → scoring → token-gating`) and `settings` as a candidate BC, in the alpha-meta-token-scanner monorepo.
> Scope: `apps/backend/src/token/{classification,scoring,token-gating,honeypot}` and `apps/backend/src/settings/`. Single-operator internal app, no auth, single deploy unit.

## 1. Executive Summary

The risk-evaluation chain is **three distinct Bounded Contexts**, not one. Each answers a different verb: *classify* (categorize a token from a snapshot), *quantify* (reduce to a 0–100 score), and *decide* (apply hard gates to approve/reject). They share data through domain events, not direct calls, and persist in separate tables (`token_classifications`, `token_scores`, `filter_decisions`) with no foreign keys between them. The frontend already mirrors that split (`entities/token-classification`, `entities/token-score`, `entities/filter-decision`).

**Three explicit verdicts:**

1. **Classification + Scoring + Token-Gating → KEEP SEPARATE.** Distinct verbs, distinct tables, distinct endpoints, distinct event topics (`classification.token.classified` → `scoring.token.scored` → `filters.token.approved|.rejected`). They are connected by **event-driven choreography**, not by shared aggregates. Merging them would force a single aggregate root to model a 4-stage state machine that none of the current code expresses.
2. **Settings → KEEP FLAT (single BC, four controllers).** `SettingsModule` is already a first-class NestJS module (`settings.module.ts:15-37`) with its own 4 tables and 4 HTTP controllers. Sub-BC decomposition is only justified once an admin UI forces 1:1 ownership boundaries.
3. **Real technical debt lives in event payload shape, not BC boundaries.** Data is silently dropped in `token-classified.handler.ts:33-36` (liquidity/MC/volume/holders → `null`), and `token-scored.handler.ts:45-50` re-queries classification to recover `riskWeight` rather than reading it from the event. These are additive enrichments, not merge-trigger refactors.

**DDD heuristic used throughout:** *distinct verbs = distinct BCs*; *same verb, different stakeholders = same BC*; *data shape overlaps ≠ shared BC*.

**Verdict: classification+scoring+token-gating → KEEP SEPARATE.**
**Verdict: settings → KEEP FLAT (single BC, four controllers).**
**Verdict: real technical debt lives in event payload shape, not BC boundaries.**

## 2. Coupling Matrix

### Table 1 — Cross-BC imports in the risk-evaluation pipeline

| From → To | classification | scoring | token-gating |
|---|---|---|---|
| **classification** uses | — | emits `classification.token.classified` (no direct import) | none |
| **scoring** uses | imports `TokenClassifiedEvent` only (`token-classified.handler.ts:3-4`) for the event-bus bridge; does NOT import `TokenClassification` entity or repo | — | emits `scoring.token.scored` (no direct import) |
| **token-gating** uses | imports `TokenClassificationRepository` **only inside the event-bus handler** (`token-scored.handler.ts:6,47`) to re-query `riskWeight`; the use case `apply-filters.use-case.ts:1-12` does **not** import anything from classification | imports `TokenScoredEvent` only (`token-scored.handler.ts:4`) for the event-bus bridge | — |

**Interpretation:** every cross-BC reference is mediated by the in-process event bus (`@nestjs/event-emitter`) plus a port-driven re-query inside one handler. There are no module-to-module circular imports and no shared aggregates. The single direct dependency (`TokenClassificationRepository` inside `token-scored.handler.ts:6`) is the actual debt — see §3b and §4.

### Shared kernel — what crosses BC boundaries (intentionally)

Every BC in the risk pipeline imports `ChainId` from `chain/chain-detection/domain/value-objects/chain-id.vo.ts` (e.g. `token-score.entity.ts:4`, `token-classification.entity.ts:4`, `apply-filters.use-case.ts:2`). This is **shared kernel** by intent — `ChainId` is a tiny value object that prevents stringly-typed chain IDs across BCs. It does not constitute coupling: no BC can mutate `ChainId` behavior, and adding a new chain touches only the chain-detection BC. The same pattern applies to `shared/kernel/domain-event.ts` (base class for all events) and `shared/common/persistence/database.module.ts` (TypeORM wiring). These are infrastructure-level shares, not domain-level coupling.

### Table 2 — Settings sub-domain shape

`SettingsModule` (`settings.module.ts:15-37`) owns four controllers, four TypeORM entities, and two services. Each sub-domain below has **its own controller, its own entity, and its own DTO** — the only thing they share is the parent module and the audit log writer.

| Sub-domain | Own controller | Own DTO/input | Own entity (table) | Own URL prefix |
|---|---|---|---|---|
| Signal penalties | `SignalsController` (`settings.module.ts:29`) | `signal.dto.ts` (CRUD) | `SignalEntity` → `signals` (`settings.module.ts:19`) | `/settings/signals` |
| Score thresholds (KOL tiers) | `ThresholdsController` (`settings.module.ts:30`) | `scoring-threshold.dto.ts` | `ScoringThresholdEntity` → `scoring_thresholds` (`:21`) | `/settings/thresholds` |
| Filter/parameter catch-all | `FiltersController` (`settings.module.ts:31`) | `settings-filter.dto.ts` | `SettingsFilterEntity` → `settings_filters` (`:22`) | `/settings/filters` |
| Audit log (read-only) | `AuditController` (`settings.module.ts:32`) | `audit-query.dto.ts` | `SettingsAuditLogEntity` → `settings_audit_log` (`:23`) | `/settings/audit` |

The **frontend does not yet have a `settings` page** (`apps/frontend/src/pages/` has 6 pages — dashboard, live-feed, tokens-explorer, token-detail, kols, ops — no settings). Operators currently mutate settings via the Tailscale-only HTTP API and an ad-hoc admin script.

## 3. Per-BC Verdict

### 3a. classification + scoring — different verbs (categorize vs quantify)

Classification turns a market snapshot into a discrete category (`TOKEN | POOL | ROUTER | NFT | SCAM | UNKNOWN`, `classification.vo.ts:27`) plus an array of typed risk signals (`risk-signal.vo.ts:4-13`, 9 signal types). Scoring takes that output plus market metrics plus KOL reputation and produces a 0–100 number with a `tier()` (`score.vo.ts:18`, 5 buckets) and a per-factor breakdown (`token-score.entity.ts:8-12`). They have different aggregate roots (`TokenClassification`, `TokenScore`), different tables (`token_classifications`, `token_scores`), and different controllers (`/ca/classification`, `/ca/scoring`).

The scoring formula itself encodes the boundary: it takes 5 market metrics (`liquidityUsd`, `holders`, `marketCapUsd`, `volume24hUsd`, `holders`) as **input**, plus the `classification` string and the `signals[]` array as **derived state from classification**. The use case does not re-derive the category — it consumes it. That asymmetry is exactly what a BC boundary looks like: producer owns the meaning, consumer owns the weighting.

The real problem is **not** that they are separate — it is that the event-bus path drops data on the floor. `token-classified.handler.ts:33-36` passes `liquidityUsd: null, marketCapUsd: null, volume24hUsd: null, holders: null` into `ScoreTokenUseCase.execute` because `TokenClassifiedEvent.payload` (`token-classified.event.ts:11-25`) does not carry those fields. The HTTP path `POST /ca/scoring/score` does pass them and gets a higher-fidelity score; the event-driven path silently degrades to a near-50 baseline because `liquidityBonus()`/`holdersBonus()`/`marketCapBonus()`/`volumeBonus()` (`score-token.use-case.ts:162-289`) all return `0` on `null`.

**Verdict: KEEP SEPARATE.** Real fix is payload enrichment of `TokenClassifiedEvent` to include the four market fields (see §4), not a merge. Merging would force the operator to write a single `RiskEvaluationAggregate` that models the 4-stage state machine (snapshot → classify → score → gate), which the code currently does not express — and which no consumer needs.

### 3b. scoring + token-gating — different verbs (quantify vs decide)

Scoring answers "how good/bad is this token on a 0–100 scale?"; token-gating answers "should we publish it?" via 7 fail-fast gates (`apply-filters.use-case.ts:70-143`: SCORE_TOO_LOW, CLASSIFICATION_BLOCKED, BLACKLISTED, HONEYPOT_SUSPECTED, RISK_WEIGHT_EXCEEDED, INSUFFICIENT_DATA, CHAIN_UNSUPPORTED). They have different aggregate roots (`TokenScore`, `FilterDecision`), different tables (`token_scores`, `filter_decisions`), and different controllers (`/ca/scoring`, `/ca/token-gating`).

The token-gating use case's input contract (`apply-filters.use-case.ts:30-43`) shows that gating consumes **6 distinct inputs**: `score`, `classification`, `riskWeight`, `snapshotCompleteness`, plus 5 holder-concentration fields (`top10HolderPercent`, `insidersPercent`, `bundlersPercent`, `bondingPercent`, `factory`). Only `score` and `classification` are in the scoring event today; the rest are either re-queried from classification (`token-scored.handler.ts:47`) or sourced from the chain explorer (`token-scored.handler.ts:46`).

The coupling is asymmetric: `token-scored.handler.ts:45-50` calls `classificationRepo.findByChainAndAddress()` and `snapshotRepo.findByChainAndAddress()` to recover `riskWeight` and `snapshotCompleteness`, then passes them into `ApplyFiltersUseCase.execute` (`apply-filters.use-case.ts:53-66`). This works but it (a) adds two DB roundtrips per scored token on the event-driven path, and (b) creates a hidden temporal coupling — if classification is in-flight when scoring fires, the handler reads a stale row, which can flip a token from APPROVED to REJECTED (or vice versa) mid-flight.

**Verdict: KEEP SEPARATE.** Real fix is to add `riskWeight` (and optionally `snapshotCompleteness`) to `TokenScoredEvent.payload` (`token-scored.event.ts:13-24` currently carries neither), and have the classification handler include it before publishing `scoring.token.scored`. That eliminates both the re-query and the temporal coupling, without changing the BC boundary. The scoring BC remains the only producer of the event; token-gating remains the only consumer; the contract just stops omitting fields the consumer needs.

### 3c. settings as a BC — already a real BC, sub-decomposition only when UI arrives

`SettingsModule` (`settings.module.ts:15-37`) has its own DI module, its own four controllers, its own four TypeORM entities, and exports only `SettingsService` + `AuditService` to consumers (`scoring/application/handlers/score-token.use-case.ts:15,18` is the heaviest consumer). It uses `isDatabaseEnabled()` (`settings.module.ts:17`) so the whole module degrades to no-op when `DATABASE_ENABLED=false`, matching the rest of the codebase's dev/prod parity.

The four sub-domains share **only** the audit log writer (`AuditService`) and the `SettingsService` cache wrapper. Each has a distinct vocabulary (`Signal`/`penalty`, `ScoringThreshold`/`tier`, `SettingsFilter`/`parameter`, `AuditLog`/`event`), a distinct CRUD surface, and a distinct operator concern. Sub-BC decomposition (one NestJS module per sub-domain) is justified **only** when an admin UI needs 1:1 ownership of routes and permissions, or when two teams will own different sub-domains independently.

Compare against the alternative: a flat namespace of `/settings/signals`, `/settings/thresholds`, `/settings/filters`, `/settings/audit` (current) versus a sub-BC split of `SignalsModule`, `ThresholdsModule`, `FiltersModule`, `AuditModule` each with their own DI graph, their own TypeORM `forFeature`, and their own consumer surface. The sub-BC split would require ~3× the boilerplate (4 modules, 4 controllers duplicated as exports, 4 service layers, 4 caching strategies) for an operator who today hits 4 URLs and sees one audit log. There is no observable benefit until an external trigger (UI, team, deploy cadence) demands it.

The real problem here is **inside one of the sub-domains**: `settings_filters` table (`settings-filter.entity.ts:10-47`) is overloaded as a catch-all for ~28 distinct `type` values (base_score, multiplier_pivot, security_cap_*, min_score, max_risk_weight, min_completeness, blocked_classification, enable_blacklist, publishable_chain, honeypot_*, bundlers_threshold, insiders_threshold, bonding_threshold, kol_*, known_good_kol, known_bad_kol, blacklist_mint, …). The `value`/`numericValue` polymorphic columns are the symptom — the domain knows there are 4 distinct parameter families (scoring-formula, KOL-reputation, honeypot-thresholds, chain-gating). Reading `apps/backend/README.md` §6 confirms that the operator's mental model already groups them this way ("Tipos de `SettingsFilterEntity.type`" is followed by type-by-type enumeration rather than a category-first view).

**Verdict: KEEP FLAT.** Sub-BC decomposition is premature — there is no admin UI yet, no team split, and no independent-deploy requirement. The actionable fix is internal to `SettingsFilterEntity`: split the catch-all into 4 typed tables (or 4 polymorphic concrete subclasses sharing the audit log), not into 4 NestJS modules.

## 4. Real Technical Debt

These are concrete, additive changes — none of them are refactors of BC boundaries.

1. **Enrich `TokenClassifiedEvent` payload** (`token-classified.event.ts:11-25`) with `liquidityUsd`, `marketCapUsd`, `volume24hUsd`, `holders` sourced from the upstream `TokenSnapshot`. The classification BC already reads the snapshot to compute signals (`classify-token.use-case.ts:74-199`); carrying the raw fields forward is free. This removes the four `null` literals at `token-classified.handler.ts:33-36` and lets the event-driven scoring path match the HTTP-path fidelity.

2. **Add `riskWeight` to `TokenScoredEvent` payload** (`token-scored.event.ts:13-24`). The scoring use case has `input.classification` already (`score-token.use-case.ts:23`); it can re-derive `riskWeight` from the signals array it already received, or the classification BC can publish it directly. Then delete the re-query at `token-scored.handler.ts:45-50` and read `event.payload.riskWeight` instead. The same payload can also carry `snapshotCompleteness` to delete the second re-query at `token-scored.handler.ts:46`.

3. **Rename `settings_filters` → `settings_parameters` with a type-discriminator split.** Either four typed tables (`scoring_parameters`, `kol_parameters`, `honeypot_parameters`, `chain_parameters`) sharing `settings_audit_log`, or one parent + four concrete subclasses via TypeORM single-table inheritance keyed on `family`. This collapses the ~28 `type` strings (`settings-filter.entity.ts:17-18`) into 4 coherent groups, makes invalid combinations unrepresentable, and keeps the controller/URL surface stable.

These three changes resolve the actionable items raised in `apps/backend/src/token/{scoring,token-gating,honeypot}/README.md` Section 14 without moving a single file across BC boundaries, and they are additive (no existing consumer breaks).

### Why not extract a shared `risk-contracts` package?

A tempting refactor is to extract `TokenClassifiedEvent` and `TokenScoredEvent` into a `shared/events/` package to "make the contract explicit". This would not reduce coupling — both events already live in their producer BC and are imported only by the immediate consumer's event handler (`token-classified.handler.ts:3-4`, `token-scored.handler.ts:4`). Moving them to `shared/` would create a third owner for the schema and require coordination for any field change, slowing the cadence for zero coupling benefit. Keep events in their producer BC; if a second consumer ever appears, that is the moment to reconsider.

## 5. When To Revisit

This document should be reopened — **not before** one of the following concrete triggers:

1. **Admin UI is added for settings.** If `apps/frontend/src/pages/settings/` appears with multiple tabs (one per parameter family), promote each family into a sub-BC with its own NestJS module + controller — the 1:1 mapping between UI tabs and modules is what justifies the decomposition. Until then, sub-BCs would be ceremony without payoff.

2. **Settings grows beyond ~15 distinct tables.** Today: 4 (`signals`, `scoring_thresholds`, `settings_filters`, `settings_audit_log`). At ~15 the module file becomes hard to navigate, ownership boundaries blur, and split-by-sub-domain pays for itself. Below that, flat is cheaper.

3. **Settings needs independent deployability.** If the settings surface must ship on a different cadence than the risk-evaluation pipeline (e.g., runtime config changes without backend redeploy), formalize as separately deployable modules with their own NestJS bootstrap. Currently the single deploy unit is fine.

4. **Classification or scoring requirements diverge significantly from token-gating.** Today both consume the same `classification.token.classified` and `scoring.token.scored` events with the same shape. If token-gating starts requiring fields that scoring refuses to compute (or vice versa), or if scoring gains a second consumer with incompatible needs, the shared events become a negotiation bottleneck — that's the signal to split publishing from consuming.

5. **Two or more teams own different risk-evaluation domains.** With one operator, the BC-by-verb split is for clarity, not for autonomy. Once team boundaries exist, the split becomes enforceable and the question becomes "which team owns which event schema?".

## 6. What NOT To Do

Anti-patterns to avoid when revisiting this analysis:

1. **Don't merge BCs based on operator mental model alone.** The operator sees one risk pipeline end-to-end — that's a UX concern (single dashboard view), not a domain boundary. Merging `classification` + `scoring` + `token-gating` into one BC would force a single aggregate root, a single transaction boundary, and a single deploy unit for three independently evolving concerns. The dashboard already aggregates them at the UI layer; the backend has no such requirement.

2. **Don't create sub-BCs before admin UI exists.** Premature decomposition into `SignalsModule` + `ThresholdsModule` + `FiltersModule` + `AuditModule` would split the audit writer, split the `SettingsService` cache, and split the dev-mode fallback (`isDatabaseEnabled` check) — all for an audience of one operator hitting the API. Wait for the UI trigger (§5.1).

3. **Don't split `token-classification` and `token-honeypot` based on name overlap.** They share "risk" as a concept but answer different verbs and have different stakeholders — classification serves scoring+filters; honeypot serves publishing+call-tracking. Different tables (`token_classifications`, `honeypot_analyses`), different controllers (`/ca/classification`, `/ca/honeypot`), different event topics (`classification.token.classified`, `honeypot.analysis.completed`), different signal vocabularies (9 risk signals in `risk-signal.vo.ts:4-13` vs 12 honeypot signals in `honeypot-signal.vo.ts:4-16`). The current split is correct.

4. **Don't add new event-driven chains between `token-scoring` and `token-classification`.** The current coupling is `scoring → classification` via the `TokenClassifiedHandler` in one direction only. Adding a `classification → scoring → classification` round-trip would create a feedback loop. The fix for the `riskWeight` re-query is payload enrichment, not a new event chain.

5. **Don't promote `SettingsService` to a shared-kernel module.** `SettingsService` is exported (`settings.module.ts:35`) and consumed by `scoring/application/handlers/score-token.use-case.ts:15` and `apply-filters.use-case.ts:12`. That is **downstream consumption via a public port**, not shared kernel — the consumers depend on the interface, not the implementation. If a second risk BC starts consuming settings directly, the right move is a dedicated `RiskParametersPort` facade inside the settings module, not a `shared/settings/` package.
