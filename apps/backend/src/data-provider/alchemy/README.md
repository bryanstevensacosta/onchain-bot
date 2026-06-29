# Alchemy — Data Provider

Provider de datos blockchain a través de Alchemy (Node API + Data APIs). Infraestructura JSON-RPC para EVM, Solana, Bitcoin, UTXOs y 80+ chains. Usa el plan **Free** (30M CU/mes, 500 CU/s).

---

## Visión

Alchemy es la capa de infraestructura blockchain que usamos para:

- **Chain detection**: `eth_getCode` para determinar si una address es contrato (EVM)
- **Token balances**: `alchemy_getTokenBalances` para saldos ERC-20
- **Logs y eventos**: `eth_getLogs` para rastrear swaps, transfers, y eventos on-chain
- **State reads**: `eth_call`, `eth_getBalance`, `eth_getStorageAt`
- **Transacciones**: `eth_getTransactionReceipt`
- **Solana**: JSON-RPC + DAS API para assets digitales

## Arquitectura de APIs

```
Alchemy
├── Node API (JSON-RPC nativo de cada chain)
│   ├── EVM (Ethereum, Polygon, Arbitrum, Base, etc.)
│   ├── Solana
│   ├── Bitcoin / Litecoin / Dogecoin (UTXO)
│   ├── Starknet
│   ├── Stellar
│   ├── Sui
│   └── Aptos
├── Data APIs (REST HTTP + Enhanced RPC)
│   ├── Token API
│   ├── Transfers API
│   ├── NFT API
│   ├── Prices API
│   ├── Portfolio API
│   ├── Simulation API
│   ├── Utility API
│   └── Webhooks (Notify API)
├── Trace API (OpenEthereum — solo PAYG+)
├── Debug API (Geth — solo PAYG+)
└── WebSocket Subscriptions
    ├── EVM: newHeads, logs, pendingTransactions, minedTransactions
    ├── Solana: accountSubscribe, programSubscribe, logsSubscribe, signatureSubscribe
    ├── UTXO: block, transaction, address, fiat
    └── Yellowstone gRPC (Solana — $75/TB extra)
```

---

## Planes

### Comparativa completa

| Feature | Free | Pay As You Go | Enterprise |
|---------|------|---------------|------------|
| Compute Units base | 30M CU/mes | — (pago por uso) | Custom |
| Rate hasta 300M CU | — | $0.45/M CU | Custom |
| Rate > 300M CU | — | $0.40/M CU | Custom |
| Throughput base | 500 CU/s (~25 req/s) | 10,000 CU/s (~300 req/s) | Custom |
| # Apps | 5 | 30 | Unlimited |
| Webhooks | 5 | 100 | 500 |
| Full Archive Data | ✅ | ✅ | ✅ |
| Node API | ✅ | ✅ | ✅ |
| Debug API | ❌ | ✅ | ✅ |
| Trace API | ❌ | ✅ | ✅ |
| NFT API | ✅ | ✅ | ✅ |
| Transfers API | ✅ | ✅ | ✅ |
| Token API | ✅ | ✅ | ✅ |
| Prices API | ✅ | ✅ | ✅ |
| Portfolio API | ✅ | ✅ | ✅ |
| Simulation | ✅ | ✅ | ✅ |
| Gas-optimized tx | ❌ | ✅ | ✅ |
| Smart WebSockets | ✅ | ✅ | ✅ |
| JavaScript SDK | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ✅ |
| Email Support | ✅ | ✅ | ✅ |
| Devoted Support | ❌ | ❌ | ✅ |
| PM Access | ❌ | ❌ | ✅ |
| Custom SLAs | ❌ | ❌ | ✅ |

### Plan actual (Free)

| Límite | Valor |
|--------|-------|
| Compute Units (CU) por mes | **30,000,000** (gratis) |
| Throughput | **500 CU/s** (~25 req/s promedio) |
| Apps | 5 |
| Webhooks | 5 |
| Chains | Todos los mainnets + testnets (80+) |
| Datos archive | Incluido (dentro del CU mensual) |
| Debug / Trace API | No |
| Gas sponsorship | Testnets solamente |
| Soporte | Standard (48h respuesta email) |

---

## Node API

### EVM — JSON-RPC estándar

#### Chain / Network

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_chainId` | **0** | ID numérico de la chain (1=Ethereum, 137=Polygon) |
| `net_version` | **0** | String del network ID |
| `eth_blockNumber` | 10 | Último bloque minado |
| `eth_syncing` | 0 | Estado de sync del nodo |
| `eth_protocolVersion` | 0 | Versión del protocolo |

#### Account

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_getBalance` | 20 | Balance ETH nativo en wei |
| `eth_getCode` | 20 | Bytecode del contrato ("" si es EOA) |
| `eth_getTransactionCount` | 20 | Nonce de la address |
| `eth_getProof` | 20 | Prueba Merkle de account/storage |

#### Block

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_getBlockByNumber` | 20 | Bloque por número (con/sin tx details) |
| `eth_getBlockByHash` | 20 | Bloque por hash |
| `eth_getBlockReceipts` | 20 | Todos los receipts del bloque (Throughput CU: 500) |
| `eth_getUncleCountByBlockNumber` | 10 | Cantidad de uncles |
| `eth_getUncleByBlockNumberAndIndex` | 20 | Uncle por índice |

#### Transaction

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_getTransactionByHash` | 20 | Tx por hash |
| `eth_getTransactionReceipt` | 20 | Receipt de tx (gasUsed, status, logs) |
| `eth_getTransactionByBlockHashAndIndex` | 20 | Tx por bloque+índice |
| `eth_getTransactionByBlockNumberAndIndex` | 20 | Tx por bloque+índice |
| `eth_sendRawTransaction` | 40 (Throughput: 250) | Enviar tx firmada |
| `eth_sendRawTransactionSync` | 40 | EIP-5792 sync submit |

