# GeckoTerminal — Data Provider

Provider de market data on-chain DEX a través de la API pública de GeckoTerminal (beta). Cubre 200+ redes blockchain, 1,500+ DEXes y 39M+ tokens.

---

## Visión

GeckoTerminal es un agregador DEX que trackea precios en tiempo real, volúmenes de trading, transacciones y liquidez a través de exchanges descentralizados. Desarrollado por el mismo equipo de CoinGecko.

Usado en el pipeline para enrichment de tokens con datos de holders, precio, volumen, market cap y FDV.

### Tipo de datos que ofrece

- **Token info**: precio USD, nombre, symbol, holders, top 10 holder %, GT score, FDV, market cap, volumen 24h, cambio % 24h
- **Pool data**: pools por token, top pools, trending pools, new pools
- **OHLCV**: datos de velas por pool (timeframes: minuto, hora, día)
- **Trades**: trades de las últimas 24h por pool
- **Networks/DEXes**: listado de redes y DEXes soportados
- **Search**: búsqueda de pools por query

## Plan (Beta gratuito)

| Límite | Valor |
|--------|-------|
| Costo | **$0 — sin API key** |
| Rate limit | **~10-30 calls/minuto** (fluctúa según tráfico) |
| Cache | **1 minuto** (server-side) |
| Freshness | **2-3 segundos** después de confirmación en blockchain |
| Endpoints | ~30 endpoints REST públicos |
| Cobertura | 200+ networks, 1,500+ DEXes, 39M+ tokens |
| Estado | **Beta** (cambios frecuentes, usar version header) |

