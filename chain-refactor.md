# Chain BC Refactor — Plan de extracción

> **Estado:** Iteración 1 — discovery
> **Objetivo:** Extraer un BC `src/chain/` a partir de las 696 referencias a `chain` dispersas en `src/discovery/`.

---

## 1. Inventario de referencias (baseline)

| Sub-BC origen | Refs `chain` | Archivos | Tipo de acoplamiento |
|---|---:|---:|---|
| `chain-detection` | ~80 | 14 | **Propietario** — probers, score, evento |
| `enrichment` | ~95 | 16 | **Consumidor** — providers filtran por `supportedChains` |
| `normalization` | ~70 | 11 | **Productor** — `Chain` VO, `chainHint` en identidad |
| `filters` | ~50 | 8 | **Consumidor** — reglas contextuales |
| `honeypot` | ~40 | 6 | **Consumidor** — analyzers chain-aware |
| `classification` | ~50 | 7 | **Consumidor** — identidad `(chain, address)` |
| `publishing` | ~45 | 7 | **Consumidor** — formato de mensaje |
| `scoring` | ~35 | 5 | **Consumidor** — score varía por chain |
| `analytics` | ~70 | 8 | **Consumidor** — jobs indexados `(chain, address)` |
| `parsing/extraction` | ~25 | 5 | **Productor** — extrae `chainHint` |
| `ingestion` | ~5 | 1 | **Indirecto** — sólo metadata |

---

## 2. Top archivos por densidad de acoplamiento

| Archivo | Refs | Acoplamiento |
|---|---:|---|
| `ca/chain-detection/application/handlers/detect-chain.use-case.ts` | 22 | Núcleo del sub-BC |
| `ca/chain-detection/chain-detection.module.ts` | 16 | DI bindings |
| `ca/enrichment/application/handlers/enrich-token.use-case.ts` | 11 | Orquestador cross-BC |
| `ca/normalization/application/handlers/get-canonical-call.use-case.ts` | 12 | Lee chain desde call |
| `ca/normalization/domain/value-objects/normalized-address.vo.ts` | 11 | Identidad derivada |
| `ca/normalization/application/handlers/normalize-call.use-case.ts` | 11 | Asigna chain |
| `ca/normalization/domain/value-objects/token-identity.vo.ts` | 10 | `(chain, address)` tuple |
| `ca/publishing/telegram/domain/entities/published-call.entity.ts` | 10 | Persistencia |
| `ca/parsing/domain/entities/token-call.entity.ts` (linea 127) | 2 | `contractChainHint` |
| `shared/common/value-objects/chain-id.vo.ts` | — | Dependencia cruzada |

---

## 3. Propuesta inicial de sub-BCs

### 3.1 `chain-identity` (núcleo puro)
- **Value objects:** `ChainId`, `ChainHint`, `ChainType` (`evm | solana | non-evm`)
- **Sin infraestructura, sin puertos externos**
- **Origen actual:** `shared/common/value-objects/chain-id.vo.ts`, `ca/normalization/domain/value-objects/chain.vo.ts`, `ca/extraction/domain/value-objects/chain-hint.vo.ts`

### 3.2 `chain-registry` (catalogo de chains)
- **Entity:** `Chain` (raíz con `id`, `type`, `displayName`, `nativeSymbol`, `blockExplorer`, `rpcUrl`)
- **Use cases:** `RegisterChain`, `GetChain`, `ListSupportedChains`
- **Port:** `ChainRepository`
- **Hoy:** está **implícito** en los maps `CHAIN_TO_GT_SLUG` y `supportedChains` arrays de cada provider — sin agregado explícito.

### 3.3 `chain-detection` (subordinada)
- **Mover tal cual:** `ca/chain-detection/**` → `chain/detection/**`
- **Cambios:** probers consultan `ChainRegistry` para enumerar targets (hoy hardcoded).

