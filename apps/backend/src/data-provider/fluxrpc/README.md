# FluxRPC — Data Provider

Provider de RPC para Solana (y Fogo) a través de FluxRPC. JSON-RPC estándar con transporte HTTP/3 + QUIC para baja latencia.

---

## Visión

Acceso RPC a Solana mainnet para consultas de blockchain. FluxRPC separa la capa de servicio RPC del validador, lo que permite caching, tuning y scaling independiente del consenso. Usado principalmente para:

- **Balance queries**: `getBalance` para saldos SOL
- **Token accounts**: `getTokenAccountsByOwner` para SPL tokens
- **Transaction data**: `getTransaction` para detalles de tx por signature
- **Blockchain state**: `getSlot`, `getLatestBlockhash`, `getMultipleAccounts`

## Diferenciador clave

FluxRPC usa **facturación por ancho de banda** (flat per-byte) en lugar del sistema de créditos por request que usan otros providers. Esto hace que los costos sean predecibles para cargas de trabajo estables.

| Aspecto | FluxRPC | Otros providers (Helius, QuickNode) |
|---------|---------|-------------------------------------|
| Pricing | Por byte transferido | Por créditos/CUs por request |
| Transporte | HTTP/3 + QUIC | HTTP/1.1 + WebSocket |
| Arquitectura | RPC decoupled del validator | RPC + validator acoplados |
| Transparencia | Costo predecible | Costo variable por tipo de request |

## Plan actual

FluxRPC usa un modelo de **pago por ancho de banda** sin planes fijos mensuales tradicionales.

| Concepto | Valor |
|----------|-------|
| Modelo de pricing | **Por byte transferido** (flat rate) |
| Costo típico | ~$38/mes por 250 GB |
| Rate limit | Depende del plan contratado |
| Chains | Solana mainnet (Fogo disponible on request) |
| Transporte | HTTP/3 + QUIC (baja latencia) |
| WebSocket | Sí |

> No hay un plan "Free" tradicional — el costo escala linealmente con el ancho de banda consumido.

## Endpoints implementados en el servicio

| Método service | Método RPC | Descripción |
|----------------|------------|-------------|
| `rpcCall(method, params)` | — | JSON-RPC genérico (any method) |
| `getBalance(address)` | `getBalance` | Balance SOL en lamports |
| `getTokenAccountsByOwner(owner)` | `getTokenAccountsByOwner` | Token accounts SPL de un owner |
| `getTransaction(signature)` | `getTransaction` | Detalles de transacción |
| `getSlot()` | `getSlot` | Slot actual |
| `getLatestBlockhash()` | `getLatestBlockhash` | Blockhash + lastValidBlockHeight |
| `getMultipleAccounts(addresses)` | `getMultipleAccounts` | Múltiples cuentas batch |

### Response types

```typescript
// getBalance → number (lamports)
const balance = await flux.getBalance('9x...');
// > 523456789012 (en lamports, dividir por 10^9 para SOL)

// getLatestBlockhash → { blockhash, lastValidBlockHeight }
const blockhash = await flux.getLatestBlockhash();
// > { blockhash: "Cx...", lastValidBlockHeight: 283456789 }

// getTransaction → SolanaTransactionResponse
{
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    postBalances: number[];
    preBalances: number[];
  } | null;
  transaction: { signatures: string[] };
}
```

### Métodos sugeridos para agregar

| Método service sugerido | Método RPC | Para qué sirve |
|-------------------------|------------|----------------|
| `getProgramAccounts(programId, filters?)` | `getProgramAccounts` | Cuentas de un programa (ej: Token Program) |
| `getSignaturesForAddress(address, limit?)` | `getSignaturesForAddress` | Signatures de una address |
| `getBlock(slot)` | `getBlock` | Bloque completo |
| `getTokenSupply(mint)` | `getTokenSupply` | Supply de un SPL token |
| `getTokenAccountBalance(tokenAccount)` | `getTokenAccountBalance` | Balance de un token account |
| `simulateTransaction(tx)` | `simulateTransaction` | Simular transacción |
| `getPriorityFeeEstimate(params)` | `getPriorityFeeEstimate` | Estimación de priority fee (+ Jito tip) |
| `getFeeForMessage(message)` | `getFeeForMessage` | Fee estimado para un mensaje |
| `getEpochInfo()` | `getEpochInfo` | Info del epoch actual |
| `getRecentPerformanceSamples(limit?)` | `getRecentPerformanceSamples` | Muestras de rendimiento recientes |

## Solana JSON-RPC — métodos disponibles

FluxRPC soporta todos los métodos JSON-RPC estándar de Solana:

### Account

| Método | Descripción |
|--------|-------------|
| `getBalance` | Balance en lamports |
| `getAccountInfo` | Info de cuenta (owner, data, lamports, executable) |
| `getMultipleAccounts` | Múltiples cuentas |
| `getProgramAccounts` | Cuentas owned by un programa |
| `getMinimumBalanceForRentExemption` | Exención de renta |

### Token

| Método | Descripción |
|--------|-------------|
| `getTokenAccountsByOwner` | Token accounts de un owner |
| `getTokenAccountBalance` | Balance de un token account |
| `getTokenSupply` | Supply de un mint |
| `getTokenLargestAccounts` | Top holders |

### Transaction

| Método | Descripción |
|--------|-------------|
| `getTransaction` | Tx por signature |
| `getSignaturesForAddress` | Signatures de una address |
| `simulateTransaction` | Simular tx |
| `getFeeForMessage` | Fee estimado |
| `getPriorityFeeEstimate` | Priority fee + Jito tip |

### Block / Slot

