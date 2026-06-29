---
slug: data-provider
status: approved
intent: clear
pending-action: execution
approach: Create a centralized data-provider layer at apps/backend/src/data-provider/ with 8 self-contained provider modules (coinmarketcap, alchemy, birdeye, fluxrpc, helius, moralis, mobula, pumpdev), each with a NestJS module + service + README.md, plus a top-level synthesis README.md. Existing adapters in chain/explorer are migrated into this new structure with backward-compatible re-exports.
---

# Draft: data-provider

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
| id | outcome | status | evidence path |
|----|---------|--------|---------------|
| F1-data-provider-dir | Directory structure apps/backend/src/data-provider/{coinmarketcap,alchemy,birdeye,...} | active | monorepo topology: apps/backend/src/ is the only src/ |
| F2-coinmarketcap | Module + service + README | active | .env.example:14 has COINMARKETCAP_API_KEY; no code usage found |
| F3-alchemy | Module + service + README | active | app.config.ts:43 has alchemy config; used in evm-chain-prober.adapter.ts |
| F4-birdeye | Module + service + README | active | birdeye.adapter.ts exists in chain/explorer/providers/ |
| F5-fluxrpc | Module + service + README | active | app.config.ts:45 has fluxrpc config (apiKey, rpcUrl, wsUrl); no code usage |
| F6-helius | Module + service + README | active | helius.adapter.ts + helius-das.adapter.ts exist |
| F7-moralis | Module + service + README | active | moralis.adapter.ts exists |
| F8-mobula | Module + service + README | active | mobula.adapter.ts exists |
| F9-pumpdev | Module + service + README | active | app.config.ts:56 has pumpdev config; no code usage |
| F10-synthesis-readme | Top-level src/data-provider/README.md | active | — |
| F11-backward-compat | Existing chain/explorer/providers/ adapters re-export from new location | active | chain-explorer.module.ts imports from old path |
| F12-app-config | app.config.ts may need updates for new provider config patterns | active | app.config.ts:177-359 |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|------------|----------------|-----------|-------------|
| Location of src/data-provider/ | apps/backend/src/data-provider/ (not root) | Monorepo has no root src/; backend src/ is the only NestJS codebase | Yes — easy to move if root src/ is wanted |
| Each provider = 1 NestJS module + 1 service | Self-contained module per provider | Matches NestJS conventions, tree-shakeable DI | Yes — can consolidate |
| README.md per provider + synthesis | Each documents endpoints, vision, data types | User explicitly requested it | Yes — content can change |
| Existing adapters migrate + re-export | Old path re-exports from new for backward compat | Avoids breaking existing BCs during migration | Yes — can remove re-exports after full migration |
| No new providers beyond the 8 listed | Only coinmarketcap, alchemy, birdeye, fluxrpc, helius, moralis, mobula, pumpdev | User specified exactly these 8 | Yes — can add more |

## Findings (cited - path:lines)

### Provider status in current codebase

| Provider | .env keys | Code exists? | Location |
|----------|-----------|-------------|----------|
| CoinMarketCap | COINMARKETCAP_API_KEY | ❌ No code usage | — |
| Alchemy | ALCHEMY_API_KEY | ⚠️ Partial — used in evm-chain-prober | apps/backend/src/chain/detection/infrastructure/probers/evm-chain-prober.adapter.ts |
| Birdeye | BIRDEYE_API_KEY | ✅ birdeye.adapter.ts | apps/backend/src/chain/explorer/infrastructure/providers/birdeye.adapter.ts |
| FluxRPC | FLUXRPC_API_KEY, RPC, WS | ❌ No code usage (only app.config.ts) | — |
| Helius | HELIUS_API_KEY + 8 URLs | ✅ helius.adapter.ts + helius-das.adapter.ts | apps/backend/src/chain/explorer/infrastructure/providers/ |
| Moralis | MORALIS_API_KEY | ✅ moralis.adapter.ts | apps/backend/src/chain/explorer/infrastructure/providers/moralis.adapter.ts |
| Mobula | MOBULA_API_KEY | ✅ mobula.adapter.ts | apps/backend/src/chain/explorer/infrastructure/providers/mobula.adapter.ts |
| PumpDev | PUMPDEV_API_KEY + wallets | ❌ No code usage (only app.config.ts) | — |