### 3.4 `chain-capabilities` (matriz feature × chain)
- **Entity:** `ChainCapabilities(chainId, features: Set<Capability>)`
- **Capacidades:** `MARKET_DATA`, `HONEYPOT_ANALYSIS`, `EXPLORER_LOOKUP`, `TOKEN_PROBING`
- **Origen actual:** propiedad `supportedChains: ChainId[]` repetida en cada provider.

### 3.5 `chain-explorer` (adapters externos)
- **Adapters:** `BirdeyeAdapter`, `DexScreenerAdapter`, `GeckoTerminalAdapter`, probers EVM/Solana
- **Migración desde:** `ca/enrichment/infrastructure/providers/*` y `ca/chain-detection/infrastructure/probers/*`
- **Contrato:** `MarketDataProviderPort(chain, address) → Snapshot?` y `ChainProberPort(address) → ChainDetectionScore`.

---

## 4. Grafo de dependencias entre sub-BCs

```
                   ┌─────────────────┐
                   │ chain-identity  │  (sin deps)
                   └────────┬────────┘
                            │
                ┌───────────┼───────────┐
                ▼                       ▼
        ┌───────────────┐      ┌─────────────────┐
        │ chain-registry│◀─────│ chain-capabilities│
        └───────┬───────┘      └────────┬─────────┘
                │                       │
                ▼                       ▼
        ┌───────────────┐      ┌─────────────────┐
        │ chain-detection│     │  chain-explorer │
        └───────────────┘      └────────┬────────┘
                                        │
                            ┌───────────┼───────────┐
                            ▼           ▼           ▼
                       enrichment  honeypot   analytics
                       classification scoring  filters
                       publishing
```

`chain-identity` es el único módulo sin dependencias internas — debe ser puro y moverse primero.

---

## 5. Riesgos y trade-offs identificados

### R1 — Ciclo `shared/common` ↔ `ca/*`
**Síntoma:** `chain-id.vo.ts` vive en `shared/common` y es importado por 9 sub-BCs de `ca`.
**Decisión propuesta:** romper import path. `chain-identity` se vuelve autosuficiente; cualquier BC que ya importaba de `shared/common/value-objects/chain-id.vo` redirige a `chain/identity/chain-id.vo`.
**Validar:** `rg "shared/common/value-objects/chain-id" src/` antes de mover.

### R2 — `chainHint` vs `chain` semántica dual
**Síntoma:** `chainHint` (extracción, débil) coexiste con `chain` resuelto (detección/normalización, fuerte).
**Decisión:** ambos quedan en `chain-identity` como VOs distintos pero `Chain` entidad sólo se construye cuando hay `chain` fuerte. `ChainHint` representa evidencia, `Chain` representa hecho.
**Pendiente:** revisar dónde se "promueve" `ChainHint → Chain` (probablemente en `chain-detection` o `normalize-call`).

### R3 — Providers duplican `supportedChains`
**Síntoma:** cada adapter declara su propio array. Si se centraliza en `chain-capabilities`, los adapters deben consultar la registry.
**Riesgo:** orden de bootstrap — capabilities deben estar cargadas antes que providers.
**Mitigación:** capabilities se hidratan en módulo estático (no DB) en v1.

### R4 — Identidad `(chain, address)` repetida en 6 entidades
**Síntoma:** `TokenSnapshot.id = "${chain}:${address}"`, `TokenClassification`, `TokenScore`, `CallEvaluationJob`, etc.
**Decisión propuesta:** introducir `TokenLocator(chain, address)` VO en `chain-identity` (o en `shared/common`) — depende de si pertenece al dominio chain o al dominio token.
**Pregunta abierta:** ¿`TokenLocator` es value object de `chain-identity` o de un futuro `token-identity`?

### R5 — Tests acoplados a paths concretos
**Síntoma:** 696 hits incluyen `.spec.ts` con imports hardcoded.
**Mitigación:** refactor por fases, correr `npm test` después de cada movimiento.

