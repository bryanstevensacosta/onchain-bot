# Token Profile Image Loading Optimization

## TL;DR

> **Quick Summary**: Optimize token profile image loading on `/tokens` page. Currently only ~33% of tokens show images because 4 of 6 enrichment providers return empty `imageUrls` arrays, and there's no fallback, no caching, and no central image proxy.
>
> **Deliverables**:
> - All 4 "empty array" providers actually return image URLs (closes the coverage gap)
> - HTTP cache headers + React Query staleTime (5-min to implement, big performance win)
> - Lazy loading + async decoding on `<img>` tags
> - Server-side identicon fallback for tokens with zero provider coverage
> - Self-hosted image proxy with in-memory cache (pluggable for Redis later)
> - WebP transcoding in the proxy
> - Cache invalidation on enrichment update
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1-T4 (provider fixes) → T12 (enrichment fallback) → T17 (frontend proxy wiring) → F1-F4

---

## Context

### Original Request
> "En http://localhost:5173/tokens solo algunos muestran imagen de perfil. ¿Esa imagen la tenemos alojada en la API y hacemos llamadas a la API cada vez que la queremos, o la tenemos en una DB, o la tenemos en cache?"

### Investigation Summary

**Two parallel `explore` agents** mapped the complete frontend and backend code paths. Verbatim findings:

**Frontend** (`apps/frontend`):
- `/tokens` page = `TokensExplorerPage` at `apps/frontend/src/pages/tokens-explorer/index.tsx`
- Row = `DecisionRow` (lines 60-74) renders `<img src={currentImageUrl}>` from `snapshot.data?.imageUrls[currentImageIndex]` (lines 25-32)
- Image URLs come from `useSnapshot` React Query hook at `apps/frontend/src/entities/token-snapshot/model/use-snapshot.ts` — NO explicit `staleTime` configured
- `onError` cycles to next URL in array, falls back to static `/assets/token-placeholder.svg`
- No `loading="lazy"`, no `decoding="async"`, no explicit `width`/`height` on images
- API endpoint: `/token/market-data/snapshots/:chain/:address` defined at `apps/frontend/src/shared/api/endpoints.ts:33-34`

**Backend** (`apps/backend`):
- Controller: `apps/backend/src/chain/explorer/api/http/enrichment.controller.ts:36-42` exposes `GET /token/market-data/snapshots/:chain/:address`
- DB schema: `apps/backend/src/chain/explorer/infrastructure/persistence/typeorm/entities/token-snapshot.entity.ts:101-107` → `image_urls` JSONB column (array of external URLs)
- Enrichment merges providers in `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts` (`mergeMarketData` lines 220-227, `imageUrls: merged.imageUrls` at line 166)

**Provider coverage today** (CRITICAL FINDING):
| Provider | Returns imageUrls? | Chains |
|----------|-------------------|--------|
| DexScreener | ✅ Yes (1 URL) | Most chains |
| Birdeye | ✅ Yes (1 URL) | Solana only |
| CoinGecko | ❌ Empty array | — |
| GeckoTerminal | ❌ Empty array | — |
| Moralis | ❌ Empty array | — |
| Helius | ❌ Empty array | — |

**Other gaps**:
- ❌ No HTTP cache headers on API responses
- ❌ No Redis/Memcached backend cache
- ❌ No S3/R2/GCS/Cloudinary — images served directly from provider CDNs
- ❌ No image proxy in our app — frontend hits `dd.dexscreener.com` / `cdn.birdeye.so` directly
- ❌ No server-side fallback for tokens with zero provider coverage

### Answer to User's Question

The images are **stored as external URLs in PostgreSQL** (`image_urls` JSONB column), but the **actual bytes live on third-party CDNs** (`dd.dexscreener.com`, `cdn.birdeye.so`). The frontend fetches those URLs **directly from the CDN on every render**. There is no caching layer in the app (no Redis, no HTTP cache headers, no proxy).

---

## Work Objectives

### Core Objective
Close the "only some tokens show images" coverage gap and reduce image-load latency by adding caching, lazy loading, and a self-hosted image proxy with format optimization.

### Concrete Deliverables
1. All 6 enrichment providers extract image URLs from their responses when available
2. `GET /token/market-data/snapshots/:chain/:address` returns `Cache-Control: public, max-age=60, stale-while-revalidate=300`
3. `useSnapshot` React Query hook has `staleTime: 60_000` configured
4. `<img>` tags in `DecisionRow` and token-detail page have `loading="lazy"`, `decoding="async"`, and explicit `width`/`height`
5. Server-side identicon generator (`@blockies/react`-equivalent or simple SVG-from-hash) used as fallback when no provider has coverage
6. Self-hosted image proxy endpoint `GET /token/image/:chain/:address` with in-memory LRU cache (5 min TTL) and `Cache-Control: public, max-age=86400, immutable` on success
7. WebP transcoding in the proxy when the client sends `Accept: image/webp`
8. Cache invalidation triggered when enrichment updates the `image_urls` column

### Definition of Done
- [ ] `curl localhost:5173/tokens` shows profile image (not placeholder) for **at least 90%** of tokens in the list (vs ~33% today)
- [ ] `curl -I localhost:3030/token/market-data/snapshots/solana/<address>` returns `Cache-Control` header
- [ ] Browser DevTools Network tab shows `loading="lazy"` images don't fire until near viewport
- [ ] `curl -I localhost:3030/token/image/solana/<address>` returns `200` with `Content-Type: image/webp` when `Accept: image/webp` is sent, with `Cache-Control: public, max-age=86400`
- [ ] Lighthouse performance score on `/tokens` increases by ≥10 points
- [ ] No new TypeScript errors (`tsc --noEmit` passes)
- [ ] All existing backend tests pass (`npm run test:backend`)
- [ ] All existing frontend tests pass (`npm run test:frontend`)

### Must Have
- Backward-compatible API response shape (`imageUrls` field unchanged)
- All 4 currently-broken providers actually contribute image URLs
- Server-side fallback covers tokens with zero provider coverage
- Image proxy returns proper HTTP cache headers

### Must NOT Have (Guardrails)
- ❌ No new dependencies on the frontend unless absolutely required (prefer built-in browser APIs)
- ❌ No image upload UI (out of scope — this is read-side optimization)
- ❌ No admin panel for managing token images
- ❌ No breaking changes to existing API contract
- ❌ No storage in production Redis without explicit feature flag (start with in-memory LRU)
- ❌ No AI-slop: every new helper must have a single clear responsibility, no over-abstraction
- ❌ No comments like "// TODO" or "// FIXME" in committed code

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (this is an active monorepo with apps/frontend and apps/backend)
- **Automated tests**: Tests-after (existing test suite must continue to pass; no new test framework setup)
- **Framework**: Whatever the existing project uses (jest/vitest — verify in T0 baseline task)
- **Agent-Executed QA**: MANDATORY for all tasks regardless of test choice

### QA Policy

Every task MUST include ≥1 happy-path + ≥1 failure/edge-case QA scenario in its body. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend HTTP/API**: `curl` against `localhost:3030` with assertions on status + response headers + JSON fields
- **Frontend rendering**: Playwright MCP — navigate to `/tokens`, screenshot DOM, count `<img>` tags that successfully loaded vs fell back to placeholder
- **Image proxy**: `curl -I` for headers, `curl -o /tmp/img.webp && file /tmp/img.webp` for format verification
- **Cache verification**: Same request twice — second response should come from cache (no upstream network call)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation + Quick Wins — 8 parallel tasks, all independent):
├── T1: Fix CoinGecko provider (apps/backend/src/chain/explorer/infrastructure/providers/coingecko.adapter.ts)
├── T2: Fix GeckoTerminal provider (.../geckoterminal.adapter.ts)
├── T3: Fix Moralis provider (.../moralis.adapter.ts)
├── T4: Fix Helius provider (.../helius.adapter.ts)
├── T5: Add Cache-Control headers to enrichment controller (.../enrichment.controller.ts)
├── T6: Set React Query staleTime on useSnapshot (apps/frontend/src/entities/token-snapshot/model/use-snapshot.ts)
├── T7: Add loading="lazy" + decoding="async" + width/height to images (apps/frontend/src/pages/tokens-explorer/index.tsx + apps/frontend/src/pages/token-detail/index.tsx)
└── T8: Baseline verification — tsc --noEmit, existing tests pass, document current image coverage % (read-only, no code changes)

Wave 2 (Server-side fallback — 3 tasks):
├── T9: Create identicon generator utility (.../shared/identicon/ — new file, no deps on T1-T8)
├── T10: Enrichment use case appends identicon URL when all providers return [] (depends: T9, on file .../enrich-token.use-case.ts)
└── T11: Frontend DecisionRow consumes new field, falls back to identicon when imageUrls[] empty (depends: T10, on file .../tokens-explorer/index.tsx)

