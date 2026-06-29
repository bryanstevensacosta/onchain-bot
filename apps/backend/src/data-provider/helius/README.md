# Helius — Data Provider

Provider de infraestructura Solana a través de la API de Helius. Combina JSON-RPC estándar, DAS API (Digital Asset Standard) y Enhanced Transactions API. Plan **Free** (1M CU/mes).

---

## Visión

Helius es la capa de datos enriquecidos para Solana. Se usa para:

- **Token accounts**: holder count y distribución por mint via `getTokenAccounts`
- **Asset metadata**: nombre, símbolo, imagen, supply, precio via DAS `getAsset`
- **Transaction parsing**: transacciones parseadas con tipo, instrucciones, transfers via Enhanced Transactions API
- **Address history**: historial completo de transacciones de una wallet o mint
- **RPC genérico**: cualquier método JSON-RPC de Solana

## Plan actual (Free — $0)

| Límite | Valor |
|--------|-------|
| Plan | **Free** (Developer) |
| Compute Units (CU) por mes | **1,000,000** (se resetea mensual) |
| Rate limit | Depende del endpoint |
| Chains | Solana mainnet + devnet |
| Enhanced Transactions | ✅ (10,000 req/mes en Free) |
| DAS API | ✅ |
| WebSocket | ✅ |
| Webhooks | Limitados |

> Con 1M CU/mes, ~33k requests/día promedio. Para producción, los planes superiores ofrecen 10M+ CU.

### Comparativa de planes

| Feature | Free | Growth ($50) | Business (custom) |
|---------|:----:|:------------:|:-----------------:|
| CU/mes | 1,000,000 | 10,000,000+ | Custom |
| Enhanced TX req/mes | 10,000 | 100,000+ | Custom |
| Webhooks | 2 | 10+ | Custom |
| Yellowstone gRPC | ❌ | ✅ | ✅ |
| Rate limit (RPC) | 100 req/s | 500 req/s | Custom |

## Endpoints implementados en el servicio

| Método service | API | Tipo | CU aprox. | Descripción |
|----------------|-----|:----:|:---------:|-------------|
| `getTokenAccounts(mint)` | RPC `getTokenAccounts` | RPC | ~40 | Token accounts por mint (holders) |
| `getAsset(id)` | DAS `getAsset` | DAS | ~80 | Asset metadata + price |
| `parseTransaction(signature)` | Enhanced TX `POST /v0/transactions` | REST | ~20 | Tx parseada completa |
| `getAddressHistory(address, limit?)` | Enhanced TX `GET /v0/addresses/{address}/transactions` | REST | ~20 | Historial de address |

### Response types

```typescript
// getTokenAccounts → holder info
{
  total: number;                     // Total token accounts
  distinctOwners: number;            // Owners únicos (holders reales)
  holders: number | null;            // Max(total, distinctOwners)
}

// getAsset → DAS asset data
{
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  token_info?: {
    symbol?: string;
    supply?: string | null;
    decimals?: number | null;
    price_info?: {
      price_per_token?: number | string | null;
      currency?: string;
    } | null;
  } | null;
  authorities?: Array<{
    address: string;
    scopes: string[];
  }>;
}

// parseTransaction → parsed tx
{
  signature: string;
  slot: number;
  blockTime: number | null;
  type: string;                     // SWAP, TRANSFER, BURN, etc.
  fee: number;
  signer: string[];
  instructions: Array<{ type?: string; programId?: string; info?: object }>;
  accounts: Array<{ account: string; role: string }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

// getAddressHistory → same as parseTransaction (array)
[] HeliusParsedTransaction
```

### Métodos sugeridos para agregar

