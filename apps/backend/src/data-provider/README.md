# Data Providers — Index

Capa de abstracción para fuentes de datos blockchain. 11 providers especializados que implementan `DataProviderPort` + 1 módulo core `@Global()`. Cada provider sigue la misma estructura: `config.ts`, `module.ts`, `service.ts`, `types.ts`, `index.ts` y `README.md`.

---

## Core

| Archivo | Descripción |
|---------|-------------|
| [`core/data-provider.port.ts`](core/README.md) | Clase abstracta base `DataProviderPort` con `name`, `logger`, `onModuleInit()` |
| [`core/data-provider.module.ts`](core/README.md) | Módulo `@Global()` que agrega y exporta los 11 providers |

---

## Market Data / Enrichment

Providers de precio, liquidez, volumen, holders y metadata para el pipeline de enrichment de tokens.

| Provider | README | Enfoque | Costo Free | Coverage |
|----------|--------|---------|:----------:|:--------:|
| **DexScreener** | [README](dexscreener/README.md) | Pairs cross-chain, search, profiles, boosts | **$0** (60 req/min) | 40+ chains, 80+ DEXes |
| **GeckoTerminal** | [README](geckoterminal/README.md) | Holders, top10%, GT score, precio, volumen | **$0** (~10-30 req/min) | 200+ networks, 1,500+ DEXes |
| **Birdeye** | [README](birdeye/README.md) | Token overview, price, trades, security | 30k CU/mes | 14 chains (Solana full) |
| **Mobula** | [README](mobula/README.md) | Concentration metrics, bonding curve, factory | 60 req/min | 6 chains |
| **Moralis** | [README](moralis/README.md) | Token analytics, holders, price, wallet balances | 40k CU/día | 5 EVM chains |
| **CoinGecko** | [README](coingecko/README.md) | Price, MC, FDV (fallback blue chips) | 10k créditos/mes | 100+ asset platforms |
| **CoinMarketCap** | [README](coinmarketcap/README.md) | Quotes, metadata, listings, global metrics | 20k créditos/mes | Chain-agnostic |

## RPC / Blockchain Data

Providers de acceso directo a blockchain (JSON-RPC, DAS API, transacciones parseadas).

| Provider | README | Enfoque | Costo Free | Coverage |
|----------|--------|---------|:----------:|:--------:|
| **Alchemy** | [README](alchemy/README.md) | JSON-RPC EVM, token balances, logs, tx receipts | 30M CU/mes | 80+ chains |
| **Helius** | [README](helius/README.md) | Solana RPC + DAS API + Enhanced Transactions | 1M CU/mes | Solana |
| **FluxRPC** | [README](fluxrpc/README.md) | Solana JSON-RPC HTTP/3 + QUIC | Por byte | Solana |

## Trading / Execution

Providers para ejecución de trades en DEXes.

| Provider | README | Enfoque | Costo | Coverage |
|----------|--------|---------|:-----:|:--------:|
| **PumpDev** | [README](pumpdev/README.md) | Pump.fun trading, token creation, Jito bundles | Comisión 0.25% | Solana (pump.fun) |

---

## Arquitectura

```
data-provider/
├── README.md                    ← Este archivo (índice general)
├── core/                        ← Abstract base + global module
│   ├── data-provider.port.ts
│   ├── data-provider.module.ts
│   ├── index.ts
│   └── README.md
│
├── dexscreener/                 ← Market data (patrón canónico)
├── geckoterminal/               ← Market data (holders, GT score)
├── birdeye/                     ← Market data (Solana)
├── coingecko/                   ← Market data (fallback blue chips)
├── mobula/                      ← Concentration metrics
├── moralis/                     ← EVM analytics
├── coinmarketcap/               ← Reference prices
├── alchemy/                     ← EVM RPC
├── helius/                      ← Solana RPC + DAS
├── solana-rpc/                  ← Solana JSON-RPC holders + probing
├── rugcheck/                    ← Token safety (locked LP, burned %)
├── fluxrpc/                     ← Solana RPC
├── pumpdev/                     ← Pump.fun trading
│
└── {provider}/                  ← Cada provider contiene:
    ├── {provider}.config.ts         Token de inyección + interfaz
    ├── {provider}.module.ts         Módulo NestJS con forRoot()
    ├── {provider}.service.ts        Servicio que extiende DataProviderPort
    ├── {provider}.types.ts          Interfaces de request/response
    ├── index.ts                     Barrel export
    └── README.md                    Documentación del provider
```

## Capas de integración

Los providers son consumidos desde `src/chain/` a través de adapters:

```
chain/explorer/infrastructure/providers/
├── dexscreener.adapter.ts      → DexScreenerService      ✅
├── geckoterminal.adapter.ts    → GeckoTerminalService    ✅
├── birdeye.adapter.ts           → BirdeyeService          ✅
├── helius.adapter.ts            → HeliusService           ✅
├── coingecko.adapter.ts         → CoinGeckoService        ✅
├── mobula.adapter.ts            → MobulaService           ⏳ (no registrado)
├── moralis.adapter.ts           → MoralisService          ⏳ (no registrado)
├── rugcheck.adapter.ts          → raw axios               (no tiene service)
├── solana-rpc.adapter.ts        → raw axios               (no tiene service)
├── coingecko.adapter.ts         → CoinGeckoService        ✅
└── .../

chain/detection/infrastructure/probers/
├── evm-chain-prober.adapter.ts  → AlchemyService          ✅
└── solana-chain-prober.adapter.ts → JsonRpcClient directo ❌
```