#### State

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_call` | 26 | Ejecutar llamada read-only |
| `eth_estimateGas` | 20 | Estimar gas de una tx |
| `eth_getStorageAt` | 20 | Leer storage slot |
| `eth_getLogs` | 60 | Event logs con filtros (address, topics, blocks) |
| `eth_getFilterLogs` | 60 | Logs de un filter existente |
| `eth_newFilter` | 20 | Crear filter de logs |
| `eth_newBlockFilter` | 10 | Crear filter de nuevos bloques |
| `eth_getFilterChanges` | 10 | Poll de cambios del filter |

#### Gas

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_gasPrice` | 20 | Precio gas actual (wei) |
| `eth_feeHistory` | 10 | Historial de fees para EIP-1559 |
| `eth_maxPriorityFeePerGas` | 20 | Max priority fee sugerido |
| `eth_blobBaseFee` | 10 | Blob base fee (EIP-4844) |
| `eth_estimateGas` | 20 | Gas estimado |

#### EIP-5792

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_sendRawTransactionSync` | 40 | Enviar tx y esperar receipt |
| `eth_simulateV1` | 40 | Simular bundle de txs |
| `wallet_sendCalls` | 40 | Batch de llamadas |
| `wallet_getCallsStatus` | 10 | Estado de un batch |

#### WebSocket

| Método | CU | Descripción |
|--------|----|-------------|
| `eth_subscribe("newHeads")` | 0 | Nuevos bloques |
| `eth_subscribe("logs", filter)` | 0 | Logs por filtro |
| `eth_subscribe("newPendingTransactions")` | 0 | Txs pendientes (hashes) |
| `eth_subscribe("alchemy_pendingTransactions")` | 0 | Txs pendientes (full tx objects) |
| `eth_subscribe("alchemy_minedTransactions")` | 0 | Txs minadas con filtros |
| `eth_unsubscribe` | 0 | Cancelar suscripción |

### Solana — JSON-RPC

#### Account

| Método | CU | Descripción |
|--------|----|-------------|
| `getBalance` | 10 | Balance en lamports |
| `getAccountInfo` | 10 | Info de cuenta (owner, data, lamports) |
| `getMultipleAccounts` | 20 | Múltiples cuentas batch |
| `getProgramAccounts` | 40 | Cuentas de un programa (con filtros) |

#### Token

| Método | CU | Descripción |
|--------|----|-------------|
| `getTokenAccountsByOwner` | 10 | Token accounts de un owner |
| `getTokenAccountBalance` | 10 | Balance de un token account |
| `getTokenSupply` | 20 | Supply total de un mint |
| `getTokenLargestAccounts` | 20 | Top holders de un mint |

#### Transaction

| Método | CU | Descripción |
|--------|----|-------------|
| `getTransaction` | 40 | Tx por signature |
| `getSignaturesForAddress` | 40 | Signatures de una address |
| `simulateTransaction` | 40 | Simular tx |

#### Block / Slot

| Método | CU | Descripción |
|--------|----|-------------|
| `getBlock` | 40 | Bloque por slot |
| `getBlocks` | 20 | Slots confirmados |
| `getBlockHeight` | 10 | Altura actual |
| `getBlockTime` | 10 | Timestamp UNIX de un slot |
| `getEpochInfo` | 10 | Info de epoch |
| `getSlot` | 20 | Slot actual |
| `getSlotLeader` | 10 | Líder del slot |
| `getLeaderSchedule` | 20 | Schedule de líderes |

### Solana — DAS API (Digital Asset Standard)

| Método | CU | Descripción |
|--------|----|-------------|
| `getAsset` | 80 | Info de un asset digital |
| `getAssetProof` | 80 | Merkle proof de compressed NFT |
| `getAssetProofs` | 80 | Merkle proofs batch |
| `getAssets` | 80 | Múltiples assets |
| `getAssetsByOwner` | 80 | Assets de un owner |
| `getAssetsByAuthority` | 80 | Assets por authority |
| `getAssetsByCreator` | 80 | Assets por creator |
| `getAssetsByGroup` | 80 | Assets por grupo/colección |
| `getNftEditions` | 80 | Ediciones de un master NFT |
| `getTokenAccounts` | 160 | Token accounts (filtro owner/mint) |
| `searchAssets` | 160 | Búsqueda avanzada |
| `getAssetSignatures` | 80 | Signatures de interacciones |

### UTXO — Bitcoin / Litecoin / Dogecoin / Bitcoin Cash

| Método | CU | Descripción |
|--------|----|-------------|
| `getBalance` | 10 | Balance en satoshis |
| `getBlockchainInfo` | 10 | Info de la chain |
| `getBlockCount` | 10 | Altura del bloque |
| `getBlockHash` | 10 | Hash del bloque |
| `getBlock` | 20 | Bloque completo (transacciones) |
| `getTransaction` | 20 | Transacción por txid |
| `sendTransaction` | 40 | Enviar raw transaction |
| `estimateSmartFee` | 10 | Fee estimada |

### WebSocket UTXO

| Método | CU | Descripción |
|--------|----|-------------|
| `subscribe("block")` | 0 | Nuevos bloques |
| `subscribe("transaction")` | 0 | Transacciones |
| `subscribe("address")` | 0 | Actividad de address |
| `subscribe("fiat")` | 0 | Precios fiat |

---

## Data APIs

### Token API (Enhanced RPC)

Endpoints RPC para metadata y balances de tokens ERC-20.

| # | Método | CU | Descripción |
|---|--------|----|-------------|
| 1 | `alchemy_getTokenBalances(address)` | 20 | Todos los ERC-20 balances de una address |
| 2 | `alchemy_getTokenBalances(address, contractAddresses[])` | 20 | Balances de contratos específicos |
| 3 | `alchemy_getTokenMetadata(address)` | 10 | Metadata (name, symbol, decimals, logo) |
| 4 | `alchemy_getTokenAllowance(owner, spender, contract)` | 20 | Allowance ERC-20 |

**Parámetros de `alchemy_getTokenBalances`:**
- `address` (string, required) — Owner address
- `contractAddresses` (string[], optional) — Filtrar por contratos específicos
- `pageKey` (string, optional) — Paginación para +100 tokens
- **Response**: `{ address, tokenBalances: [{ contractAddress, tokenBalance }] }`

### Transfers API (Enhanced RPC)

Historial de transfers para cualquier address sin escanear toda la chain.

| # | Método | CU | Descripción |
|---|--------|----|-------------|
| 1 | `alchemy_getAssetTransfers(params)` | 120 | Transferencias históricas |

**Parámetros de `AssetTransfersParams`:**

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `fromBlock` | string (hex) | `0x0` | Bloque inicial (inclusive) |
| `toBlock` | string (hex) | latest | Bloque final (inclusive) |
| `fromAddress` | string | wildcard | Address remitente |
| `toAddress` | string | wildcard | Address destinatario |
| `category` | AssetTransfersCategory[] | **required** | `["external", "internal", "erc20", "erc721", "erc1155", "specialnft"]` |
| `contractAddresses` | string[] | all | Filtrar por contratos |
| `excludeZeroValue` | boolean | `true` | Excluir transfers de valor 0 |
| `maxCount` | number | 1000 | Max resultados por página |
| `order` | SortingOrder | ascending | `"asc"` \| `"desc"` (por bloque) |
| `pageKey` | string | — | Paginación |
| `withMetadata` | boolean | `false` | Incluir metadata |

**Response (with metadata):**
```json
{
  "transfers": [{
    "blockNum": "0x...",
    "hash": "0x...",
    "from": "0x...",
    "to": "0x...",
    "value": 123.45,
    "erc721TokenId": null,
    "erc1155Metadata": null,
    "tokenId": null,
    "asset": "ETH",
    "category": "external",
    "rawContract": {
      "value": "0x...",
      "address": null,
      "decimal": "0x12"
    },
    "metadata": {
      "blockTimestamp": "2024-01-01T00:00:00Z"
    }
  }]
}
```

### NFT API

API REST completa para NFTs. 25+ endpoints organizados en 5 categorías.

#### Ownership

| # | Endpoint | CU | Descripción |
|---|----------|----|-------------|
| 1 | `GET /nft/v3/{network}/getNFTsForOwner` | 40 | Todos los NFTs de un owner |
| 2 | `GET /nft/v3/{network}/getOwnersForNFT` | 40 | Owners de un NFT específico |
| 3 | `GET /nft/v3/{network}/getOwnersForContract` | 80 | Owners de un contrato completo |
| 4 | `GET /nft/v3/{network}/isHolderOfContract` | 20 | Verificar si address tiene el NFT |
| 5 | `GET /nft/v3/{network}/getContractsForOwner` | 40 | Contratos donde un owner tiene NFTs |
| 6 | `GET /nft/v3/{network}/getCollectionsForOwner` | 40 | Colecciones de un owner |

#### Metadata

| # | Endpoint | CU | Descripción |
|---|----------|----|-------------|
| 7 | `GET /nft/v3/{network}/getNFTsForContract` | 80 | Todos los NFTs de un contrato |
| 8 | `GET /nft/v3/{network}/getNFTsForCollection` | 80 | NFTs de una colección (por slug) |
| 9 | `GET /nft/v3/{network}/getNFTMetadata` | 10 | Metadata de un token ID |
| 10 | `POST /nft/v3/{network}/getNFTMetadataBatch` | 10/token | Metadata batch (hasta 100 tokens) |
| 11 | `GET /nft/v3/{network}/getContractMetadata` | 10 | Metadata del contrato NFT |
| 12 | `POST /nft/v3/{network}/getContractMetadataBatch` | 10/contract | Metadata batch de contratos |
| 13 | `GET /nft/v3/{network}/getCollectionMetadata` | 10 | Metadata de colección por slug |
| 14 | `GET /nft/v3/{network}/searchContractMetadata` | 10 | Buscar metadata de contratos |
| 15 | `GET /nft/v3/{network}/summarizeNFTAttributes` | 20 | Resumen de atributos de una colección |
| 16 | `GET /nft/v3/{network}/computeRarity` | 20 | Rareza por atributos de un NFT |
| 17 | `GET /nft/v3/{network}/invalidateContract` | 10 | Invalidar cache del contrato |
| 18 | `GET /nft/v3/{network}/refreshNFTMetadata` | 10 | Refrescar metadata de un NFT |

#### Spam Detection

| # | Endpoint | CU | Descripción |
|---|----------|----|-------------|
| 19 | `GET /nft/v3/{network}/getSpamContracts` | 10 | Lista de contratos marcados como spam |
| 20 | `GET /nft/v3/{network}/isSpamContract` | 10 | Verificar si un contrato es spam |
| 21 | `GET /nft/v3/{network}/isAirdropNFT` | 10 | Verificar si un NFT es airdrop |
| 22 | `POST /nft/v3/{network}/reportSpam` | 10 | Reportar una address como spam |

#### Sales / Floor

| # | Endpoint | CU | Descripción |
|---|----------|----|-------------|
| 23 | `GET /nft/v3/{network}/getFloorPrice` | 40 | Floor price de colección por slug |
| 24 | `GET /nft/v3/{network}/getNFTSales` | 80 | Historial de ventas NFT (filtrado) |

### Prices API

Precios real-time e históricos de tokens fungibles.

| # | Endpoint | CU | Descripción |
|---|----------|----|-------------|
| 1 | `GET /prices/v1/tokens/by-symbol` | 10 | Precios actuales por symbol (ETH, BTC, etc.) |
| 2 | `GET /prices/v1/tokens/by-address` | 10 | Precios actuales por address+network |
| 3 | `GET /prices/v1/tokens/historical` | 20 | Precios históricos (rango + intervalo) |

**Parámetros del SDK:**

| Método SDK | Descripción |
|------------|-------------|
| `alchemy.prices.getTokenPriceBySymbol(symbols[])` | Precio actual por símbolos |
| `alchemy.prices.getTokenPriceByAddress(addresses[])` | Precio actual por address+network |
| `alchemy.prices.getHistoricalPriceBySymbol(symbol, startTime, endTime, interval)` | Precio histórico por symbol |
| `alchemy.prices.getHistoricalPriceByAddress(network, address, startTime, endTime, interval)` | Precio histórico por address |

**Intervalos soportados:** `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, `1d`, `1w`, `1M`