| Método service sugerido | Método/Endpoint | Para qué sirve |
|-------------------------|-----------------|----------------|
| `getBalance(address)` | RPC `getBalance` | Balance SOL |
| `getSignaturesForAddress(address, limit?)` | RPC `getSignaturesForAddress` | Signatures de una address |
| `getTransaction(signature)` | RPC `getTransaction` | Tx raw (no parseada) |
| `getTokenSupply(mint)` | RPC `getTokenSupply` | Supply de un SPL token |
| `getAssetsByOwner(owner)` | DAS `getAssetsByOwner` | Assets de un owner |
| `getNftEditions(mint)` | DAS `getNftEditions` | Ediciones de un NFT |
| `getWebhook(webhookId)` | Webhooks API | Gestionar webhooks |
| `createWebhook(params)` | Webhooks API | Crear webhook |

## Todos los endpoints de Helius

### RPC (JSON-RPC estándar de Solana)

| Método | CU | Descripción |
|--------|:--:|-------------|
| `getBalance` | 10 | Balance en lamports |
| `getAccountInfo` | 10 | Info de cuenta |
| `getMultipleAccounts` | 20 | Múltiples cuentas |
| `getProgramAccounts` | 40 | Cuentas de un programa |
| `getTokenAccountsByOwner` | 10 | Token accounts de un owner |
| `getTokenAccountBalance` | 10 | Balance de un token account |
| `getTokenSupply` | 20 | Supply de un mint |
| `getTokenLargestAccounts` | 20 | Top holders de un mint |
| `getTransaction` | 40 | Tx por signature |
| `getSignaturesForAddress` | 40 | Signatures de una address |
| `simulateTransaction` | 40 | Simular tx |
| `getBlock` | 40 | Bloque por slot |
| `getBlockHeight` | 10 | Altura actual |
| `getSlot` | 20 | Slot actual |
| `getEpochInfo` | 10 | Info de epoch |
| `getLatestBlockhash` | 10 | Blockhash actual |

### DAS API (Digital Asset Standard)

| Método | CU | Descripción |
|--------|:--:|-------------|
| `getAsset` | 80 | Info de un asset |
| `getAssetProof` | 80 | Merkle proof |
| `getAssetsByOwner` | 80 | Assets de un owner |
| `getAssetsByCreator` | 80 | Assets por creator |
| `getAssetsByGroup` | 80 | Assets por colección |
| `getTokenAccounts` | 40 | Token accounts |
| `searchAssets` | 160 | Búsqueda avanzada |

### Enhanced Transactions API

| Endpoint | CU | Descripción |
|----------|:--:|-------------|
| `POST /v0/transactions` | ~20 | Parsear transacciones por signature |
| `GET /v0/addresses/{address}/transactions` | ~20 | Historial de address |
| `POST /v0/webhooks` | — | Crear webhook |
| `GET /v0/webhooks/{id}` | — | Obtener webhook |
| `PUT /v0/webhooks/{id}` | — | Actualizar webhook |
| `DELETE /v0/webhooks/{id}` | — | Eliminar webhook |

## Autenticación

- **RPC**: API key como query param
  ```
  https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
  ```
- **DAS**: API key como query param (misma URL base)
  ```
  https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
  ```
- **Enhanced Transactions**: API key como query param
  ```
  https://api.helius.xyz/v0/transactions/?api-key=YOUR_API_KEY
  ```
- **Header**: `Content-Type: application/json` (RPC/DAS)

### Ejemplo curl

```bash
# DAS getAsset
curl -s --request POST \
  --url 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "jsonrpc": "2.0",
    "id": "hel-1",
    "method": "getAsset",
    "params": { "id": "9x...", "displayOptions": { "showFungible": true } }
  }'

# Enhanced Transactions
curl -s --request POST \
  --url 'https://api.helius.xyz/v0/transactions/?api-key=YOUR_KEY' \
  --header 'Content-Type: application/json' \
  --data '{ "transactions": ["5v..."] }'

# Address history
curl -s --request GET \
  --url 'https://api.helius.xyz/v0/addresses/9x.../transactions?api-key=YOUR_KEY&limit=10'
```

## Chains soportadas

| Chain | Tipo | Estado |
|-------|------|--------|
| **Solana** (mainnet) | L1 | ✅ |
| **Solana** (devnet) | L1 | ✅ |

## Manejo de errores