### R6 — Publicación Telegram formatea chain legible
**Síntoma:** `default-message-formatter.adapter.ts` referencia chains para nombres legibles (`ethereum → "Ethereum"`).
**Decisión:** el formatter consulta `chain-registry` vía `GetChain.displayName`. Hoy el mapeo está hardcoded en el formatter.

---

## 6. Plan de ejecución por fases

### Fase 0 — Preparación (sin mover código)
- [ ] Crear `chain-identity` con `ChainId` clonado, marcar deprecation en `shared/common`.
- [ ] Documentar mapeo `path-antiguo → path-nuevo` en sección 7.
- [ ] Snapshot de tests verdes como baseline.

### Fase 1 — Extraer `chain-identity`
- [ ] Mover `ChainId`, `ChainHint`, `ChainType` a `src/chain/identity/`.
- [ ] Actualizar todos los imports con codemod.
- [ ] Eliminar `shared/common/value-objects/chain-id.vo.ts`.
- [ ] Validar: `npm run lint && npm test`.

### Fase 2 — Extraer `chain-registry`
- [ ] Crear entidad `Chain` + repo in-memory + use cases.
- [ ] Reemplazar arrays `supportedChains` hardcoded por queries al registry.
- [ ] Hidratar registry con las ~6 chains actuales (ethereum, bsc, polygon, arbitrum, base, solana).

### Fase 3 — Mover `chain-detection`
- [ ] Mover `ca/chain-detection/**` → `src/chain/detection/**`.
- [ ] Refactorizar probers para consumir `ChainRegistry`.
- [ ] Actualizar `ca/normalization`, `ca/enrichment` para escuchar evento desde nueva ubicación.

### Fase 4 — Extraer `chain-explorer`
- [ ] Mover providers (`birdeye`, `dexscreener`, `geckoterminal`) → `src/chain/explorer/providers/`.
- [ ] Renombrar contrato: `MarketDataProviderPort` → `ChainExplorerPort`.
- [ ] `enrichment` consume vía `ChainExplorerPort` del registry.

### Fase 5 — Extraer `chain-capabilities`
- [ ] Crear matriz estática `CAPABILITIES[chainId]`.
- [ ] Cada adapter declara sólo `requires: Capability[]` en lugar de `supportedChains`.
- [ ] `chain-registry` expone `supports(chainId, capability)`.

### Fase 6 — Limpieza
- [ ] Eliminar código duplicado en `supportedChains`.
- [ ] Introducir `TokenLocator` VO si se decide ubicación (ver R4).
- [ ] Actualizar formatter de Telegram para usar `displayName` del registry.

---

## 7. Mapa de paths (a poblar tras cada fase)

| Path antiguo | Path nuevo | Fase | Estado |
|---|---|---|---|
| `shared/common/value-objects/chain-id.vo.ts` | `src/chain/identity/chain-id.vo.ts` | 1 | ⏳ |
| `ca/normalization/domain/value-objects/chain.vo.ts` | `src/chain/identity/chain.vo.ts` | 1 | ⏳ |
| `ca/extraction/domain/value-objects/chain-hint.vo.ts` | `src/chain/identity/chain-hint.vo.ts` | 1 | ⏳ |
| `ca/chain-detection/**` | `src/chain/detection/**` | 3 | ⏳ |
| `ca/enrichment/infrastructure/providers/{birdeye,dexscreener,geckoterminal}.adapter.ts` | `src/chain/explorer/providers/*` | 4 | ⏳ |
| `ca/chain-detection/infrastructure/probers/{evm,solana}-chain-prober.adapter.ts` | `src/chain/explorer/probers/*` | 4 | ⏳ |

---

## 8. Preguntas abiertas (para iterar contigo)

1. **R4:** ¿`TokenLocator(chain, address)` pertenece a `chain-identity` o a un futuro `token-identity`? Argumentos:
   - *Chain:* es identidad relativa a una chain — sin chain no hay locator.
   - *Token:* el address es del token, no de la chain.

2. **R2:** ¿Dónde se promueve `ChainHint → Chain`? ¿En `chain-detection` o en `normalize-call`?