### Portfolio API

API REST para consultar el portfolio completo de una wallet (tokens + NFTs + transacciones).

| # | Endpoint | CU | Descripción |
|---|----------|----|-------------|
| 1 | `GET /portfolio/v1/{network}/tokens/by-address` | 20 | Tokens fungibles de una wallet |
| 2 | `GET /portfolio/v1/{network}/token-balances/by-address` | 20 | Balances de tokens de una wallet |
| 3 | `GET /portfolio/v1/{network}/nfts/by-address` | 40 | NFTs de una wallet |
| 4 | `GET /portfolio/v1/{network}/nft-collections/by-address` | 40 | Colecciones de una wallet |
| 5 | `GET /portfolio/v1/{network}/transactions/by-address` | 60 | Historial completo de transacciones |

**Métodos SDK correspondientes (PortfolioNamespace):**

```typescript
alchemy.portfolio.getTokensByWallet(addresses, includeNativeTokens?)
alchemy.portfolio.getTokenBalancesByWallet(addresses, includeNativeTokens?)
alchemy.portfolio.getNftsByWallet(addresses, options?)
alchemy.portfolio.getNftCollectionsByWallet(addresses, options?)
alchemy.portfolio.getTransactionsByWallet(addresses, options?)
```

- `addresses`: hasta 2 pares (address+network), max 5 networks cada uno
- `includeNativeTokens`: incluir ETH/MATIC/SOL nativo (default: true)