| HTTP / RPC Code | Significado | Acción |
|-----------------|-------------|--------|
| 400 | Bad request | Revisar payload |
| 401 | API key inválida | Verificar `.env` |
| 429 | Rate limit / CU excedido | Retry con backoff |
| 500 | Internal error | Retry después de 1s |
| `-32000` | Server error | Retry |
| `-32001` | Resource not found | Verificar address/signature |
| `-32602` | Invalid params | Revisar payload |

El service actual retorna `null` silenciosamente en errores y logea en debug.

## Costos estimados (CU)

### Por categoría

| Categoría | CU promedio | Métodos |
|-----------|:-----------:|---------|
| **Lecturas ligeras** | 10 CU | `getBalance`, `getAccountInfo`, `getTokenAccountsByOwner`, `getSlot`, `getBlockHeight`, `getEpochInfo`, `getLatestBlockhash` |
| **Lecturas medias** | 20 CU | `getMultipleAccounts`, `getTokenSupply`, `getTokenLargestAccounts`, `getBlock` |
| **Lecturas pesadas** | 40 CU | `getProgramAccounts`, `getTransaction`, `getSignaturesForAddress`, `simulateTransaction`, `getTokenAccounts` |
| **DAS** | 80 CU | `getAsset`, `getAssetsByOwner`, `getAssetProof` |
| **DAS pesado** | 160 CU | `searchAssets` |
| **Enhanced TX** | ~20 CU | `parseTransaction`, `getAddressHistory` |

### Uso proyectado mensual (1M CU gratis)

| Escenario | CU/request | Requests/mes estimados |
|-----------|:----------:|:---------------------:|
| Solo balances | 10 CU | ~100,000 |
| Solo DAS getAsset | 80 CU | ~12,500 |
| Enhanced TX parse | 20 CU | ~50,000 |
| Mix holder analysis | ~30 CU | ~33,333 |
| Mix pipeline típico | ~40 CU | ~25,000 |

## Ejemplos de uso

### Uso básico del service

```typescript
import { HeliusService } from 'data-provider/helius';

// 1. Token accounts de un mint (holder count)
const accounts = await helius.getTokenAccounts(
  'So11111111111111111111111111111111111111112',
);
if (accounts) {
  console.log(`Total token accounts: ${accounts.total}`);
  console.log(`Distinct owners: ${accounts.distinctOwners}`);
  console.log(`Estimated holders: ${accounts.holders}`);
}

// 2. Asset metadata via DAS
const asset = await helius.getAsset(
  'So11111111111111111111111111111111111111112',
);
if (asset) {
  console.log(`Name: ${asset.content?.metadata?.name}`);
  console.log(`Symbol: ${asset.content?.metadata?.symbol}`);
  console.log(`Image: ${asset.content?.links?.image}`);
  console.log(`Supply: ${asset.token_info?.supply}`);
  console.log(`Price: ${asset.token_info?.price_info?.price_per_token}`);
}

// 3. Parsear una transacción
const tx = await helius.parseTransaction('5v...');
if (tx) {
  console.log(`Type: ${tx.type}`);
  console.log(`Fee: ${tx.fee} lamports`);
  console.log(`Signer: ${tx.signer[0]}`);
  for (const transfer of tx.tokenTransfers ?? []) {
    console.log(`Transfer ${transfer.tokenAmount} of ${transfer.mint}`);
  }
}

// 4. Address history
const history = await helius.getAddressHistory(
  '9x...',
  10,
);
if (history) {
  for (const tx of history) {
    console.log(`${tx.type}: ${tx.signature} (${new Date((tx.blockTime ?? 0) * 1000).toISOString()})`);
  }
}
```

### Uso en holder analysis

