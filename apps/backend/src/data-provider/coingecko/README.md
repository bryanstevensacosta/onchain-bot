# CoinGecko — Data Provider

Provider de market data cripto a través de la API oficial de CoinGecko (v3). Fuente autoritativa para precios, market cap, FDV, volumen y cambio % de tokens ya listados.

---

## Visión

CoinGecko es el agregador de data cripto más grande del mundo (independiente). Cubre 18,000+ coins, 1,500+ exchanges, 600+ categorías. También incluye datos on-chain DEX vía GeckoTerminal (200+ networks, 1,500+ DEXes, 39M+ tokens).

Usado en el pipeline como **fallback** de precio/MC/FDV cuando DexScreener, GeckoTerminal, Mobula y Birdeye no tienen datos. CoinGecko indexa tokens establecidos más rápido que los agregadores para blue chips, pero laggea detrás de launches nuevos.

### Tipo de datos que ofrece (vía `getTokenContractInfo`)

- **Precio USD**: `current_price.usd`
- **Market Cap USD**: `market_cap.usd`
- **FDV USD**: `fully_diluted_valuation.usd`
- **Volumen 24h USD**: `total_volume.usd`
- **Cambio % 24h**: `price_change_percentage_24h`
- **Imágenes**: `image.thumb`, `image.small`, `image.large`

No retorna liquidityUsd, holders ni metadata del token — es un provider de precio únicamente.

## Plan actual (Demo — free)

| Límite | Demo (keyless) | Demo (API key) | Pro (Startup $79/mes) |
|--------|:--------------:|:--------------:|:---------------------:|
| Rate limit | ~10-30 req/min | 50 req/min | 250+ req/min |
| Créditos/mes | 10,000 | 10,000 | 200,000+ |
| Endpoints | Limitados | Limitados | 80+ endpoints |
| Cache (precios) | 60s | 60s | 20s |
| Cache (metadata) | 30min | 5min | 5min |
| WebSocket | ❌ | ❌ | ✅ |
| Webhooks | ❌ | ❌ | ✅ |

> El plan Demo permite prototyping. Para producción se recomienda plan Pro (Startup desde $79/mes).

## API Reference

### Base URL

```
https://api.coingecko.com/api/v3
```

### Endpoint implementado en el servicio

| Método service | Endpoint | Descripción |
|----------------|----------|-------------|
| `getTokenContractInfo(platform, address)` | `GET /coins/{platform}/contract/{contract_address}` | Token info por platform + contract address |

### Response type: CoinGeckoResponse

```json
{
  "id": "wrapped-solana",
  "symbol": "sol",
  "name": "Wrapped Solana",
  "image": {
    "thumb": "https://coin-images.coingecko.com/coins/images/22829/thumb/SOL_1.png",
    "small": "https://coin-images.coingecko.com/coins/images/22829/small/SOL_1.png",
    "large": "https://coin-images.coingecko.com/coins/images/22829/large/SOL_1.png"
  },
  "market_data": {
    "current_price": { "usd": 150.50 },
    "market_cap": { "usd": 75000000000 },
    "fully_diluted_valuation": { "usd": 15000000000 },
    "total_volume": { "usd": 500000000 },
    "price_change_percentage_24h": 2.5
  }
}
```

### Platform IDs (asset platforms)

CoinGecko usa IDs específicos para cada blockchain. El adapter mantiene un `PLATFORM_MAP` que traduce los `ChainId` del sistema a estos IDs:

| Chain | CoinGecko Platform ID |
|-------|:---------------------:|
| Ethereum | `ethereum` |
| BNB Chain | `binance-smart-chain` |
| Solana | `solana` |
| Base | `base` |
| Arbitrum | `arbitrum-one` |
| Polygon | `polygon-pos` |

> La lista completa de platforms se obtiene de `/asset_platforms`. GeckoTerminal también expone `coingecko_asset_platform_id` en su response de networks.

### Otros endpoints disponibles (no implementados en service)