### Simulation API

Simular transacciones antes de enviarlas.

| # | Método | CU | Descripción |
|---|--------|----|-------------|
| 1 | `alchemy_simulateAssetChanges(tx)` | 40 | Asset changes de una tx |
| 2 | `alchemy_simulateAssetChangesBundle(txs[])` | 80 | Asset changes de múltiples txs |
| 3 | `alchemy_simulateExecution(tx)` | 60 | Full execution trace |
| 4 | `alchemy_simulateExecutionBundle(txs[])` | 120 | Full execution trace batch |

### Utility API

| # | Método | CU | Descripción |
|---|--------|----|-------------|
| 1 | `alchemy_getTransactionReceipts(blockNumberOrHash)` | 20 | Todos los receipts de un bloque (batch) |

### Webhooks (Notify API)

Sistema de webhooks para recibir notificaciones push en tiempo real.

#### Tipos de webhook

| Tipo | Descripción | Límite Free |
|------|-------------|-------------|
| **Address Activity** | Transferencias de tokens/ETH desde/hacia addresses trackeadas | 5 webhooks, ∞ addresses |
| **NFT Activity** | Transfers de NFTs de colecciones trackeadas | 5 webhooks |
| **Mined Transaction** | Tx específica es minada | 5 webhooks |
| **Dropped Transaction** | Tx específica es dropeada del mempool | 5 webhooks |
| **Custom Webhook** | GraphQL query sobre actividad on-chain (cualquier evento) | 5 webhooks |

#### Endpoints de gestión (Notify API)

