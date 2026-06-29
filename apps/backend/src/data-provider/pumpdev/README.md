# PumpDev — Data Provider

Provider de trading y creación de tokens en [pump.fun](https://pump.fun) a través de la API de PumpDev. Compra, venta y creación programática de tokens en la bonding curve de Pump.fun.

---

## Visión

Interacción programática con Pump.fun (Solana) sin manejar RPC, transacciones raw ni keypairs directamente. Usado para:

- **Trading automatizado**: compra/venta de tokens en la bonding curve
- **Token creation**: lanzar nuevos tokens con metadata IPFS + dev buy
- **Jito bundles**: lanzamiento atómico multi-buyer
- **Fee claiming**: recolectar fees de creador
- **WebSocket streaming**: datos en tiempo real de nuevos tokens, trades, whales

## Modos de trading

| Modo | Descripción | Llaves | Velocidad |
|------|-------------|--------|-----------|
| **trade-local** | API construye la tx, tú la firmas localmente y la envías | Tus keys nunca salen | Media |
| **trade-lightning** | API firma y envía la tx por ti — un HTTP call | Custodia del server | Máxima |

## Pricing

| Concepto | Valor |
|----------|-------|
| Comisión por trade | **0.25%** |
| WebSocket data | **Gratis** (sin auth) |
| Token creation | Sin costo adicional |
| API key | Sin costo mensual — pago por uso (comisión en trades) |

## Endpoints implementados en el servicio

| Método service | Endpoint | Descripción |
|----------------|----------|-------------|
| `tradeLocal(params)` | `POST /api/trade-local` | Construir tx de buy/sell para firmar localmente |
| `tradeLightning(params)` | `POST /api/trade-lightning` | Trade server-side (un HTTP call) |
| `createToken(params)` | `POST /api/create` | Crear nuevo token en pump.fun |
| `createBundle(params)` | `POST /api/create-bundle` | Jito bundle — launch atómico multi-buyer |
| `claimAccount()` | `POST /api/claim-account` | Reclamar fees de creador |
| `transfer(params)` | `POST /api/transfer` | Transferir SOL entre wallets |

### Parámetros

```typescript
// tradeLocal / tradeLightning
{
  publicKey: string;         // wallet public key
  action: 'buy' | 'sell';    // comprar o vender
  mint: string;              // token mint address
  amount: number;            // cantidad (SOL o tokens)
  denominatedInSol?: boolean; // true = amount en SOL, false = en tokens
  slippage?: number;         // slippage tolerance % (default: 15-20)
  priorityFee?: number;      // priority fee en SOL (lightning only)
}

// createToken
{
  name: string;              // nombre del token
  symbol: string;            // símbolo
  description?: string;      // descripción (opcional)
  image?: string;            // URL de imagen (opcional, IPFS auto)
  amount?: number;           // dev buy amount en SOL (opcional)
}

// createBundle (Jito bundle)
{
  mint: string;              // token mint address
  buyers: Array<{            // hasta 4 buyers
    publicKey: string;
    amount: number;          // amount en SOL
  }>;
}

// transfer
{
  to: string;                // wallet destino
  amount: number;            // cantidad en SOL
}
```

### Response types

```typescript
// TradeResponse / CreateTokenResponse / BundleResponse
{
  success: boolean;
  txId?: string;      // transaction signature
  mint?: string;      // solo en create: dirección del token creado
  error?: string;     // mensaje de error si falla
}

// ClaimResponse
{
  success: boolean;
  txId?: string;
  amount?: number;    // SOL reclamados
  error?: string;
}
```

## Todos los endpoints de la API

| # | Endpoint | Método | Descripción |
|---|----------|--------|-------------|
| 1 | `POST /api/trade-local` | POST | Build tx de buy/sell (client-side signing) |
| 2 | `POST /api/trade-lightning` | POST | Trade server-side (custodial) |
| 3 | `POST /api/create` | POST | Crear token con metadata IPFS |
| 4 | `POST /api/create-bundle` | POST | Jito bundle — launch + hasta 4 buyers |
| 5 | `POST /api/claim-account` | POST | Reclamar fees de creador |
| 6 | `POST /api/transfer` | POST | Transferir SOL |
| 7 | `POST /api/wallet/create` | POST | Crear lightning wallet |
| 8 | `WSS /ws` | WebSocket | Streaming de datos real-time |

## WebSocket (gratis, sin auth)

El WebSocket de PumpDev (`wss://pumpdev.io/ws`) es **gratuito y no requiere API key**. Proporciona streams en tiempo real de toda la actividad de Pump.fun.

### Eventos disponibles

| Método WebSocket | Descripción | Datos incluidos |
|-----------------|-------------|-----------------|
| `subscribeNewToken` | Nuevos tokens lanzados | mint, name, symbol, creator, dev buy |
| `subscribeTokenTrade` | Trades de un token específico | txType (buy/sell), solAmount, tokenAmount, trader, marketCapSol |
| `subscribeAccountTrade` | Trades de una wallet específica | mismo formato que token trade |
| `unsubscribeNewToken` | Dejar de recibir nuevos tokens | — |
| `unsubscribeTokenTrade` | Dejar de recibir trades de un token | — |
| `unsubscribeAccountTrade` | Dejar de recibir trades de una wallet | — |

### Formato de evento de trade

```json
{
  "txType": "buy",
  "solAmount": 0.5,
  "tokenAmount": 1234567,
  "traderPublicKey": "9x...",
  "marketCapSol": 45.2,
  "vSolInBondingCurve": 100.5,
  "vTokensInBondingCurve": 500000000
}
```

El precio se calcula como: `price = vSolInBondingCurve / vTokensInBondingCurve`

## Autenticación

- **Header**: `X-API-Key` (para endpoints REST)
- **Query param**: `?api-key=YOUR_KEY` (alternativa)
- **WebSocket**: Sin autenticación (gratis)
- **Base URL**: `https://pumpdev.io/api`

## Chains soportadas

| Chain | Tipo | Estado |
|-------|------|--------|
| **Solana** | L1 | ✅ Mainnet (pump.fun) |

## Rate limits

PumpDev no publica rate limits fijos. La comisión del 0.25% por trade desincentiva el abuso. Para WebSocket no hay límite conocido.

## Error handling

| HTTP | Significado |
|------|-------------|
| 400 | Invalid request parameters |
| 401 | API key inválida/faltante |
| 404 | Token no encontrado |
| 429 | Rate limit |
| 500 | Internal server error |

El service actual retorna `null` silenciosamente en errores 4xx/5xx y logea en debug.

## Ejemplos de uso

### Uso básico — Lightning trade (recomendado)

```typescript
import { PumpDevService } from 'data-provider/pumpdev';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Buy — un HTTP call y está ejecutado
const buy = await pump.tradeLightning({
  action: 'buy',
  mint: 'TokenMintAddress',
  amount: 0.1,        // 0.1 SOL
  denominatedInSol: true,
});
if (buy?.success) {
  console.log(`Buy executed: ${buy.txId}`);
}

// 2. Sell
const sell = await pump.tradeLightning({
  action: 'sell',
  mint: 'TokenMintAddress',
  amount: 1000000,     // 1,000,000 tokens
  denominatedInSol: false,
});
```

### Client-side signing (non-custodial)

```typescript
// 1. Obtener la transacción serializada
const trade = await pump.tradeLocal({
  publicKey: wallet.publicKey.toBase58(),
  action: 'buy',
  mint: 'TokenMintAddress',
  amount: 0.1,
  denominatedInSol: true,
});

if (trade?.success && trade.txId) {
  // trade.txId contiene la tx serializada (base64)
  // firmar localmente y enviar a Solana
}
```

### Crear un token

```typescript
// Crear token con metadata y dev buy
const create = await pump.createToken({
  name: 'My Token',
  symbol: 'MYTKN',
  description: 'The best token ever',
  image: 'https://example.com/logo.png',
  amount: 0.5,  // 0.5 SOL de dev buy
});

if (create?.success) {
  console.log(`Token created: ${create.mint}`);
  console.log(`Creation TX: ${create.txId}`);
}
```

### Jito bundle — launch atómico

```typescript
// Crear token + múltiples buys en un solo bloque
const bundle = await pump.createBundle({
  mint: 'TokenMintAddress',
  buyers: [
    { publicKey: 'wallet1...', amount: 0.5 },
    { publicKey: 'wallet2...', amount: 0.3 },
    { publicKey: 'wallet3...', amount: 0.2 },
  ],
});
```

### Claim de fees de creador

```typescript
// Reclamar todas las fees acumuladas
const claim = await pump.claimAccount();
if (claim?.success) {
  console.log(`Claimed ${claim.amount} SOL — TX: ${claim.txId}`);
}
```

### Transferencia de SOL

```typescript
const transfer = await pump.transfer({
  to: 'walletDestino...',
  amount: 0.1,  // 0.1 SOL
});
```

## Casos de uso sugeridos

### Sniper bot (WebSocket + Lightning trade)

```typescript
// 1. WebSocket gratis para detectar nuevos tokens
const ws = new WebSocket('wss://pumpdev.io/ws');
ws.send(JSON.stringify({ method: 'subscribeNewToken' }));

ws.on('message', async (data) => {
  const token = JSON.parse(data.toString());
  // 2. Filtrar por condiciones (dev buy > 0.5 SOL, etc.)
  if (shouldBuy(token)) {
    // 3. Ejecutar trade lightning
    const buy = await pump.tradeLightning({
      action: 'buy',
      mint: token.mint,
      amount: 0.01,
      denominatedInSol: true,
    });
  }
});
```

### Copy trading (WebSocket + Lightning)

```typescript
// Seguir a un whale específico
ws.send(JSON.stringify({
  method: 'subscribeAccountTrade',
  keys: ['WhaleWalletPublicKey'],
}));
ws.on('message', async (data) => {
  const trade = JSON.parse(data.toString());
  if (trade.txType === 'buy') {
    // Copiar el trade
    await pump.tradeLightning({
      action: 'buy',
      mint: trade.mint, // Nota: necesitas extraer el mint del evento
      amount: 0.01,
      denominatedInSol: true,
    });
  }
});
```

## Consideraciones de seguridad

| Aspecto | trade-local | trade-lightning |
|---------|-------------|-----------------|
| Custodia de keys | Tus keys nunca salen | El servidor firma |
| Riesgo | Bajo (firmas locales) | Medio (confianza en el server) |
| Velocidad | Media (2 HTTP calls) | Máxima (1 HTTP call) |
| Recomendado para | Bots pequeños, aprendizaje | Producción, sniper bots |

> ⚠️ `trade-lightning` requiere depositar SOL en la wallet del server. Usar solo con la cantidad necesaria para operar, no como bóveda.