```typescript
// Análisis de holders usando Helius DAS + RPC
async function analyzeHolders(mint: string) {
  // 1. Token accounts (holders count)
  const accounts = await helius.getTokenAccounts(mint);
  if (!accounts) return null;

  // 2. Asset metadata
  const asset = await helius.getAsset(mint);

  return {
    holders: accounts.holders,
    distinctOwners: accounts.distinctOwners,
    totalAccounts: accounts.total,
    name: asset?.content?.metadata?.name,
    symbol: asset?.content?.metadata?.symbol,
    supply: asset?.token_info?.supply,
    decimals: asset?.token_info?.decimals,
    price: asset?.token_info?.price_info?.price_per_token,
    image: asset?.content?.links?.image,
  };
}
// Costo: ~120 CU (40 getTokenAccounts + 80 getAsset)
```

### Diferencia entre Helius y otros providers Solana

| Aspecto | Helius | Birdeye | FluxRPC |
|---------|--------|---------|---------|
| DAS API | ✅ | ❌ | ❌ |
| Enhanced TX parsing | ✅ (único) | ❌ | ❌ |
| RPC estándar | ✅ | ❌ | ✅ |
| Market data | Limitado | ✅ (mejor) | ❌ |
| Holders analysis | ✅ | ✅ | ❌ |
| Address history | ✅ | Solo Solana wallet | ❌ |
| Free tier | 1M CU/mes | 30k CU/mes | No free |
| Pricing | Créditos | CU | Por byte |

## Enhanced WebSockets (tiempo real)

Helius ofrece WebSockets mejorados con parsing automático de transacciones. El plan Free permite suscripciones a eventos en tiempo real.

### transactionSubscribe

```typescript
// Suscripción a transacciones en tiempo real vía WebSocket
// wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY

interface TransactionNotification {
  signature: string;
  type: string;           // "SWAP", "NFT_SALE", "TRANSFER", "DEPOSIT", etc.
  source: string;          // "JUPITER", "RAYDIUM", "PHANTOM", etc.
  description: string;     // Descripción legible: "WALLET_A swapped 1.5 SOL for 225.5 USDC"
  fee: number;
  feePayer: string;
  slot: number;
  timestamp: number;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }>;
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<object>;
  }>;
}
```

### WebSocket Manager para el pipeline

```typescript
// Gestor de WebSocket para monitorear transacciones de tokens en tiempo real
class HeliusWSManager {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (data: TransactionNotification) => void> = new Map();

  constructor(private apiKey: string) {}

  connect() {
    const url = `wss://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[Helius WS] Connected');
      // Suscribir a transacciones de tokens monitoreados
      for (const [mint, cb] of this.subscriptions) {
        this.subscribeToMint(mint, cb);
      }
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'transactionNotification') {
        const tx: TransactionNotification = data.params.result;
        // Identificar el mint y llamar callback
        for (const transfer of tx.tokenTransfers ?? []) {
          const cb = this.subscriptions.get(transfer.mint);
          if (cb) cb(tx);
        }
      }
    };

    this.ws.onclose = () => {
      console.log('[Helius WS] Disconnected');
      setTimeout(() => this.connect(), 5000); // Reconexión automática
    };
  }

  trackMint(mint: string, onTransaction: (tx: TransactionNotification) => void) {
    this.subscriptions.set(mint, onTransaction);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.subscribeToMint(mint, onTransaction);
    }
  }

  private subscribeToMint(mint: string, _cb: (tx: TransactionNotification) => void) {
    this.ws?.send(JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'transactionSubscribe',
      params: [{
        vote: false,
        failed: false,
        accountInclude: [mint],
      }],
    }));
  }
}

// Uso en el pipeline:
// const ws = new HeliusWSManager('YOUR_KEY');
// ws.connect();
// ws.trackMint('So11111111111111111111111111111111111111112', (tx) => {
//   console.log(`Nueva transacción: ${tx.type} - ${tx.description}`);
// });
```

## Webhooks (monitoreo de eventos)

Helius permite crear webhooks para recibir notificaciones HTTP cuando ocurren eventos en cadena.

### Gestión de webhooks

La API de Webhooks de Helius permite crear, listar, actualizar y eliminar webhooks:

| Operación | Método | Endpoint | Descripción |
|-----------|--------|----------|-------------|
| Crear | POST | `/webhooks` | Crear webhook para monitorear cuentas |
| Listar | GET | `/webhooks` | Listar todos los webhooks |
| Obtener | GET | `/webhooks/{id}` | Detalle de un webhook |
| Actualizar | PUT | `/webhooks/{id}` | Modificar webhook existente |
| Eliminar | DELETE | `/webhooks/{id}` | Eliminar webhook |

### Crear webhook para monitoreo de tokens

```typescript
// POST /webhooks
// Body:
{
  "accountAddresses": [
    "So11111111111111111111111111111111111111112", // wSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
  ],
  "webhookURL": "https://tu-backend.com/webhook/helius",
  "transactionDetails": "full",
  "webhookType": "transaction"
}