| Endpoint | Descripción | Créditos |
|----------|-------------|:--------:|
| `GET /simple/price` | Precio simple de 1+ coins | 1 |
| `GET /simple/token_price/{id}` | Precio por contract address | 1 |
| `GET /coins/list` | Lista de todos los coins con ID | 0 |
| `GET /coins/markets` | Market data de múltiples coins | 1 |
| `GET /coins/{id}` | Metadata completa de un coin | 1 |
| `GET /coins/{id}/market_chart` | Chart histórico | 1 |
| `GET /coins/{id}/market_chart/range` | Chart en rango | 1 |
| `GET /coins/{id}/contract/{address}/market_chart` | Chart por contract address | 1 |
| `GET /search/trending` | Trending coins | 1 |
| `GET /global` | Global market metrics | 1 |
| `GET /key` | API key info (plan, usage) | 1 |
| `GET /asset_platforms` | Lista de platforms soportadas | 0 |
| `GET /onchain/*` | Onchain DEX data (GeckoTerminal via Pro API) | Varía |

## Autenticación

### Demo API (gratis, con key)

```
Header: x-cg-demo-api-key: YOUR_DEMO_KEY
```

### Pro API (planes pagos)

```
Header: x-cg-pro-api-key: YOUR_PRO_KEY
```

### Keyless (muy limitado)

Sin header — solo endpoints muy básicos, rate limit ~10-30 req/min.

### Ejemplo curl

```bash
# Demo API — Wrapped SOL en Solana
curl -s --request GET \
  --url 'https://api.coingecko.com/api/v3/coins/solana/contract/So11111111111111111111111111111111111111112' \
  --header 'x-cg-demo-api-key: YOUR_DEMO_KEY'

# Demo API — USDT en Ethereum
curl -s --request GET \
  --url 'https://api.coingecko.com/api/v3/coins/ethereum/contract/0xdac17f958d2ee523a2206206994597c13d831ec7' \
  --header 'x-cg-demo-api-key: YOUR_DEMO_KEY'
```

## Rate limits y créditos

### Demo plan (gratis)

| Límite | Valor |
|--------|-------|
| Rate limit | 50 calls/minuto |
| Créditos mensuales | 10,000 |
| Cache precios | 60 segundos |
| Cache metadata | 5 minutos (con key) / 30 minutos (keyless) |

### Pro plans

| Plan | Precio | Créditos/mes | Rate limit | Endpoints |
|------|:------:|:------------:|:----------:|:---------:|
| **Startup** | $79/mes | 200,000 | 250/min | Full |
| **Lite** | $149/mes | 400,000 | 500/min | Full + WebSocket |
| **Pro** | $299/mes | 800,000 | 1,000/min | Full + WebSocket + Webhooks |
| **Enterprise** | Custom | Custom | Custom | Todo |

### Cálculo de créditos

- Cada response 200 = 1 crédito
- Errores 4xx/5xx cuentan para el rate limit pero NO consumen créditos
- Créditos se resetean mensualmente

## Manejo de errores

| HTTP | Código | Significado | Acción |
|------|:------:|-------------|--------|
| 200 | — | OK | Response válido |
| 401 | — | API key inválida | Verificar `.env` |
| 403 | — | Endpoint no disponible en tu plan | Revisar plan |
| 404 | — | Token/platform no encontrado | Address/platform inválido |
| 429 | — | Rate limit / créditos excedido | Retry con backoff |
| 5xx | — | Error interno | Retry con backoff |

El servicio actual maneja:
- **Sin API key**: retorna `null` con warn en constructor
- **404**: retorna `null` (token no listado en CoinGecko)
- **429/5xx/timeout**: retorna `null` y loggea en debug
- **Price+MC nulos**: retorna `null` (no hay data útil)

## CoinGecko vs otros providers

| Aspecto | CoinGecko | DexScreener | GeckoTerminal | Birdeye |
|---------|:---------:|:-----------:|:-------------:|:-------:|
| Costo | Demo/Pro | $0 | $0 | $0 (30K CU) |
| Blue chips | ✅ Mejor | ⚠️ A veces falta | ⚠️ A veces falta | ⚠️ A veces falta |
| Fresh launches | ❌ Lags | ✅ Mejor | ✅ Mejor | ✅ Mejor |
| Holders | ❌ No | ❌ No | ✅ Sí | ✅ Sí |
| Historical data | ✅ 12 años | ❌ No | ✅ OHLCV | ✅ Sí |
| Rate limit (free) | 50/min | 60/min | 10-30/min | 1/s |
| Imágenes token | ✅ Sí | ⚠️ Limitado | ❌ No | ✅ Sí |

