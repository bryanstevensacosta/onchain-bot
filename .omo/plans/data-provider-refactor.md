# Plan de Refactorización: Data Providers

> **Referencia**: `dexscreener/` como patrón canónico
> **Objetivo**: Estandarizar los 9 providers bajo un mismo patrón estructural
> **Principio**: Consistencia > creatividad individual

---

## 1. Visión General

### Problema

Cada provider fue implementado de forma independiente, resultando en 9 estilos distintos para:
- Manejo de HTTP helpers (per-method, generic helper, axios client)
- Formato de error handling
- Estructura del constructor
- Estilo de JSDoc y comentarios
- Organización del servicio (section headers, grouping)
- Exports y naming

### Solución

Estandarizar todos los providers siguiendo el patrón de `dexscreener/` como referencia canónica, con variaciones mínimas donde la API del proveedor lo exija.

---

## 2. Patrón Canónico (DexScreener-derived)

### 2.1 Service — Estructura

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/__core__/data-provider.port';
import type { ProviderConfig } from './provider.config';
import { PROVIDER_CONFIG } from './provider.config';
import type { SomeType } from './provider.types';

const BASE = 'https://api.provider.com';

/**
 * ProviderName market data provider.
 *
 * Short description of what this provider does.
 *
 * @see https://docs.provider.com/
 */
@Injectable()
export class ProviderService extends DataProviderPort {
  public readonly name = 'provider';
  protected readonly logger = new Logger(ProviderService.name);

  // ── Private fields ──────────────────────────
  private readonly apiKey: string;