3. **Capacidades estáticas vs dinámicas:** ¿`CAPABILITIES[chainId]` en código o cargado desde config/DB?
   - Estático: simple, predecible, requiere redeploy.
   - Dinámico: flexible, pero introduce consistencia eventual.

4. **Eventos cross-BC:** ¿`ChainDetected` se queda como evento de dominio del BC `chain`, o sigue siendo evento de integración publicado por `chain-detection`?

5. **Compatibilidad:** ¿qué versión del BC actual debe coexistir durante la migración, o se hace big-bang con feature flag?

6. **Mapeo `CHAIN_TO_GT_SLUG`:** ¿vive en `chain-registry` (datos) o en `geckoterminal.adapter` (configuración del adapter)?

7. **`honeypot` analyzer chain-aware:** ¿el analyzer se registra en `chain-capabilities` o sigue siendo un adapter con `supportedChains` propio?

8. **Telegram formatter:** ¿`displayName` viene del registry o del i18n module?

---

## 9. Decisiones tomadas (log)

| # | Decisión | Justificación | Iteración |
|---|---|---|---|
| — | _(vacío — esperando feedback)_ | | |

---

## 10. Métricas de éxito

- **Reducción de refs `chain` en `src/discovery/`:** baseline 696 → objetivo <50 (sólo DTOs de entrada/salida).
- **Acoplamiento:** `src/chain/` no debe importar de ningún sub-BC de `src/discovery/`.
- **Test runtime:** suite completa sin aumento >10% en tiempo de ejecución.
- **Build:** cero errores tras cada fase.

---

# Anexo A — Análisis del BC `src/token/` (futuro)

> **Estado:** Iteración 1 — discovery paralelo
> **Baseline:** 809 referencias a `token`/`Token` en `src/discovery/`.

## A1. Inventario por sub-BC

| Sub-BC origen | Refs token | Rol respecto a "token" |
|---|---:|---|
| `normalization` | ~180 | **Productor del agregado raíz** — `CanonicalTokenCall`, `TokenIdentity` |
| `enrichment` | ~140 | **Consumidor + productor** — `TokenSnapshot`, `TokenEnrichedEvent` |
| `classification` | ~110 | **Propietario** — `TokenClassification`, `TokenClassifiedEvent` |
| `scoring` | ~110 | **Propietario** — `TokenScore`, `TokenScoredEvent` |
| `parsing` | ~90 | **Productor** — `TokenCall`, `ParseFromCandidates` |
| `filters` | ~70 | **Consumidor** — `TokenFiltered`, `TokenRejected` |
| `honeypot` | ~50 | **Consumidor** — `AnalyzeTokenHoneypot` |
| `publishing` | ~30 | **Consumidor** — formatea mensajes sobre tokens |
| `analytics` | ~30 | **Consumidor** — evalúa performance por token |

## A2. Agregados identificados (entidades)

| Agregado | Ubicación actual | Tipo de BC candidato |
|---|---|---|
| `TokenCall` | `ca/parsing/domain/entities/token-call.entity.ts` | `token-intake` (input crudo) |
| `CanonicalTokenCall` | `ca/normalization/domain/entities/canonical-token-call.entity.ts` | `token-identity` (versión canónica) |
| `TokenSnapshot` | `ca/enrichment/domain/entities/token-snapshot.entity.ts` | `token-market-data` |
| `TokenClassification` | `ca/classification/domain/entities/token-classification.entity.ts` | `token-classification` |
| `TokenScore` | `ca/scoring/domain/entities/token-score.entity.ts` | `token-scoring` |

**Observación crítica:** los 5 agregados comparten el mismo id `"${chain}:${address}"` → es la **identidad natural del token**.

## A3. Value objects compartidos

- `TokenIdentity(chain, address)` — `ca/normalization/domain/value-objects/token-identity.vo.ts`
- `NormalizedAddress` — `ca/normalization/domain/value-objects/normalized-address.vo.ts`
- `Pair` — `ca/enrichment/domain/value-objects/pair.vo.ts`
- `ContractAddress` — `ca/extraction/domain/value-objects/contract-address.vo.ts` (ya cruza chain)

