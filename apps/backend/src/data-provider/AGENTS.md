# data-provider/ — 13 External API Adapters

## OVERVIEW

Adapter pattern layer. Each external API (market data, RPC, security, trading) extends `DataProviderPort`. `DataProviderModule` is `@Global()` — import once in AppModule, inject any provider directly in any BC.

## STRUCTURE

| Category | Providers |
|----------|-----------|
| Market Data | `dexscreener`, `geckoterminal`, `birdeye`, `mobula`, `moralis`, `coingecko`, `coinmarketcap` |
| RPC / Blockchain | `alchemy` (EVM), `helius` (Solana), `fluxrpc`, `solana-rpc` |
| Security | `rugcheck` |
| Trading | `pumpdev` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a new provider | Copy `dexscreener/` as template; add module to `core/data-provider.module.ts` |
| Mock provider in tests | Use `forRoot(config)` with test config — each module accepts config in code |
| Configure API keys | `shared/common/config/app.config.ts` — env vars validated there, injected via config token |
| Add rate-limit awareness | Per-provider `README.md` (e.g., DexScreener 60 req/min, Birdeye 1 req/s, Helius 1M CU/month) |
| Find response shape | `{provider}/{provider}.types.ts` — request/response interfaces |
| Understand base contract | `core/data-provider.port.ts` — `DataProviderPort` abstract class |
| Global module wiring | `core/data-provider.module.ts` — imports/exports all 13 providers |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `DataProviderPort` | abstract class | `core/data-provider.port.ts` | Base: `name`, `logger`, `onModuleInit()` |
| `DataProviderModule` | class | `core/data-provider.module.ts` | `@Global()` — wires all 13 providers |
| `DEXSCREENER_CONFIG` | const | `dexscreener/dexscreener.config.ts` | Injection token |
| `HELIUS_CONFIG` | const | `helius/helius.config.ts` | Injection token |
| `BIRDEYE_CONFIG` | const | `birdeye/birdeye.config.ts` | Injection token |
| `ALCHEMY_CONFIG` | const | `alchemy/alchemy.config.ts` | Injection token |

## CONVENTIONS

**Per-provider directory layout** (mandatory):
```
{provider}/
├── {provider}.config.ts      # Injection token + config interface
├── {provider}.module.ts      # NestJS module with forRoot(config)
├── {provider}.service.ts     # Service extending DataProviderPort
├── {provider}.types.ts       # Request/response interfaces
├── index.ts                  # Barrel export
└── README.md                 # Provider docs (rate limits, endpoints)
```

**forRoot pattern**: Each module has `forRoot(config)` for tests + `forRootAsync()` that reads from AppConfig env vars. Tests pass config directly; production uses env-driven variant.

**name property**: Every service MUST declare `public abstract readonly name: string` (e.g., `'dexscreener'`, `'helius'`).

**Logger injection**: Each service MUST declare `protected abstract readonly logger: Logger` and use it for all logging.

## ANTI-PATTERNS

- **Never bypass DataProviderPort**: All providers must extend it. No standalone HTTP clients in provider layer.
- **Never add shared HttpService/HttpClient wrapper**: Use raw `axios` per provider. No shared HTTP infrastructure.
- **Never cache at provider layer**: Caching is consumer responsibility. Consumers (chain/explorer, chain/detection) implement short TTL (30-60s recommended per DexScreener README).
- **Never silently swallow errors without logging**: Return `null` on errors is OK per convention, but log the failure.

## UNIQUE STYLES

- **13-provider adapter pattern**: Each provider is isolated, follows identical layout, no shared HTTP wrapper.
- **Config as injection token**: Provider configs are NestJS injection tokens, not imported from AppConfig directly.
- **Raw axios**: No HttpService from `@nestjs/common`. Each service instantiates its own axios client.

## NOTES

- **forRoot dual-mode**: Use `forRoot(testConfig)` in tests, `forRootAsync()` in production (reads AppConfig env vars). Both coexist in same module.
- **Silent null returns**: Providers return `null` on 404, 429, timeout, network failure. No exceptions propagate. Consumers decide how to handle null (retry next provider, use cached, etc.).
- **Rate limits documented in READMEs**: Each provider's `README.md` has rate limits. No centralized rate limiter at provider layer.
- **Adding a new provider**: Copy `dexscreener/` layout, rename files, implement service, add module to `core/data-provider.module.ts`, add env validation to `app.config.ts`.