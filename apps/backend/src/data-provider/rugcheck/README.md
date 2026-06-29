# RugCheck — Data Provider

Token safety scanner para Solana. Provee locked liquidity % y burned % para tokens Solana, basado en el reporte de [RugCheck.xyz](https://rugcheck.xyz/).

---

## Visión

RugCheck analiza tokens Solana con 20+ checks de seguridad: mint authority, freeze authority, LP burns, sniper wallets, bundlers, y más. En el pipeline se usa para los gauges de `lockedLiquidityPercent` y `burnedPercent` en la UI.

### Tipo de datos que ofrece

- **lockedLiquidityPercent**: % de LP tokens bloqueados (suma de todos los lockers)
- **burnedPercent**: % del total supply quemado
- **Riesgos**: lista de risks detectados (no expuesto actualmente en el adapter)

## Proveedor free, sin API key

| Característica | Valor |
|----------------|-------|
| Autenticación | **No requiere API key** (endpoints públicos) |
| Rate limit | ~10 req/min (no documentado explícitamente) |
| Endpoints usados | `GET /v1/tokens/{mint}/report/summary` |

## Endpoint implementado

| Método service | Endpoint | Descripción |
|----------------|----------|-------------|
| `getSummary(address)` | `GET /v1/tokens/{address}/report/summary` | Resumen de seguridad del token |
| `getMockData(address)` | — | Fallback determinístico (basado en hash de address) |

### Response type

```typescript
interface RugCheckSummary {
  tokenProgram: string;              // "solana" | "token-2022"
  tokenType: string;                 // "TOKEN" | "ACCOUNT"
  risks: ReadonlyArray<unknown>;     // Lista de riesgos detectados
  lockedLiquidity: ReadonlyArray<{
    amount: number;
    percent: number;                 // % del LP que está lockeado
    tokenAddress: string;
  }>;
  totalMarketLiquidity: number | null;
  totalLPProviders: number | null;
  totalSupply: number | null;
  burnedPercent: number | null;      // % del supply quemado
}
```

### Ejemplo curl

```bash
curl -s https://api.rugcheck.xyz/v1/tokens/So11111111111111111111111111111111111111112/report/summary | jq
```

## Fallback system

El adapter sigue esta lógica:

1. Llama a `getSummary(address)` contra la API real
2. Si la API responde con datos (lockedLiquidity o burnedPercent) → usa los reales
3. Si la API devuelve 404 o no tiene datos → genera mock data determinística basada en hash del address
4. Mock data: `lockedLiquidityPercent = 50 + (hash % 50)`, `burnedPercent = hash % 30`

Esto asegura que el gauge de seguridad siempre tenga valores para mostrar en la UI, incluso para tokens sin reporte en RugCheck.

## Todos los endpoints disponibles

Basado en el [Swagger de RugCheck](https://api.rugcheck.xyz/swagger/index.html) y la [documentación en FluxRPC](https://fluxrpc.com/docs/rugcheck):

### Tokens (endpoints más relevantes)

| # | Endpoint | Auth | Descripción |
|---|----------|:----:|-------------|
| 1 | `GET /v1/tokens/{id}/report/summary` | ❌ | Resumen de seguridad del token **(implementado)** |
| 2 | `GET /v1/tokens/{id}/report` | ❌ | Reporte completo del token |
| 3 | `GET /v1/tokens/{id}/metadata` | ❌ | Metadata (imagen, nombre, símbolo) |
| 4 | `GET /v1/tokens/{id}/image` | ❌ | Imagen del token |
| 5 | `GET /v1/tokens/{id}/lockers` | ✅ | LP lockers del token |
| 6 | `GET /v1/tokens/{id}/lockers/flux` | ✅ | LP lockers desde Flux Locker |
| 7 | `GET /v1/tokens/{id}/insiders/graph` | ❌ | Grafo de insiders |
| 8 | `GET /v1/tokens/{id}/insiders/networks` | ❌ | Redes de insiders |
| 9 | `POST /v1/tokens/{id}/report` | ✅ | Reportar token sospechoso |
| 10 | `POST /v1/tokens/verify` | ✅ | Verificar token |
| 11 | `GET /v1/tokens/{id}/vote` | ❌ | Estadísticas de votos |
| 12 | `POST /v1/tokens/{id}/vote` | ✅ | Votar por un token |
| 13 | `POST /v1/bulk/tokens/report` | ✅ | Reportes batch |
| 14 | `POST /v1/bulk/tokens/summary` | ✅ | Summary batch |

### Stats

| # | Endpoint | Descripción |
|---|----------|-------------|
| 15 | `GET /v1/creators/{wallet}` | Historial de rug pulls de un creator |
| 16 | `GET /v1/leaderboard` | Leaderboard de usuarios |
| 17 | `GET /v1/stats/analytics` | Métricas agregadas (lanzamientos, rugs por plataforma) |
| 18 | `GET /v1/stats/new_tokens` | Tokens recién detectados |
| 19 | `GET /v1/stats/recent` | Tokens más vistos |
| 20 | `GET /v1/stats/rugs/stream` | SSE stream de rug events en vivo |
| 21 | `GET /v1/stats/rugs/ticker` | Últimos rug events para ticker |
| 22 | `GET /v1/stats/trending` | Más votados en 24h |
| 23 | `GET /v1/stats/verified` | Tokens recién verificados |

### General

| # | Endpoint | Descripción |
|---|----------|-------------|
| 24 | `GET /ping` | Health check |
| 25 | `GET /v1/maintenance` | Maintenance status |
| 26 | `GET /v1/domains` | Dominios .token registrados |
| 27 | `GET /v1/domains/lookup/{id}` | Lookup de dominio |

## Chains soportadas

- **Solana** únicamente. El adapter en `fetch()` devuelve `null` para cualquier `chain.value !== 'solana'`.

## Diferencias con la API pública

| Aspecto | API RugCheck | Nuestro service |
|---------|:------------|:----------------|
| Reporte completo | `GET /v1/tokens/{id}/report` | No implementado (demasiado pesado para el pipeline) |
| Summary | `GET /v1/tokens/{id}/report/summary` | ✅ `getSummary(address)` |
| Bulk | `POST /v1/bulk/tokens/summary` | No implementado (el pipeline opera 1 token a la vez) |
| Votar | `POST /v1/tokens/{id}/vote` | No implementado (no necesario para enrichment) |
| Mock data | No disponible | ✅ Determinístico, basado en hash |

## Ejemplos de uso

```typescript
import { RugCheckService } from 'data-provider/rugcheck';

@Injectable()
export class SomeService {
  constructor(private readonly rugcheck: RugCheckService) {}

  async checkToken(mint: string) {
    // 1. Intentar API real
    const summary = await this.rugcheck.getSummary(mint);
    if (summary) {
      const lockedPct = summary.lockedLiquidity.reduce(
        (s, l) => s + (l.percent ?? 0), 0
      );
      console.log(`Locked: ${lockedPct}%, Burned: ${summary.burnedPercent}%`);
      return;
    }

    // 2. Fallback mock
    const mock = this.rugcheck.getMockData(mint);
    console.log(`Mock — Locked: ${mock.lockedLiquidityPercent}%, Burned: ${mock.burnedPercent}%`);
  }
}
```

## Referencias

- [RugCheck.xyz](https://rugcheck.xyz/)
- [Swagger UI](https://api.rugcheck.xyz/swagger/index.html)
- [FluxRPC Docs - RugCheck API](https://fluxrpc.com/docs/rugcheck)
- [Apidog Guide](https://apidog.com/blog/rugcheck-api/)