Additional providers NOT in user's list but in codebase: CoinGecko (adapter), DexScreener (adapter), GeckoTerminal (adapter), RugCheck (adapter).

### Current adapter pattern
- All extend `MarketDataProviderPort` (abstract class): `chain/explorer/domain/ports/market-data-provider.port.ts:48`
- Registered via DI in `ChainExplorerModule`: `chain-explorer.module.ts:70-94`
- Use `axios` directly, read config from `ConfigService`
- `MarketDataProviderPort` has `name: string` + `fetch(chain: ChainId, address: string): Promise<MarketData | null>`

### Config loading
- `app.config.ts:177-359` — all provider configs registered via `registerAs('app', ...)`
- Each provider section reads from `process.env` env vars

## Decisions (with rationale)

1. **Location: `apps/backend/src/data-provider/`** — Only `src/` in the monorepo is the backend's, and providers are backend concerns (HTTP/RPC clients to external APIs).
2. **Each provider = 1 NestJS module + 1 service class** — Self-contained for clean DI, tree-shakeable, easy to test. Each exposes a provider-specific service (not the generic `MarketDataProviderPort` interface) that wraps ALL endpoints of that provider.
3. **Existing adapters migrate in-place** — Their code moves from `chain/explorer/infrastructure/providers/` to `data-provider/<name>/`. The old location becomes a barrel re-export for backward compatibility, so no existing imports in chain-detection or enrichment break.
4. **Alchemy becomes its own provider module** — Currently baked into `evm-chain-prober.adapter.ts`; will be extracted into `data-provider/alchemy/` with a proper service exposing EVM RPC methods.
5. **CoinMarketCap, FluxRPC, PumpDev built from scratch** — No existing code; built using official docs researched per the user's requirement.
6. **README.md per provider documents: vision, endpoints, auth, data types** — As specified by the user.
7. **Top-level README.md synthesizes all 8 providers** — Comparison table, when to use each, chain support, cost model.

## Scope IN

- Create `apps/backend/src/data-provider/` with 8 subdirectories
- Each subdirectory: NestJS module + service class + types + README.md
- For Birdeye, Helius, Moralis, Mobula: migrate existing adapters
- For Alchemy: extract from evm-chain-prober into standalone module
- For CoinMarketCap, FluxRPC, PumpDev: build from scratch with official doc research
- Before writing each new provider: search official docs; notify user if not found
- Update `app.config.ts` if any new config keys are needed
- Create backward-compatible re-exports from old paths
- Top-level `data-provider/README.md` synthesis
- Provider-agnostic abstract port/interface in `data-provider/__core__/` for future providers

## Scope OUT (Must NOT have)

- Do NOT add providers beyond the 8 listed (no CoinGecko, DexScreener, GeckoTerminal, RugCheck extraction — those stay in chain/explorer)
- Do NOT change the `MarketDataProviderPort` interface in this plan (backward compat)
- Do NOT rewrite existing BC tests — only update import paths
- Do NOT change `.env` or `.env.example` structure — only update `app.config.ts` if config shape changes
- Do NOT implement GraphQL or gRPC wrappers — plain REST/RPC only
- Do NOT add caching, rate limiting, or retry logic (leave for a future plan)
- Do NOT create new test files for existing migrated adapters (they keep their existing tests)

## Open questions

1. **Where exactly does `src/data-provider/` live?** — I adopted `apps/backend/src/data-provider/` as default. Confirm or veto.
2. **Should existing `coingecko` adapter also be migrated into data-provider?** User didn't list it. I assumed no. Confirm or add.
3. **Should the new providers expose a generic port (like `MarketDataProviderPort`) or provider-specific interfaces?** I assumed provider-specific services + a new generic `DataProviderPort` in `__core__/`. Confirm.

## Approval gate
status: awaiting-approval
When exploration is exhausted and unknowns are answered, set status: ready-to-plan, write .omo/plans/data-provider.md, then wait for the user's explicit start.