> Para rate limits más altos y estables, los mismos datos on-chain están disponibles via CoinGecko API Pro (plan pago) con endpoints `/onchain/*`. [CoinGecko API Pricing](https://www.coingecko.com/en/api/pricing)

## API Reference

### Base URL

```
https://api.geckoterminal.com/api/v2
```

### Versioning

Se recomienda setear la versión via `Accept` header:
```
Accept: application/json;version=20230203
```

### Endpoint implementado en el servicio

| Método service | Endpoint | Descripción |
|----------------|----------|-------------|
| `getTokenInfo(networkSlug, address)` | `GET /networks/{network}/tokens/{address}/info` | Metadata del token (nombre, symbol, holders, precio, etc.) |

### Response type: Token Info

```typescript
{
  "data": {
    "id": "solana_So11111111111111111111111111111111111111112",
    "type": "token",
    "attributes": {
      "address": "So11111111111111111111111111111111111111112",
      "name": "Wrapped SOL",
      "symbol": "SOL",
      "total_supply": "100000000000000",
      "decimals": 9,
      "holders": { "count": 12345 },
      "top_10_percent_holders": "45.5",
      "gt_score": 8.5,
      "price_usd": "150.50",
      "fdv_usd": "15000000000",
      "market_cap_usd": "75000000000",
      "volume_usd": { "h24": "500000000" },
      "price_change_percentage": { "h24": "2.5" }
    }
  }
}
```

### Otros endpoints disponibles (no implementados en service)

| Endpoint | Descripción |
|----------|-------------|
| `GET /networks` | Lista de todas las networks soportadas |
| `GET /networks/{network}/tokens/{address}` | Token data por address |
| `GET /networks/{network}/tokens/multi/{addresses}` | Token data batch (comma-separated) |
| `GET /networks/{network}/tokens/{address}/pools` | Top pools por token |
| `GET /networks/trending_pools` | Trending pools globales |
| `GET /networks/{network}/trending_pools` | Trending pools por network |
| `GET /networks/new_pools` | New pools globales |
| `GET /networks/{network}/pools/{address}` | Pool data por address |
| `GET /networks/{network}/pools/{address}/ohlcv/{timeframe}` | OHLCV chart |
| `GET /networks/{network}/pools/{address}/trades` | Trades 24h |
| `GET /search/pools?q={query}` | Search pools |
| `GET /simple/networks/{network}/token_price/{addresses}` | Simple token price |
| `GET /tokens/info_recently_updated` | Recently updated tokens |

### Networks soportadas (slugs)

La API de GeckoTerminal usa slugs cortos para identificar networks. Ejemplos de los principales:

| Network | slug (network ID) | CoinGecko asset platform ID |
|---------|:-----------------:|:---------------------------:|
| Ethereum | `eth` | `ethereum` |
| BNB Chain | `bsc` | `binance-smart-chain` |
| Solana | `solana` | `solana` |
| Base | `base` | `base` |
| Arbitrum | `arbitrum` | `arbitrum-one` |
| Polygon POS | `polygon_pos` | `polygon-pos` |
| Avalanche | `avax` | `avalanche` |
| Optimism | `optimism` | `optimistic-ethereum` |
| Fantom | `ftm` | `fantom` |
| Cronos | `cro` | `cronos` |
| zkSync | `zksync` | `zksync` |
| Linea | `linea` | `linea` |
| Blast | `blast` | `blast` |
| Mantle | `mantle` | `mantle` |
| Scroll | `scroll` | `scroll` |
| Mode | `mode` | `mode` |
| Sui | `sui-network` | `sui` |
| Aptos | `aptos` | `aptos` |
| TON | `ton` | `the-open-network` |
| Starknet | `starknet-alpha` | `starknet` |

> El adapter resuelve el slug via `CHAIN_CATALOG` (chain registry) usando el campo `geckoTerminalSlug`, no tiene hardcoded mapping.

## Autenticación

- **API key**: No requerida (endpoints públicos)
- **Rate limit**: ~10-30 calls/minuto (puede fluctuar)
- **Version header**: Recomendado `Accept: application/json;version=20230203`
- **Base URL**: `https://api.geckoterminal.com/api/v2`

### Ejemplo curl

```bash
# Token info en Solana
curl -s 'https://api.geckoterminal.com/api/v2/networks/solana/tokens/So11111111111111111111111111111111111111112/info'

# Token info en Ethereum
curl -s 'https://api.geckoterminal.com/api/v2/networks/eth/tokens/0xdac17f958d2ee523a2206206994597c13d831ec7/info'

# Trending pools en Base
curl -s 'https://api.geckoterminal.com/api/v2/networks/base/trending_pools'

# Simple price (múltiples tokens)
curl -s 'https://api.geckoterminal.com/api/v2/simple/networks/eth/token_price/0xdac17f958d2ee523a2206206994597c13d831ec7,0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
```

## Rate limits

| Límite | Valor |
|--------|-------|
| Requests/min (público) | ~10-30 (fluctúa) |
| Con CoinGecko API paid | 250 req/min (25x más) |
| Cache | 1 minuto server-side |
| Tipo de limit | IP-based |

> El rate limit público es bajo. Para producción se recomienda cache agresivo o suscribirse a CoinGecko API Pro para acceder a los mismos endpoints via `/onchain/*` con 250 req/min.

### Estrategia para maximizar rate limit

1. **Cache agresivo**: los datos se actualizan cada 2-3 segundos pero el cache server-side es de 1 minuto
2. **Batch**: usar `/tokens/multi/{addresses}` en vez de calls individuales
3. **Priorizar**: GeckoTerminal como fuente secundaria, no primaria
4. **Fallback**: si rate limiteado, los mismos datos llegan via CoinGecko API Pro

## Manejo de errores

| HTTP | Significado | Acción |
|------|-------------|--------|
| 200 | OK | Response válido |
| 404 | Token no encontrado | Address inválido o token sin datos |
| 429 | Rate limit excedido | Esperar 2-6 segundos |
| 5xx | Error interno | Retry con backoff |

El servicio actual maneja:
- **404**: retorna `null` (no es error, es "no hay datos")
- **429/5xx/timeout**: retorna `null` y loggea en debug
- **Errores de red**: capturados, loggeados, retorna `null`

## Ejemplos de uso

### Uso básico

```typescript
import { GeckoTerminalService } from 'data-provider/geckoterminal';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Token info en Solana
const info = await gecko.getTokenInfo('solana', 'So11111111111111111111111111111111111111112');
if (info) {
  console.log(`${info.name} (${info.symbol})`);
  console.log(`  Price: $${info.priceUsd}`);
  console.log(`  Market Cap: $${info.marketCapUsd}`);
  console.log(`  Holders: ${info.holders}`);
  console.log(`  Top 10: ${info.top10HolderPercent}%`);
  console.log(`  GT Score: ${info.gtScore}`);
}

// 2. Token info en Ethereum
const ethInfo = await gecko.getTokenInfo('eth', '0xdac17f958d2ee523a2206206994597c13d831ec7');
```

### Uso en enrichment

```typescript
// GeckoTerminal como fuente secundaria de market data.
// Ideal para holders count y top 10 holder concentration.

async function enrichWithGeckoTerminal(address: string, slug: string) {
  const info = await gecko.getTokenInfo(slug, address);
  if (!info) return null;

  return {
    priceUsd: info.priceUsd,
    volume24hUsd: info.volumeUsdH24,
    marketCapUsd: info.marketCapUsd,
    fdvUsd: info.fdvUsd,
    holders: info.holders,
    top10HolderPercent: info.top10HolderPercent,
    priceChange24h: info.priceChangePercentH24,
    name: info.name,
    gtScore: info.gtScore,
  };
}
```

## Comparativa con otros providers

| Aspecto | GeckoTerminal | DexScreener | Birdeye | CoinGecko |
|---------|:-------------:|:-----------:|:-------:|:---------:|
| Costo | **$0** | $0 | $0 (30K CU) | Demo/Pro |
| API Key | ❌ No | ❌ No | ✅ Sí | ✅ Sí |
| Rate limit | 10-30/min | 60/min | 1/s | 10-50/min |
| Holders | ✅ Sí | ❌ No | ✅ Sí | ❌ No |
| Top 10 holder % | ✅ Sí | ❌ No | ❌ No | ❌ No |
| GT Score | ✅ Sí | ❌ No | ❌ No | ❌ No |
| Precio | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Liquidez | ❌ No | ✅ Sí | ✅ Sí | ❌ No |
| Cobertura chains | 200+ | 40+ | 14 | 100+ |
| DEXes | 1,500+ | 80+ | ~20 | N/A |
| OHLCV | ✅ Sí | ❌ No | ✅ Sí | ✅ Sí |
| Trades 24h | ✅ Sí | ❌ No | ❌ No | ❌ No |

## Diferencia con CoinGecko API

GeckoTerminal y CoinGecko son del mismo equipo pero APIs diferentes:

| Aspecto | GeckoTerminal API | CoinGecko API (/onchain) |
|---------|:-----------------:|:------------------------:|
| Rate limit | 10-30 req/min | 250+ req/min (paid) |
| Costo | Gratis | Demo gratis / Pro paga |
| Coverage | Misma data on-chain | Misma data on-chain |
| Endpoints | REST beta | REST + WebSocket + Webhooks |
| SLA | Sin SLA | Soporte empresarial |

> Estrategia: GeckoTerminal gratis para desarrollo/prototyping; CoinGecko Pro para producción con alta demanda.

## Referencias

- [GeckoTerminal API Docs (Swagger)](https://api.geckoterminal.com/docs/index.html)
- [GeckoTerminal API Guide](https://apiguide.geckoterminal.com/)
- [GeckoTerminal DEX API Page](https://www.geckoterminal.com/dex-api)
- [CoinGecko API Pricing (para rate limits superiores)](https://www.coingecko.com/en/api/pricing)
- [CoinGecko Onchain Endpoints](https://docs.coingecko.com/reference/endpoint-overview#onchain)
