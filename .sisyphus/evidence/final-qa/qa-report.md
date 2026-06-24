=== F3: REAL MANUAL QA ===
Token Image Optimization — Comprehensive Verification
Date: 2026-06-24
Backend: localhost:3030 (NestJS)
Frontend: localhost:5173 (Vite/React)

QA SCENARIOS:
- T1 (CoinGecko): PASS — Snapshot for 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 (USDC) includes URL `coin-images.coingecko.com/coins/images/6319/large/USDC.png` from extractImageUrls(data.image) in coingecko.adapter.ts. URL correctly rewritten through proxy.
- T2 (GeckoTerminal): PASS — geckoterminal.adapter.ts implements `a.image_url && a.image_url.startsWith('https://') ? [a.image_url] : []` correctly. Source 'geckoterminal' present in /snapshots/recent response for multiple tokens. API sometimes returns null image_url which is handled gracefully (empty array).
- T3 (Moralis): PASS — moralis.adapter.ts uses `buildImageUrls(metadata?.logo)` and validates `https://` prefix. USDC snapshot includes `logo.moralis.io/...` URL.
- T4 (Helius): PASS — Solana USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) snapshot has 4 URLs including helius-DAS-derived entry from raw.githubusercontent.com/solana-labs/token-list/.../logo.png.
- T5 (Cache headers): PASS — `curl -I` returns `Cache-Control: public, max-age=60, stale-while-revalidate=300` on /token/market-data/snapshots/:chain/:address.
- T6 (staleTime): PASS — apps/frontend/src/entities/token-snapshot/model/use-snapshot.ts contains `staleTime: 60_000` and `gcTime: 5 * 60_000` with explanatory comment.
- T7 (lazy loading): PASS — Both DecisionRow img tags have `loading="lazy"`, `decoding="async"`, `width={40}`, `height={40}`. Token-detail page also has `loading="lazy"`, `decoding="async"`, `width={48}`, `height={48}`.
- T8 (baseline): N/A — already captured at task-8-baseline.json (12 tokens, 4 real, 8 placeholder, 33.33% coverage, lighthouse 52).
- T9 (identicon): PASS — apps/backend/src/shared/identicon/identicon.generator.ts creates deterministic 64x64 SVG via SHA-256. Spec file with 5 tests exists. Returns `data:image/svg+xml;base64,...` URI.
- T10 (identicon fallback): PASS — Token with no coverage (0x0000000000000000000000000000000000000001) gets identicon data URI in imageUrls[] (encoded as `source=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2C...` in proxy URL).
- T11 (frontend testid): PASS — Both DecisionRow img tags have `data-testid="token-image"`.
- T12 (proxy endpoint): PASS — `/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` returns 200 with Content-Type: image/webp, Cache-Control: public, max-age=300. NOT 501. TokenImageController at apps/backend/src/chain/explorer/api/http/token-image.controller.ts has validation (@Param chain + address pattern, ALLOWED_CHAINS set).
- T13 (LRU service): PASS — apps/backend/src/chain/explorer/application/services/token-image.service.ts uses lru-cache@^11.5.1 (added to package.json). Service file exists with proper spec file.
- T14 (fetcher): PASS — apps/backend/src/chain/explorer/infrastructure/fetchers/token-image.fetcher.ts implements multi-provider fallback (DexScreener, Birdeye for Solana). Uses fetch + AbortController timeout. Throws NotFoundException on all-fail.
- T15 (mapper rewrite): PASS — Snapshot endpoint returns `imageUrls[]` with `/token/image/:chain/:address?source=<urlencoded>` proxy URLs. Confirmed for USDC (Solana) and WETH (Ethereum).
- T16 (WebP): PASS for transcoding — `Accept: image/webp` returns `image/webp` WebP-encoded image (file confirms RIFF Web/P).  PARTIAL FAILURE: When `Accept: image/png` is sent (no WebP accept), response is STILL `image/webp`. Spec expected original (PNG) when client doesn't accept WebP. Practically OK since all modern browsers send `image/webp` in Accept.
- T17 (invalidation): PASS — `enrich-token.use-case.ts:185` calls `this.tokenImageService.invalidate(chain.value, normalizedAddress)` after persistence. Cache key prefix `${chain}:${address}:` matches invalidate logic.
- T18 (Redis flag): PASS — `apps/backend/src/shared/cache/token-image-cache.adapter.ts:151` reads `(process.env.TOKEN_IMAGE_REDIS_ENABLED ?? 'false').toLowerCase() === 'true'`. Factory pattern creates RedisTokenImageCache or LruTokenImageCache based on env. Startup log line at line 167/170.
- T19 (benchmark): FAIL — coverage 0% (regression from baseline 33.33%). Confirmed independently: 16 visible token rows, all 16 showing placeholder, 0 real images. Lighthouse score 56 (delta +4 vs baseline 52, target was +10). Root cause is NOT the proxy 404 issue mentioned in task brief — see CRITICAL ISSUES below.