Wave 3 (Image proxy — 4 tasks, sequential within wave):
├── T12: Image proxy controller endpoint foundation (route + handler signature only, returns 501) (.../token-image.controller.ts — new file)
├── T13: Image proxy service with in-memory LRU cache (depends: T12) (.../token-image.service.ts — new file)
├── T14: Image proxy fetcher — handles redirects, content-type sniffing, error responses (depends: T13) (.../token-image-fetcher.ts — new file)
└── T15: Wire frontend to use proxy URL via VITE_API_BASE_URL + path rewrite (depends: T14, on file .../shared/api/endpoints.ts + .../pages/tokens-explorer/index.tsx)

Wave 4 (Production hardening — 4 tasks):
├── T16: WebP transcoding in image proxy using sharp library (depends: T14, on file .../token-image.service.ts)
├── T17: Cache invalidation when enrichment updates image_urls (depends: T13, T15, on file .../enrich-token.use-case.ts)
├── T18: Add Redis client behind feature flag (depends: T13, optional infra) (.../shared/cache/redis-cache.adapter.ts — new file, behind TOKEN_IMAGE_REDIS_ENABLED env)
└── T19: Performance benchmark + Lighthouse audit (depends: ALL above, READ-ONLY, runs playwright + lighthouse against /tokens)

Wave FINAL (4 parallel reviews, then user explicit OK):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — Playwright + curl (unspecified-high + playwright skill)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix (full)

| Task | Blocked By | Blocks |
|------|------------|--------|
| T1-T4 (provider fixes) | None | T10 |
| T5 (cache headers) | None | — |
| T6 (staleTime) | None | — |
| T7 (lazy loading) | None | — |
| T8 (baseline) | None | — |
| T9 (identicon utility) | None | T10 |
| T10 (enrichment fallback) | T9 | T11 |
| T11 (frontend fallback) | T10 | T19 |
| T12 (proxy controller) | None | T13 |
| T13 (proxy service) | T12 | T14, T17 |
| T14 (proxy fetcher) | T13 | T15, T16 |
| T15 (frontend wire) | T14 | T17, T19 |
| T16 (WebP transcoding) | T14 | T19 |
| T17 (cache invalidation) | T13, T15 | T19 |
| T18 (Redis feature flag) | T13 | T19 |
| T19 (benchmark) | T11, T15, T16, T17, T18 | F1-F4 |
| F1-F4 | T19 | user explicit OK |

### Agent Dispatch Summary

- **Wave 1**: 8 tasks → mix of `quick` (T5, T6, T8) and `unspecified-high` (T1-T4, T7)
- **Wave 2**: 3 tasks → `deep` (T9, T10), `unspecified-high` (T11)
- **Wave 3**: 4 tasks → `deep` (T12-T14), `unspecified-high` (T15)
- **Wave 4**: 4 tasks → `deep` (T16, T17), `unspecified-high` (T18, T19)
- **Wave FINAL**: 4 reviews in parallel

---

## TODOs

### Wave 1 — Quick Wins (Coverage + Performance)

> **Wave 1 goal**: Close the ~67% coverage gap (4 of 6 providers return `imageUrls: []` despite their APIs returning image URLs in their response bodies), then add the cheap performance wins (cache headers, staleTime, lazy loading). All 8 tasks are fully independent — different files, no shared state.

#### Task 1 — Fix CoinGecko provider to extract image URLs

**What to do**:
- Open `apps/backend/src/chain/explorer/infrastructure/providers/coingecko.adapter.ts`
- Find the line where `imageUrls: []` (or equivalent) is hardcoded (likely near line 99 per investigation findings)
- Inspect the existing `CoinGeckoResponse` / typed response object already destructured in the adapter
- Extract image URL(s) from the response — CoinGecko's `/coins/{id}` returns an `image` object with `thumb`, `small`, `large` fields. Map them in this order of preference: `image.large` → `image.small` → `image.thumb`
- If the response `image` object is missing or all fields empty, return `imageUrls: []` (current fallback) — do NOT fabricate URLs
- Deduplicate the returned array before assigning

**Must NOT do**:
- Don't change the provider's external HTTP call shape
- Don't refactor the adapter's response parsing beyond what's needed to extract images
- Don't add new dependencies

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — requires reading existing API response shape and making a precise mapping
- **Skills**: `[]` — standard code reading + edit
- **Why**: Backend provider adapter change, no special skill needed

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T2, T3, T4, T5, T6, T7, T8)
- **Blocks**: T10 (enrichment fallback — but T10 only depends on T9, not T1-T4; T1-T4 affect the merge result)
- **Blocked By**: None

**References**:
- **Pattern (existing provider that already works)**: `apps/backend/src/chain/explorer/infrastructure/providers/dexscreener.adapter.ts:85-87` — shows the exact `imageUrls: [`...`]` assignment pattern
- **Pattern (Birdeye, simpler)**: `apps/backend/src/chain/explorer/infrastructure/providers/birdeye.adapter.ts:99` — single-URL pattern
- **File to edit**: `apps/backend/src/chain/explorer/infrastructure/providers/coingecko.adapter.ts`
- **External (CoinGecko API docs)**: https://docs.coingecko.com/reference/coins-id — response shape for `image` field (thumb/small/large)
- **WHY**: The pattern references show what shape the assignment must have; the API doc confirms the response field names exist.

**Acceptance Criteria**:
- [ ] File modified: `apps/backend/src/chain/explorer/infrastructure/providers/coingecko.adapter.ts`
- [ ] `grep -n "imageUrls" coingecko.adapter.ts` shows the line is no longer `imageUrls: []`
- [ ] `cd apps/backend && npx tsc --noEmit` → PASS (0 errors)
- [ ] `cd apps/backend && npm test -- --testPathPattern=providers` → PASS

**QA Scenarios**:

```
Scenario: CoinGecko-covered token now returns non-empty imageUrls
  Tool: Bash (curl + jq)
  Preconditions: Backend running on localhost:3030. A known CoinGecko-covered token address exists in the system (e.g., USDC on Ethereum: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" | jq '.imageUrls | length'
    2. If 0, trigger re-enrichment: curl -X POST "http://localhost:3030/token/market-data/enrich/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
    3. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" | jq '.imageUrls'
  Expected Result: array length > 0, containing valid `https://...` URL(s) from CoinGecko's CDN (`assets.coingecko.com`)
  Failure Indicators: empty array, or array containing empty strings, or array containing non-URL strings
  Evidence: .sisyphus/evidence/task-1-coingecko-image-extracted.json

Scenario: Token NOT on CoinGecko still returns empty imageUrls (graceful fallback)
  Tool: Bash (curl + jq)
  Preconditions: Backend running. Use a contract address not listed on CoinGecko.
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0x0000000000000000000000000000000000000001" | jq '.imageUrls'
  Expected Result: `[]` (empty array — adapter correctly returns empty when no image data available, does not throw, does not return malformed URLs)
  Failure Indicators: 500 error, malformed URL strings, or fabricated URLs
  Evidence: .sisyphus/evidence/task-1-coingecko-empty-fallback.json
```

#### Task 2 — Fix GeckoTerminal provider to extract image URLs

**What to do**:
- Open `apps/backend/src/chain/explorer/infrastructure/providers/geckoterminal.adapter.ts`
- Find the line where `imageUrls: []` is hardcoded (likely near line 95 per investigation findings)
- GeckoTerminal's `/networks/{chain}/tokens/{address}` endpoint returns a `token.attributes.image_url` field (string). Extract it.
- Validate the URL starts with `https://` before adding to the array (GeckoTerminal sometimes returns null)
- If the response has no `image_url`, return `imageUrls: []`

**Must NOT do**:
- Don't modify other provider adapters in this task
- Don't change the request URL structure
- Don't add network retries (out of scope)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`
- **Why**: Same as T1 — backend provider adapter change

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T1, T3, T4, T5, T6, T7, T8)
- **Blocks**: None
- **Blocked By**: None

**References**:
- **Pattern (working provider)**: `apps/backend/src/chain/explorer/infrastructure/providers/dexscreener.adapter.ts:85-87`
- **File to edit**: `apps/backend/src/chain/explorer/infrastructure/providers/geckoterminal.adapter.ts`
- **External (GeckoTerminal API docs)**: https://api.geckoterminal.com/api/v2 — search docs for `tokens` endpoint response shape, look for `image_url` field

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "imageUrls" geckoterminal.adapter.ts` confirms non-empty assignment
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test -- --testPathPattern=providers` PASS

**QA Scenarios**:

```
Scenario: GeckoTerminal-covered token returns imageUrls
  Tool: Bash (curl + jq)
  Preconditions: Backend on localhost:3030. Use a token known to exist on GeckoTerminal (e.g., a Uniswap V2 pair token on Ethereum).
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0x<geckoterminal-covered-token>" | jq '.imageUrls'
  Expected Result: array with ≥1 URL starting with `https://`
  Failure Indicators: empty array when token IS on GeckoTerminal, or malformed URL
  Evidence: .sisyphus/evidence/task-2-geckoterminal-image.json