// Response (webhook creado):
// {
//   "id": "whk_abc123xyz789",
//   "accountAddresses": ["So11111111111111111111111111111111111111112"],
//   "webhookURL": "https://tu-backend.com/webhook/helius",
//   "webhookType": "transaction",
//   "createdAt": "2024-01-01T00:00:00Z"
// }
```

### Integración con el pipeline

```typescript
// Los webhooks de Helius pueden alimentar el pipeline en tiempo real:
// 1. Webhook recibe notificación de transacción SWAP
// 2. Backend parsea la transacción con parseTransaction()
// 3. Si es un token nuevo, encolar para enrichment
// 4. Pipeline procesa: DexScreener → Mobula → Moralis → Scoring

async function handleHeliusWebhook(notification: TransactionNotification) {
  const { type, tokenTransfers, signature } = notification;

  // Solo procesar SWAPs y TRANSFERS
  if (type !== 'SWAP' && type !== 'TRANSFER') return;

  for (const transfer of tokenTransfers ?? []) {
    const mint = transfer.mint;

    // Verificar si el token ya está en seguimiento
    const exists = await tokenRepository.exists(mint);
    if (!exists) {
      console.log(`Nuevo token detectado via webhook: ${mint}`);
      // Encolar para enrichment asíncrono
      await enrichmentQueue.enqueue({ mint, signature, source: 'helius-webhook' });
    }
  }
}
```

## Estrategia de integración en el pipeline

Helius es el proveedor principal para todo lo relacionado con Solana, complementando a DexScreener y Mobula.

```
1. DexScreener.getPairsByToken(address)
   └── Si está en Solana
       │
2. Helius.getAsset(id) — DAS API (80 CU)
   ├── Nombre, símbolo, imagen, supply
   ├── Precio (price_per_token)
   └── Authorities (mint/freeze authority)
       │
3. Helius.getTokenAccounts(mint) — RPC (40 CU)
   ├── Total holders
   └── Distinct owners
       │
4. Helius.getAddressHistory(mint, 5) — Enhanced TX (20 CU)
   └── Últimas transacciones del token
       │
5. Mobula.getTokenMarkets(address, 'solana')
   └── Concentration metrics (top10, insiders, dev, bundlers)
```

### Integración con chain detection

```typescript
// Helius se usa para detectar si una address es Solana
// probando con getAsset() y getTokenAccounts()

async function detectSolana(address: string): Promise<boolean> {
  // Method 1: DAS getAsset
  const asset = await helius.getAsset(address);
  if (asset?.token_info) return true;

  // Method 2: RPC getTokenAccounts
  const accounts = await helius.getTokenAccounts(address);
  if (accounts && accounts.total > 0) return true;

  return false;
}
// Costo: 80 CU (getAsset) + 40 CU (getTokenAccounts) = 120 CU
// Alternativa: solo getAsset (80 CU) es suficiente la mayoría de las veces.
```

### Análisis de transacciones de un token

```typescript
// Analizar las transacciones más recientes de un token
// para entender actividad: swaps, transfers, burns, etc.

interface TokenActivity {
  totalTx: number;
  swapCount: number;
  transferCount: number;
  uniqueTraders: Set<string>;
  totalVolume: number;
  recentBuys: number;
  recentSells: number;
}