## A4. Eventos de dominio

| Evento | Publicador | Consumidores |
|---|---|---|
| `TokenEnrichedEvent` | `enrichment` | `classification` |
| `TokenClassifiedEvent` | `classification` | `scoring` |
| `TokenScoredEvent` | `scoring` | `filters`, `honeypot`, `analytics` |
| `TokenFilteredEvent` | `filters` | `publishing` |
| `TokenRejectedEvent` | `filters` | `publishing` |

## A5. Propuesta de sub-BCs para `src/token/`

```
src/token/
├── identity/                    # núcleo puro
│   ├── domain/
│   │   ├── value-objects/
│   │   │   ├── token-id.vo.ts          # (chain, address)
│   │   │   ├── normalized-address.vo.ts
│   │   │   └── contract-address.vo.ts
│   │   └── entities/
│   │       └── token.entity.ts         # agregado raíz
│   └── application/
│       └── use-cases/
│           ├── resolve-token.use-case.ts
│           └── get-token.use-case.ts
│
├── intake/                      # antes parsing
│   └── (mover ca/parsing/**)
│
├── normalization/               # canónico
│   └── (mover ca/normalization/**)
│
├── market-data/                 # antes enrichment
│   └── (mover ca/enrichment/**)
│
├── classification/              # tal cual
│   └── (mover ca/classification/**)
│
├── scoring/                     # tal cual
│   └── (mover ca/scoring/**)
│
└── analytics/                   # performance por token
    └── (mover ca/analytics/** — subconjunto token-related)
```

### Sub-BCs mínimos viables (recomendación inicial)

Sólo 3 sub-BCs en v1, el resto se mantiene en `src/discovery/` hasta validar:

1. **`token-identity`** (núcleo): `TokenId(chain, address)`, normalización de address, resolución cross-chain.
2. **`token-intake`**: absorbe `parsing` completo.
3. **`token-normalization`**: absorbe `normalization` + emite `TokenCanonicalizedEvent`.

> Los sub-BCs `classification`, `scoring`, `market-data` son **read models** sobre la identidad — pueden quedarse en `src/discovery/` consumiendo eventos.

---

## A6. Análisis de colisión `chain` ↔ `token`

### Zonas de colisión explícita

| Concepto | Vive en `chain` | Vive en `token` | Solapamiento |
|---|---|---|---|
| `(chain, address)` | `ChainAddress` (?) | `TokenId(chain, address)` | 🔴 **CRÍTICO** |
| `chainHint` | sí (evidencia débil) | sí (en `ContractAddress`) | 🟡 medio |
| `TokenIdentity` | no | sí | 🟢 limpio |
| `TokenSnapshot.id` | no | sí | 🟢 limpio |
| Eventos `Token*Event` | no (eventos propios) | sí | 🟢 limpio |
| `chain` en payloads DTO | sí (input) | sí (input) | 🟡 medio |
| `supportedChains` en provider | sí (capability) | no | 🟢 limpio |
| `TokenLocator` (R4 de chain-refactor) | ¿propuesto? | propuesto | 🔴 **CRÍTICO** |

### Conflictos que chocan

**C1 — Identidad `(chain, address)`归属归属归属**
- `chain/identity/` propone `TokenLocator(chain, address)` (R4 del refactor chain).
- `token/identity/` necesita `TokenId(chain, address)`.
- **Decisión necesaria:** un sólo VO. Recomendación: **`TokenId` en `token/identity/`**, `chain` lo consume vía import.
- **Implicación:** `chain` dependería de `token` — **rompe el aislamiento** del BC `chain`.

**C2 — `chainHint` vs `ContractAddress.chainHint`**
- En `extraction`: `chainHint` se extrae de la fuente cruda.
- En `token/intake`: `ContractAddress` lo contiene.
- **Decisión:** `ChainHint` permanece en `chain/identity/` (es evidencia de chain). `ContractAddress` lo agrega como campo, importando de `chain`.