Scenario: Token NOT on GeckoTerminal returns empty array gracefully
  Tool: Bash (curl + jq)
  Preconditions: Address not on GeckoTerminal.
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0x000000000000000000000000000000000000dEaD" | jq '.imageUrls'
  Expected Result: `[]`
  Failure Indicators: 500 error, error response
  Evidence: .sisyphus/evidence/task-2-geckoterminal-empty.json
```

#### Task 3 — Fix Moralis provider to extract image URLs

**What to do**:
- Open `apps/backend/src/chain/explorer/infrastructure/providers/moralis.adapter.ts`
- Find the line where `imageUrls: []` is hardcoded (likely near line 99)
- Moralis's `/token/{address}/metadata` endpoint returns a `logo` field (string URL) plus sometimes `logo_hash`. Extract the `logo` URL.
- If response has no `logo` or it's null, return `imageUrls: []`
- Validate URL starts with `http(s)://` before including

**Must NOT do**:
- Don't change Moralis API key handling
- Don't add new dependencies
- Don't modify other adapters

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T1, T2, T4, T5, T6, T7, T8)
- **Blocks**: None
- **Blocked By**: None

**References**:
- **Pattern (working provider)**: `apps/backend/src/chain/explorer/infrastructure/providers/dexscreener.adapter.ts:85-87`
- **File to edit**: `apps/backend/src/chain/explorer/infrastructure/providers/moralis.adapter.ts`
- **External**: Moralis Token API docs for `/token/{address}/metadata` — look for `logo` field in response

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "imageUrls" moralis.adapter.ts` confirms non-empty assignment where applicable
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test -- --testPathPattern=providers` PASS

**QA Scenarios**:

```
Scenario: Moralis-covered token returns logo URL
  Tool: Bash (curl + jq)
  Preconditions: Use a token known to have Moralis metadata (e.g., USDC).
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" | jq '.imageUrls'
  Expected Result: array contains a URL from `cdn.moralis.io` or `moralis.com`
  Failure Indicators: empty when Moralis should have data, or 500 errors
  Evidence: .sisyphus/evidence/task-3-moralis-image.json

Scenario: Moralis failure (rate limit / network error) doesn't crash the merge
  Tool: Bash (curl)
  Preconditions: Simulate by setting MORALIS_API_KEY env to invalid value temporarily (or use a token Moralis doesn't recognize).
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0x<some-token>" -w "\n%{http_code}\n"
  Expected Result: 200 OK, response JSON contains `imageUrls` array (possibly empty if other providers also lack coverage), no 500 error
  Failure Indicators: 500 status, unhandled exception in response body
  Evidence: .sisyphus/evidence/task-3-moralis-graceful.json
```

#### Task 4 — Fix Helius provider to extract image URLs

**What to do**:
- Open `apps/backend/src/chain/explorer/infrastructure/providers/helius.adapter.ts`
- Find the line where `imageUrls: []` is hardcoded (likely near line 121)
- Helius's token metadata response (from `getTokenMetadata` RPC or REST API) typically includes an `image` or `logo` field. Extract whichever is present.
- Some Helius responses include both `content.files[].uri` (IPFS) and `content.link` (off-chain). Prefer `content.link` if present and starts with `https://`.
- Validate URLs before adding to array (must start with `http(s)://`)
- If no valid image URL present, return `imageUrls: []`

**Must NOT do**:
- Don't change Helius RPC call signature
- Don't add IPFS resolution (out of scope — just preserve the URL as-is)
- Don't modify other adapters

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T1, T2, T3, T5, T6, T7, T8)
- **Blocks**: None
- **Blocked By**: None

**References**:
- **Pattern (working provider)**: `apps/backend/src/chain/explorer/infrastructure/providers/dexscreener.adapter.ts:85-87`
- **File to edit**: `apps/backend/src/chain/explorer/infrastructure/providers/helius.adapter.ts`
- **External**: Helius DAS API docs for `getAsset` / token metadata response — look for `content.links.image` or `content.files[].uri`

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "imageUrls" helius.adapter.ts` confirms non-empty assignment where applicable
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test -- --testPathPattern=providers` PASS

**QA Scenarios**:

```
Scenario: Helius-covered Solana token returns image URL
  Tool: Bash (curl + jq)
  Preconditions: Use a Solana token address known to have Helius metadata (e.g., USDC on Solana: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v).
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" | jq '.imageUrls'
  Expected Result: array contains a URL from Helius CDN or arweave
  Failure Indicators: empty when Helius should have data, or 500 errors
  Evidence: .sisyphus/evidence/task-4-helius-image.json

Scenario: Helius returns malformed/empty image data — graceful fallback
  Tool: Bash (curl + jq)
  Preconditions: Solana address with no Helius metadata.
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/solana/11111111111111111111111111111111" | jq '.imageUrls, .sources'
  Expected Result: imageUrls: [], sources array may or may not contain "helius" but no error
  Failure Indicators: 500 status, unhandled promise rejection
  Evidence: .sisyphus/evidence/task-4-helius-empty.json
```

#### Task 5 — Add HTTP Cache-Control headers to enrichment endpoint

**What to do**:
- Open `apps/backend/src/chain/explorer/api/http/enrichment.controller.ts`
- Find the `@Get('snapshots/:chain/:address')` decorator (line ~36-42)
- Add a `@Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')` decorator on the method
- Also add the same header to the `@Get('snapshots/recent')` method (line ~28-34)
- Verify that the header is applied via `curl -I` after restart

**Must NOT do**:
- Don't change the response body shape
- Don't add response compression (different concern, out of scope)
- Don't add ETag/Last-Modified (out of scope for this task — could be added later)

**Recommended Agent Profile**:
- **Category**: `quick` — single decorator addition
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T1-T4, T6, T7, T8)
- **Blocks**: None
- **Blocked By**: None

**References**:
- **File to edit**: `apps/backend/src/chain/explorer/api/http/enrichment.controller.ts`
- **Existing decorators in same file**: search for `@Get(`, `@Header(`, `@Controller(` — NestJS decorator pattern
- **External**: https://docs.nestjs.com/controllers#route-parameters — `@Header` decorator usage

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "@Header" enrichment.controller.ts` shows ≥2 Cache-Control decorators
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS (existing tests)

**QA Scenarios**:

```
Scenario: Cache-Control header present on single-snapshot endpoint
  Tool: Bash (curl -I)
  Preconditions: Backend running on localhost:3030.
  Steps:
    1. curl -I "http://localhost:3030/token/market-data/snapshots/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  Expected Result: response headers include `Cache-Control: public, max-age=60, stale-while-revalidate=300`
  Failure Indicators: header missing, or different Cache-Control value, or 500 error
  Evidence: .sisyphus/evidence/task-5-cache-headers-single.txt

Scenario: Cache-Control header present on recent-snapshots endpoint
  Tool: Bash (curl -I)
  Preconditions: Backend running.
  Steps:
    1. curl -I "http://localhost:3030/token/market-data/snapshots/recent?limit=10"
  Expected Result: response includes `Cache-Control: public, max-age=60, stale-while-revalidate=300`
  Failure Indicators: header missing on this endpoint
  Evidence: .sisyphus/evidence/task-5-cache-headers-recent.txt