---

## Mapa de decisión

```
¿Necesito pares DEX cross-chain?
├── Sí → DexScreener (gratis, 40+ chains)

¿Necesito holders / top10%?
├── EVM → Moralis (total + top10%)
├── Solana → GeckoTerminal (200+ networks) o Helius (DAS)

¿Necesito concentration metrics (insiders, bundlers, dev)?
├── Sí → Mobula (único provider)

¿Necesito precio rápido?
├── DexScreener (gratis, cross-chain)
├── GeckoTerminal (gratis, 200+ networks)
├── Birdeye (3 CU, 14 chains)
├── CoinMarketCap (1 crédito, reference price)
├── CoinGecko (fallback blue chips)

¿Necesito RPC (balance, tx, logs)?
├── EVM → Alchemy (30M CU/mes gratis)
├── Solana → Helius (1M CU/mes gratis) o FluxRPC (HTTP/3)

¿Necesito trading en pump.fun?
├── Sí → PumpDev

¿Necesito seguridad del token (honeypot, rug)?
├── Birdeye token_security (Solana)
├── RugCheck (Solana, mock actualmente)
```

---

## Uso

```typescript
import { DataProviderModule } from 'data-provider/core/data-provider.module';

// Solo importar DataProviderModule una vez en AppModule (es @Global).
// Luego inyectar cualquier servicio directamente:

@Injectable()
export class SomeService {
  constructor(
    private readonly dex: DexScreenerService,
    private readonly gecko: GeckoTerminalService,
    private readonly helius: HeliusService,
  ) {}
}
```

---

## Cómo agregar un nuevo provider

1. Crear carpeta `data-provider/{name}/`
2. Seguir el patrón canónico de [`dexscreener/`](dexscreener/README.md):
   - `{name}.config.ts` — token de inyección + interfaz de config
   - `{name}.types.ts` — interfaces de request/response (con `readonly`)
   - `{name}.service.ts` — clase que extiende `DataProviderPort`
   - `{name}.module.ts` — módulo NestJS con `forRoot()`
   - `index.ts` — barrel export
   - `README.md` — documentación (usar las existentes como referencia)
3. Agregar el módulo a `core/data-provider.module.ts` (imports + exports)
4. Si tiene adapter en `chain/`, refactorizarlo para inyectar el service
5. Verificar con `tsc --noEmit`

Ver el plan de refactor en [`.omo/plans/data-provider-refactor.md`](../../../../.omo/plans/data-provider-refactor.md).

---

## Proveedores por tipo de dato

| Dato | Proveedores |
|------|-------------|
| **Precio USD** | DexScreener, GeckoTerminal, Birdeye, Mobula, Moralis, CoinGecko, CoinMarketCap |
| **Liquidez USD** | DexScreener, Birdeye |
| **Volumen 24h** | DexScreener, GeckoTerminal, Birdeye, CoinGecko, CoinMarketCap |
| **Market Cap / FDV** | GeckoTerminal, CoinGecko, CoinMarketCap |
| **Holders** | GeckoTerminal, Birdeye, Moralis, Helius |
| **Top 10 Holder %** | GeckoTerminal, Moralis |
| **Price Change %** | GeckoTerminal, Birdeye, CoinGecko, CoinMarketCap |
| **Insiders / Bundlers / Dev %** | Mobula |
| **Locked Liquidity / Burned %** | RugCheck |
| **GT Score** | GeckoTerminal |
| **Balance (RPC)** | Alchemy, Helius, FluxRPC |
| **Transaction data** | Alchemy, Helius, FluxRPC |
| **Token metadata** | Moralis, CoinMarketCap |
| **Pairs / DEX data** | DexScreener, Birdeye |
| **Token profiles / news** | DexScreener, CoinMarketCap |
| **Global metrics** | CoinMarketCap |
| **Trading execution** | PumpDev |

---

## Proveedores por blockchain

| Blockchain | Market Data | RPC | Trading |
|-----------|-------------|:---:|:-------:|
| **Ethereum** | DexScreener, GeckoTerminal, Moralis, CoinGecko, CoinMarketCap | Alchemy | — |
| **BNB Chain** | DexScreener, GeckoTerminal, Moralis, CoinGecko, CoinMarketCap | Alchemy | — |
| **Solana** | DexScreener, GeckoTerminal, Birdeye, CoinGecko, CoinMarketCap | Helius, FluxRPC | PumpDev |
| **Base** | DexScreener, GeckoTerminal, CoinGecko, CoinMarketCap | Alchemy | — |
| **Arbitrum** | DexScreener, GeckoTerminal, Moralis, CoinGecko, CoinMarketCap | Alchemy | — |
| **Polygon** | DexScreener, GeckoTerminal, Moralis, CoinGecko, CoinMarketCap | Alchemy | — |
| **Avalanche** | DexScreener, GeckoTerminal, CoinGecko, CoinMarketCap | Alchemy | — |
| **Optimism** | DexScreener, GeckoTerminal, CoinGecko, CoinMarketCap | Alchemy | — |
| **Otras 40+** | DexScreener, GeckoTerminal | — | — |