**C3 — Eventos de cadena → token**
- Hoy: `chain-detection` emite `ChainDetectedEvent`.
- `token-normalization` consume ese evento para enriquecer el `CanonicalTokenCall`.
- **Si `chain-detection` se mueve a `src/chain/`:** el consumidor (`src/token/normalization/`) debe suscribirse — flujo cross-BC natural.
- ✅ No hay colisión si la dirección de la dependencia es: `token` → `chain`.

**C4 — `TokenSnapshot.id = "${chain}:${address}"`
- Si el id se construye con `ChainId` VO, hay acoplamiento por composición, no por herencia.
- ✅ Aceptable.

### Recomendación de frontera

```
┌──────────────────────────┐
│  src/chain/              │  ← NO importa de token
│  • chain-identity        │
│  • chain-registry        │
│  • chain-detection       │
│  • chain-capabilities    │
│  • chain-explorer        │
└──────────┬───────────────┘
           │ importa ChainId, ChainHint, TokenLocator?
           ▼
┌──────────────────────────┐
│  src/token/              │  ← importa de chain
│  • token-identity ◀──────┼─── vive aquí TokenId(chain, address)
│  • token-intake          │
│  • token-normalization   │
│  • token-classification  │
│  • token-scoring         │
│  • token-market-data     │
└──────────────────────────┘
```

### Decisión clave (a confirmar contigo)

**D1:** ¿`TokenId(chain, address)` vive en `src/token/identity/` y `src/chain/` lo consume por necesidad?

- ✅ A favor: el address es **concepto de token**, no de chain. Chain sólo conoce `ChainId`.
- ⚠️ Implicación: `src/chain/identity/` no contendría `TokenLocator` — se elimina la propuesta R4.
- ❌ Contra: si `token` se construye después de `chain`, el orden de extracción cuenta.

### Riesgos del doble BC

| # | Riesgo | Mitigación |
|---|---|---|
| T1 | Import circular `chain ↔ token` si se hace mal | `token` depende de `chain`, nunca al revés |
| T2 | Eventos duplicados (`TokenScored` vs nuevos) | Establecer convención: `Token*` en BC token, `Chain*` en BC chain |
| T3 | Mappers duplicados entre capas | Empezar sólo con `token-identity` puro, sin infra |
| T4 | Tests cross-BC fallan al mover | Refactorizar 1 sub-BC a la vez, correr suite entre fases |
| T5 | 5 agregados con misma PK | Centralizar `TokenId` en `token/identity/` |

## A7. Orden de extracción propuesto

1. **`token-identity`** (núcleo puro, sin infra) — mover `TokenIdentity` VO.
2. **`token-intake`** (parsing completo) — bajo riesgo, pocos consumidores.
3. **`token-normalization`** — depende de intake.
4. **`token-classification`** — depende de market-data.
5. **`token-scoring`** — depende de classification.
6. **`token-market-data`** — al final por ser el más acoplado a chain.

## A8. Preguntas abiertas adicionales

9. **D1:** ¿`TokenId` vive en `token/identity/` y `chain` lo consume?
10. **D2:** ¿`src/discovery/` desaparece tras la migración o se mantiene como capa de orquestación (`src/discovery/orchestration/`)?
11. **D3:** ¿Los use cases cross-BC (`EnrichToken`, `ScoreToken`, `ClassifyToken`) se quedan en `src/discovery/` o se mueven a `src/token/<sub>/`?
12. **D4:** ¿El BC `token` necesita un módulo API propio (`src/token/api/`) o comparte controllers con `src/discovery/`?
13. **D5:** Eventos `TokenEnriched`, `TokenScored`, etc. — ¿se mueven a `src/token/<sub>/domain/events/` o se quedan donde están?
14. **D6:** ¿`Analytics` es sub-BC de `token` (porque evalúa performance por token) o queda independiente?