| Método | Descripción |
|--------|-------------|
| `getSlot` | Slot actual |
| `getBlock` | Bloque completo |
| `getBlockHeight` | Altura confirmada |
| `getBlockTime` | Timestamp de un slot |
| `getEpochInfo` | Info del epoch |
| `getEpochSchedule` | Schedule de epochs |

### Cluster

| Método | Descripción |
|--------|-------------|
| `getLatestBlockhash` | Blockhash + lastValidBlockHeight |
| `getGenesisHash` | Genesis hash |
| `getIdentity` | Identity del nodo |
| `getInflationRate` | Tasa de inflación |
| `getInflationReward` | Rewards de inflación |
| `getRecentPerformanceSamples` | Samples de rendimiento |
| `getVoteAccounts` | Validadores actuales |
| `requestAirdrop` | Airdrop en devnet |

## Autenticación

- **Formato**: API key como query param en la URL del RPC
  ```
  https://rpc.fluxrpc.com/solana?key={API_KEY}
  ```
- **Header**: `Content-Type: application/json`
- **Body**: JSON-RPC 2.0
  ```json
  {
    "jsonrpc": "2.0",
    "id": "flux-1234",
    "method": "getBalance",
    "params": ["9x..."]
  }
  ```

## Transporte HTTP/3 + QUIC

FluxRPC usa HTTP/3 sobre QUIC (en lugar de HTTP/1.1 o HTTP/2) para:

- **0-RTT connection establishment**: sin handshake TLS en reconexiones
- **Multiplexing sin head-of-line blocking**: a diferencia de HTTP/2 sobre TCP
- **Menor latencia**: especialmente en conexiones nuevas
- **Mejor rendimiento en redes con pérdida de paquetes**

## Error handling

| Código | Significado |
|--------|-------------|
| `-32000` | Rate limit / servidor ocupado |
| `-32001` | Resource not found (ej: slot no disponible) |
| `-32002` | Transaction simulation failure |
| `-32004` | Block not available |
| `-32005` | Node behind (validador no ha alcanzado el slot) |
| `-32600` | Request inválido |
| `-32601` | Method not found |
| `-32602` | Parámetros inválidos |
| `-32603` | Internal error |

El service actual maneja errores retornando `null` y logeando en debug.

## Chains soportadas

| Chain | Tipo | Estado |
|-------|------|--------|
| **Solana** | L1 | ✅ Mainnet (producción) |
| **Fogo** | L1 | 🔜 Disponible on request |

## Rate limits

FluxRPC no publica rate limits fijos públicos — el throughput depende del plan contratado. Para cargas de trabajo predecibles, el modelo de ancho de banda permite consultas intensivas sin preocuparse por créditos por request.

## Ejemplos de uso

### Uso básico del service

```typescript
import { FluxRpcService } from 'data-provider/fluxrpc';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Obtener balance SOL
const balanceLamports = await flux.getBalance('9x...');
if (balanceLamports !== null) {
  const sol = balanceLamports / 1_000_000_000;
  console.log(`Balance: ${sol} SOL`);
}

// 2. Obtener token accounts de una wallet
const tokens = await flux.getTokenAccountsByOwner('9x...');
if (tokens) {
  // each token account tiene mint, balance, etc.
}

// 3. Obtener detalle de transacción
const tx = await flux.getTransaction('5v...');
if (tx) {
  console.log(`Slot: ${tx.slot}`);
  console.log(`Fee: ${tx.meta?.fee} lamports`);
  console.log(`Block time: ${tx.blockTime}`);
}

// 4. Obtener slot actual
const slot = await flux.getSlot();
console.log(`Current slot: ${slot}`);

// 5. Obtener latest blockhash (para construir transacciones)
const blockhash = await flux.getLatestBlockhash();
if (blockhash) {
  console.log(`Blockhash: ${blockhash.blockhash}`);
  console.log(`Valid until height: ${blockhash.lastValidBlockHeight}`);
}

// 6. Obtener múltiples cuentas
const accounts = await flux.getMultipleAccounts([
  '9x...',
  '8x...',
]);
```

### Uso combinado con otros providers

```typescript
// FluxRPC para RPC (balance, tx, slot)
// Otros providers para market data (Birdeye, Helius)

// Ejemplo: obtener balance + precio de un token
const [balance, price] = await Promise.all([
  flux.getBalance(walletAddress),
  birdeye.getTokenPrice(tokenMint),
]);

if (balance !== null && price) {
  const solValue = (balance / 1_000_000_000) * price.value;
  console.log(`Wallet value: $${solValue}`);
}
```

### JSON-RPC genérico

```typescript
// Para métodos no implementados en el service
const epochInfo = await flux.rpcCall<{
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
}>('getEpochInfo');

console.log(`Epoch: ${epochInfo?.epoch}`);
```

## Comparativa con otros RPC providers

| Aspecto | FluxRPC | Helius | QuickNode | Chainstack |
|---------|---------|--------|-----------|------------|
| Pricing | Por byte (~$38/250GB) | Créditos ($49/10M) | Créditos ($49/20M) | RU ($49/20M) |
| Transporte | HTTP/3 + QUIC | HTTP/1.1 | HTTP/1.1 | HTTP/1.1 |
| Solana-native | ✅ | ✅ | Multi-chain | Multi-chain |
| Enhanced APIs | ❌ | ✅ | ❌ | ❌ |
| WebSocket | ✅ | ✅ | ✅ | ✅ |
| Yellowstone gRPC | ❌ | ✅ | ✅ | ✅ |
| Free tier | No tradicional | 1M créditos/mes | 20M créditos/mes | 3M RU/mes |