```

#### Task 6 — Set React Query staleTime on useSnapshot hook

**What to do**:
- Open `apps/frontend/src/entities/token-snapshot/model/use-snapshot.ts`
- Find the `useQuery` call (lines 8-12)
- Add `staleTime: 60_000` (60 seconds) to the options object
- Also add `gcTime: 5 * 60_000` (5 minutes) — explicit for clarity even though it matches default
- Document with a single-line comment WHY: "Avoid refetch storm on every navigation; matches backend Cache-Control TTL"

**Must NOT do**:
- Don't change `queryKey`
- Don't add `refetchInterval` (out of scope)
- Don't change `enabled` logic

**Recommended Agent Profile**:
- **Category**: `quick` — single config object change
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T1-T5, T7, T8)
- **Blocks**: None
- **Blocked By**: None

**References**:
- **File to edit**: `apps/frontend/src/entities/token-snapshot/model/use-snapshot.ts`
- **Existing useQuery pattern in repo**: search `apps/frontend/src/entities/*/model/use-*.ts` for other hooks with staleTime — copy their pattern
- **External**: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults — TanStack Query staleTime/gcTime docs

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "staleTime" use-snapshot.ts` shows the new line
- [ ] `cd apps/frontend && npx tsc --noEmit` PASS
- [ ] `cd apps/frontend && npm test` PASS

**QA Scenarios**:

```
Scenario: staleTime is set in the hook
  Tool: Bash (grep + verification)
  Preconditions: Source available.
  Steps:
    1. grep -A 8 "useQuery({" apps/frontend/src/entities/token-snapshot/model/use-snapshot.ts
  Expected Result: output contains `staleTime: 60_000` and `gcTime: 5 * 60_000`
  Failure Indicators: staleTime not present, or value < 60000
  Evidence: .sisyphus/evidence/task-6-staletime-config.txt

Scenario: Frontend build still succeeds
  Tool: Bash (npm run build)
  Preconditions: Node + dependencies installed.
  Steps:
    1. cd apps/frontend && npm run build
  Expected Result: build completes without error
  Failure Indicators: TypeScript error mentioning useSnapshot or staleTime
  Evidence: .sisyphus/evidence/task-6-frontend-build.log
```

#### Task 7 — Add lazy loading + async decoding + explicit dimensions to token images

**What to do**:
- Open `apps/frontend/src/pages/tokens-explorer/index.tsx`
- Find the `<img>` tags in the `DecisionRow` component (lines 62-67 and 69-73)
- Add `loading="lazy"`, `decoding="async"`, explicit `width="40"`, `height="40"` attributes to BOTH `<img>` elements (the real one and the placeholder)
- Open `apps/frontend/src/pages/token-detail/index.tsx`
- Find the `<img>` tags in that page (location varies; search for `img src={imageUrl}` or similar)
- Add the same 4 attributes: `loading="lazy"`, `decoding="async"`, and explicit `width`/`height` matching the rendered size
- If the token-detail image renders larger (e.g., 96x96), use those dimensions; otherwise match the rendered CSS class

**Must NOT do**:
- Don't change `src` or `alt` attributes
- Don't change `onError` handlers
- Don't refactor the surrounding JSX beyond what's needed
- Don't switch to `<Image>` from Next.js (this is Vite, not Next.js — verify in package.json)

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — touches 2 files, needs to verify rendered dimensions
- **Skills**: `[]`
- **Why**: Need to read both files, determine actual rendered sizes from CSS classes, and add correct dimensions

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with T1-T6, T8)
- **Blocks**: None
- **Blocked By**: None

**References**:
- **Files to edit**:
  - `apps/frontend/src/pages/tokens-explorer/index.tsx:62-73` (two `<img>` tags in DecisionRow)
  - `apps/frontend/src/pages/token-detail/index.tsx` (one `<img>` tag, search by `src=` or `imageUrl`)
- **CSS class for sizing**: search for `w-10 h-10` (40px) or similar in tokens-explorer; token-detail likely uses `w-24 h-24` or `w-20 h-20` (80-96px)
- **External**: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attributes — MDN reference for `loading`, `decoding`, `width`, `height`

**Acceptance Criteria**:
- [ ] Both files modified
- [ ] `grep -c 'loading="lazy"' apps/frontend/src/pages/tokens-explorer/index.tsx` returns ≥2 (both images)
- [ ] `grep -c 'decoding="async"' apps/frontend/src/pages/tokens-explorer/index.tsx` returns ≥2
- [ ] `grep -n 'loading="lazy"\|decoding="async"' apps/frontend/src/pages/token-detail/index.tsx` shows the new attributes
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS

**QA Scenarios**:

```
Scenario: DecisionRow images have lazy loading + dimensions
  Tool: Bash (grep)
  Preconditions: Source available.
  Steps:
    1. grep -n 'loading="lazy"\|decoding="async"\|width=\|height=' apps/frontend/src/pages/tokens-explorer/index.tsx
  Expected Result: ≥4 lines matching (2 imgs × 4 attributes, but width/height share lines with loading/decoding → expect ≥2 occurrences each)
  Failure Indicators: missing any of the 4 attributes on either `<img>` tag
  Evidence: .sisyphus/evidence/task-7-lazy-loading.txt

Scenario: token-detail page image has lazy loading
  Tool: Bash (grep)
  Preconditions: Source available.
  Steps:
    1. grep -n 'loading="lazy"\|decoding="async"' apps/frontend/src/pages/token-detail/index.tsx
  Expected Result: ≥2 lines matching (both attributes on the single image)
  Failure Indicators: missing attributes
  Evidence: .sisyphus/evidence/task-7-token-detail-lazy.txt

Scenario: Frontend build still succeeds
  Tool: Bash
  Preconditions: Deps installed.
  Steps:
    1. cd apps/frontend && npm run build
  Expected Result: build succeeds
  Evidence: .sisyphus/evidence/task-7-frontend-build.log
```

#### Task 8 — Baseline verification of current image coverage

**What to do**:
- This is a READ-ONLY task. No code changes.
- Start backend + frontend if not already running
- Navigate to http://localhost:5173/tokens via Playwright MCP
- Use Playwright to count visible token rows and count rows that show the placeholder SVG vs rows that show a real image
- Use backend logs or direct DB query to determine total tokens in the list
- Calculate baseline coverage %: `(real_image_count / total_tokens) * 100`
- Run Lighthouse on http://localhost:5173/tokens and capture the performance score
- Save baseline metrics to `.sisyphus/evidence/task-8-baseline.json`

**Must NOT do**:
- Don't modify any code in this task
- Don't change any config

**Recommended Agent Profile**:
- **Category**: `quick` — read-only verification, no code changes
- **Skills**: [`playwright` skill — REQUIRED for browser automation]
- **Why**: Needs to launch a browser, navigate, count DOM elements, screenshot

**Parallelization**:
- **Can Run In Parallel**: YES (no code dependencies)
- **Parallel Group**: Wave 1 (with T1-T7)
- **Blocks**: T19 (benchmark — needs baseline to compare against)
- **Blocked By**: None

**References**:
- **Playwright skill**: `/playwright` command/skill in this environment
- **Lighthouse**: install via `npm install -g lighthouse` if not available
- **Frontend URL**: http://localhost:5173/tokens
- **Backend URL**: http://localhost:3030/token/market-data/snapshots/recent?limit=100

**Acceptance Criteria**:
- [ ] `.sisyphus/evidence/task-8-baseline.json` exists
- [ ] JSON contains: `totalTokens`, `tokensWithImage`, `tokensWithPlaceholder`, `coveragePercent`, `lighthousePerformanceScore`, `timestamp`
- [ ] Playwright screenshot saved to `.sisyphus/evidence/task-8-baseline-tokens-page.png`

**QA Scenarios**:

```
Scenario: Baseline coverage percentage is captured
  Tool: Playwright + Bash
  Preconditions: Backend on localhost:3030, frontend on localhost:5173.
  Steps:
    1. Playwright: navigate to http://localhost:5173/tokens, wait for network idle
    2. Playwright: query DOM `img.rounded-full` to count images, then check `src` attributes — count those ending in `token-placeholder.svg` vs those starting with `https://`
    3. Save counts and percentage to .sisyphus/evidence/task-8-baseline.json
  Expected Result: JSON file with coverage % (likely 30-40% given 2 of 6 providers work)
  Failure Indicators: JSON file missing or zero values
  Evidence: .sisyphus/evidence/task-8-baseline.json

Scenario: Lighthouse baseline score captured
  Tool: Bash (lighthouse CLI)
  Preconditions: lighthouse installed, frontend running.
  Steps:
    1. lighthouse http://localhost:5173/tokens --output json --output-path .sisyphus/evidence/task-8-lighthouse.json --quiet --chrome-flags="--headless"
    2. jq '.categories.performance.score * 100' .sisyphus/evidence/task-8-lighthouse.json
  Expected Result: numeric score (0-100), file saved
  Failure Indicators: lighthouse error, file not generated
  Evidence: .sisyphus/evidence/task-8-lighthouse.json
```

---

### Wave 2 — Server-side Fallback for Tokens with Zero Coverage

> **Wave 2 goal**: For tokens where ALL providers return `imageUrls: []` (e.g., obscure micro-caps), generate a deterministic identicon so every token shows *something* instead of the generic placeholder. Single dependency: pure TypeScript — no new npm packages.

#### Task 9 — Create server-side identicon generator utility

**What to do**:
- Create new file `apps/backend/src/shared/identicon/identicon.generator.ts`
- Export a class `IdenticonGenerator` with method `generate(chain: string, address: string): string` that returns a `data:image/svg+xml;base64,...` URI
- Implementation: deterministic blocky avatar derived from `sha256(chain + ':' + address)`. Use 8x8 colored blocks with symmetric mirroring (similar to Ethereum identicons / blockies). Output dimensions: 64x64 SVG, scaled up by browser.
- Use Node's built-in `crypto.createHash('sha256')` — no new deps.
- Color: derive background + foreground colors from hash bytes 0-5 (RGB) with high contrast.
- Add unit test file `identicon.generator.spec.ts` (or `.test.ts` depending on project convention) with 3 test cases: same input → same output; different address → different output; SVG starts with `data:image/svg+xml;base64,`.

**Must NOT do**:
- Don't add npm packages (use Node `crypto` + string templating only)
- Don't render to PNG (SVG inline is enough — smaller, scales, no extra deps)
- Don't add IPFS resolution

**Recommended Agent Profile**:
- **Category**: `deep` — needs to design the identicon algorithm from scratch
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with T10, T11 — but T10/T11 depend on T9)
- **Blocks**: T10 (uses IdenticonGenerator)
- **Blocked By**: None

**References**:
- **Existing test patterns**: search `apps/backend/src/**/*.spec.ts` for unit test style (Jest based on README "tests")
- **External (algorithm reference)**: https://github.com/ethereum/blockies — Ethereum blockies algorithm, public domain reference
- **External (SHA-256 in Node)**: https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options

**Acceptance Criteria**:
- [ ] File `apps/backend/src/shared/identicon/identicon.generator.ts` created
- [ ] Test file `apps/backend/src/shared/identicon/identicon.generator.spec.ts` created
- [ ] `cd apps/backend && npm test -- --testPathPattern=identicon` → PASS
- [ ] `npx tsc --noEmit` PASS

**QA Scenarios**:

```
Scenario: Identicon is deterministic for same input
  Tool: Bash
  Preconditions: Backend deps installed.
  Steps:
    1. node -e "const {IdenticonGenerator} = require('./apps/backend/dist/shared/identicon/identicon.generator'); const g = new IdenticonGenerator(); console.log(g.generate('solana', 'addr1') === g.generate('solana', 'addr1'));"
  Expected Result: prints `true`
  Failure Indicators: prints `false`
  Evidence: .sisyphus/evidence/task-9-identicon-deterministic.txt