| # | Método HTTP | Path | Descripción |
|---|-------------|------|-------------|
| 1 | `GET` | `/v2/team-webhooks` | Listar todos los webhooks |
| 2 | `POST` | `/v2/create-webhook` | Crear webhook |
| 3 | `PATCH` | `/v2/update-webhook` | Actualizar webhook (activo, addresses, filtros) |
| 4 | `DELETE` | `/v2/delete-webhook/{id}` | Eliminar webhook |
| 5 | `GET` | `/v2/webhook-addresses/{id}` | Addresses de un Address Activity webhook |
| 6 | `PUT` | `/v2/add-remove-addresses/{id}` | Añadir/remover addresses |
| 7 | `PUT` | `/v2/replace-addresses/{id}` | Reemplazar todas las addresses |
| 8 | `GET` | `/v2/webhook-nft-filters/{id}` | NFT filters de un webhook |
| 9 | `PUT` | `/v2/update-webhook-nft-filters/{id}` | Actualizar NFT filters |
| 10 | `POST` | `/v2/create-custom-webhook-variable` | Crear variable de custom webhook |
| 11 | `DELETE` | `/v2/delete-custom-webhook-variable/{id}` | Eliminar variable |
| 12 | `GET` | `/v2/get-custom-webhook-variable/{id}` | Obtener variable |
| 13 | `PATCH` | `/v2/update-custom-webhook-variable/{id}` | Actualizar variable |

#### Payload de Address Activity Webhook

```json
{
  "webhookId": "wh_abc123",
  "eventType": "ADDRESS_ACTIVITY",
  "event": {
    "network": "ETH_MAINNET",
    "activity": [{
      "fromAddress": "0x...",
      "toAddress": "0x...",
      "contractAddress": null,
      "value": 1000000000000000000,
      "asset": "ETH",
      "category": "external",
      "rawContract": { "value": "0x...", "address": null, "decimal": "0x12" },
      "log": { ... },
      "blockNum": "0x...",
      "hash": "0x..."
    }]
  }
}
```

---

### No disponibles en Free Plan

| API | Requiere | Costo aprox. |
|-----|----------|-------------|
| Debug API (`debug_traceTransaction`, etc.) | Pay as You Go+ | $0.45/M CU |
| Trace API (`trace_replayTransaction`, etc.) | Pay as You Go+ | $0.45/M CU |
| Gas Manager & Bundler API | Pay as You Go+ | $0.45/M CU |
| Yellowstone gRPC (Solana) | Add-on | $75/TB |
| Private transactions (Flashbots) | Pay as You Go+ | $0.45/M CU |
| SAML SSO / RBAC | Enterprise | Custom |

---

## Endpoints implementados en el servicio

### Métodos actuales del service

| Método service | Método RPC | CU | Descripción |
|----------------|------------|----|-------------|
| `rpcCall(method, params)` | — | Varía | JSON-RPC genérico (any method) |
| `getBalance(address)` | `eth_getBalance` | 20 | Balance ETH en wei |
| `getCode(address)` | `eth_getCode` | 20 | Bytecode del contrato |
| `ethCall(to, data)` | `eth_call` | 26 | Llamada read-only a contrato |
| `getChainId()` | `eth_chainId` | 0 | ID de la chain (1 = Ethereum) |
| `getTokenBalances(address)` | `alchemy_getTokenBalances` | 20 | Saldos ERC-20 |
| `getLogs(filter)` | `eth_getLogs` | 60 | Event logs |
| `getTransactionReceipt(txHash)` | `eth_getTransactionReceipt` | 20 | Receipt de transacción |
| `getBlockNumber()` | `eth_blockNumber` | 10 | Último bloque |

### Métodos sugeridos para agregar

| Método service sugerido | Método RPC | CU | Para qué sirve |
|-------------------------|------------|----|----------------|
| `estimateGas(tx)` | `eth_estimateGas` | 20 | Estimar gas de una tx |
| `getAssetTransfers(params)` | `alchemy_getAssetTransfers` | 120 | Historial de transfers |
| `getTokenMetadata(address)` | `alchemy_getTokenMetadata` | 10 | Metadata de token (name, symbol, decimals) |
| `getTokenPrice(symbol)` | Prices API | 10 | Precio actual de un token |
| `getTransactionCount(address)` | `eth_getTransactionCount` | 20 | Nonce de una address |
| `simulateAssetChanges(tx)` | `alchemy_simulateAssetChanges` | 40 | Simular tx antes de enviar |
| `getBlockByNumber(number)` | `eth_getBlockByNumber` | 20 | Obtener bloque completo |
| `sendRawTransaction(signedTx)` | `eth_sendRawTransaction` | 40 | Enviar tx firmada |

---

## Autenticación

- **Formato**: API key en URL path
  ```
  https://{chain}.g.alchemy.com/v2/{API_KEY}
  ```
- **Header**: `Content-Type: application/json`
- **Todas las requests**: POST con body JSON-RPC

### Endpoints por chain