  constructor(@Inject(PROVIDER_CONFIG) config: ProviderConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(`${ProviderService.name} API key missing — provider will return null`);
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('ProviderName provider initialized');
    }
  }

  // ───────────────────────────────────────────────
  //  Method group name
  // ───────────────────────────────────────────────

  /** JSDoc describing the method. */
  async getSomething(param: string): Promise<ReturnType | null> {
    try {
      const { data } = await axios.get<ResponseType>(
        `${BASE}/endpoint/${param}`,
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data?.result ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`ProviderName getSomething failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ... more methods
}
```

### 2.2 Reglas del patrón

| Regla | Descripción |
|-------|-------------|
| **BASE** | `const BASE = 'https://...'` a nivel de módulo (no dentro de la clase) |
| **name** | `public readonly name = 'provider'` — lowercase, sin espacios |
| **logger** | `protected readonly logger = new Logger(ProviderService.name)` |
| **apiKey** | `private readonly apiKey: string` — siempre guardar como field |
| **constructor** | Inyectar config, guardar apiKey, warn si falta |
| **onModuleInit** | Log de inicialización (siempre que apiKey exista) |
| **JSDoc class** | `@see` link a docs oficiales |
| **JSDoc methods** | Todos los métodos públicos deben tener JSDoc |
| **Section comments** | `// ──────────────────` separadores entre grupos lógicos |
| **HTTP client** | `axios.get<T>()` / `axios.post<T>()` con timeout 8_000ms |
| **Error handling** | 404→null, otros→debug log + null |
| **Response unwrap** | Desenvolver response.data según estructura del provider |
| **Return types** | Siempre en `provider.types.ts`, no inline en service |
| **Timeout** | 8_000ms salvo que el provider requiera otro |

### 2.3 Reglas de module

```typescript
@Module({
  providers: [
    {
      provide: PROVIDER_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): ProviderConfig =>
        cs.get<ProviderConfig>('app.provider') ?? { apiKey: '' },
    },
    ProviderService,
  ],
  exports: [ProviderService],
})
export class ProviderModule {
  public static forRoot(config: ProviderConfig): DynamicModule {
    return {
      module: ProviderModule,
      providers: [
        { provide: PROVIDER_CONFIG, useValue: config },
        ProviderService,
      ],
      exports: [ProviderService],
    };
  }
}
```

Reglas:
- `useFactory` default: siempre `{ apiKey: '' }` (salvo fields extra)
- `forRoot()` acepta el config type exacto
- exports solo el servicio (no el token de config)

### 2.4 Reglas de config

```typescript
export const PROVIDER_CONFIG = 'PROVIDER_CONFIG';

export interface ProviderConfig {
  readonly apiKey: string;
}
```

- Siempre `apiKey: string` (requerido), salvo DexScreener que es opcional
- Campos extra solo cuando el provider lo requiere (PumpDev: walletPublic/walletPrivate, FluxRPC: rpcUrl, Helius: mainnet/devnet)

### 2.5 Reglas de types

- Todos los tipos en `provider.types.ts`
- Nombres con prefijo del provider: `BirdeyeTokenOverview`, `CmcQuote`, etc.
- Usar `readonly` en todos los campos de interfaces
- Usar `ReadonlyArray<T>` para arrays en interfaces
- NO tipos inline en service.ts (Moralis/Mobula violan esto)

### 2.6 Reglas de index.ts

```typescript
export { ProviderModule } from './provider.module';
export { ProviderService } from './provider.service';
export { PROVIDER_CONFIG, ProviderConfig } from './provider.config';
```

- Sin `.js` extensiones (Helius viola esto)
- Exportar module + service + config

---

### 2.7 Reglas de integración con chain/ adapters

Cada adapter en `chain/explorer/infrastructure/providers/` debe:
- Importar el service desde `data-provider/{provider}/{provider}.service` (no raw axios)
- Delegar la llamad HTTP al service, no duplicarla
- Mantener en el adapter solo la lógica de transformación chain/address → MarketData
- No duplicar CHAIN_MAP/PLATFORM_MAP que ya existe en el service

Los adapters en `chain/detection/infrastructure/probers/` deben seguir el mismo principio:
- `EvmChainProberAdapter` ya usa `AlchemyService` ✅
- `SolanaChainProberAdapter` aún crea `JsonRpcClient` directo ❌

---

## 3. Auditoría por Provider

### 3.1 [✅ DONE] DexScreener — Patrón Referencia

**Estado**: OK, es la referencia. No tocar.

### 3.2 Birdeye

| Aspecto | Actual | Debería |
|---------|--------|---------|
| HTTP helper | `get<T>(path, params)` genérico | Per-method try/catch como DexScreener |
| Error handling | `!data.success`→null | Igual, funciona (response wrapping) |
| Timeout | 5_000ms | 8_000ms |
| Constructor | `apiKey` field directo | OK |
| `onModuleInit` | `if (apiKey)` loggea | OK |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | Mínimo | Expandir |
| Constants naming | `BASE_URL` | `BASE` (consistente con DexScreener) |

### 3.3 Alchemy

| Aspecto | Actual | Debería |
|---------|--------|---------|
| HTTP helper | `rpcCall<T>(method, params)` genérico | Mantener helper pero estandarizar nombre |
| Error handling | `data.error`→null+debug | OK |
| Timeout | 8_000ms | OK |
| Constructor | `apiKey` + `rpcUrl` | OK (necesita rpcUrl) |
| `onModuleInit` | `if (apiKey)` loggea | OK |
| Section comments | ❌ No tiene | Agregar |
| Constants | `ALCHEMY_RPC` externo | OK |
| return type `getChainId` | Promise<number \| null> | OK |
| `getBalance` return | `string \| null` (hex wei) | Agregar convenience method para number |
| `getLogs` return | `ReadonlyArray<LogEntry> \| null` | OK |

### 3.4 CoinMarketCap

| Aspecto | Actual | Debería |
|---------|--------|---------|
| HTTP helper | `request<T>(path, params)` genérico | Mantener helper (CMC tiene response wrapping especial) |
| Error handling | `error_code !== 0` + 404 | OK |
| Timeout | 8_000ms | OK |
| Constructor | `apiKey` + `axios.create` | Mantener axios.create (unique headers) |
| `onModuleInit` | `if (apiKey)` loggea | OK |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | OK buenos | Expandir returns |
| Constants naming | `BASE_URL` + `HEADER_KEY` | Mantener (son 2 constantes) |
| Return types | Modelos con `CmcXxxResponse` anidados | Simplificar (usar `data` directamente) |

### 3.5 Helius

| Aspecto | Actual | Debería |
|---------|--------|---------|
| HTTP helpers | 2 helpers: `rpcCall()` + `dasCall()` | Simplificar a 1 helper genérico + per-method |
| Config | `apiKey + mainnet.rpcUrl + devnet.rpcUrl` | Simplificar (solo mainnet? o mantener pero estandarizar) |
| Constructor | Crea 2 URLs + 3 helpers | Simplificar |
| `onModuleInit` | Log con stats | OK |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | Algunos sin JSDoc | Completar |
| index.ts | Usa `./helius.types.js` | Cambiar a `./helius.types` sin `.js` |
| Timeout | 10_000ms | 8_000ms |

### 3.6 Mobula

| Aspecto | Actual | Debería |
|---------|--------|---------|
| Pattern | Per-method axios.get (similar a DexScreener) | ✅ Casi OK |
| Auth | `_headers` getter con `Authorization` | Inline en cada método o field constante |
| Constructor | guarda `apiKey` | OK |
| `onModuleInit` | Log simple | OK |
| CHAIN_MAP | En types.ts | Mover a service.ts como constante privada |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | Mínimo sin `@see` | Expandir |
| Response types | Algunos inline | Mover a types.ts |
| Error handling | 404→null, outros→null+debug | OK |
| BASE constant | Per-method inline | Extraer a constante |

### 3.7 Moralis

| Aspecto | Actual | Debería |
|---------|--------|---------|
| Pattern | Per-method axios.get | ✅ Casi OK |
| Auth | `_headers` getter con `X-API-Key` | Inline en cada método o field constante |
| Constructor | guarda `apiKey` | OK |
| `onModuleInit` | Log simple | OK |
| CHAIN_MAP | En types.ts | Mover a service.ts |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | Mínimo sin `@see` | Expandir |
| Response types | Objetos inline en return type | Mover a types.ts |
| Error handling | 404→null, others→null+debug | OK |
| BASE constant | Per-method inline | Extraer a constante |

### 3.8 PumpDev

| Aspecto | Actual | Debería |
|---------|--------|---------|
| HTTP helper | `post<T>(path, data)` genérico | Per-method try/catch |
| Constructor | Crea `axios.create` + null si no apiKey | No crear cliente, usar axios directo |
| `onModuleInit` | `if (apiKey)` loggea | OK |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | OK | Expandir returns |
| Error handling | 404→null, others→null+debug | OK |
| Timeout | 10_000ms | 8_000ms |
| Client pattern | `axios.create` condicional | Cambiar a axios.get/post directo |
| Types | Request/Response separados | OK |

### 3.9 FluxRPC

| Aspecto | Actual | Debería |
|---------|--------|---------|
| HTTP helper | `rpcCall<T>(method, params)` genérico | Mantener helper (JSON-RPC) |
| Constructor | Crea cliente con apiKey en URL | Simplificar a field + método |
| `onModuleInit` | `if (apiKey && rpcUrl)` log | OK |
| Section comments | ❌ No tiene | Agregar |
| JSDoc methods | OK | Expandir returns |
| Error handling | `data.error`→null+debug | OK |
| Timeout | 10_000ms | 8_000ms |
| Client pattern | `axios.create` | Cambiar a axios.post directo |
| Types | JsonRpcRequest/Response genéricos | OK |

### 3.10 [✅ DONE] GeckoTerminal — Nuevo Provider

**Estado**: Creado desde cero siguiendo el patrón canónico. Sin refactor necesario.

| Aspecto | Estado |
|---------|--------|
| Service | `getTokenInfo(networkSlug, address)` — per-method try/catch ✅ |
| Config | Sin apiKey (gratis) — `GeckoTerminalConfig` con `apiKey?` opcional ✅ |
| Types | `GeckoTerminalTokenInfo`, `GeckoTerminalAttributes`, etc. en types.ts ✅ |
| Module | `GeckoTerminalModule` con `forRoot()` y `useFactory` desde ConfigService ✅ |
| README | Documentación completa con API ref, rate limits, networks, ejemplos ✅ |
| Adapter | `GeckoTerminalAdapter` refactorizado para usar `GeckoTerminalService` ✅ |
| Chain resolution | Slug vía `CHAIN_CATALOG` (no hardcoded) mantenido en adapter ✅ |

### 3.11 [✅ DONE] CoinGecko — Nuevo Provider

**Estado**: Creado desde cero siguiendo el patrón canónico. Sin refactor necesario.

| Aspecto | Estado |
|---------|--------|
| Service | `getTokenContractInfo(platform, address)` — per-method try/catch ✅ |
| Config | `CoinGeckoConfig` con `apiKey` requerido ✅ |
| Types | `CoinGeckoTokenInfo`, `CoinGeckoResponse`, `CoinGeckoMarketData` en types.ts ✅ |
| Module | `CoinGeckoModule` con `forRoot()` y `useFactory` desde ConfigService ✅ |
| README | Documentación completa con API ref, rate limits, platform IDs, pricing ✅ |
| Adapter | `CoinGeckoAdapter` refactorizado para usar `CoinGeckoService` ✅ |
| Chain resolution | `PLATFORM_MAP` mantenido en adapter (lógica de dominio) ✅ |

---

## 4. Orden de Refactorización

**Orden recomendado** (de menor riesgo a mayor):

```
1. Mobula       ✅ Casi OK, cambios cosméticos
2. Moralis      ✅ Casi OK, cambios cosméticos
3. Birdeye      ⚠️ Helper genérico → per-method
4. PumpDev      ⚠️ Helper genérico → per-method
5. CoinMarketCap ⚠️ Helper genérico → per-method
6. Alchemy      ⚠️ Helper genérico, JSDoc, timeout
7. FluxRPC      ⚠️ Helper genérico, client pattern, timeout
8. Helius       🔴 Más complejo: config, helpers, index.js
```

Razón: Mobula y Moralis ya siguen per-method, solo necesitan limpieza cosmética. Birdeye y PumpDev son pequeños y fáciles de convertir. Alchemy y FluxRPC tienen JSON-RPC que justifica mantener helper. Helius es el más complejo por su configuración anidada.

> **Nuevos providers (ya conformes al patrón)**: GeckoTerminal, CoinGecko — no requieren refactor.

---

## 5. Especificaciones por Provider

### 5.0a [✅ DONE] GeckoTerminal — Nuevo Provider

| Archivo | Propósito |
|---------|-----------|
| `geckoterminal.config.ts` | Config token (sin apiKey necesaria) |
| `geckoterminal.types.ts` | `GeckoTerminalAttributes`, `GeckoTerminalTokenData`, `GeckoTerminalTokenInfo` |
| `geckoterminal.service.ts` | `getTokenInfo(networkSlug, address)` — per-method, timeout 8s |
| `geckoterminal.module.ts` | Módulo NestJS con `forRoot()` |
| `index.ts` | Barrel export |

**Adapter**: `GeckoTerminalAdapter` inyecta `GeckoTerminalService`, mantiene resolución de slug via `CHAIN_CATALOG`.

**API**: `GET https://api.geckoterminal.com/api/v2/networks/{slug}/tokens/{address}/info`

### 5.0b [✅ DONE] CoinGecko — Nuevo Provider

| Archivo | Propósito |
|---------|-----------|
| `coingecko.config.ts` | Config con `apiKey` requerido |
| `coingecko.types.ts` | `CoinGeckoImage`, `CoinGeckoMarketData`, `CoinGeckoTokenInfo` |
| `coingecko.service.ts` | `getTokenContractInfo(platform, address)` — per-method, timeout 8s |
| `coingecko.module.ts` | Módulo NestJS con `forRoot()` |
| `index.ts` | Barrel export |

**Adapter**: `CoinGeckoAdapter` inyecta `CoinGeckoService`, mantiene `PLATFORM_MAP` para resolución chain→platform.

**API**: `GET https://api.coingecko.com/api/v3/coins/{platform}/contract/{address}`

### 5.1 Mobula — Refactor

**Archivos**: `mobula.service.ts`, `mobula.types.ts`

**Cambios**:
1. [service] Extraer `const BASE = 'https://api.mobula.io/api/1'`
2. [service] Reemplazar `private get _headers()` por header inline o field
3. [service] Agregar section comments (`// ──────────────────`)
4. [service] Mejorar JSDoc en todos los métodos (actual: mínimo)
5. [types] Mover CHAIN_MAP de types.ts a mobula.service.ts como `private readonly CHAIN_MAP`
6. [types] Mover tipos inline de service a types.ts
7. [service] Unificar timeout a 8_000ms

### 5.2 Moralis — Refactor

**Archivos**: `moralis.service.ts`, `moralis.types.ts`

**Cambios**:
1. [service] Extraer `const BASE = 'https://deep-index.moralis.io/api/v2'`
2. [service] Reemplazar `private get _headers()` por inline o field
3. [service] Agregar section comments
4. [service] Mejorar JSDoc en todos los métodos
5. [types] Mover CHAIN_MAP de types.ts a moralis.service.ts
6. [types] Mover tipos inline (Promise<{...}>) a types.ts con interfaces nombradas
7. [service] Unificar timeout a 8_000ms

### 5.3 Birdeye — Refactor

**Archivos**: `birdeye.service.ts`

**Cambios**:
1. [service] Convertir `get<T>(path, params)` genérico a per-method try/catch
2. [service] Extraer `const BASE = 'https://public-api.birdeye.so'` (de `BASE_URL`)
3. [service] Cambiar timeout de 5_000ms a 8_000ms
4. [service] Agregar section comments
5. [service] Expandir JSDoc (actual: one-liner)
6. [service] `x-chain` header → field constante o inline por método

### 5.4 PumpDev — Refactor

**Archivos**: `pumpdev.service.ts`

**Cambios**:
1. [service] Eliminar `private client` + `axios.create` condicional
2. [service] Convertir `post<T>(path, data)` a per-method try/catch con axios.post directo
3. [service] Extraer `const BASE = 'https://pumpdev.io/api'` (ya existe)
4. [service] Cambiar timeout de 10_000ms a 8_000ms
5. [service] Agregar section comments
6. [service] `X-API-Key` header inline en cada método

### 5.5 CoinMarketCap — Refactor

**Archivos**: `coinmarketcap.service.ts`

**Cambios**:
1. [service] Eliminar `private client` + `axios.create` (usar axios.get directo)
2. [service] Convertir `request<T>(path, params)` a per-method try/catch
3. [service] Simplificar response: `const { data } = await axios.get(...)` en cada método
4. [service] Agregar section comments
5. [service] Renombrar `BASE_URL` → `BASE`
6. [types] Simplificar tipos `CmcXxxResponse` (envoltura `data` ya se resuelve en service)

### 5.6 Alchemy — Refactor

**Archivos**: `alchemy.service.ts`

**Cambios**:
1. [service] Renombrar `ALCHEMY_RPC` → `const BASE = 'https://eth-mainnet.g.alchemy.com/v2'`
2. [service] Mantener `rpcCall<T>()` helper (JSON-RPC justifica helper), pero no exponerlo como public
3. [service] Agregar section comments
4. [types] Mantener tipos (están bien)
5. [service] Mejorar JSDoc con `@see` links a docs de Alchemy
6. [service] NO timeout change (8_000ms ya)

### 5.7 FluxRPC — Refactor

**Archivos**: `fluxrpc.service.ts`

**Cambios**:
1. [service] Eliminar `private client` + `axios.create` condicional
2. [service] Mantener `rpcCall<T>(method, params)` helper (JSON-RPC lo justifica)
3. [service] Implementar per-method con axios.post directo en rpcCall
4. [service] Cambiar timeout de 10_000ms a 8_000ms
5. [service] Agregar section comments
6. [service] Extraer lógica URL de constructor a constante
7. [service] Mejorar JSDoc

### 5.8 Helius — Refactor

**Archivos**: `helius.service.ts`, `helius.config.ts`, `helius.types.ts`, `helius/index.ts`

**Cambios**:
1. [config] Simplificar `HeliusConfig`: evaluar si mantener `mainnet.rpcUrl`/`devnet.rpcUrl` o aplanar
   - Opción A: Mantener estructura actual pero estandarizar naming
   - Opción B: Aplanar a `rpcUrlMainnet`, `rpcUrlDevnet` como strings planos
   - **Recomendación**: Opción A (menos breaking change)
2. [service] Simplificar: unificar `rpcCall()` y `dasCall()` en un solo helper
3. [service] Eliminar `createTokenImageCache` (lógica de negocio no pertenece al provider)
4. [service] Agregar section comments
5. [service] Completar JSDoc en todos los métodos
6. [service] Cambiar timeout de 10_000ms a 8_000ms
7. [index] Cambiar `./helius.types.js` → `./helius.types`

---

## 6. Estrategia de Implementación

### Principios

1. **Un provider por PR** — cada refactor es un cambio aislado y revisable
2. **No breaking changes** — la firma de los métodos públicos NO cambia
3. **Tests** — verificar que `tsc --noEmit` pasa antes y después
4. **Orden**: Mobula → Moralis → Birdeye → PumpDev → CoinMarketCap → Alchemy → FluxRPC → Helius

### Checklist por Provider

```markdown
- [ ] `const BASE` extraído y nombrado consistentemente
- [ ] Constructor estandarizado (apiKey field, warn si falta)
- [ ] `onModuleInit()` con log condicional
- [ ] Per-method try/catch con error handling estándar (404→null, others→debug+null)
- [ ] Timeout 8_000ms
- [ ] Section comments entre grupos lógicos
- [ ] JSDoc completo en todos los métodos públicos
- [ ] Tipos en types.ts (no inline)
- [ ] Sin `.js` en imports
- [ ] `tsc --noEmit` sin errores
- [ ] Sin helper `axios.create` (usar axios.get/post directo)
```

### Excepciones permitidas

| Provider | Excepción | Razón |
|----------|-----------|-------|
| Alchemy | Mantener `rpcCall<T>()` helper | JSON-RPC genérico bien encapsulado |
| FluxRPC | Mantener `rpcCall<T>()` helper | JSON-RPC genérico bien encapsulado |
| Helius | Mantener estructura de config | mainnet/devnet son necesarios |
| Birdeye | Mantener `x-chain` header | Provider requiere chain header |
| DexScreener | Sin apiKey field | Provider no necesita API key |

---

## 7. Timeline Estimado

| Provider | Cambios | Archivos | Esfuerzo |
|----------|---------|----------|----------|
| **GeckoTerminal** | 🆕 Nuevo | 5 + adapter | ~1.5 hr |
| **CoinGecko** | 🆕 Nuevo | 5 + adapter | ~1.5 hr |
| Mobula | Cosmético | service, types | ~30 min |
| Moralis | Cosmético | service, types | ~30 min |
| Birdeye | Medio | service | ~45 min |
| PumpDev | Medio | service | ~45 min |
| CoinMarketCap | Medio | service | ~45 min |
| Alchemy | Bajo | service | ~30 min |
| FluxRPC | Medio | service | ~45 min |
| Helius | Alto | service, config, index | ~1.5 hr |

**Total**: ~9 horas de trabajo efectivo (+3 hr por GeckoTerminal + CoinGecko)