Scenario: Identicon output is a valid data URI
  Tool: Bash
  Preconditions: Compiled or runnable TS.
  Steps:
    1. node -e "const {IdenticonGenerator} = require('./apps/backend/dist/shared/identicon/identicon.generator'); const g = new IdenticonGenerator(); const out = g.generate('solana', 'addr1'); console.log(out.substring(0, 60));"
  Expected Result: starts with `data:image/svg+xml;base64,`
  Failure Indicators: any other prefix, or empty string
  Evidence: .sisyphus/evidence/task-9-identicon-format.txt
```

#### Task 10 — Append identicon fallback in enrichment use case

**What to do**:
- Open `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts`
- Locate the `mergeMarketData` function (around line 220-227) and the snapshot creation line (~166)
- After merging `imageUrls` from providers, check if the merged array is empty: `if (merged.imageUrls.length === 0) { ... }`
- If empty, inject `identiconGenerator.generate(chain, address)` as a single-item array. Inject ONE class instance via constructor.
- Add the import at the top: `import { IdenticonGenerator } from '@/shared/identicon/identicon.generator';` (or relative path matching the codebase style)
- Update the use case's constructor to accept `IdenticonGenerator` as a dependency (DI-friendly — NestJS injects via module)
- Register the provider in the relevant NestJS module (`chain.module.ts` or wherever `EnrichTokenUseCase` is provided)

**Must NOT do**:
- Don't change the providers themselves (that's T1-T4)
- Don't remove existing fallback behavior (placeholder, etc.)
- Don't fetch identicon on the frontend — must be server-side

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`
- **Why**: Needs to navigate NestJS DI module to wire the dependency

**Parallelization**:
- **Can Run In Parallel**: NO (depends on T9)
- **Parallel Group**: Wave 2 (sequential: T9 → T10 → T11)
- **Blocks**: T11
- **Blocked By**: T9

**References**:
- **File to edit**: `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts:220-227` (mergeMarketData), `:166` (snapshot creation)
- **DI pattern**: search `apps/backend/src/chain/explorer/chain.module.ts` (or similar) for how use cases are wired
- **IdenticonGenerator**: file from T9

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "IdenticonGenerator" enrich-token.use-case.ts` shows the import + usage
- [ ] Backend boots without DI errors
- [ ] `npm test` PASS
- [ ] `npx tsc --noEmit` PASS

**QA Scenarios**:

```
Scenario: Token with no provider coverage gets identicon in imageUrls
  Tool: Bash (curl + jq)
  Preconditions: Backend running. Use a token address guaranteed to have zero provider coverage (or trigger fresh enrichment after deleting existing snapshot row).
  Steps:
    1. Pick a chain+address with no snapshot row: pick a brand-new random address, e.g., curl -X POST "http://localhost:3030/token/market-data/enrich/ethereum/0x<random-unused-address>"
    2. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0x<random-unused-address>" | jq '.imageUrls[0][:60]'
  Expected Result: starts with `data:image/svg+xml;base64,`
  Failure Indicators: empty array, or `[]`, or 500 error
  Evidence: .sisyphus/evidence/task-10-identicon-fallback.json

Scenario: Token WITH provider coverage still uses provider URL (not identicon)
  Tool: Bash (curl + jq)
  Preconditions: Use a known token like USDC that has DexScreener coverage.
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" | jq '.imageUrls[0]'
  Expected Result: starts with `https://` (from DexScreener or Birdeye), NOT `data:image/svg+xml`
  Failure Indicators: starts with `data:image/svg+xml` (would mean provider URL was overwritten)
  Evidence: .sisyphus/evidence/task-10-provider-wins.json
```

#### Task 11 — Frontend DecisionRow handles identicon data URI

**What to do**:
- Open `apps/frontend/src/pages/tokens-explorer/index.tsx`
- Read the existing `DecisionRow` component (lines 25-74)
- Verify the existing logic correctly handles a single-item array (when identicon is the only URL). No changes likely needed, but verify by reading.
- If `imageUrls` is `[<data-uri>]`, the `<img src={data-uri}>` should render the SVG inline. Verify this works.
- If the existing `onError` handler isn't needed for data URIs (data URIs can't fail to load), keep it but verify it doesn't infinite-loop on data URI.
- Add `data-testid="token-image"` to the `<img>` tag (not yet used, but enables T19 benchmark counting).

**Must NOT do**:
- Don't change the `<img>` JSX structure beyond adding `data-testid`
- Don't add separate handling for data URIs (the existing `<img>` handles them)
- Don't remove `onError` handler

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`
- **Why**: Needs to verify existing logic + add testid

**Parallelization**:
- **Can Run In Parallel**: NO (depends on T10 — needs backend serving identicon)
- **Parallel Group**: Wave 2 (T9 → T10 → T11)
- **Blocks**: None
- **Blocked By**: T10

**References**:
- **File to edit**: `apps/frontend/src/pages/tokens-explorer/index.tsx:62-73` (img tags in DecisionRow)
- **Existing onError logic**: lines 34-40 (per investigation findings)

**Acceptance Criteria**:
- [ ] File modified (only adds `data-testid="token-image"`)
- [ ] `grep -c 'data-testid="token-image"' tokens-explorer/index.tsx` returns 2 (both img tags)
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS

**QA Scenarios**:

```
Scenario: DecisionRow img tags have data-testid
  Tool: Bash (grep)
  Preconditions: Source available.
  Steps:
    1. grep -n 'data-testid="token-image"' apps/frontend/src/pages/tokens-explorer/index.tsx
  Expected Result: ≥2 lines (both image variants)
  Failure Indicators: missing
  Evidence: .sisyphus/evidence/task-11-testid.txt

Scenario: Identicon renders correctly in browser (visual check)
  Tool: Playwright
  Preconditions: Backend running, T10 deployed, frontend running.
  Steps:
    1. Playwright: navigate to http://localhost:5173/tokens
    2. Find a token row where img src starts with `data:image/svg+xml`
    3. Take screenshot, verify SVG is visible (not a broken-image icon)
  Expected Result: SVG identicon is visible and colored
  Failure Indicators: broken-image icon, blank space, or fallback placeholder
  Evidence: .sisyphus/evidence/task-11-identicon-visual.png
```

---

### Wave 3 — Self-hosted Image Proxy

> **Wave 3 goal**: Add `GET /token/image/:chain/:address` that proxies images through our backend with proper cache headers (immutable, 1-day TTL), reducing direct calls to provider CDNs and giving us a place to add format optimization in Wave 4. T12 (controller scaffold) can run in parallel with T13 (service) since they share only a contract.

#### Task 12 — Image proxy controller endpoint (foundation)

**What to do**:
- Create new file `apps/backend/src/chain/explorer/api/http/token-image.controller.ts`
- Define NestJS controller with `@Controller('token/image')`
- Define method: `@Get(':chain/:address')` that accepts chain + address, validates (400 on invalid format), and returns `501 Not Implemented` for now (T13 will wire the service)
- Use existing NestJS patterns from `enrichment.controller.ts` (e.g., `@Param` decorators)
- Register the controller in the relevant NestJS module (likely `chain.module.ts` or wherever enrichment controller is registered)
- Add a comment: `// Service wired in T13. This is the route + validation scaffold only.`

**Must NOT do**:
- Don't implement the service logic here (that's T13/T14)
- Don't add caching at this layer (T13)
- Don't add format transcoding (T16)