| Chain | Subdominio |
|-------|-----------|
| Ethereum Mainnet | `eth-mainnet.g.alchemy.com` |
| Ethereum Sepolia | `eth-sepolia.g.alchemy.com` |
| Ethereum Holesky | `eth-holesky.g.alchemy.com` |
| Polygon PoS Mainnet | `polygon-mainnet.g.alchemy.com` |
| Polygon Amoy | `polygon-amoy.g.alchemy.com` |
| Arbitrum Mainnet | `arb-mainnet.g.alchemy.com` |
| Arbitrum Sepolia | `arb-sepolia.g.alchemy.com` |
| Base Mainnet | `base-mainnet.g.alchemy.com` |
| Base Sepolia | `base-sepolia.g.alchemy.com` |
| Optimism Mainnet | `opt-mainnet.g.alchemy.com` |
| Optimism Sepolia | `opt-sepolia.g.alchemy.com` |
| Solana Mainnet | `solana-mainnet.g.alchemy.com` |
| Solana Devnet | `solana-devnet.g.alchemy.com` |
| BNB Smart Chain | `bnb-mainnet.g.alchemy.com` |
| Avalanche C-Chain | `avax-mainnet.g.alchemy.com` |
| Scroll Mainnet | `scroll-mainnet.g.alchemy.com` |
| ZKsync Mainnet | `zksync-mainnet.g.alchemy.com` |
| Blast Mainnet | `blast-mainnet.g.alchemy.com` |
| Starknet Mainnet | `starknet-mainnet.g.alchemy.com` |
| ... 60+ más | Ver [Alchemy Chains Docs](https://docs.alchemy.com/docs/chains) |

---

## Chains soportadas (80+)

Alchemy soporta **todas las major L1, L2, L3** en un solo API key.

### EVM (Ethereum-compatible)

| # | Chain | Tipo | Mainnet | Testnets |
|---|-------|------|---------|----------|
| 1 | Ethereum | L1 | ✅ | Sepolia, Holesky |
| 2 | Base | L2 (OP) | ✅ | Sepolia |
| 3 | Arbitrum | L2 (Rollup) | ✅ | Sepolia, Nova |
| 4 | Optimism (OP Mainnet) | L2 (OP) | ✅ | Sepolia |
| 5 | Polygon PoS | Sidechain | ✅ | Amoy |
| 6 | BNB Smart Chain | L1 | ✅ | Testnet |
| 7 | Avalanche C-Chain | L1 (EVM) | ✅ | Fuji |
| 8 | Scroll | L2 (zkEVM) | ✅ | Sepolia |
| 9 | ZKsync | L2 (zkEVM) | ✅ | Sepolia |
| 10 | Blast | L2 (OP) | ✅ | Sepolia |
| 11 | Linea | L2 (zkEVM) | ✅ | Sepolia |
| 12 | Mantle | L2 (OP) | ✅ | Sepolia |
| 13 | Berachain | L1 (EVM) | ✅ | Artio |
| 14 | Celo | L1 (EVM) | ✅ | Alfajores |
| 15 | Fanto | L1 (EVM) | ✅ | Testnet |
| 16 | Frax | L2 | ✅ | Testnet |
| 17 | Mode | L2 (OP) | ✅ | Testnet |
| 18 | Metis | L2 (OP) | ✅ | Sepolia |
| 19 | Rootstock | L2 (BTC) | ✅ | Testnet |
| 20 | Ronin | L1 (EVM) | ✅ | Saigon |
| 21 | Sei | L1 (EVM) | ✅ | Atlantic |
| 22 | Sonic | L1 (EVM) | ✅ | Testnet |
| 23 | Hyperliquid | L1 | ✅ | Testnet |
| 24 | Monad | L1 (EVM) | ✅ | Testnet |
| 25 | Abstract | L2 (zkEVM) | ✅ | Testnet |
| 26 | ApeChain | L1 | ✅ | Testnet |
| 27 | BOB | L2 (BTC) | ✅ | Testnet |
| 28 | Botanix | L2 (BTC) | ✅ | Testnet |
| 29 | Citrea | L2 (BTC) | ✅ | Testnet |
| 30 | CrossFi | L1 | ✅ | Testnet |
| 31 | Degen | L3 | ✅ | Testnet |
| 32 | Gnosis | L1 | ✅ | Chiado |
| 33 | Gravity | L1 | ✅ | Testnet |
| 34 | Injective | L1 | ✅ | Testnet |
| 35 | Ink | L2 (OP) | ✅ | Sepolia |
| 36 | Kakarot | L2 | ✅ | Sepolia |
| 37 | Lens | L2 (zkEVM) | ✅ | Testnet |
| 38 | LightLink | L2 | ✅ | Testnet |
| 39 | Lisk | L2 | ✅ | Sepolia |
| 40 | Lumia | L2 | ✅ | Testnet |
| 41 | MegaETH | L2 | ✅ | Testnet |
| 42 | Moonbeam | Parachain | ✅ | Moonbase |
| 43 | Morph | L2 | ✅ | Testnet |
| 44 | opBNB | L2 (OP) | ✅ | Testnet |
| 45 | Parallel | L2 | ✅ | Testnet |
| 46 | Plasma | L2 | ✅ | Testnet |
| 47 | Polygon zkEVM | L2 (zkEVM) | ✅ | Cardona |
| 48 | Rise | L2 | ✅ | Sepolia |
| 49 | Robinhood Chain | L1 | ✅ | Testnet |
| 50 | Shape | L2 | ✅ | Sepolia |
| 51 | Soneium | L2 (OP) | ✅ | Sepolia |
| 52 | Stable | L3 | ✅ | Testnet |
| 53 | Superseed | L2 | ✅ | Testnet |
| 54 | Unichain | L2 (OP) | ✅ | Sepolia |
| 55 | World Chain | L2 (OP) | ✅ | Sepolia |
| 56 | X Layer | L2 (zkEVM) | ✅ | Testnet |
| 57 | ZetaChain | L1 | ✅ | Testnet |
| 58 | Zora | L2 (OP) | ✅ | Sepolia |

### No-EVM

| # | Chain | Tipo | Mainnet | Testnets |
|---|-------|------|---------|----------|
| 1 | Solana | Solana | ✅ | Devnet |
| 2 | Bitcoin | UTXO | ✅ | Testnet |
| 3 | Litecoin | UTXO | ✅ | Testnet |
| 4 | Dogecoin | UTXO | ✅ | Testnet |
| 5 | Bitcoin Cash | UTXO | ✅ | Testnet |
| 6 | Starknet | CairoVM | ✅ | Sepolia |
| 7 | Stellar | Stellar | ✅ | Testnet |
| 8 | Sui | Sui | ✅ | Testnet |
| 9 | Aptos | Aptos | ✅ | Testnet |
| 10 | Flow EVM | EVM+ | ✅ | Testnet |

---

## Rate limits

| Límite | Free | Pay as You Go |
|--------|------|---------------|
| Throughput | **500 CU/s** (~25 req/s) | **10,000 CU/s** (~300 req/s) |
| CU mensuales | **30M** gratis | Desde $0.45/M CU |
| Apps | 5 | 30 |
| Webhooks | 5 | 100 |
| Archive data | Incluido (30M CU) | Incluido |

### Pay As You Go — costos

| Rango | Costo por millón CU |
|-------|-------------------|
| 0 — 300M CU/mes | $0.45 |
| > 300M CU/mes | $0.40 |

**Ejemplos:**
- 120M CU/mes → 120 × $0.45 = **$54/mes**
- 460M CU/mes → 300×$0.45 + 160×$0.40 = **$199/mes**

### Manejo de errores

| HTTP | JSON-RPC Code | Significado | Acción |
|------|---------------|-------------|--------|
| 400 | — | Bad request (parámetros inválidos) | Revisar payload |
| 401 | — | API key inválida/faltante | Verificar `.env` |
| 403 | — | Endpoint no disponible en tu plan | Debug/Trace requieren PAYG+ |
| 429 | -32000 | Rate limit excedido (CU/s) | Retry con backoff exponencial |
| 429 | -32005 | CU mensual excedido | Upgrade plan o esperar al próximo mes |
| 429 | -32006 | Throughput CU excedido | Limitar concurrencia |
| 500 | -32603 | Error interno | Retry después de 1s |
| — | -32001 | Resource not found | Verificar address/chain |
| — | -32602 | Parámetros inválidos | Revisar tipos y formato |

### Estrategia de retry recomendada

```typescript
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // ms

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      // 429 o 5xx → retry con backoff exponencial + jitter
      const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

---

## WebSocket Subscriptions

### EVM

| Evento | CU | Descripción |
|--------|----|-------------|
| `newHeads` | 0 | Nuevo bloque minado |
| `logs` (con address/topics) | 0 | Logs de eventos en tiempo real |
| `newPendingTransactions` | 0 | Hashes de txs pendientes |
| `alchemy_pendingTransactions` | 0 | Full tx objects pendientes (con filtros: from, to, hashes) |
| `alchemy_minedTransactions` | 0 | Txs recién minadas (con filtros) |

### Solana

| Evento | CU | Descripción |
|--------|----|-------------|
| `accountSubscribe` | 0 | Cambios en lamports/data de una cuenta |
| `programSubscribe` | 0 | Cuentas owned by un programa |
| `logsSubscribe` | 0 | Log messages que matchean un filtro |
| `signatureSubscribe` | 0 | Estado de una signature |
| `slotSubscribe` | 0 | Nuevo slot procesado |
| `rootSubscribe` | 0 | Nuevo root slot |

### UTXO (Bitcoin, Litecoin, Dogecoin)

| Evento | CU | Descripción |
|--------|----|-------------|
| `block` | 0 | Nuevo bloque |
| `transaction` | 0 | Nueva transacción |
| `address` | 0 | Transferencias a/de una address |
| `fiat` | 0 | Actualización de precio fiat |

---

## Compute Units — resumen completo

### Por categoría

| Categoría | CU promedio | Ejemplos |
|-----------|-------------|----------|
| **Métodos gratuitos** (CU=0) | 0 CU | `eth_chainId`, `net_version`, `eth_syncing`, WS subscriptions |
| **Lecturas ligeras** | 10-20 CU | `eth_blockNumber`, `eth_gasPrice`, `eth_getBalance`, `eth_getCode` |
| **Lecturas pesadas** | 20-26 CU | `eth_call`, `eth_estimateGas`, `eth_getTransactionReceipt` |
| **Logs** | 60 CU | `eth_getLogs`, `eth_getFilterLogs` |
| **Escrituras** | 40 CU | `eth_sendRawTransaction` |
| **Token API** | 10-20 CU | `alchemy_getTokenMetadata`, `alchemy_getTokenBalances` |
| **Transfers API** | 120 CU | `alchemy_getAssetTransfers` |
| **NFT API** | 10-80 CU | Metadata=10, Ownership=40, Contracts=80 |
| **Prices API** | 10-20 CU | Current prices=10, Historical=20 |
| **Portfolio API** | 20-60 CU | Tokens=20, NFTs=40, Transactions=60 |
| **Simulation** | 40-120 CU | AssetChanges=40, Execution=60, Bundles=80-120 |
| **Trace API** (PAYG+) | 40-80 CU | `trace_call`=40, `trace_replayTransaction`=80 |
| **Debug API** (PAYG+) | 40 CU | `debug_traceTransaction`=40 |

### Costo real estimado de operaciones comunes en el pipeline

| Operación | Métodos llamados | CU total |
|-----------|-----------------|----------|
| Chain detection en EVM | `eth_getCode` (20) | **20 CU** |
| Token balances de wallet | `alchemy_getTokenBalances` (20) | **20 CU** |
| Event logs de un contrato | `eth_getLogs` (60) | **60 CU** |
| Enriquecimiento completo | `eth_call` (26) + `alchemy_getTokenMetadata` (10) | **36 CU** |
| Obtener precio de token | Prices API (10) | **10 CU** |
| Verificar si es contrato | `eth_getCode` (20) | **20 CU** |
| Subscripción WS (por evento) | — | **0 CU** |
| Transfer history de wallet | `alchemy_getAssetTransfers` (120) | **120 CU** |

### Uso proyectado mensual (30M CU gratis)

Con ~25 CU promedio por request:

| Escenario | CU/request | Requests/mes estimados |
|-----------|-----------|----------------------|
| Solo `eth_call` | 26 CU | ~1,153,846 |
| Solo `eth_getLogs` | 60 CU | ~500,000 |
| Solo `alchemy_getTokenBalances` | 20 CU | ~1,500,000 |
| Solo `alchemy_getAssetTransfers` | 120 CU | ~250,000 |
| Mix chain detection (20 CU) | 20 CU | ~1,500,000 |
| Mix enriquecimiento (36 CU) | 36 CU | ~833,333 |
| Mix típico del pipeline | ~27 CU | ~1,111,111 |

### Throughput por plan

| Throughput | Free (500 CU/s) | PAYG (10,000 CU/s) |
|------------|-----------------|---------------------|
| `eth_call` (26 CU) | ~19 req/s | ~384 req/s |
| `eth_getBalance` (20 CU) | ~25 req/s | ~500 req/s |
| `eth_getLogs` (60 CU) | ~8 req/s | ~166 req/s |
| `alchemy_getTokenBalances` (20 CU) | ~25 req/s | ~500 req/s |
| `alchemy_getAssetTransfers` (120 CU) | ~4 req/s | ~83 req/s |

---

## Ejemplos de uso

### Uso básico del service

```typescript
import { AlchemyService } from 'data-provider/alchemy';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Verificar si una dirección es un contrato
const code = await alchemy.getCode('0x...');
const isContract = code !== '0x' && code !== '0x0';

// 2. Obtener token balances de una wallet
const balances = await alchemy.getTokenBalances('0x...');
if (balances) {
  for (const token of balances.tokenBalances) {
    console.log(`${token.contractAddress}: ${token.tokenBalance}`);
  }
}

// 3. Leer estado de un contrato (ej: decimals de un ERC-20)
// selector keccak("decimals()") = 0x313ce567
const decimalsData = '0x313ce567';
const result = await alchemy.ethCall('0x...', decimalsData);

// 4. Obtener eventos Swap de Uniswap V3
const swapTopic = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const logs = await alchemy.getLogs({
  address: '0x...',
  fromBlock: '0x...',
  toBlock: 'latest',
  topics: [swapTopic],
});

// 5. Obtener receipt de una transacción
const receipt = await alchemy.getTransactionReceipt('0x...');
if (receipt) {
  console.log(`Status: ${receipt.status}`);   // '0x1' = success
  console.log(`Gas used: ${parseInt(receipt.gasUsed, 16)}`);
  console.log(`Block: ${parseInt(receipt.blockNumber, 16)}`);
}

// 6. Obtener chain ID
const chainId = await alchemy.getChainId();
// 1 = Ethereum mainnet, 137 = Polygon, 10 = Optimism, etc.

// 7. JSON-RPC genérico
const blockNum = await alchemy.rpcCall('eth_blockNumber', []);
```

### Uso en chain-detection

```typescript
// chain/detection usa AlchemyService para probar si una address
// es un contrato en cada chain EVM soportada.

async function detectChain(address: string): Promise<string | null> {
  const code = await alchemy.getCode(address);
  if (code !== '0x' && code !== '0x0') {
    return 'ethereum'; // es un contrato
  }
  return null; // EOA o no está en esta chain
}
```

### Manejo de errores

```typescript
try {
  const balance = await alchemy.getBalance('0x...');
  console.log(balance);
} catch (error) {
  if (error.message?.includes('429') || error.code === -32000) {
    // Rate limit — aplicar backoff
  } else if (error.code === -32602) {
    // Parámetros inválidos
  } else {
    // Error de red o interno
  }
}
```

### Uso con WebSocket (avanzado)

```typescript
// No implementado en el service actual, pero Alchemy soporta:
// ws[s]://eth-mainnet.g.alchemy.com/v2/{API_KEY}

// Subscribirse a nuevos bloques:
// > {"jsonrpc":"2.0","id":1,"method":"eth_subscribe","params":["newHeads"]}

// Subscribirse a logs de un contrato:
// > {"jsonrpc":"2.0","id":2,"method":"eth_subscribe",
//    "params":["logs",{"address":"0x...","topics":["0x..."]}]}
```

### Cálculo de CU para una operación completa

```typescript
// Pipeline típico de chain-detection + enrichment en EVM:
const CU_BREAKDOWN = {
  eth_getCode:       20,  // chain detection
  eth_call:          26,  // leer metadata del token
  alchemy_getTokenBalances: 20,  // balances
  // Total: 66 CU por token analizado
};

// Con 30M CU/mes gratis:
const TOTAL_MONTHLY_CU = 30_000_000;
const CU_PER_TOKEN = 66;
const MAX_TOKENS_PER_MONTH = Math.floor(TOTAL_MONTHLY_CU / CU_PER_TOKEN);
// ≈ 454,545 tokens/mes gratis solo con estos métodos
```
