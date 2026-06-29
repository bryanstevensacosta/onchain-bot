# Core — Abstract DataProvider base + Global Module

Módulo raíz de la capa `data-provider/`. Define el contrato abstracto `DataProviderPort` y el módulo `@Global()` que agrega todos los providers existentes.

> **Índice general** → [`data-provider/README.md`](../README.md)

| Archivo | Descripción |
|---------|-------------|
| `data-provider.port.ts` | Clase abstracta base con `name`, `logger`, `onModuleInit()` |
| `data-provider.module.ts` | `@Global()` module que importa y exporta los 11 providers |
| `index.ts` | Barrel export del port + module + servicios registrados |

## Uso

```typescript
import { DataProviderModule } from 'data-provider/core';

// Importar una vez en AppModule (es @Global).
// Luego inyectar cualquier servicio directamente:

@Injectable()
export class SomeService {
  constructor(
    private readonly dex: DexScreenerService,
    private readonly helius: HeliusService,
  ) {}
}
```

## Proveedores registrados

| Provider | Módulo | Servicio | Exportado |
|----------|--------|----------|:---------:|
| DexScreener | `DexScreenerModule` | `DexScreenerService` | ✅ |
| GeckoTerminal | `GeckoTerminalModule` | `GeckoTerminalService` | ✅ |
| CoinGecko | `CoinGeckoModule` | `CoinGeckoService` | ✅ |
| Birdeye | `BirdeyeModule` | `BirdeyeService` | ✅ |
| Mobula | `MobulaModule` | `MobulaService` | ✅ |
| Moralis | `MoralisModule` | `MoralisService` | ✅ |
| CoinMarketCap | `CoinMarketCapModule` | `CoinMarketCapService` | ✅ |
| Alchemy | `AlchemyModule` | `AlchemyService` | ✅ |
| RugCheck | `RugCheckModule` | `RugCheckService` | ✅ |
| SolanaRPC | `SolanaRpcModule` | `SolanaRpcService` | ✅ |
| Helius | `HeliusModule` | `HeliusService` | ✅ |
| FluxRPC | `FluxRpcModule` | `FluxRpcService` | ✅ |
| PumpDev | `PumpDevModule` | `PumpDevService` | ✅ |

## Nota

Los servicios sueltos de `index.ts` (`CoinMarketCapService`, `FluxRpcService`, etc.) son re-exportados por conveniencia. El `DataProviderModule` es la forma correcta de registrar todo en NestJS.