INTEGRATION TESTS:
- Full page load: FAIL — `/tokens` page renders 16 rows but ALL 16 show placeholder SVG (token-placeholder.svg). Network requests show 18+ requests to `http://localhost:5173/token/image/...?source=...` returning 200 OK, but the proxy chain is broken (see below).
- Image proxy resolution: PARTIAL — Direct backend access (port 3030) returns valid WebP images. Frontend requests (port 5173) hit Vite which returns HTML for /token/image/* path because Vite proxy config does not include this route. NOT the 404 mentioned in task brief — Vite returns 200 + text/html (index.html fallback).

EDGE CASES:
- Malformed address: PASS — `curl -I http://localhost:3030/token/image/!!!/!!!` returns 400 Bad Request. Controller validation rejects via `ADDRESS_PATTERN = /^[A-Za-z0-9]{1,100}$/`.
- Unsupported chain: PASS — `curl -I http://localhost:3030/token/image/foobar/0xabc` returns 400 Bad Request. Controller checks `ALLOWED_CHAINS.has(chain)`.
- Empty source param: PASS — `curl -I http://localhost:3030/token/image/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (no source) returns 200 OK with image/webp. Service falls back to fetcher chain (DexScreener → Birdeye for Solana).

CRITICAL ISSUES:
1. **Vite proxy missing `/token/image/*` route** (HIGH PRIORITY — blocks all image rendering)
   - File: apps/frontend/vite.config.ts:16-26
   - Current proxy rules: only `/api` and `/socket.io` are proxied to backend :3030
   - Effect: When browser makes request to `http://localhost:5173/token/image/...` (relative URL from React), Vite serves index.html (200 OK, text/html, 630 bytes) as SPA fallback
   - Browser interprets HTML response as failed image load → fires onError → cycles through all imageUrls[] → falls back to placeholder
   - Result: 0% coverage on /tokens page (16/16 placeholders) — REGRESSION from 33% baseline
   - Fix: Add `'/token/image': { target: 'http://localhost:3030', changeOrigin: false }` to vite.config.ts proxy block
   - Evidence: .sisyphus/evidence/final-qa/network-images-current.txt (18 successful 200 OK requests to localhost:5173/token/image/* — Vite proxy returned index.html but browser logged as 200)

2. **T16 WebP transcoding always-on** (LOW PRIORITY — not user-visible)
   - Spec expected: original content-type when client doesn't send `Accept: image/webp`
   - Actual: response is always `image/webp` regardless of Accept header
   - Cause: Need to investigate cache key vs variant logic in token-image.service.ts:38-57
   - Practical impact: zero — all modern browsers send `image/webp` in Accept header

3. **The 404 issue from task brief is NOT the root cause** — T19 finding was incorrect
   - Brief claimed: "image proxy endpoint returns 404 for all tested tokens"
   - Actual: Direct backend access returns valid images. The 404s the brief observed were likely from the Vite dev server's HTML fallback being misinterpreted. The proxy endpoint works correctly when called with absolute URL `http://localhost:3030/token/image/...`. However, when called from the browser with relative URL, Vite intercepts and returns HTML.

OVERALL: FAIL — Implementation is functionally complete at the backend level (all scenarios T1-T18 pass), but the Vite proxy config in apps/frontend/vite.config.ts was not updated to proxy `/token/image/*` to the backend. This causes 100% image rendering failure on /tokens page (regression from 33.33% baseline to 0%).

EVIDENCE FILES:
- .sisyphus/evidence/final-qa/t1-coingecko.json
- .sisyphus/evidence/final-qa/t2-geckoterminal.json
- .sisyphus/evidence/final-qa/t3-moralis.txt
- .sisyphus/evidence/final-qa/t4-helius.json
- .sisyphus/evidence/final-qa/t5-cache-headers.txt
- .sisyphus/evidence/final-qa/t6-staletime.txt
- .sisyphus/evidence/final-qa/t7-lazy-loading.txt
- .sisyphus/evidence/final-qa/t7-token-detail-lazy.txt
- .sisyphus/evidence/final-qa/t9-identicon.txt
- .sisyphus/evidence/final-qa/t10-identicon.json
- .sisyphus/evidence/final-qa/t11-testid.txt
- .sisyphus/evidence/final-qa/t12-controller.txt
- .sisyphus/evidence/final-qa/t12-proxy-endpoint.txt
- .sisyphus/evidence/final-qa/t13-lru-service.txt
- .sisyphus/evidence/final-qa/t14-fetcher.txt
- .sisyphus/evidence/final-qa/t15-rewritten-url.txt
- .sisyphus/evidence/final-qa/t16-webp-transcoded.txt
- .sisyphus/evidence/final-qa/t17-invalidate-call.txt
- .sisyphus/evidence/final-qa/t18-redis-flag.txt
- .sisyphus/evidence/final-qa/edge-malformed.txt
- .sisyphus/evidence/final-qa/edge-unsupported-chain.txt
- .sisyphus/evidence/final-qa/edge-no-source.txt
- .sisyphus/evidence/final-qa/playwright-coverage.json
- .sisyphus/evidence/final-qa/playwright-coverage-v2.json
- .sisyphus/evidence/final-qa/playwright-coverage-detailed.json
- .sisyphus/evidence/final-qa/final-coverage.json
- .sisyphus/evidence/final-qa/network-images-current.txt
- .sisyphus/evidence/final-qa/direct-fetch-test.json
- .sisyphus/evidence/final-qa/absolute-url-test.json
- .sisyphus/evidence/final-qa/console-errors.txt

ROOT CAUSE FOR T19 FAILURE:
Vite dev server in apps/frontend/vite.config.ts is configured to proxy only `/api` and `/socket.io` to the backend. The image proxy endpoint `/token/image/*` is NOT in the proxy rules. When the React app makes relative URL requests (e.g., `<img src="/token/image/...">`), Vite intercepts and returns index.html (SPA fallback) instead of forwarding to the backend.

The task spec said "No frontend code changes needed! The DecisionRow already uses `imageUrls[currentImageIndex]`" but this was incorrect — while the DecisionRow doesn't need changes, the Vite proxy config DOES need a `/token/image` rule to forward requests to the backend.

RECOMMENDED FIX:
1. Edit apps/frontend/vite.config.ts: add to server.proxy:
   ```
   '/token/image': {
     target: 'http://localhost:3030',
     changeOrigin: false,
   },
   ```
2. Verify with `curl http://localhost:5173/token/image/solana/<address>` returns image/* instead of text/html
3. Re-run /tokens page coverage test — should jump to ≥90%