async function analyzeTokenActivity(mint: string, limit = 20): Promise<TokenActivity | null> {
  const history = await helius.getAddressHistory(mint, limit);
  if (!history || history.length === 0) return null;

  const activity: TokenActivity = {
    totalTx: history.length,
    swapCount: 0,
    transferCount: 0,
    uniqueTraders: new Set(),
    totalVolume: 0,
    recentBuys: 0,
    recentSells: 0,
  };

  for (const tx of history) {
    // Clasificar por tipo
    if (tx.type === 'SWAP') activity.swapCount++;
    else if (tx.type === 'TRANSFER') activity.transferCount++;

    // Unique wallets involucradas
    tx.signer.forEach(s => activity.uniqueTraders.add(s));

    // Sumar transfers de este mint
    for (const t of tx.tokenTransfers ?? []) {
      if (t.mint === mint) {
        activity.totalVolume += t.tokenAmount;
      }
    }
  }

  return activity;
}
// Costo: ~20 CU por getAddressHistory
// Útil para entender si un token tiene actividad reciente genuina.
```

## Planes y facturación

Helius ofrece varios planes vía su Plans & Billing API:

| Plan | CU/mes | Enhanced TX req/mes | Rate limit RPC | Yellowstone gRPC | Webhooks |
|------|:------:|:-------------------:|:--------------:|:----------------:|:--------:|
| **Free (Developer)** | 1,000,000 | 10,000 | 100 req/s | ❌ | 2 |
| **Growth** ($50/mes) | 10,000,000+ | 100,000+ | 500 req/s | ✅ | 10+ |
| **Business** (custom) | Custom | Custom | Custom | ✅ | Custom |

### Métodos de la API de billing

| Método | Descripción |
|--------|-------------|
| `getHeliusPlanInfo()` | Obtener plan actual |
| `compareHeliusPlans()` | Comparar planes disponibles |
| `previewUpgrade(newPlan)` | Previsualizar costo de upgrade |
| `upgradePlan(email, firstName, lastName)` | Upgrade de plan |
| `payRenewal()` | Pagar renovación |

## RPC V2 Enhanced (métodos avanzados)

Helius ofrece una capa RPC V2 con métodos mejorados que incluyen paginación server-side y filtrado:

| Método RPC V2 | Descripción | CU |
|----------------|-------------|:--:|
| `getTransactionsForAddress(address, options)` | Transaction history con pagination_token | ~20 |
| `getProgramAccountsV2(programId, config)` | Program accounts con pagination_key | ~40 |
| `getAllProgramAccounts(programId, config)` | Auto-paginación de program accounts | ~40 |
| `getTokenAccountsByOwnerV2(owner, filter, config)` | Token accounts v2 con pagination_key | ~10 |
| `getAllTokenAccountsByOwner(owner, filter, config)` | Auto-paginación de token accounts | ~10 |
| `getPriorityFeeEstimate(request)` | Estimación de fees prioritarios | ~10 |

Estos métodos son útiles cuando se necesita paginar grandes conjuntos de datos sin manejar la paginación manualmente.

```typescript
// Ejemplo futuro: usar RPC V2 para obtener todas las token accounts de un owner
// const allAccounts = await helius.getAllTokenAccountsByOwner(owner, { showZero: false });
// Costo: ~10 CU con auto-paginación
```

## Manejo avanzado de errores

| HTTP / RPC Code | Significado | Estrategia de retry |
|-----------------|-------------|---------------------|
| 400 | Bad request | No retry (error de programación) |
| 401 | API key inválida | No retry (check config) |
| 429 | Rate limit / CU excedido | Exponential backoff, max 5 retries |
| 500 | Internal server error | Retry 3 veces con 1s间隔 |
| `-32000` | Server error (RPC) | Retry con backoff |
| `-32001` | Resource not found | No retry (retornar null) |
| `-32602` | Invalid params | No retry (error de programación) |

```typescript
// Estrategia de retry completa para Helius
async function heliusFetchWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T | null> {
  const { maxRetries = 3, baseDelay = 1000 } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isAxios = axios.isAxiosError(err);

      // 429: rate limit → backoff más agresivo
      if (isAxios && err.response?.status === 429) {
        const delay = baseDelay * Math.pow(4, attempt); // 1s, 4s, 16s
        this.logger.warn(`Helius rate limited, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // 5xx: error temporal → backoff estándar
      if (isAxios && (err.response?.status ?? 0) >= 500) {
        const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // RPC error -32000: server error → retry
      if (isAxios && err.response?.data?.error?.code === -32000) {
        await new Promise(r => setTimeout(r, baseDelay));
        continue;
      }

      // Otros errores: no retry
      return null;
    }
  }
  return null;
}
```

## Proyección de CU mensual

### Uso actual del servicio

| Operación | Métodos llamados | CU | Veces/día | CU/día |
|-----------|-----------------|:--:|:---------:|:------:|
| Holder count | `getTokenAccounts` (RPC) | 40 | 100 | 4,000 |
| Token metadata | `getAsset` (DAS) | 80 | 100 | 8,000 |
| Parse transaction | `parseTransaction` (Enhanced) | 20 | 50 | 1,000 |
| Address history | `getAddressHistory` (Enhanced) | 20 | 50 | 1,000 |
| **Total** | | | | **14,000 CU/día** |

Con 1,000,000 CU/mes y 14,000 CU/día → ~71 días de operación continua. **Sobra capacidad.**

### Escenarios de escalado

| Escenario | CU/op | Op/día | CU/día | CU/mes | ¿Free alcanza? |
|-----------|:-----:|:------:|:------:|:------:|:--------------:|
| Holder analysis básico | 120 | 200 | 24,000 | 720,000 | ✅ Sí |
| Full enrichment Solana | 200 | 100 | 20,000 | 600,000 | ✅ Sí |
| Monitoreo intensivo | 140 | 500 | 70,000 | 2,100,000 | ❌ No (Growth) |
| Parsing masivo de txs | 20 | 2,000 | 40,000 | 1,200,000 | ❌ No (Growth) |

## Preguntas frecuentes

### ¿Diferencia entre RPC y DAS?

La RPC estándar (`getTokenAccounts`, `getBalance`) usa el JSON-RPC tradicional de Solana. La DAS API (`getAsset`, `getAssetsByOwner`) es un estándar de Helius que ofrece datos más ricos (metadata, precio, authorities). Para tokens fungibles, la DAS es superior porque devuelve precio y metadata en un solo call.

### ¿Enhanced Transactions vs RPC getTransaction?

Enhanced Transactions parsea automáticamente las instrucciones y devuelve tipos legibles (SWAP, TRANSFER, BURN) con descripciones en lenguaje natural. La RPC `getTransaction` devuelve el raw binario sin parsear.

### ¿CU gratis alcanza para producción?

Para un pipeline que procesa ~100 tokens/día en Solana, el plan Free (1M CU/mes) es suficiente. Si se necesita monitoreo en tiempo real vía WebSocket o webhooks con alto throughput, Growth ($50/mes) es más adecuado.

### ¿Cómo migrar de Free a Growth?

Usar la Plans API:
```typescript
// GET /plans/compare → comparar planes
// GET /plans/upgrade/preview?newPlan=growth → ver costo
// POST /plans/upgrade → ejecutar upgrade
```

## Referencias

- [Helius Docs](https://docs.helius.dev/)
- [Helius Dashboard](https://dev.helius.xyz/)
- [DAS API Reference](https://docs.helius.dev/digital-asset-standard-das-api)
- [Enhanced Transactions API](https://docs.helius.dev/enhanced-transactions-api)
- [Enhanced WebSockets](https://docs.helius.dev/enhanced-websockets)
- [Webhooks](https://docs.helius.dev/webhooks)
- [RPC V2 Methods](https://www.helius.dev/docs/agents/rust-sdk/api-reference)
- [Plans & Billing](https://www.helius.dev/docs/agents/mcp/tools)
- [Pricing](https://www.helius.dev/pricing)
- [Helius SDK (TypeScript)](https://github.com/helius-labs/helius-sdk)