**Recommended Agent Profile**:
- **Category**: `quick` — controller scaffold only
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES (no code dependency on T13 — just route + 501 stub)
- **Parallel Group**: Wave 3 (with T13, T14, T15 — but T13/T14/T15 have their own dependencies)
- **Blocks**: T13 (uses the controller's signature)
- **Blocked By**: None

**References**:
- **Pattern**: `apps/backend/src/chain/explorer/api/http/enrichment.controller.ts` (lines 1-50, controller structure)
- **Module registration**: search `apps/backend/src/chain/explorer/chain.module.ts` (or similar) for `controllers: [EnrichmentController]`
- **External (NestJS controllers)**: https://docs.nestjs.com/controllers

**Acceptance Criteria**:
- [ ] File `apps/backend/src/chain/explorer/api/http/token-image.controller.ts` created
- [ ] Controller registered in module
- [ ] `curl -I http://localhost:3030/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` returns `501 Not Implemented` (or similar)
- [ ] `curl -I http://localhost:3030/token/image/invalid/!!` returns `400 Bad Request`
- [ ] `npx tsc --noEmit` PASS

**QA Scenarios**:

```
Scenario: Endpoint exists and returns 501 stub for valid input
  Tool: Bash (curl -I)
  Preconditions: Backend running.
  Steps:
    1. curl -I "http://localhost:3030/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  Expected Result: HTTP/1.1 501 Not Implemented (or 503)
  Failure Indicators: 404 (route not registered), 500 (module error)
  Evidence: .sisyphus/evidence/task-12-endpoint-501.txt

Scenario: Endpoint validates and rejects malformed input
  Tool: Bash (curl -I)
  Preconditions: Backend running.
  Steps:
    1. curl -I "http://localhost:3030/token/image/!!!/!!!"
  Expected Result: HTTP/1.1 400 Bad Request
  Failure Indicators: 500, 404, or 501 (would mean validation skipped)
  Evidence: .sisyphus/evidence/task-12-validation-400.txt
```

#### Task 13 — Image proxy service with in-memory LRU cache

**What to do**:
- Create new file `apps/backend/src/chain/explorer/application/services/token-image.service.ts`
- Inject `TokenImageFetcher` (from T14) via constructor
- Use `lru-cache` npm package — verify if installed first; if not, add to `apps/backend/package.json` dependencies (`npm install lru-cache`)
- Method: `async getImage(chain: string, address: string, acceptHeader?: string): Promise<{ buffer: Buffer; contentType: string }>`
- Method: `async invalidate(chain: string, address: string): Promise<void>`
- TTL: 5 minutes (300_000 ms). Cache key: `token-image:${chain}:${address}:${acceptHeader || 'default'}`.
- Service is a NestJS `@Injectable()` class. Register in module with `providers: [TokenImageService, TokenImageFetcher]`.
- The fetcher (T14) is injected but for now T13 only sets up the cache layer. If T14 isn't done yet, the service can call a placeholder method that throws "not implemented" for the actual fetch.

**Must NOT do**:
- Don't implement HTTP fetch logic here (T14)
- Don't implement WebP transcoding here (T16)
- Don't use Redis yet (T18, optional behind feature flag)

**Recommended Agent Profile**:
- **Category**: `deep` — needs to design cache key strategy and TTL semantics
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: NO (depends on T12 — needs controller signature)
- **Parallel Group**: Wave 3 (T12 → T13 → T14)
- **Blocks**: T14, T16, T17, T18
- **Blocked By**: T12

**References**:
- **External (lru-cache npm)**: https://www.npmjs.com/package/lru-cache
- **NestJS Injectable pattern**: search `apps/backend/src/**/*.service.ts` for `@Injectable()` usage
- **Filer service pattern**: `apps/backend/src/chain/explorer/application/services/` (existing services if any)

**Acceptance Criteria**:
- [ ] File created
- [ ] `lru-cache` added to `apps/backend/package.json` dependencies
- [ ] Service registered as provider in module
- [ ] `npx tsc --noEmit` PASS

**QA Scenarios**:

```
Scenario: lru-cache dependency added
  Tool: Bash (cat + grep)
  Preconditions: —
  Steps:
    1. grep '"lru-cache"' apps/backend/package.json
  Expected Result: line matching `"lru-cache": "^..."` (semver range)
  Failure Indicators: not found
  Evidence: .sisyphus/evidence/task-13-dep-lru-cache.txt

Scenario: Service module compiles
  Tool: Bash
  Preconditions: deps installed.
  Steps:
    1. cd apps/backend && npm run build
  Expected Result: build succeeds, no TS errors mentioning token-image.service
  Failure Indicators: TS error about missing types, missing imports, circular dep
  Evidence: .sisyphus/evidence/task-13-build.log
```

#### Task 14 — Image proxy fetcher with error handling

**What to do**:
- Create new file `apps/backend/src/chain/explorer/infrastructure/fetchers/token-image.fetcher.ts`
- Export a NestJS `@Injectable()` class `TokenImageFetcher`
- Method: `async fetch(chain: string, address: string): Promise<{ buffer: Buffer; contentType: string; ttlMs: number }>`
- Logic: try each known provider URL in order (DexScreener first, Birdeye second). On HTTP 200, return buffer + content-type from response header. On 404 / network error / timeout (5s), try next provider. If all fail, throw `NotFoundException`.
- Use Node's built-in `fetch` (Node 18+) — no new deps.
- Set `User-Agent: onchain-bot/1.0` to avoid being blocked by some CDNs.

**Must NOT do**:
- Don't add retries with exponential backoff (keep simple — fail fast to next provider)
- Don't add image transformation (T16)
- Don't add caching (T13 handles)

**Recommended Agent Profile**:
- **Category**: `deep` — needs to handle multiple providers, error states, timeouts
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: NO (depends on T13 — service injects this fetcher)
- **Parallel Group**: Wave 3 (T12 → T13 → T14)
- **Blocks**: T15, T16, T17
- **Blocked By**: T13

**References**:
- **Provider URLs (from investigation)**:
  - DexScreener: `https://dd.dexscreener.com/ds-data/tokens/{chainSlug}/{address}.png`
  - Birdeye (Solana only): `https://cdn.birdeye.so/tokens/{address}/logo.png`
- **Existing fetcher patterns**: search `apps/backend/src/chain/explorer/infrastructure/providers/` for HTTP client usage
- **External (Node fetch)**: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

**Acceptance Criteria**:
- [ ] File created
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS

**QA Scenarios**:

```
Scenario: Fetcher returns image buffer for covered token (DexScreener)
  Tool: Bash (node script or unit test)
  Preconditions: Backend compiled, deps installed.
  Steps:
    1. node -e "(async () => { const {TokenImageFetcher} = require('./apps/backend/dist/chain/explorer/infrastructure/fetchers/token-image.fetcher'); const f = new TokenImageFetcher(); const r = await f.fetch('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); console.log('contentType:', r.contentType, 'size:', r.buffer.length); })();"
  Expected Result: `contentType: image/png` (or similar), `size: > 0`
  Failure Indicators: throws, empty buffer, wrong content-type
  Evidence: .sisyphus/evidence/task-14-fetcher-success.txt

Scenario: Fetcher throws NotFoundException for un-coverable address
  Tool: Bash
  Preconditions: Compiled.
  Steps:
    1. node -e "(async () => { try { const {TokenImageFetcher} = require('./apps/backend/dist/chain/explorer/infrastructure/fetchers/token-image.fetcher'); const f = new TokenImageFetcher(); await f.fetch('ethereum', '0x000000000000000000000000000000000000dEaD'); console.log('UNEXPECTED SUCCESS'); } catch(e) { console.log('expected error:', e.constructor.name); } })();"
  Expected Result: prints `expected error: NotFoundException` (or similar)
  Failure Indicators: prints `UNEXPECTED SUCCESS` (means fetcher fell back to fake URL)
  Evidence: .sisyphus/evidence/task-14-fetcher-notfound.txt
```

#### Task 15 — Wire frontend to use image proxy URL

**What to do** (single canonical approach):
- **Backend step**: Open `apps/backend/src/chain/explorer/application/mappers/token-snapshot.mapper.ts`
  - Find where `imageUrls` is mapped from the DB entity to the API response view
  - **Rewrite each URL** in `imageUrls` to a proxy URL: `/token/image/${chain}/${address}?source=<url-encoded-original-url>` — the proxy (T14) will use the `source` query param to know which CDN to fetch from
  - Keep the response field name `imageUrls` unchanged (backward-compatible)
- **Frontend step**: No frontend code changes needed! The DecisionRow already uses `imageUrls[currentImageIndex]` as `<img src>`. Since the backend now returns proxy URLs, the frontend automatically uses them.
- **Verify**: After deploying both backend mapper change AND T14 (proxy fetcher), the frontend should automatically route image requests through the proxy.

**Must NOT do**:
- Don't change `imageUrls` field name (keep backward compat)
- Don't break existing T11 data-testid
- Don't add a new field to the response (just rewrite existing URLs)
- Don't hardcode `http://localhost:3030` anywhere — use relative paths

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — backend mapper change, frontend mostly unchanged
- **Skills**: `[]`
- **Note**: Originally marked as `deep` but on reflection this is a mapper-level rewrite + verification, not architecture-level design

**Parallelization**:
- **Can Run In Parallel**: NO (depends on T14 — proxy fetcher must exist to handle `source` query param)
- **Parallel Group**: Wave 3 (T12 → T13 → T14 → T15)
- **Blocks**: T17 (cache invalidation needs to know which URLs to invalidate)
- **Blocked By**: T14

**References**:
- **Backend mapper (file to edit)**: `apps/backend/src/chain/explorer/application/mappers/token-snapshot.mapper.ts`
- **Existing mapper pattern**: search for `imageUrls` in this file to see the current mapping
- **T14 fetcher signature**: `apps/backend/src/chain/explorer/infrastructure/fetchers/token-image.fetcher.ts` (created in T14) — needs to accept the `source` query param

**Acceptance Criteria**:
- [ ] Backend mapper modified to rewrite URLs
- [ ] `grep -n "token/image" token-snapshot.mapper.ts` shows the rewrite logic
- [ ] `cd apps/backend && npx tsc --noEmit` PASS
- [ ] `cd apps/frontend && npx tsc --noEmit` PASS (no frontend changes, but verify)
- [ ] `npm test` PASS in both workspaces

**QA Scenarios**:

```
Scenario: Snapshot response now returns proxy URLs in imageUrls
  Tool: Bash (curl + jq)
  Preconditions: Backend running with T14 deployed.
  Steps:
    1. curl -s "http://localhost:3030/token/market-data/snapshots/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" | jq '.imageUrls[0]'
  Expected Result: URL starts with `/token/image/...` (relative path, contains `source=` query param with the original CDN URL encoded)
  Failure Indicators: URL still points to `dd.dexscreener.com` or `cdn.birdeye.so` directly (mapper didn't rewrite)
  Evidence: .sisyphus/evidence/task-15-rewritten-url.json

Scenario: Image rendered on /tokens page now goes through proxy
  Tool: Playwright
  Preconditions: Frontend + backend running, T14 + T15 deployed.
  Steps:
    1. Playwright: navigate to http://localhost:5173/tokens, wait for network idle
    2. Playwright: evaluate `Array.from(document.querySelectorAll('img[data-testid="token-image"]')).slice(0,3).map(img => img.src)`, log to console
    3. Confirm ≥1 src contains `/token/image/`
  Expected Result: ≥1 image src contains `/token/image/` (may be relative or absolute depending on how browser resolves)
  Failure Indicators: all src point directly to `dd.dexscreener.com` or `cdn.birdeye.so` (proxy not wired in mapper)
  Evidence: .sisyphus/evidence/task-15-frontend-uses-proxy.png
```

---

### Wave 4 — Production Hardening

> **Wave 4 goal**: Polish the proxy with WebP transcoding, ensure cache freshness via invalidation, optionally add Redis (behind feature flag), and run final benchmark. Tasks can mostly run in parallel within the wave.

#### Task 16 — WebP transcoding in image proxy

**What to do**:
- Add `sharp` npm package to `apps/backend/package.json` dependencies (`npm install sharp`)
- Open `apps/backend/src/chain/explorer/application/services/token-image.service.ts`
- When client sends `Accept: image/webp` header (received via the controller method signature from T12), transcode the buffer using `sharp(buffer).webp({ quality: 80 }).toBuffer()`
- Set Content-Type to `image/webp` in response
- If client doesn't accept WebP, return original buffer with original content-type
- Cache the transcoded WebP version separately (cache key includes the accept variant)

**Must NOT do**:
- Don't transcode to other formats (AVIF, JPEG-XL) — out of scope
- Don't add quality presets / config — hardcode quality 80
- Don't change the fetcher (T14)

**Recommended Agent Profile**:
- **Category**: `deep` — image transcoding + cache variant management
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES (can run alongside T17, T18 — only depends on T14)
- **Parallel Group**: Wave 4 (with T17, T18)
- **Blocks**: T19
- **Blocked By**: T14

**References**:
- **External (sharp)**: https://sharp.pixelplumbing.com/api-output#toformat
- **sharp install**: typically requires build tools; if install fails, fallback to using the raw buffer + setting Content-Type via the response (document as known limitation)
- **Existing service**: file from T13

**Acceptance Criteria**:
- [ ] `sharp` added to `apps/backend/package.json`
- [ ] File modified
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS

**QA Scenarios**:

```
Scenario: WebP returned when Accept header indicates support
  Tool: Bash (curl)
  Preconditions: Backend running, T16 deployed.
  Steps:
    1. curl -H "Accept: image/webp" "http://localhost:3030/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" -o /tmp/test.webp
    2. file /tmp/test.webp
  Expected Result: `/tmp/test.webp: Web/P image` (or similar WebP signature)
  Failure Indicators: `PNG image`, empty file, HTTP error
  Evidence: .sisyphus/evidence/task-16-webp-transcoded.txt

Scenario: PNG returned when client doesn't accept WebP
  Tool: Bash (curl)
  Preconditions: Backend running.
  Steps:
    1. curl "http://localhost:3030/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" -o /tmp/test.png
    2. file /tmp/test.png
  Expected Result: `PNG image data` (no transcoding when not requested)
  Failure Indicators: WebP format (means service transcoded unconditionally)
  Evidence: .sisyphus/evidence/task-16-no-transcode-default.txt
```

#### Task 17 — Cache invalidation when enrichment updates

**What to do**:
- Open `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts`
- Locate where the snapshot is persisted (after the mergeMarketData block)
- After successful DB save, call `await this.tokenImageService.invalidate(chain, address)`
- This ensures the next request to the proxy fetches fresh data
- Add `TokenImageService` to the use case's constructor (DI injection)

**Must NOT do**:
- Don't change the enrichment merge logic
- Don't add invalidation for other entities (only tokens)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES (with T18; T16 also parallel)
- **Parallel Group**: Wave 4 (with T16, T18)
- **Blocks**: T19
- **Blocked By**: T13, T15 (needs service to exist + URLs to be proxied)

**References**:
- **File to edit**: `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts` (after mergeMarketData)
- **TokenImageService**: file from T13 (`apps/backend/src/chain/explorer/application/services/token-image.service.ts`)

**Acceptance Criteria**:
- [ ] File modified
- [ ] `grep -n "invalidate" enrich-token.use-case.ts` shows the new call
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS

**QA Scenarios**:

```
Scenario: Cache invalidated after enrichment update
  Tool: Bash (curl twice)
  Preconditions: Backend running, T13+T15+T17 deployed.
  Steps:
    1. curl -I "http://localhost:3030/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" — capture response headers (note if HIT or MISS in custom header, or just verify cache works)
    2. Trigger re-enrichment: curl -X POST "http://localhost:3030/token/market-data/enrich/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" (or whatever enrichment trigger endpoint exists — check backend routes)
    3. curl -I again, observe whether cache was invalidated (look for HIT/MISS or date headers changing)
  Expected Result: 2nd response shows cache MISS (fresh data) after enrichment triggered
  Failure Indicators: 2nd response identical to 1st with old data (cache not invalidated)
  Evidence: .sisyphus/evidence/task-17-invalidation.txt
```

#### Task 18 — Redis cache adapter behind feature flag

**What to do**:
- Add `ioredis` npm package to `apps/backend/package.json` dependencies (`npm install ioredis`)
- Create new file `apps/backend/src/shared/cache/token-image-cache.adapter.ts`
- Export two classes implementing the same interface: `LruTokenImageCache` (wraps `lru-cache` from T13) and `RedisTokenImageCache` (wraps `ioredis`)
- Interface methods: `get(key): Promise<Buffer | null>`, `set(key, buffer, ttlMs): Promise<void>`, `invalidate(key): Promise<void>`
- In `apps/backend/src/chain/explorer/application/services/token-image.service.ts`, read env var `TOKEN_IMAGE_REDIS_ENABLED` at module init. If `true` and `REDIS_URL` is set, use `RedisTokenImageCache`; else `LruTokenImageCache`.
- Add log line at startup indicating which cache backend is active

**Must NOT do**:
- Don't make Redis the default (must be explicit opt-in via env var)
- Don't change the in-memory LRU behavior
- Don't add cluster support

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES (with T16, T17)
- **Parallel Group**: Wave 4 (with T16, T17)
- **Blocks**: T19
- **Blocked By**: T13

**References**:
- **External (ioredis)**: https://github.com/redis/ioredis
- **LRU cache from T13**: file `apps/backend/src/chain/explorer/application/services/token-image.service.ts`
- **Env var pattern**: search `apps/backend/src/**/*.config.ts` or `process.env` usage in the codebase

**Acceptance Criteria**:
- [ ] `ioredis` added to dependencies
- [ ] Adapter file created
- [ ] Service reads env var at startup
- [ ] `npx tsc --noEmit` PASS
- [ ] `npm test` PASS

**QA Scenarios**:

```
Scenario: With TOKEN_IMAGE_REDIS_ENABLED=false, LRU cache is used
  Tool: Bash (start backend + curl)
  Preconditions: Backend stoppable/startable.
  Steps:
    1. cd apps/backend && npm run start:prod (or dev) WITHOUT setting TOKEN_IMAGE_REDIS_ENABLED
    2. Check startup log for "Using LRU cache" or similar
    3. curl twice to same proxy URL, verify 2nd is cached (faster)
  Expected Result: log shows LRU cache active; 2nd curl is cached
  Failure Indicators: Redis connection error on startup (means default is Redis)
  Evidence: .sisyphus/evidence/task-18-lru-default.log

Scenario: With TOKEN_IMAGE_REDIS_ENABLED=true, Redis is used (skipped if no Redis available)
  Tool: Bash (start with env)
  Preconditions: Local Redis available (or skip this scenario if Redis not installed).
  Steps:
    1. cd apps/backend && TOKEN_IMAGE_REDIS_ENABLED=true REDIS_URL=redis://localhost:6379 npm run start:prod
    2. Check startup log for "Using Redis cache" or similar
  Expected Result: log shows Redis active (if Redis available)
  Failure Indicators: connection refused, fallback to LRU without logging
  Evidence: .sisyphus/evidence/task-18-redis-active.log
```

#### Task 19 — Performance benchmark + Lighthouse audit

**What to do**:
- This is a READ-ONLY task. No code changes.
- Ensure backend + frontend running with ALL previous tasks deployed
- Use Playwright to navigate to http://localhost:5173/tokens, count `img[data-testid="token-image"]` elements, count how many src attributes point to provider CDN vs proxy vs data URI
- Calculate new coverage %: `(real_image_count / total_visible_rows) * 100`
- Run Lighthouse on http://localhost:5173/tokens with the same flags as T8
- Calculate Lighthouse score delta from baseline (T8)
- Save final metrics to `.sisyphus/evidence/task-19-final-benchmark.json`

**Must NOT do**:
- Don't modify any code
- Don't change Lighthouse flags from T8 (must be comparable)

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — needs to write Playwright + Lighthouse scripts
- **Skills**: [`playwright` skill — REQUIRED]

**Parallelization**:
- **Can Run In Parallel**: YES (no code dependencies)
- **Parallel Group**: Wave 4 (with T16, T17, T18 — but BENCHMARK must run LAST among Wave 4)
- **Blocks**: F1-F4 (final reviews)
- **Blocked By**: T11, T15, T16, T17, T18

**References**:
- **T8 baseline**: `.sisyphus/evidence/task-8-baseline.json` (read for comparison)
- **T8 lighthouse**: `.sisyphus/evidence/task-8-lighthouse.json`
- **Playwright skill**: `/playwright`
- **Lighthouse CLI**: same flags as T8

**Acceptance Criteria**:
- [ ] `.sisyphus/evidence/task-19-final-benchmark.json` exists
- [ ] JSON contains: `totalTokens`, `tokensWithImage`, `tokensWithPlaceholder`, `coveragePercent`, `lighthousePerformanceScore`, `lighthouseDeltaVsBaseline`, `proxyHitRate`, `timestamp`
- [ ] Coverage % is ≥90% (vs ~33% baseline)
- [ ] Lighthouse score delta is ≥+10 points OR final score ≥0.90

**QA Scenarios**:

```
Scenario: Coverage % is now ≥90%
  Tool: Playwright + Bash
  Preconditions: ALL Wave 1-3 deployed.
  Steps:
    1. Playwright: navigate to http://localhost:5173/tokens, wait for network idle
    2. Count rows with `img[data-testid="token-image"]`
    3. Count how many have src starting with `https://` or `data:image/` (vs `/assets/token-placeholder.svg`)
    4. Calculate coverage %
  Expected Result: ≥90% of visible rows show a real image (not placeholder)
  Failure Indicators: coverage still ~33% (means Wave 1/2 didn't take effect)
  Evidence: .sisyphus/evidence/task-19-coverage.json

Scenario: Lighthouse score improved vs baseline
  Tool: Bash (lighthouse)
  Preconditions: All Wave 1-3 deployed.
  Steps:
    1. lighthouse http://localhost:5173/tokens --output json --output-path .sisyphus/evidence/task-19-lighthouse.json --quiet --chrome-flags="--headless"
    2. jq '.categories.performance.score * 100' .sisyphus/evidence/task-19-lighthouse.json
    3. jq '.categories.performance.score * 100' .sisyphus/evidence/task-8-lighthouse.json (baseline)
    4. Calculate delta
  Expected Result: delta ≥+10 OR final score ≥90
  Failure Indicators: regression (delta < 0), or final score < 80
  Evidence: .sisyphus/evidence/task-19-lighthouse.json
```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + existing test suite. Review all changed files for: `as any` / `@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together). Test edge cases: tokens with no provider coverage, malformed addresses, network failures. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: 4 commits (one per wave), each task may be its own commit inside the wave
  - `feat(backend): extract image URLs from CoinGecko provider responses`
  - `feat(backend): extract image URLs from GeckoTerminal provider responses`
  - `feat(backend): extract image URLs from Moralis provider responses`
  - `feat(backend): extract image URLs from Helius provider responses`
  - `perf(backend): add Cache-Control headers to enrichment endpoint`
  - `perf(frontend): set staleTime on useSnapshot React Query hook`
  - `perf(frontend): add lazy loading and explicit dimensions to token images`
  - `chore: baseline image coverage verification`
- **Wave 2**: 3 commits
  - `feat(backend): add server-side identicon generator utility`
  - `feat(backend): append identicon fallback when no provider has image`
  - `feat(frontend): consume identicon fallback in DecisionRow`
- **Wave 3**: 4 commits
  - `feat(backend): add image proxy controller endpoint`
  - `feat(backend): add image proxy service with LRU cache`
  - `feat(backend): add image proxy fetcher with error handling`
  - `feat(frontend): wire frontend to use self-hosted image proxy`
- **Wave 4**: 4 commits
  - `feat(backend): add WebP transcoding to image proxy`
  - `feat(backend): invalidate image cache on enrichment update`
  - `feat(backend): add Redis cache adapter behind feature flag`
  - `chore: image loading performance benchmark`

---

## Success Criteria

### Verification Commands

```bash
# T1-T4: Verify provider fixes
curl -s localhost:3030/token/market-data/snapshots/ethereum/0x... | jq '.imageUrls | length'
# Expected: > 0 (was 0 before fix for providers that return empty arrays)

# T5: Cache headers present
curl -I localhost:3030/token/market-data/snapshots/solana/<address>
# Expected: Cache-Control: public, max-age=60, stale-while-revalidate=300

# T6: staleTime applied (verify in browser dev tools / verify via repeated curl is fast)
time curl -s localhost:3030/token/market-data/snapshots/solana/<address>
# Run twice; second should be faster or hit React Query cache

# T7: Lazy loading on images (verify in browser DevTools)
# Open localhost:5173/tokens, scroll, check Network tab for image requests

# T10-T11: Identicon fallback for tokens without coverage
curl -s localhost:3030/token/market-data/snapshots/<chain>/<address-with-no-coverage> | jq '.imageUrls'
# Expected: ["data:image/svg+xml;base64,..."] or ["/assets/identicon/..."]

# T12-T15: Image proxy works
curl -I localhost:3030/token/image/solana/<address>
# Expected: 200 OK, Content-Type: image/webp or image/png, Cache-Control: public, max-age=86400

# T16: WebP transcoding
curl -H "Accept: image/webp" localhost:3030/token/image/solana/<address> -o /tmp/test.webp
file /tmp/test.webp
# Expected: /tmp/test.webp: Web/P image

# T17: Cache invalidation
curl -I localhost:3030/token/image/solana/<address>
# Then trigger enrichment update
curl -X POST localhost:3030/admin/enrich/solana/<address>  # hypothetical
curl -I localhost:3030/token/image/solana/<address>
# Expected: 2nd response is MISS or fresh data

# T19: Lighthouse benchmark
lighthouse localhost:5173/tokens --output json --quiet | jq '.categories.performance.score'
# Expected: ≥0.90 (or 10+ points higher than T8 baseline)

# Final: All tests pass
cd apps/backend && npm test
cd apps/frontend && npm test
# Expected: 0 failures

# Final: TypeScript clean
cd apps/backend && npx tsc --noEmit
cd apps/frontend && npx tsc --noEmit
# Expected: 0 errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (search for forbidden patterns: `as any`, image upload UI code, admin endpoints)
- [ ] All 19 implementation tasks + 4 final tasks completed
- [ ] Evidence files exist in `.sisyphus/evidence/`
- [ ] No new TODOs/FIXMEs in committed code
- [ ] No scope creep beyond the 19 tasks defined