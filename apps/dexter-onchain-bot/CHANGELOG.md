# Changelog

All notable changes to `@onchain-bot/dexter-onchain-bot` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Launchpad (bonding-curve) short-layout keys (2026-10-30):** Rick
  renders a SHORTER card while a token is still on a launchpad bonding
  curve (docs: "the launchpad headline drops `[FDV/24h change]`",
  "There is no USD or Liq row, and `5M:` replaces `1H:`"). Seven new
  derived keys on EVERY command, each SILENT off curve so ONE body
  serves both layouts and any existing body stays byte-identical:
  `curveRow` (`\n⏳ [prog% ]@ Name`, launchpad display name honoring
  the `launchpadName` override and falling back to
  `bondingCurve.launchpadId` when the snapshot `launchpad` is null),
  `quoteSuffix` (`/<quoteSymbol>` or `""`), `fdvChangeBracket`
  (owning its V2 bracket escapes: off curve `\[<fdvUsd>/<priceChange24h>\] `
  with its own trailing space, `""` when both values are unknown and
  `N/A` for one unknown side; `""` on curve), `usdRow`
  (`\n💰 USD: <priceUsd>` with the price in a code span — raw value,
  zero backslashes; `""` on curve), `liqRow`
  (`\n💦 Liq: <one-side>` in a code span plus `liquidityFlags`
  outside it — zero backslashes; `""` on curve), `market5mRow`
  (exact `market1hRow` mirror with
  `5M:` and the four new 5m fields), and `marketRow` (layout switch:
  `market5mRow` on curve, `market1hRow` off curve, both
  byte-identical to the key they delegate to). The 1H row was
  extracted into a shared private helper with its bytes pinned
  unchanged. Wire contract (owned by market-data):
  `bondingCurve: { onCurve, launchpadId, quoteSymbol, quoteMint,
progressPercent } | null`, validated by `toBondingCurveOrNull`
  (rejects unless `onCurve === true`, non-empty `launchpadId`,
  absent/null or non-empty quote strings, and a finite
  `0..100` progress) and re-validated in the pipeline (the field is
  declared in `toResolvedToken`'s structural type). Four optional 5m
  fields (`volume5mUsd`, `priceChange5m`, `txns5mBuys`, `txns5mSells`)
  validate exactly like the 1h ones. Registry: **61** keys for
  `ca|x|z|bare`, **62** for `c|cc`. Renderer + specs only — no
  template body, seed or DB change; `headerIcon` already covers the
  💊 half of `🆕💊`.

- **`{{newTokenIcon}}` — the 🆕 title status emoji (2026-10-30):**
  Rick scan-icons rule (`pricebot#scan-icons`, "🆕 - token age under
  15 minutes") reproduced as a SEPARATE derived key on every command,
  so a body composes `{{newTokenIcon}}{{headerIcon}}` → `🆕💊`
  (launchpad icon-link) or `🆕🟡` (chain emoji); `headerIcon` itself
  stays byte-identical. Age is the SAME best-liquidity PAIR ISO
  `pairCreatedAt` the `age` key reads — no new wire field, no new
  HTTP call, no migration (proxy caveat unchanged: a curve → AMM
  migration under-reports the age). Windows, computed per render with
  `Date.now()`: `0 <= now - at < 15 * 60_000` → `🆕`; exactly 15m
  and older → `""` (the docs say "under 15 minutes"); non-string /
  empty / unparseable → `""`; FUTURE timestamp → `""` with an
  explicit guard (never claim an age — `{{age}}` clamps future to
  `0m`). Raw emoji, no MarkdownV2 escaping, no leading/trailing
  space. Registry: **54** keys for `ca|x|z|bare`, **55** for `c|cc`;
  catalog META carries the `🆕` example. Spec:
  `template-renderer-new-token-icon.spec.ts` + registry/age/rick-card
  count pins. Renderer only — no template body, seed or DB change.

- **`{{holderTopRow}}` — the `👥 TH:` derived key (2026-10-26):** Rick
  compact-card row fed by market-data's `holderConcentration`. SILENCE
  (`""`) on ANY gap — absent/null/malformed, empty `topPercents`, more
  than five entries, any non-finite or out-of-range value,
  `sum(top5) > top10 + ε` — never a half row, never `N/A`, never a
  literal placeholder. Otherwise emits `"\n\n👥 TH: "` + the payload in
  MONOSPACE (owner request 2026-10-26): each percent at 1 decimal with
  the trailing zero KEPT (`2.0`) in its OWN code span joined by `⋅`,
  then ONE space and the integer top-10 bracket, whose V2 escapes stay
  OUTSIDE the span. Carried shape:

  ```text
  \n\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` \[`20%`\]
  ```

  The bracket is computed from the DISPLAYED tenths
  (`max(round(top10), ceil(Σround(p*10)/10))`) so binary carry can
  never print a number below the printed five. Client guard
  `toHolderConcentrationOrNull` validates shape, non-increasing order
  (ties valid) and coherence; `HolderConcentrationInfo` is declared on
  the scan port AND in `toResolvedToken`'s structural type (an
  undeclared field is dropped silently). Registry: **53** keys for
  `ca|x|z|bare`, **54** for `c|cc`; catalog META carries the sample.
  Renderer only — the live `RickBurpBot` body stays operator-owned and
  is not modified or activated by this change.

- **Rick 1-hour row — `{{market1hRow}}` (2026-10-26):** ONE composed
  derived key on EVERY command, fed by four NEW optional snapshot
  fields (`volume1hUsd`, `priceChange1h`, `txns1hBuys`,
  `txns1hSells` — wire contract owned by the market-data lane).
  Reference row (docs: pricebot#reading-a-token-scan):
  `📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5` = 1h volume, 1h change, buys, sells;
  `📉` ONLY on a strictly negative change (zero and positive render
  `📈`). Composition reuses the shared formatters (`formatMoneyText`,
  `formatPercentText` — it ALREADY emits `%`, so none is appended —
  and `formatNumberText` for the counts) and renders every value in its
  own MarkdownV2 code span (owner request 2026-10-26, monospaced
  numbers), so the row carries NO V2 backslashes (`codeV2Text`, not
  `escapeV2Text`: a `\.` inside a code entity prints its backslash).
  Rendered shape:

  ```text
  📈 1H: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`
  ```

  SILENCE (`""`) when ANY of the four
  is missing/non-finite (counts additionally `>= 0`) — never a
  half-empty row, never `N/A`. Client boundary `toFiniteNumberOrNull`
  / `toNonNegativeCountOrNull`; the pipeline passes the four through
  with explicit `null` when absent. Port fields are OPTIONAL
  (`?: number | null`) so every existing `ResolvedToken` literal
  keeps compiling. Registry: 22 base + 30 derived = 52 keys for
  `ca|x|z|bare` / 53 for `c|cc`; catalog META carries the exact
  sample as its example. Specs: `template-renderer-market-1h-row.spec.ts`,
  `market-data-client-market-1h.spec.ts`,
  `token-scan-market-1h.spec.ts` + registry/rick-card count pins.

- **Rick compact-card placeholders + BSC seed row (2026-10-22):** six
  new derived keys on every command — `headerIcon` (launchpad icon link
  when present, else the chain DisplayMap emoji), `liquidityUsdSide`
  (`liquidityUsd / 2`, display-only — the core liquidity stays total),
  `liquidityFlags` (`⚠️` when the one-side value is `< $1,000`, `🔒`
  when `lockedLiquidityPercent + burnedPercent >= 50` with at least one
  numeric; ONE leading space, adjacent icons, `""` when neither),
  `honeypotBlock` (`"\n\n🍯 " + <honeypotLine core>`; `honeypotLine`
  itself stays byte-identical), `ageSuffix` (`" ⋅ Age: "` + a static
  code span around the rendered age; `""` when age is empty so the
  label never dangles) and `nameLink`
  (`[**Name**](botStartUrl)` or `**Name**`; reuses the `{{name}}`
  helper including the `(unverified)` suffix and the `N/A` default, so
  no `[Name]()` link). Registry now 22 base + 29 derived = 51 keys for
  `ca|x|z|bare` / 52 for `c|cc`, with `PLACEHOLDER_META` entries for all
  six. The committed DisplayMap catalog gains exactly one row —
  `{placeholderKey:'chain', matchValue:'bsc', display:'🟡'}` (3 rows
  total) — applied MANUALLY: `npm run seed:display-maps` defaults to
  dry-run, `--apply` writes, existing pairs skip and drift is never
  overwritten.

- **Manual DisplayMap seed + the two rows for `🟣 Solana @ Pump`
  (dexter plan todo 9, 2026-10-21):** committed catalog
  `src/templates/infrastructure/seed/data/display-maps.seed.json`
  with `(chain, solana, 🟣)` and
  `(launchpadName, pump-fun, Pump)`, plus a separate CLI
  (`npm run seed:display-maps`, flags `--dry-run` / `--apply` /
  `--file=<path>` / `--allow-prod`; default **dry-run**). The app
  runtime never reads
  the JSON and nothing auto-seeds: the CLI imports it (so `nest build`
  emits it into `dist/`), validates every row through
  `DisplayMap.create` (shape, whitelist, normalization) and rejects
  duplicate pairs BEFORE writing. Existing pairs are skipped; a
  different display is reported as `drift` and never overwritten; a
  concurrent insert is counted as `skipped`. Bootstrap side effects
  are neutralized (`DEXTER_SEED_TEMPLATES=false`,
  `DEXTER_INGEST_MODE=webhook`), and the CLI refuses
  `DATABASE_ENABLED=false` and `NODE_ENV=production` without
  `--allow-prod`. Specs: +2 suites / +22 tests (75 suites / 815
  tests), including a seed → resolver → renderer integration that
  renders the exact label.

### Fixed

- **`nameLink` renders PLAIN text (2026-10-26):** the derived key now
  emits `[Name](botStartUrl)` (or bare `Name` without a URL) instead
  of `[**Name**](botStartUrl)`. MarkdownV2 bold is a SINGLE `*`, so the
  double-asterisk shape leaked literal `**` markers into the card.
  Compose bold in a template body as `[*{{name}}*]({{botStartUrl}})`
  when a style wants it. The `{{name}}` helper is still reused, so the
  `(unverified)` suffix and the `N/A` default are identical; 76
  suites / 855 tests green, `tsc` clean. Supersedes the `[**Name**]`
  wording in the 2026-10-22 entry. Blast radius: only the inactive
  `RickBurpBot` dev row used the key — `bare-ca-v1` v2 is unchanged.

### Changed

- **Compact age drops the weeks rung + PancakeSwap DEX labels
  (2026-10-22):** `formatCompactAgeText` no longer emits `1w` for 7-29
  days — that range falls to the days rung (`7-29d` → `Nd`), while
  `30d+` keeps `mo` and `365d+` keeps `y` (floors otherwise unchanged).
  `DEX_DISPLAY` gains `pancakeswap_v2: 'Pancakeswap V2'` and
  `pancakeswap_v3: 'Pancakeswap V3'` (the existing `pancakeswap` key is
  untouched), so the GeckoTerminal `dexId` fallback no longer renders
  the raw `Pancakeswap_v2`.

- **`venueSuffixShort` derived placeholder (dexter plan todo 73,
  2026-10-21, display-only):** new opt-in key rendering the SHORT
  venue as a suffix — `" @ " + texts.venue` (the launchpad ORIGIN
  name when known, honoring the `launchpadName` DisplayMap override,
  else the DEX display), escaped once, `""` when no venue.
  `{{chainName}}{{venueSuffixShort}}` renders `Solana @ Pump` where
  `{{chainName}}{{venueSuffix}}` renders `Solana @ Pump via
PumpSwap`; without the override it renders the escaped detector
  name (`Solana @ pump\.fun`). Purely display: no snapshot field, no
  pipeline change, no new HTTP; `venueSuffix` stays byte-identical
  (regression-pinned). Registry now 22 base + 23 derived = 45 keys
  for `ca|x|z|bare` / 46 for `c|cc`; catalog META
  `{type:'derived', nullable:true, example:' @ Pump'}`. Specs: +6 in
  `template-renderer-venue-suffix.spec.ts` plus registry/age count
  pins (73 suites / 793 tests).

- **Money sub-1000 whole integer + price 8 fixed decimals (dexter plan
  todos 65/66; re-pin 2026-10-18 with SPEED BSC evidence):**
  `formatMoneyText` keeps K/M/B at 1 decimal (todo 64 intact:
  `55.7K`/`1.5B`/`11K`/`999.9K` and the no-carry edge `1000K`) while
  the sub-1000 branch now rounds to the nearest WHOLE integer
  (`983.78` → `984`, `94.31` → `94`, `752.1` → `752`, `10.85` → `11`,
  `146.285` → `146`, `0.94` → `1`, `749`) — SPEED: Rick renders all
  four sub-1000 money samples whole (`752`/`146`/`11`/`749`) and
  `10.85`→`11` discards truncation (nearest, not floor). Guard: a
  sub-1000 whole rounding up to a bare unit-less `1000`
  (`999.5`–`999.99…`) carries to `1K`, never `1000` — mirror of the
  ≥1000 no-carry edge. `formatPriceText` `<1` now renders fixed 8
  decimals half-up with trailing zeros stripped (`0.00002434` — was
  `0.0000243`; `0.00004128` — was `0.0000413`; `0.002345`; `0.5`)
  per SPEED (DS raw `0.0000007521` → Rick `0.00000075`, which
  discriminates the old 3-sig-figs rule); ultra-dust below 1e-8 falls
  back to the legacy 3-sig-figs rule, never `0` (`1.23e-9` →
  `0.00000000123`); `>=1` grouped max-2 intact. Specs re-pinned in
  `scan-card.spec.ts` and `template-renderer.service.spec.ts` (+20
  pinned cases; suite 690→710). Evidence:
  `.omo/evidence/task-fe-format2.log`.

- **Money compact at 1 decimal (dexter plan todo 64; owner re-pin
  2026-10-17 post research 58, supersedes the up-to-2-dec rule):**
  `formatMoneyText` applies `trimFixed(x, 1)` on all four branches
  (B/M/K/sub-1000) — every money key (`marketCapUsd`, `fdvUsd`,
  `liquidityUsd`, `volume24hUsd`, `fdvAth`) and the own scan-card
  (`formatMoneyV2`) now renders `55.7K`/`1.5B`/`983.8`; trailing-zero
  strip, no `$`, `N/A` on null and sign preserved intact. Old verbatim
  values re-pinned (`1.46B` → `1.5B`, `30.22K` → `30.2K`, `983.78` →
  `983.8`, `94.31` → `94.3`); new pins `55.7K`, `11K` (`.0` strip),
  `999.9K` and the documented no-carry edge `1000K` (`999.96` carries
  the mantissa only, never rolls to `1M`; same as the old 2-dec rule,
  unobserved in Rick). `priceUsd`/percent/counts/`devPctSupply`
  untouched. Specs re-pinned in `scan-card.spec.ts`,
  `template-renderer.service.spec.ts` and
  `template-renderer-fdv-ath.spec.ts`.

### Added

- **🍯 honeypot row + `venueSuffix` + code-span cleanup (dexter plan
  todo 71; owner decisions 2026-10-19):** 2 new derived keys on each
  command → 22 base + 22 derived (44 for `ca|x|z|bare`, 45 for
  `c|cc`; catalog counts re-pinned). `honeypotLine` = `"\n🍯 " + core`
  suffix mechanics (`""` = full silence — no line) over the
  validated `ResolvedToken.honeypot` (`{buy, sell, sim}`, % 0-100):
  `sim='fail'` ALWAYS renders a row (`SIM: FAIL` minimum, sides or
  `?`), `'ok'` prefixes `SIM: OK ⋅`, `null` (Fase 1 external source)
  renders `T:` only and never claims a simulation; silence only on
  exact 0/0 or both-absent without fail; display integer or ≤2-dec
  trim (`<0.001` below), never a bare `0` for a measured >0. Client
  guard `toHoneypotOrNull` (finite 0-100 + exact sim enum, violation
  → null) + pipeline re-validation. `venueSuffix` = `" @ X"`/`""`
  (mirror of `venueLine`) kills the empty-line hole of a standalone
  ` @ {{venueLine}}`. `cleanupDanglingSeparators` gains 7 rules
  (`[`]``bracket trio, orphan empty code-span trio, line-end
dangling`⇨`; anti-link lookarounds) — populated spans, brackets
and links stay byte-intact. Seeds NOT touched (v14 wiring
owner-gated — snippet proposed, not applied). Data leg:
market-data `honeypot`field, GoPlus Fase 1 (its own CHANGELOG).
Specs:`template-renderer-honeypot.spec.ts`(full matrix) +`template-renderer-venue-suffix.spec.ts`+`market-data-client-honeypot.spec.ts`+`token-scan-honeypot.spec.ts`
  - cleanup matrix + count pins. Evidence:
    `.omo/evidence/task-fe-honeypot-research/dexter-lane.log` +
    `dexter-lane-snippets.md`.

- **Empty-bracket cleanup for omitted derived values (dexter plan todo
  69):** `TemplateRendererService.cleanupDanglingSeparators` now also
  collapses EMPTY bracket pairs left by author-composed bodies
  (`[{{liquidityRatio}}]`, `[{{alternatives}}]`, `[{{chainDisplay}}]`)
  when the derived value renders `""` — never a literal `[]` on the
  card. Three ordered rules: trailing (`Liq: 7.9K []` → `Liq: 7.9K`;
  bare `[]` → gone), leading (`[] SOL` → `SOL`), mid-line
  (`A [] B` → `A B`). Every rule guards `(?!\()` so a text-less LINK
  (`[](...)`, e.g. the documented `[{{name}}]({{botStartUrl}})`
  bodies) is never touched; brackets with content (`[x3]`,
  `[Virtuals](url)`) and escapeV2-escaped values (`\[\]` — backslash
  between the raw brackets) never match. Specs re-pinned
  (`template-renderer-alternatives.spec.ts`,
  `template-renderer.service.spec.ts`) + new cleanup matrix;
  `template-renderer-liquidity-ratio.spec.ts` gains the bracketless
  PERPS case (749/1800 → `💦 Liq: 1.8K`). Evidence:
  `.omo/evidence/task-fe-cleanup-brackets-*.log`.

- **Pair-age derived placeholder `{{age}}` (dexter plan todo 63):**
  `{{age}}` on every command renders the best-liquidity PAIR age
  from the market-data snapshot's top-level ISO `pairCreatedAt`
  (raw ms converted ONCE at market-data `buildSnapshot`; dexter
  validates via the new `toPairCreatedAtOrNull` client guard →
  `ResolvedToken.pairCreatedAt?` via the `toResolvedToken` mapping).
  Formatting reuses the shared
  `MessageFormatterAdapter.formatCompactAgeText` — never forked:
  floored d/w/mo/y rungs, future timestamps clamp to `0m`;
  absent/empty/unparseable render `""` (cold-start honesty, never a
  guessed age). PAIR PROXY, never token deploy age (a migration
  under-reports — caveat documented both sides). Registry 19→20
  derived keys (42 keys for `ca|x|z|bare`, 43 for `c|cc`); catalog
  META `{type:'derived', nullable:true, example:'3d'}`. Zero new
  HTTP calls (the field rides the existing snapshot response).
  Specs: `template-renderer-age.spec.ts` (WENCAT probe sample `4d`,
  2d/5h/12m rungs, future `0m`, malformed matrix, whitelist + META +
  `placeholdersUsed` + catalog counts),
  `market-data-client-pair-created-at.spec.ts` (boundary guard +
  fetch mapping), `token-scan-venue.spec.ts` passthrough cases,
  registry counts. Evidence: `.omo/evidence/task-fe-age.log`.

- **Liquidity-ratio derived placeholder (dexter plan todo 62):**
  `{{liquidityRatio}}` on every command renders the Rick-parity
  `xN` multiplier (`N = Math.round(fdvUsd / liquidityUsd)` over
  the SERVED values, incl. the todo-61 `dexscreener` fallback
  provenance; brackets are self-composed by the template author —
  `[{{liquidityRatio}}]` → `[x3]`). Pure renderer computation — no
  snapshot/market-data field, zero external calls. Escaped once like
  any value; empty when either side is absent/non-finite/≤0 or
  `N < 1` (never `N/A`, never `x0`). Registry 18→19 derived keys
  (41 keys for `ca|x|z|bare`, 42 for `c|cc`); catalog META entry +
  focal spec (`template-renderer-liquidity-ratio.spec.ts`:
  Chale 23300/7900 → `[x3]`, WENCAT-Rick 19100/6700 → `[x3]`,
  round/half-up + 0.5 boundary, omission + invalid-input matrix,
  catalog membership).

- **Price adaptive 3-sig-fig cap (dexter plan todo 45):**
  `formatPriceText` sub-`1` prices cap at 3 significant figures,
  half-up, trailing zeros stripped (`0.000002417035478` →
  `0.00000242`; `0.5`/`3,457` intact; zero/negative/NaN pass
  through). Single choke point — preview/cards/token all ride it.
- **Flap catalog mirror (dexter plan todo 44 Phase B):**
  `LAUNCHPAD_CATALOG.flap` (id `flap`, name `Flap`, chain-scoped
  `https://flap.sh/<chain>/<address>` with the same `bsc`→`bnb`
  alias as the detector) + `KNOWN_LAUNCHPAD_IDS` 22→23 with a
  detector↔override parity spec (row fields + robinhood/bsc URLs +
  `launchpadOverrideInfo`). DisplayMap `{launchpad,flap,🦋}`
  verified present via `GET /api/dexter/display-maps` (verify-only,
  no create — row predates this task). Detector + receipt table live
  in market-data (see its CHANGELOG entry); no dexter logic touched
  beyond the catalog mirror.

- **Tail-degraded pin-through (dexter plan todo 41b):**
  `MarketDataSnapshot.degraded?` (client-validated via
  `toDegradedOrFalse`, strict `true` only) → `ResolvedToken.
degraded?` (pipeline always sets, explicit `false` on full cards).
  Preview `token` echo + `GET /dexter/token` spread carry it with no
  extra code; stale + degraded are independent bits. Frontend badges
  it `Partial data`.

- **Identity provenance with disclosure marker (dexter plan todo 39):**
  `MarketDataSnapshot.identityProvenance?` (client-validated, exact
  `'market'`/`'metadata'` else null) → `ResolvedToken.
identityProvenance?` (pipeline always sets, `'market'` default for
  legacy silent answers). Renderer suffixes metadata-sourced
  `{{name}}` with ` (unverified)` (escaped once; empty stays `N/A`,
  `{{symbol}}` untouched). Preview, bot and frontend inherit the
  marked text with no extra code.

- **Display-only launchpad name override (display-name lane):**
  DisplayMap dimension `launchpadName` with the centralized renderer
  helper `resolveLaunchpadDisplayName(launchpad, resolver)` (override
  wins, detector `name` fallback, whitespace/empty override falls
  back, never blank). Consumed by `launchpadText`,
  `launchpadTextLink` text, `launchpadIconLink` fallback text, `venue`
  - `venueLine` origin branch. Detector output, DB rows and
    `launchpad.id` never change. Example row (operator-created via
    UI/API, never auto-seeded): `{placeholderKey:'launchpadName',
matchValue:'pump-fun', display:'Pump'}`.

- **Manual mint→launchpad override table (dexter plan todo 37):**
  curated `dexter_launchpad_overrides` (`mint` unique,
  `launchpad_id`, nullable `note`, `created_at`; new migration) with
  admin CRUD (`POST`/`GET /api/dexter/launchpad-overrides`,
  `GET /:id`, `DELETE /:id` — no update, delete+recreate suffices).
  The scan pipeline consults the row first: a hit reports the
  curated slug with maximum precedence over the detector (even over
  a positive detection) + an `override` audit log per hit; delete
  restores detector behavior. `launchpad_id` must be one of the 22
  known detector slugs (unknown → 400), mint normalizes EVM to
  lowercase / Solana exact (malformed → 400).

- **Deploy automation files (dexter plan todo 2, Wave 2 — DRY-RUN):**
  `docker-compose.prod.yml` (postgres `:5448`, redis `:6395`, HTTP `:4062`,
  DB `onchain_bot_dexter`, explicit `name:`, mirror of the staging canon),
  `.github/workflows/deploy-dexter-staging.yml` (push `dev`, GHCR `:sha` +
  `:staging-latest` amd64-only, backup + probe + builder-target migration
  one-off + `:4061` healthcheck + manual rollback lane) and
  `deploy-dexter-prod.yml` (push `master`, `:sha` + `:latest`, `:4062`
  healthcheck, automatic rollback lane mirroring `deploy.yml`) plus
  `docs/deploy-secrets.md` (var NAMES only). Nothing applied to Oracle;
  Wave 3/4 rollouts remain owner-gated.

- **Serve-stale pin-through, no background refresh (dexter plan
  todo 19b1):** the client maps market-data's `stale`/`staleAsOf`/
  `staleAgeMs` with boundary validators (`toStaleOrFalse` strict
  `true`, ISO-gated as-of, finite non-negative age; absent fields →
  fresh-shaped `false`/`null`/`null`, backward compatible) and the
  pipeline sets the trio on every `ResolvedToken` (explicit `false`
  on fresh). Stale replays resolve with the bit (identity intact);
  preview passes the token through untouched (address + echo
  paths) and `GET /dexter/token` spreads it onto the card, so the
  frontend badges stale replays instead of rendering dead prices as
  live. No refresh infra of any kind — the next request retries
  providers naturally. Specs: client mapping + garbage rejection,
  pipeline pin-through (stale + fresh), preview token bit,
  controller spread.

- **Pending-vs-not-found split + 10s market-data timeout (dexter
  plan todo 19a, robust-nulls S):** the pipeline reads
  `MarketDataSnapshot.status` (already end-to-end, no replumbing)
  at the `hasIdentity` sites and gains the `pending` outcome
  variant — pending shells answer `pending`, client nulls and
  ready-without-identity stay frozen `not-found`. Pinned wire
  contract over HTTP 200 (never 429/202 bare):
  `{ error: 'Token pending — retry shortly', address, pending: true }`
  on `GET /dexter/token` and preview (1:1, `PreviewUnresolvedShape.
pending?`); `resolve()` still returns null for pending (bot
  generic message stands, accepted). Frontend renders the pending
  copy (`Token data pending for … — retry shortly`, never `Token
not found`). `MARKET_DATA_TIMEOUT_MS` default 2000→10000 (cold
  fan-out ~2s, Telegram tolerates ~60s; `.env.*templates` updated).

- **Pair-side identity regression spec (dexter plan todo 20 —
  spec only, zero logic changes):** new
  `token-scan-pair-side.spec.ts` pins the dexter end of the
  market-data side-verification contract — a snapshot carrying the
  quote-side identity (USDC mint in a PUMP/USDC pool) resolves with
  `symbol == 'USDC'` / `!= 'PUMP'`, `name == 'USD Coin'`
  (explicit + bare paths), and base-side identity still passes
  through (PUMP stays PUMP). Identity asserts only, never address
  equality (tautological). The fix itself lives in market-data
  (summary `quoteToken` + fetcher side check); dexter copies the
  already-correct identity.

- \*\*Best-candidate auto-resolve with disclosure + `w/mo/y` ages
  (plan todo 17 — deliberate reversal of never-first-hit): the
  bare-address sweep now picks the highest-liquidity candidate
  (tiebreak: higher FDV, then first-seen — deterministic, raw-number
  comparison) and returns `alternatives: {chain,address,
liquidityUsd?}[]` on every multi-chain `ResolvedToken` (picked
  chain excluded, same order rule); `ambiguous` survives only for
  the zero-candidate path (message + hint byte-identical),
  `invalid`/`not-found` untouched. Accepted risk (scam copy with
  liquidity could win) mitigated by the always-attached disclosure.
  New derived key `{{alternatives}}` on every command (`Also on:
bsc, eth`, `""` when ≤1 chain). `formatCompactAgeText` extended
  to weeks/months/years (`<7d→Xd`, `<30d→Xw`, `<365d→Xmo`,
  else `Xy`; d/h/m rungs unchanged).

- \*\*FDV ATH from own snapshot history `{{fdvAth}}` + `{{fdvAthAgo}}`
  (plan todo 16): market-data adds a read-only `findFdvAth`
  aggregate over `snapshot-history` (max FDV + setting timestamp
  per chain+address, malformed rows skipped, history/retention
  untouched) wired into the snapshot path as `snapshot.fdvAth?`
  (strictly historical — read before the current row persists) and
  the compat edge as flat `fdvAthUsd`/`fdvAthAt`; dexter maps both
  shape-checked (client + pipeline double validation, mirroring
  `launchpad`/`venue`) onto `ResolvedToken`. Renderer: `fdvAth`
  money-compact no-`$` (todo-13 policy) + `fdvAthAgo` compact age
  (`9d/3d/5h/12m`, future clamps to now); cold-start (either null)
  renders BOTH empty — the current FDV is never substituted.
  Retention limit: janitor 90d window (ATH over surviving rows,
  not all time).

- \*\*Origin-aware venue line `{{chainName}}` + `{{venue}}` +
  `{{venueTech}}` + `{{venueLine}}` (plan todo 14): market-data
  exposes `snapshot.venue? {dexId, labels}` (live from the
  dexscreener best pair — `dexId` was already returned, `labels`
  added — resolved per call, never persisted, coexists with
  `launchpad`); dexter maps it shape-checked (`toVenueOrNull`) and
  passes it to `ResolvedToken.venue?` (re-validated at the pipeline
  boundary). Renderer: `chainName` from a code table (unlisted →
  `""`), `venue` prefers the launchpad name (no DEX hybrids),
  `venueTech` always `DexDisplay + labels` (uppercased, table +
  capitalize-first default), `venueLine` closed 4-branch (`<Origin>
via <Tech>` / origin / tech / `""`). Dangling-`@` cleanup joins the
  `•`/`|` family (`Solana @ ` → `""`, ` @ X` → `X`). Deliberate
  Conway deviation: origin-known renders the origin (`Bankr`) where
  Rick shows the tech (`Clanker V4`). `dexId` (`meteoradbc`) never
  feeds `launchpad.id` (`meteora-dbc`) — separate tables, spec-pinned.

- \*\*Bot deep-link `{{botStartUrl}}` + `/start <payload>`
  (plan todo 11, hybrid white-label design): new generic `BOT_USERNAME`
  env (no prefix, one value per env, `^[A-Za-z0-9_]{5,}$`, empty
  allowed — empty in all three templates, never a real username in
  git); new `BotIdentityService` (`settings/`, bootstrap-once
  gateway-inventory → Bot API `getMe` (5 s, token never logged) →
  env → `""`, warn-on-mismatch, fail-open); derived renderer key on
  every command (`https://t.me/<username>?start=<address>`, `""`
  without username or with a non-`[A-Za-z0-9_-]`/>64-char payload);
  `/start <payload>` answers the full card via the shared
  `sendFullScan` (ACTIVE `ca` template), bare/invalid `/start`
  byte-identical legacy. No Mini App, no auto-trading, no new
  callbacks.

- **Bot identity via bound-vault profile (plan todo 12):** `BotIdentityService` resolves the primary source from
  `GET /api/bots/:id/profile` (`username`) against the bound vault
  (existing local `'dexter'` mapping + `DEXTER_BOT_VAULT_ID`
  fallback, same order as the sender; unmapped → zero network) —
  order is now profile → Bot API `getMe` (5 s, token never logged)
  → `BOT_USERNAME` env → `""`, warn-not-throw fail-open throughout.
  The todo-11 inventory probe is deleted (rows carry no `username`
  by design). No gateway changes (existing `send`-scope endpoint);
  avatar ignored. `BOT_USERNAME` behavior unchanged (still 3rd).

- **Rick-parity number policy (plan todo 13):** formatters emit NO
  `$` (money → compact K/M/B trimmed `23.3K`/`7.9K`/`1.46B`;
  `priceUsd` → adaptive `<1` full digits `0.00002434` / `>=1`
  grouped max-2 `3,457`, fixing the live `$0.00`-for-dust bug via a
  renderer `priceUsd` special-case); percent → trimmed,
  sign-only-when-negative (`80%`, `-34.4%`, `-0` → `0%`); counts
  unchanged; `N/A` on null. `$` is literal body text where a style
  wants it (Proficy `$27.3K`, KOLscope `$30.22K` via `${{…}}`;
  Rick-style seeds carry none — zero seed-body edits, existing DB
  rows untouched). Catalog `PLACEHOLDER_META` examples updated to
  the new outputs.

- \*\*Origin-launchpad plumbing + Wave-1 seeds (dexter-launchpad Lane S,
  `feat:`): `MarketDataSnapshot` gains optional `launchpad?
{id,name,url}` (`market-data.client.ts`, shape-checked at the dexter
  boundary via `toLaunchpadOrNull` — all three strings non-empty else
  `null`, opaque JSON never reaches the renderer);
  `TokenScanPipeline.toResolvedToken` passes it through to
  `ResolvedToken.launchpad` (re-validated, JUP/HUMA team launches stay
  `null`). DisplayMap seed catalog: 22 Wave-1 rows
  (`launchpad/<id>/<emoji>`, §8 ratified set incl. swaps 👾/🪙/📥 —
  no Bags row, no backlog gofundmeme/grafun/flap/daos rows) via the
  existing `POST /api/dexter/display-maps` API only (operator-managed,
  no hardcoded seeds; exact curl loop in
  `.omo/notepads/dexter-launchpad-build.md`). Failing-first:
  `market-data-client-launchpad.spec.ts` (CHALE verbatim + absent +
  7 malformed → null) + `token-scan-launchpad.spec.ts` (CHALE
  passthrough + JUP/HUMA null + malformed → null) + 2 mocked e2e in
  `e2e/dexter-templates.spec.ts` (IconLink renders `[💊]
(https://pump.fun/coin/…)`, null → empty, card intact).
  (feat/mega-refactor-tramos)

### Changed

- Gateway staging cutover (STAGING ONLY 2026-09-29, no prod touch): `.env.staging.template` fixes `BOTS_GATEWAY_URL` to the staging gateway `:4071` (was `:4070`, unreachable — the gateway staging container listens on `4071`); `DEXTER_SEND_MODE=gateway` already pinned. Plain-text lookups cut over; keyboard sends (`reply_markup`), `editMessageText` and `answerCallbackQuery` have no gateway equivalent and stay direct-only (markup dropped client-side, recorded as skipped). Rollback: `DEXTER_SEND_MODE=dual`.

### Added

- **Message templates v1 (todos 1-13, `feat:`):** every command card
  (`ca`/`x`/`z`/`c`/`cc`/bare) renders from a DB-backed template
  (MarkdownV2, `{{double-brace}}` syntax, `{%` rejected; 22 base + 6
  derived placeholder keys + `timeframe`) with exactly 1 active
  template per command (partial unique index + in-memory guard; closed
  v1 command enum). Keyboards abandoned on `c`/`cc` — chart-link-only
  text cards (no `reply_markup` until gateway todo 7). Management via
  HTTP API only (`POST /api/dexter/templates`, template-preview,
  `/api/dexter/display-maps` CRUD, placeholders catalog — no
  Telegram-side template editing in v1). Seed: 7 templates / 6
  commands (`DEXTER_SEED_TEMPLATES`, vacuum-fill activation, per-seed
  fault isolation). DisplayMap rename: `EmojiMap` → `DisplayMap`
  (`{{chainDisplay}}`, `DISPLAY_RESOLVER`, route
  `/api/dexter/display-maps`, pure-rename migration). Transport
  rename: `src/telegram/` → `src/gateway/` (zero behavior). `GET
/dexter/token` exposes `templateUsed: { command, name, version } |
null` (error shapes unchanged). Verified: 40 suites / 288 tests
  green, `tsc --noEmit` clean, double boot
  (`DATABASE_ENABLED=false` in-memory + `true` TypeORM).
  `src/templates/` = Dexter bot message templates, NOT the future
  frontend-feed `templates` rename. (feat/mega-refactor-tramos)

- **Exclusive gateway bot + bind-from-inventory API:** dexter binds its
  bot FROM the gateway inventory (never by pasting a token here):
  `GET /api/dexter-bots/inventory` (vault bots + availability),
  `POST /api/dexter-bots/bind` (link-as-target → locks one vault bot
  to `dexter-onchain-bot`, 409 when another app holds it, records the
  local `dexter` → vault mapping), `POST /api/dexter-bots/unbind`
  (release; edit = unlink + relink). Creation stays on
  `POST /api/dexter-bots/migrate-to-gateway` (env token → vault).
  Failing-first: `dexter-bot-binding.service.spec.ts` (bind records
  mapping + inventory lists availability). (feat/mega-refactor-tramos)

- **Own scan-card template (`formatScanCard`, MarkdownV2):** built from
  `docs/examples-for-dexter/rick-bot-scanner.md` (card anatomy) under
  the `format-comparison.md` decision (entities-parse, MarkdownV2-send):
  header (`🔍 $SYMBOL | name — chain` + contract code line) +
  price/MC/liq + supplies (FDV + total/circulating/max) + holders/dev
  - links (DexScreener + GeckoTerminal) + trade-buttons hint (buttons
    travel as the inline keyboard; links keep the card actionable when
    the keyboard shape stays gateway-unsupported). All user strings
    MarkdownV2-escaped, 4096-char cap. `/x` + `/ca` (+ bare fallback)
    send it via `sendFullScan`. Failing-first: `scan-card.spec.ts`
    (real PERPS-like fixture renders every section, MarkdownV2,
    length-capped). (feat/mega-refactor-tramos)

### Changed

- **Gateway-only sends (direct leg retired):** `resolveDexterSendMode`
  always resolves `gateway` (stale `direct`/`dual` env values fall
  through instead of touching the Bot API); `TelegramBotClient`
  `.sendMessage` routes unconditionally to the inventory-bound vault
  bot (token never resolved client-side); keyboard shapes
  (`reply_markup`) degrade to text-only (gateway `SendDto` carries no
  `reply_markup` — links row keeps cards actionable; native keyboards
  return with gateway todo 7). Market-data HTTP remains the ONLY
  market-data source (unchanged). Specs updated: `send-mode.spec.ts`
  (always-gateway), `bot-client-dual-send.spec.ts` (gateway-only
  matrix), `gateway-send-client.service.spec.ts` (keyboard → text-only),
  `start-ca.spec.ts` (own-template mocks).

- **Dev holdings on the lookup card (`devWallets[]` + `devPctSupply`):**
  `MarketDataClient` maps them null-safe from the snapshot,
  `TokenScanPipeline.toResolvedToken` passes them through, `ResolvedToken`
  carries them, and the full Telegram card renders a `Dev:` line (pct +
  top-3 short wallets, `(probable)` flag; `Dev: N/A (no key or no data)`
  when absent — never a partial card). Failing-first:
  `token-scan-dev.spec.ts` (passthrough + card values + adversarial
  nulls). (feat/mega-refactor-tramos)

- **Supply fields on the lookup card (`totalSupply`,
  `circulatingSupply`, `maxSupply`, all-nullable):** `MarketDataClient`
  maps them from the market-data snapshot (null-safe `?? null`),
  `TokenScanPipeline.toResolvedToken` passes them through, `ResolvedToken`
  carries them, and the full Telegram card renders FDV + Total /
  Circulating / Max supply lines (`N/A` when the provider has none —
  never a partial card, never a crash). `GET /dexter/token` returns them
  via the pipeline token spread. Failing-first:
  `token-scan-supply.spec.ts` (passthrough + adversarial nulls + card
  lines). (feat/mega-refactor-tramos)

- **Bare-address lookup (no chain qualifier):** `GET
/dexter/token?address=` and every bot scan path accept a lone
  contract. `TokenScanPipeline.resolveDetailed` validates format (garbage
  → `invalid`, no network calls), reuses market-data chain-detect (`GET
/api/v1/chains/detect` via `MarketDataClient.detectChain`, down →
  solana-first sweep fallback), then sweeps the format-narrowed chains
  (solana → `[solana]`, EVM → `[ethereum, base, bsc, arbitrum,
polygon]`, detect winner ordered first) collecting identity hits:
  exactly one → resolved, two or more → `ambiguous` with `candidates`
  (explicit `chain:address` retry, never a first-hit silent guess), zero
  → `not-found`. `resolve()` keeps its contract (non-resolved → null,
  so Telegram handlers keep their explicit cannot-resolve message). The
  controller surfaces `{ error: 'Ambiguous address …', candidates }` and
  `{ error: 'Invalid address: …' }` alongside the unchanged `Token not
found` / `Address required` shapes. `MarketDataClient.resolveAny`
  removed (first-hit silent-guess path, zero callers).
- **Tests (failing-first, +3 suites / +14 tests, 19/69 green):**
  pipeline bare solana + bare EVM + detect-down sweep fallback +
  multi-chain ambiguous + garbage invalid + explicit-chain intact;
  client detect hit + non-ok → null + throw → null (never throws);
  controller resolved/ambiguous/invalid/not-found/missing explicit
  shapes.

### Fixed

- **Staging backport 2026-09-27:** default bind `DEXTER_HOST` changed
  `127.0.0.1` → `0.0.0.0` (loopback-in-container is unreachable via the
  published-port mapping; droplet staging already ran with `0.0.0.0`).
  Dev may still set `127.0.0.1` explicitly for loopback-only.

### Added

- **Lookup via telegram-bots-gateway (todo 6, dual-send, no cutover):**
  `DEXTER_SEND_MODE` (`direct` deprecated | `dual` default | `gateway`
  fail-closed) routing INSIDE `TelegramBotClient.sendMessage`, so all 9
  handlers + the router call it unchanged (lookup/scan/commands
  untouched otherwise). New `src/telegram/` code: vault-id-only port
  (`domain/ports/bots-gateway-sender.port.ts`, token never crosses) +
  `infrastructure/gateway/` (HMAC signer, vault-id mapping, 4096-chunk
  send client over `fetch`, send-mode helper) + `DualSendParityService`
  (outcome-only ledger, keyboard/edit/callback shapes recorded as
  `skipped`, `assertNoDivergence()` 409 cutover gate — Nest
  `ConflictException`, this app owns no `src/shared/kernel/`) +
  `MigrateBotsToGatewayUseCase` with `POST
/api/dexter-bots/migrate-to-gateway` (env token → vault, labels/ids
  only) + `POST /dexter/ingress` (gateway router fan-out target,
  `x-gateway-bot` + timing-safe secret, unsigned dev-only, errors
  acked). Gateway leg resolves the token server-side from the vault id
  (`DEXTER_BOT_VAULT_ID` or the migration mapping); direct client is
  `@deprecated` (dual-leg only). Staging/prod templates pin
  `DEXTER_SEND_MODE=gateway`.
- **Tests (failing-first, +10 suites / +35 tests, 16/55 green):**
  signer, mapping, send-client, send-mode, parity, migrate use-case,
  migration controller, ingress controller, bot-client dual routing
  (dual/direct/gateway, vault resolution, keyboard skip, divergence
  gate), secret-scan (vault-ids-only, no `console.*`, no direct token
  reads).
- **Verified:** `jest` 55/55 green, `tsc --noEmit` clean, `nest build`
  ok, gateway regression 15/66 green (zero gateway source edits), live
  dual `/start` (direct 401 vs gateway 777 — environmental divergence,
  gate closed) + live keyboard `/tb` skip + live gateway-mode `/help`
  777 (token never resolved) + 0 token leaks. Mode stays `dual`.
  Evidence `.omo/evidence/task-6-telegram-bots-gateway.log`.
- **Known cutover blockers (gateway todo 7):** keyboard sends
  (`reply_markup`), `editMessageText`, `answerCallbackQuery` need
  gateway support (or stay dual); vault mapping is in-memory.

### Changed

- **Dexter flat layout (follow-up of todo 13, no behavior change):**
  `src/dexter/` level removed — `commands/`, `scan/`, `settings/` lifted
  to `src/` top level via `git mv`, `telegram-io/` renamed to
  `src/telegram/` (no `-io` suffix), `dexter.module.ts` moved to
  `src/dexter.module.ts` (single composition root, still no nested Nest
  modules — commands ⇄ telegram would `forwardRef`-cycle). All imports
  re-pointed, `dexter/*` path alias + jest mapper entry dropped (unused),
  AGENTS.md paths updated. Suite counts unchanged (6 suites / 20 tests).
- **Hexagonal split by sub-BCs (Tramo 3, todo 13, follow-up of
  todo 9, P13):** flat `src/dexter/` (todo 9 lift-and-shift) split into
  four hexagonal sub-BCs with zero behavior change — `commands/`
  (router + handlers: slash dispatch, bare-address fallback, context
  resolver, per-user rate limiter), `scan/` (pipeline + address
  detector + forward extractor + market-data client + formatter),
  `telegram/` (poller, webhook + lookup controllers, Bot API client,
  trade-button registry, keyboard builder), `settings/` (chat-settings
  domain + service, bot config, in-memory repositories). Each sub-BC
  owns `domain/` ports, `application/` use-cases/services, and
  `infrastructure/` adapters (`telegram` also owns `api/` HTTP).
  Two new domain ports: `scan/domain/ports/scan-pipeline.port.ts`
  (`ScanPipeline` + `ResolvedToken` + `ChainIdentifier`, decoupled from
  the telegram `ChainId`) and
  `telegram/domain/ports/telegram.port.ts` (Bot API shapes,
  re-exported by the client). `src/` root keeps only
  `dexter.module.ts` (single composition root — nested Nest modules
  would `forwardRef`-cycle commands against telegram). Every spec
  moved with its source; suite counts unchanged (6 suites / 20 tests).
- **Verified:** `jest` 20/20 green (±0), `tsc --noEmit` clean,
  `nest build` ok, boot on `:4060` with empty route diff (4 routes:
  `GET /api/health`, `GET /dexter/token`, `POST /dexter/webhook`,
  `POST /dexter/health`) and identical spot curls (`/api/health` ok,
  `/dexter/health` polling, `/dexter/token` explicit errors,
  webhook `{ ok: true }`, unknown route 404).

### Added

- **Dexter onchain lookup bot extraction (Tramo 3, todo 9, P13):** new
  `apps/dexter-onchain-bot/` (`@onchain-bot/dexter-onchain-bot` v0.1.0)
  answering on-chain token scans over Bot API, fed exclusively by
  market-data HTTP (todo 5 bridge, default-true).
- **Setup:** `package.json` (NestJS 11, `@nestjs/axios` for the Bot API
  client), `nest-cli.json`, `tsconfig.json` / `tsconfig.build.json`
  (`shared/*`, `src/*` paths), `src/main.ts` (`DEXTER_PORT`,
  default dev `:4060`, loopback bind, global `ValidationPipe`),
  `AppModule` (Config + Health + Dexter), `GET /api/health`,
  `.env.example` + `.env.staging.template` + `.env.production.template`,
  `Dockerfile` (`CMD apps/dexter-onchain-bot/dist/main.js`, healthcheck
  on `/api/health`), dev + staging compose (explicit project names,
  `onchain_bot_dexter[_staging]` DBs, ports verified free: app
  4060/4061/4062, postgres 5440/5441, redis 6387/6388).
- **Moved from backend `chain-dexter-bot` (read-only source, untouched):**
  `CommandRouterService` + commands (`/x /z /c /cc /tb /settings`
  inherited) + `MessageFormatterAdapter` + `TradeButtonRegistry`
  (affiliate tags rebranded `dexter-*`) + `InlineKeyboardBuilder` +
  chat settings (model + in-memory repos + service, TypeORM NOT moved) +
  `ContextResolverService` + `TelegramBotClient` + `UpdatePollerService`
  - webhook controller (`POST /dexter/webhook`, secret + per-user limit).
- **New:** `/start` rewritten (lookup info + usage, no publish words),
  `/ca <contract>` full card, bare-address detection (no slash) +
  forward / free-text extraction (addresses + exchange mentions; kind
  resolved via market-data, never guessed) through `BareAddressHandler`,
  `MarketDataClient` (`GET /api/market-data/snapshot` + `resolveAny`
  chain sweep) backing `TokenScanPipeline.resolve`, per-user sliding
  window rate limit (router on all paths + webhook edge), native
  `GET /dexter/token?address=` lookup for manual QA.
- **Token migration (C-BOTS-01):** `DEXTER_BOT_TOKEN` wins,
  `CHAIN_DEXTER_BOT_TOKEN` honored as deprecated fallback.
- **Tests (failing-first, 6 suites / 20 tests green):** start, ca
  (card + usage + explicit unresolvable), bare, forward-ok,
  forward-empty, settings (`/settings` render, `/tb` on/off), plus
  address-detector, forward-extractor, and per-user rate-limiter units.
- **Verified:** `jest` 20/20 green, `tsc --noEmit` clean, boot on
  `:4060` with `curl` (`/api/health` ok, `/dexter/token` explicit
  error with market-data down, `/dexter/health` polling). No-token
  boot keeps HTTP up with bot ingress inactive (warn + poller skip).

### Constraints honored

- Lookup-only: no channel publishing, no scoring/tracking imports.
- Backend move source read-only; `.kiro/` untouched; no root scripts
  touched (no `dev:dexter` alias — documented in AGENTS.md instead).
