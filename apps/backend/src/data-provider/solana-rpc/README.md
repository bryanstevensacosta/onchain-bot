# Solana RPC — Data Provider

Cliente JSON-RPC 2.0 para Solana. Provee holders data (`getTokenLargestAccounts`) y chain probing (`getAccountInfo`) con failover automático: primary (Helius) → fallback (public Solana RPC).

---

## Visión

Provider de acceso directo a la blockchain de Solana vía JSON-RPC. En el pipeline se usa para:

- **Chain Explorer**: top-20 holders + top10% holder concentration via `getTokenLargestAccounts`
- **Chain Detection**: verificar existencia de cuentas via `getAccountInfo`

### Tipo de datos que ofrece

- **Holders**: top-20 token accounts con amounts y decimals
- **Account info**: data, executable, lamports, owner, rentEpoch
- **Failover**: primary RPC → public RPC automático en errores de transporte

## Configuración

| Variable | Descripción |
|----------|-------------|
| `primaryRpcUrl` | Helius mainnet RPC URL (de `HELIUS_RPC_URL_MAINNET`) |
| `fallbackRpcUrl` | `https://api.mainnet.solana.com` (hardcoded) |

Sin `primaryRpcUrl`, todas las llamadas van directo al public RPC de Solana.

## Endpoints implementados

| Método service | Método RPC | Descripción |
|----------------|------------|-------------|
| `getTokenLargestAccounts(mintAddress)` | `getTokenLargestAccounts` | Top-20 holders de un SPL Token mint |
| `getAccountInfo(address)` | `getAccountInfo` | Estado y metadata de una cuenta |

### getTokenLargestAccounts

Retorna las 20 cuentas token más grandes para un SPL Token mint.

```json
// Request
{
  "jsonrpc": "2.0",
  "id": "solana-rpc",
  "method": "getTokenLargestAccounts",
  "params": ["3wyAj7Rt1TWVPZVteFJPLa26JmLvdb1CAKEFZm3NY75E"]
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 1114 },
    "value": [
      { "address": "FYjHNoFtSQ5uijKrZFyYAxvEr87hsKXkXcxkcmkBAf4r",
        "amount": "771", "decimals": 2, "uiAmount": 7.71, "uiAmountString": "7.71" }
    ]
  }
}
```

### getAccountInfo

Retorna el estado de una cuenta. `null` si la cuenta no existe.

```json
// Request
{
  "jsonrpc": "2.0",
  "id": "solana-rpc",
  "method": "getAccountInfo",
  "params": [
    "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
    { "encoding": "base58", "commitment": "confirmed" }
  ]
}

// Response (cuenta existe)
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 341197053 },
    "value": {
      "data": ["", "base58"],
      "executable": false,
      "lamports": 88849814690250,
      "owner": "11111111111111111111111111111111",
      "rentEpoch": 18446744073709551615
    }
  }
}

// Response (cuenta NO existe)
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 341197053 },
    "value": null
  }
}
```

## Failover logic

```
getTokenLargestAccounts(address)
  │
  ├── primaryRpcUrl (Helius) → ¿responde?
  │   ├── Sí → devuelve resultado
  │   └── Error transporte → fallback
  │
  └── publicRpcUrl → ¿responde?
      ├── Sí → devuelve resultado
      └── Error → null
```

Errores 404 (protocol errors) short-circuit a `null` sin fallback.

## Rate limits

| RPC | Rate limit | Uso |
|-----|:----------:|-----|
| Helius (primary, con API key) | 1M CU/mes (plan free) | 1 CU = 1 request |
| Public Solana (fallback) | ~100 req/10s por IP | Sin API key, compartido |

### Estrategia

1. Helius primary para máxima confiabilidad (requiere `HELIUS_API_KEY`)
2. Public RPC como fallback solo en errores de transporte (no para 400/404)
3. Timeout de 10s por RPC call

## Diferencias con FluxRpcService

| Aspecto | FluxRpcService | SolanaRpcService |
|---------|:---------------|:-----------------|
| Protocolo | HTTP/3 + QUIC | HTTP/1.1 JSON-RPC estándar |
| Endpoints | `getTokenSupply`, `getBalance`, etc. | `getTokenLargestAccounts`, `getAccountInfo` |
| Config | `FLUXRPC_API_KEY` | `SOLANA_RPC_CONFIG` (Helius URL) |
| Fallback | No | Sí (public Solana RPC) |
| Uso | RPC general | Holders + chain probing |

## Response types

```typescript
interface TokenAccountEntry {
  readonly address: string;            // Token-account address (base58)
  readonly amount: string;             // Raw balance (base-10 integer string)
  readonly decimals: number;           // Decimal places configured on mint
  readonly uiAmount: number | null;    // Scaled balance (deprecated)
  readonly uiAmountString: string;     // Scaled balance as string
}

interface AccountInfoResult {
  readonly context?: { readonly slot: number };
  readonly value?: {
    readonly data: readonly [string, string];  // [data, encoding]
    readonly executable: boolean;               // Is a program?
    readonly lamports: number;                  // SOL balance (lamports)
    readonly owner: string;                     // Owner program pubkey
    readonly rentEpoch: number;                 // Next rent epoch
    readonly space?: number;                    // Data size in bytes
  } | null;
}
```

## Ejemplos de uso

```typescript
import { SolanaRpcService } from 'data-provider/solana-rpc';

@Injectable()
export class SomeService {
  constructor(private readonly rpc: SolanaRpcService) {}

  async analyzeHolders(mint: string) {
    const accounts = await this.rpc.getTokenLargestAccounts(mint);
    if (!accounts) return null;

    // Top-10 concentration
    let total = 0n;
    for (const acc of accounts) total += BigInt(acc.amount);
    let top10 = 0n;
    for (let i = 0; i < Math.min(10, accounts.length); i++)
      top10 += BigInt(accounts[i].amount);
    const pct = Number((top10 * 10000n) / total) / 100;

    return { holders: accounts.length, top10Percent: pct };
  }

  async accountExists(address: string) {
    const info = await this.rpc.getAccountInfo(address);
    return info !== null;
  }
}
```

## Referencias

- [Solana RPC Documentation](https://solana.com/docs/rpc)
- [getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts)
- [getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo)
- [Solana JSON Structures](https://solana.com/docs/rpc/json-structures)
- [Helius RPC Docs](https://docs.helius.dev/)