### Posición en el pipeline

CoinGecko es **fallback de último recurso** para precio/MC/FDV:

```
1. DexScreener  → precio, liquidez, volumen (gratis, cross-chain, 60 req/min)
2. Birdeye      → precio, holders, seguridad (solo Solana, 30K CU)
3. GeckoTerminal → holders, top10%, GT score (gratis, 10-30 req/min)
4. Mobula       → precio, market data multicadena (API key)
5. Moralis      → precio, metadata EVM (API key)
6. CoinGecko    → precio, MC, FDV (FALLBACK — solo blue chips)
```

## Ejemplos de uso

### Uso básico

```typescript
import { CoinGeckoService } from 'data-provider/coingecko';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Precio de Wrapped SOL en Solana
const info = await coingecko.getTokenContractInfo('solana', 'So11111111111111111111111111111111111111112');
if (info) {
  console.log(`Price: $${info.priceUsd}`);
  console.log(`Market Cap: $${info.marketCapUsd}`);
  console.log(`FDV: $${info.fdvUsd}`);
  console.log(`Volume 24h: $${info.volumeUsdH24}`);
  console.log(`Change 24h: ${info.priceChangePercent24h}%`);
  console.log(`Images: ${info.imageUrls.join(', ')}`);
}

// 2. Precio de USDT en Ethereum
const usdt = await coingecko.getTokenContractInfo('ethereum', '0xdac17f958d2ee523a2206206994597c13d831ec7');
```

### Uso como fallback

```typescript
// CoinGecko solo se llama si todos los otros providers fallaron.

async function getPriceWithFallback(address: string, chain: string) {
  const platform = PLATFORM_MAP[chain];
  if (!platform) return null;

  // Solo gastar crédito de CoinGecko si es necesario
  const info = await coingecko.getTokenContractInfo(platform, address);
  if (!info || info.priceUsd === null) return null;

  return {
    priceUsd: info.priceUsd,
    marketCapUsd: info.marketCapUsd,
    fdvUsd: info.fdvUsd,
    volume24hUsd: info.volumeUsdH24,
    priceChange24h: info.priceChangePercent24h,
  };
}
```

## Plans y facturación

CoinGecko ofrece varios planes vía API key:

| Plan | Ideal para | Costo | Créditos/mes | Rate limit |
|------|-----------|:-----:|:------------:|:----------:|
| **Demo** (keyless) | Prototyping | $0 | 10,000 | ~10-30/min |
| **Demo** (con key) | Prototyping | $0 | 10,000 | 50/min |
| **Startup** | Producción baja | $79/mes | 200,000 | 250/min |
| **Lite** | Producción media | $149/mes | 400,000 | 500/min |
| **Pro** | Producción alta | $299/mes | 800,000 | 1,000/min |
| **Enterprise** | Escala masiva | Custom | Custom | Custom |

### Métricas de uso estimadas

| Escenario | Créditos/request | Requests/día | Créditos/mes | ¿Demo alcanza? |
|-----------|:----------------:|:------------:|:------------:|:--------------:|
| Fallback esporádico | 1 | 50 | 1,500 | ✅ Sí |
| Enrichment diario 100 tokens | 1 | 100 | 3,000 | ✅ Sí |
| Monitoreo cada 5 min (50 tokens) | 1 | 14,400 | 432,000 | ❌ No (Startup) |
| Batch pricing 500 tokens | 1 | 500 | 15,000 | ❌ No (Startup) |

## Referencias

- [CoinGecko API Docs](https://docs.coingecko.com/)
- [CoinGecko API Reference](https://docs.coingecko.com/reference/endpoint-overview)
- [CoinGecko API Pricing](https://www.coingecko.com/en/api/pricing)
- [CoinGecko Demo API Reference](https://docs.coingecko.com/demo/reference/endpoint-overview)
- [CoinGecko Keyless Public API](https://docs.coingecko.com/docs/keyless-public-api)
- [CoinGecko Asset Platforms](https://docs.coingecko.com/reference/asset-platforms-list)
- [CoinGecko API Status](https://status.coingecko.com/)
- [CoinGecko Methodology](https://www.coingecko.com/en/methodology)
