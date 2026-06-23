# Hexagonal Architecture (Ports & Adapters)

## Structure

Each Bounded Context follows a hexagonal (Ports & Adapters) layout:

```
                 [ API / CLI / Queue Consumer / Event Handler ]
                          |
                     (Adapters In)
                          |
                  ┌─────────────────┐
                  │   APPLICATION   │
                  │   (Use Cases)   │
                  └─────────────────┘
                          |
                   (Ports / Interfaces)
                          |
                  ┌─────────────────┐
                  │     DOMAIN      │
                  │  (Entities +    │
                  │   Rules)        │
                  └─────────────────┘
                          |
                   (Ports Out)
                          |
              [ DB / APIs / Brokers ]
```

## Dependency Direction

**All dependencies point inward:** Domain ← Application ← Infrastructure

## Ports (Interfaces)

Define contracts. Two types:

| Port Type | Direction | Purpose |
|-----------|-----------|---------|
| **Inbound** | → Application | What the system does (use cases) |
| **Outbound** | Domain ← | What the system needs (repositories, clients, probers) |

> En el core de SpyDefi, los puertos son `abstract class` (no `interface`) para ser tokens de DI de NestJS. Esto está fijado en [`08-file-structure.md`](08-file-structure.md) y en la convención §8 de cada README de BC.

## Adapters (Implementations)

| Adapter Type | Examples (SpyDefi core) |
|-------------|----------|
| **Inbound** | `telegram-ingestion.listener` (MTProto), `telegram-message.handler` (event consumer), NestJS controller para `AppController` |
| **Outbound** | `telegram-mtproto.adapter`, `dexscreener.client`, `geckoterminal.client`, `helius.client`, `in-memory-channel.repository`, `in-memory-call.repository` |

## Rules

- Domain has **zero dependencies** on frameworks (ni NestJS, ni TypeORM, ni axios, ni el cliente `telegram` MTProto).
- Application depends on domain, never on adapters.
- Adapters depend on ports (interfaces), not on concrete implementations.
- Swapping a DB, queue, or HTTP client should not change domain or application code.

## Ejemplo concreto del core: `token/market-data/enrichment`

```
HTTP REST (no tiene inbound — se activa por evento NormalizedCallExtracted)
        │
        ▼
[ EventHandler: enrichment.handler.ts ]              (Adapters In)
        │ dispara
        ▼
[ EnrichTokenCallUseCase ]                           (Application)
        │ usa
        ▼
[ TokenSnapshotRepository (abstract class) ]         (Port — Out)
[ MarketDataProvider (abstract class) ]              (Port — Out)
        ▲                                            (Domain no sabe quién implementa)
        │
[ InMemoryTokenSnapshotRepository ]                 (Adapters Out)
[ DexScreenerMarketDataProvider ]                    (Adapters Out)
[ GeckoTerminalMarketDataProvider ]                  (Adapters Out)
[ HeliusMarketDataProvider ]                         (Adapters Out)
```

Si mañana se cambia DexScreener por GoPlus, solo se sustituye el adapter; el dominio, el caso de uso y los handlers no se tocan.
