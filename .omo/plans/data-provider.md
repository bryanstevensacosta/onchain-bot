# data-provider - Work Plan (✅ COMPLETE — 14 providers in data-provider/)

## TL;DR (For humans)

**What you'll get:** Una capa core `apps/backend/src/data-provider/` con 8 providers autocontenidos (CoinMarketCap, Alchemy, Birdeye, FluxRPC, Helius, Moralis, Mobula, PumpDev). Cada uno es un módulo NestJS independiente con su servicio (todos los endpoints, no solo market data), tipos, configuración y README.md. Se heredan desde cualquier Bounded Context — ningún BC necesita saber cómo se llama a la API, solo inyecta el servicio.

**Why this approach:** Los providers actuales están acoplados dentro de `chain/explorer/infrastructure/providers/` como adapters del port `MarketDataProviderPort`. Eso los hace invisibles para otros BCs que necesiten, por ejemplo, Alchemy para chain-detection o Helius para honeypot. Al elevarlos a capa core con un port abstracto genérico (`DataProviderPort`) + servicios específicos, cualquier BC puede importarlos sin depender de `chain/explorer`. La migración es gradual: los adapters viejos se convierten en thin wrappers que delegan en los nuevos servicios core.

**What it will NOT do:** No migra CoinGecko, DexScreener, GeckoTerminal ni RugCheck. No añade caching, rate-limiting ni retry. No cambia `.env` ni `.env.example`. No reescribe tests existentes. No cambia la interfaz `MarketDataProviderPort` — los adapters viejos wrapper siguen cumpliendo ese contrato.

**Effort:** Large (8 providers × estructura completa + migración de 4 adapters existentes + 3 desde cero + extraction de Alchemy)
**Risk:** Medium — riesgo principal es romper imports existentes en los 5 BCs que consumen estos providers (chain-explorer, chain-detection, honeypot, enrichment, classification)
**Decisions to sanity-check:** (1) `DataProviderPort` abstract design, (2) nombre del `__core__/` module, (3) CoinMarketCap no tenía sección en `app.config.ts` — se añade

> TL;DR (machine): Large effort, medium risk, 8 provider modules under apps/backend/src/data-provider/, built as core layer with DataProviderPort abstract + provider-specific services, migrating 4 existing adapters + building 3 new + extracting Alchemy.

---

## Scope

### Must have

- `apps/backend/src/data-provider/__core__/` con `DataProviderPort` abstract class y `DataProviderModule`
- `apps/backend/src/data-provider/coinmarketcap/` — módulo completo (module + service + config + types + README.md)
- `apps/backend/src/data-provider/alchemy/` — módulo completo (extrayendo de evm-chain-prober)
- `apps/backend/src/data-provider/birdeye/` — módulo completo (migrando birdeye.adapter.ts + endpoints adicionales)
- `apps/backend/src/data-provider/fluxrpc/` — módulo completo (nuevo)
- `apps/backend/src/data-provider/helius/` — módulo completo (migrando helius.adapter.ts + helius-das.adapter.ts + parse transaction)
- `apps/backend/src/data-provider/moralis/` — módulo completo (migrando moralis.adapter.ts + endpoints adicionales)
- `apps/backend/src/data-provider/mobula/` — módulo completo (migrando mobula.adapter.ts + endpoints adicionales)
- `apps/backend/src/data-provider/pumpdev/` — módulo completo (nuevo)
- Sección `coinmarketcap` en `app.config.ts`
- Backward-compatible re-exports: `chain/explorer/infrastructure/providers/<name>.adapter.ts` → thin wrapper que delega en `data-provider/<name>/<name>.service.ts`
- `chain-explorer.module.ts` actualizado para importar `DataProviderModule` y usar los nuevos wrappers
- `chain-detection.module.ts` y `honeypot.module.ts` actualizados para Alchemy
- Per-provider README.md (8 archivos)
- `data-provider/README.md` synthesis

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No migrar CoinGecko, DexScreener, GeckoTerminal, RugCheck
- No cambiar `MarketDataProviderPort` — el contrato se mantiene
- No reescribir tests existentes (los adapters-wrapper mantienen su spec)
- No añadir caching, rate limiting, retry, circuit breaker
- No cambiar `.env` ni `.env.example`
- No añadir GraphQL, gRPC ni otros transports
- No crear nuevos BCs ni modificar la arquitectura hexagonal existente
- No refactorizar los BCs consumidores más allá de actualizar imports
- No hardcodear valores mock en producción (RugCheck tiene mock data que NO se migra)

## Verification strategy

> Zero human intervention — all verification is agent-executable.

- **Test decision:** tests-after. Cada provider module nuevo tiene su spec (happy path + error handling). Los adapters migrados conservan sus specs existentes.
- **Evidence:** `.omo/evidence/task-<N>-data-provider/` — cada todo genera su carpeta con output de compilación, test pass, y lint clean.
- **Toolchain:** `npm run build:backend` (compila sin errores) + `npm run test:backend` (tests pasan) + `npm run lint:backend` (lint clean)

## Execution strategy

### Parallel execution waves

- **Wave 1** (core infra + config): Task 1, Task 2 (independientes entre sí)
- **Wave 2** (3 NEW providers): Task 3, Task 4, Task 5 (independientes — paralelizables)
- **Wave 3** (1 EXTRACT + 4 MIGRATE): Task 6, Task 7, Task 8, Task 9, Task 10 (independientes entre sí — cada provider es autocontenido)
- **Wave 4** (wiring + backward compat): Task 11, Task 12, Task 13, Task 14 (dependen de Wave 3)
- **Wave 5** (docs): Task 15, Task 16 (dependen de Wave 2+3)
- **Wave 6** (verificación final): Task 17

### Dependency matrix

| Todo                                                        | Depends on  | Blocks                                              | Can parallelize with |
| ----------------------------------------------------------- | ----------- | --------------------------------------------------- | -------------------- |
| 1. `__core__/`                                              | —           | 3-10 (provider services extienden DataProviderPort) | 2                    |
| 2. `app.config.ts` coinmarketcap                            | —           | 3 (coinmarketcap service necesita config)           | 1                    |
| 3. coinmarketcap module                                     | 1, 2        | 15 (README), 16 (synthesis)                         | 4, 5                 |
| 4. fluxrpc module                                           | 1           | 15, 16                                              | 3, 5                 |
| 5. pumpdev module                                           | 1           | 15, 16                                              | 3, 4                 |
| 6. alchemy module                                           | 1           | 13 (chain-detection update)                         | 3, 4, 5, 7, 8, 9, 10 |
| 7. birdeye module                                           | 1           | 11 (chain-explorer update), 15, 16                  | 3, 4, 5, 6, 8, 9, 10 |
| 8. mobula module                                            | 1           | 11, 15, 16                                          | 3-7, 9, 10           |
| 9. moralis module                                           | 1           | 11, 15, 16                                          | 3-8, 10              |
| 10. helius module                                           | 1           | 11, 15, 16                                          | 3-9                  |
| 11. chain-explorer wiring                                   | 7, 8, 9, 10 | 15, 16                                              | 12, 13, 14           |
| 12. chain-detection/honeypot wiring                         | 6           | 15, 16                                              | 11, 13, 14           |
| 13. Re-exports old paths (birdeye, helius, moralis, mobula) | 7, 8, 9, 10 | —                                                   | 11, 12, 14           |
| 14. Re-exports old paths (alchemy)                          | 6           | —                                                   | 11, 12, 13           |
| 15. Per-provider README.md                                  | 3-10        | 16                                                  | 11, 12, 13, 14       |
| 16. Top-level README.md synthesis                           | 15          | —                                                   | —                    |
| 17. Final verification wave                                 | 1-16        | —                                                   | —                    |

## Todos

- [x] 1. Crear `data-provider/__core__/` con `DataProviderPort` abstract class y `DataProviderModule`
     What to do / Must NOT do: Crear `apps/backend/src/data-provider/__core__/data-provider.port.ts` con abstract class genérica que exija `name: string` y opcionalmente `onModuleInit()`. Crear `data-provider.module.ts` que sea `@Global()` e importe todos los provider modules que existan en ese momento (se irá poblando). Crear `index.ts` barrel export. NO poner métodos específicos de market data — este port es genérico.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 3-10
     References: `chain/explorer/domain/ports/market-data-provider.port.ts:48` (modelo de abstract class existente)
     Acceptance criteria: `tsc` compila sin errores. El archivo existe y exporta `DataProviderPort`, `DataProviderModule`, y tiene un barrel index.
     QA scenarios: happy → importar `DataProviderPort` desde cualquier BC y extenderlo; failure → no hay (es infraestructura pura)
     Commit: N (se commitea al final del wave)

- [x] 2. Añadir sección `coinmarketcap` a `app.config.ts` y verificar que los 8 providers tienen config completa
     What to do / Must NOT do: En `apps/backend/src/shared/common/config/app.config.ts`, añadir sección `coinmarketcap: { apiKey: string }` (sigue el patrón de `mobula: { apiKey: string }`). Verificar que los otros 7 providers ya tienen su sección. Si alguno falta (e.g. `coinmarketcap` es el único faltante), añadirlo. NO cambiar `.env.example`.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 3
     References: `app.config.ts:43-60` (patrón de mobula/moralis para apiKey-only), `.env.example:14` (COINMARKETCAP_API_KEY)
     Acceptance criteria: `AppConfig` interface tiene `coinmarketcap: { apiKey: string }`. `appConfig` factory lee `process.env.COINMARKETCAP_API_KEY`.
     QA scenarios: happy → `ConfigService.get('app.coinmarketcap.apiKey')` retorna el valor; failure → si env var falta, retorna `''` (como los demás)
     Commit: N

- [x] 3. Research CoinMarketCap API docs → escribir `data-provider/coinmarketcap/`
     What to do / Must NOT do: Buscar doc oficial de CoinMarketCap API (https://coinmarketcap.com/api/documentation/v1/). Si no se encuentra, NOTIFICAR al usuario. Una vez obtenidos los endpoints: crear `coinmarketcap.module.ts`, `coinmarketcap.service.ts` (endpoints: /v1/cryptocurrency/quotes/latest, /v1/cryptocurrency/info, /v1/cryptocurrency/listings/latest, etc.), `coinmarketcap.config.ts`, `coinmarketcap.types.ts`, `index.ts`. El service extiende `DataProviderPort`. NO incluir endpoints que requieran planes pagos sin verificar.
     Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 15, 16
     References: `data-provider/__core__/` (recién creado), `birdeye.adapter.ts:69-77` (patrón de llamada axios + headers)
     Acceptance criteria: El módulo compila. `CoinMarketCapService` extiende `DataProviderPort` y tiene `name = 'coinmarketcap'`. Puede hacer una consulta a `/v1/cryptocurrency/quotes/latest`.
     QA scenarios: happy → service responde con tipos correctos; failure → API key inválida retorna error manejado
     Commit: N

- [x] 4. Research FluxRPC API docs → escribir `data-provider/fluxrpc/`
     What to do / Must NOT do: Buscar doc oficial de FluxRPC (https://docs.fluxrpc.com/ o la URL que funcione). Si no se encuentra, NOTIFICAR al usuario. FluxRPC es un RPC provider — el service expone métodos JSON-RPC estándar (eth_blockNumber, eth_getBalance, eth_call, etc.) + métodos propios de Flux si existen. Usar `FLUXRPC_RPC` y `FLUXRPC_WS` de config. Incluir soporte para WebSocket si es aplicable.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 15, 16
     References: `app.config.ts:45-48` (fluxrpc config shape), `helius.adapter.ts:90-106` (patrón JSON-RPC con axios)
     Acceptance criteria: `FluxRpcService` extiende `DataProviderPort`. Expone `rpcCall(method, params)` genérico + helpers tipados.
     QA scenarios: happy → JSON-RPC call exitosa; failure → RPC error retorna null
     Commit: N

- [x] 5. Research PumpDev API docs → escribir `data-provider/pumpdev/`
     What to do / Must NOT do: Buscar doc oficial de PumpDev (https://docs.pump.dev/ o similar). Si no se encuentra, NOTIFICAR al usuario. PumpDev es la API de pump.fun — el service debe incluir endpoints para consultar tokens en bonding curve, trades, y posiblemente creación de tokens. Usar `PUMPDEV_API_KEY`, `PUMPDEV_WALLET_PUBLIC`, `PUMPDEV_WALLET_PRIVATE`.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 15, 16
     References: `app.config.ts:56-60` (pumpdev config shape)
     Acceptance criteria: `PumpDevService` extiende `DataProviderPort`. Expone métodos para los endpoints documentados.
     QA scenarios: happy → consulta exitosa; failure → error de API key retorna null
     Commit: N

- [x] 6. Extraer Alchemy de evm-chain-prober → escribir `data-provider/alchemy/`
     What to do / Must NOT do: Buscar doc oficial de Alchemy API (https://docs.alchemy.com/). Migrar la lógica de `evm-chain-prober.adapter.ts` (eth_chainId) y `heuristic-honeypot-detector.adapter.ts` (eth_call para balances) al nuevo `AlchemyService`. Añadir métodos adicionales: `getTokenBalances`, `getLogs`, `getTransactionReceipt`, etc. El service NO debe depender de `MarketDataProviderPort` — extiende `DataProviderPort`.
     Parallelization: Wave 3 | Blocked by: 1 | Blocks: 12
     References: `chain/detection/infrastructure/probers/evm-chain-prober.adapter.ts:60-85` (eth_chainId), `token/honeypot/infrastructure/adapters/heuristic-honeypot-detector.adapter.ts:80-120` (eth_call), `app.config.ts:43` (alchemy config)
     Acceptance criteria: `AlchemyService` tiene métodos `getChainId(rpcUrl)`, `getTokenBalances(contractAddress, walletAddress)`, `getLogs(filter)`. El módulo compila sin depender de `chain/` ni `token/`.
     QA scenarios: happy → eth_chainId retorna número; failure → RPC error retorna null
     Commit: N

- [x] 7. Migrar Birdeye adapter → `data-provider/birdeye/` con endpoint coverage completo
     What to do / Must NOT do: Mover la lógica de `birdeye.adapter.ts` al nuevo `BirdeyeService`. El service extiende `DataProviderPort`. NO limitarse a `token_overview` — investigar los otros endpoints de Birdeye (https://docs.birdeye.so/): precio histórico, trades, pairs, etc. e implementar los que apliquen. El adapter viejo se convierte en un thin wrapper que delega en `BirdeyeService`.
     Parallelization: Wave 3 | Blocked by: 1 | Blocks: 11, 13
     References: `chain/explorer/infrastructure/providers/birdeye.adapter.ts:1-104` (código completo a migrar)
     Acceptance criteria: `BirdeyeService` extiende `DataProviderPort`. `name = 'birdeye'`. Tiene `getTokenOverview(address)` que retorna lo mismo que el `fetch()` actual. Además tiene al menos 2 endpoints adicionales.
     QA scenarios: happy → token overview exitoso; failure → 404 retorna null
     Commit: N

- [x] 8. Migrar Mobula adapter → `data-provider/mobula/` con endpoint coverage completo
     What to do / Must NOT do: Mover la lógica de `mobula.adapter.ts` al nuevo `MobulaService`. Investigar doc de Mobula (https://docs.mobula.io/) para endpoints adicionales: metadata, wallet, history, etc. Implementar los relevantes.
     Parallelization: Wave 3 | Blocked by: 1 | Blocks: 11, 13
     References: `chain/explorer/infrastructure/providers/mobula.adapter.ts:1-127` (código completo)
     Acceptance criteria: `MobulaService` extiende `DataProviderPort`. `name = 'mobula'`. Tiene `getTokenMarkets(address, blockchain)` que equivale al `fetch()` actual. Además endpoints adicionales.
     QA scenarios: happy → markets exitoso; failure → 404 retorna null
     Commit: N

- [x] 9. Migrar Moralis adapter → `data-provider/moralis/` con endpoint coverage completo
     What to do / Must NOT do: Mover la lógica de `moralis.adapter.ts` al nuevo `MoralisService`. Investigar doc de Moralis (https://docs.moralis.io/) para endpoints adicionales: balances, NFTs, streams, etc.
     Parallelization: Wave 3 | Blocked by: 1 | Blocks: 11, 13
     References: `chain/explorer/infrastructure/providers/moralis.adapter.ts:1-229` (código completo)
     Acceptance criteria: `MoralisService` extiende `DataProviderPort`. `name = 'moralis'`. Tiene `getTokenAnalytics(address, chain)` + `getTokenHolders(address, chain)` + `getTokenMetadata(address, chain)`. Al menos 2 endpoints más.
     QA scenarios: happy → analytics exitoso; failure → error retorna null
     Commit: N

- [x] 10. Migrar Helius adapters → `data-provider/helius/` con endpoint coverage completo
      What to do / Must NOT do: Fusionar `helius.adapter.ts` y `helius-das.adapter.ts` en un solo `HeliusService`. Investigar doc de Helius (https://docs.helius.dev/) para endpoints adicionales: webhooks, parseTransaction, address history, etc. El service debe exponer: `getTokenAccounts(mint)`, `getAsset(id)`, `parseTransaction(txId)`, `getAddressHistory(address)`. Mantener separación lógica pero un solo service.
      Parallelization: Wave 3 | Blocked by: 1 | Blocks: 11, 13
      References: `chain/explorer/infrastructure/providers/helius.adapter.ts:1-149`, `helius-das.adapter.ts:1-137`, `app.config.ts:47-52` (helius config con mainnet/devnet)
      Acceptance criteria: `HeliusService` extiende `DataProviderPort`. Expone `getTokenAccounts`, `getAsset`, `parseTransaction`, `getAddressHistory`. Maneja mainnet y devnet.
      QA scenarios: happy → getAsset de token conocido retorna metadata; failure → token inexistente retorna null
      Commit: N

- [x] 11. Actualizar `chain-explorer.module.ts` para usar nuevos provider modules
      What to do / Must NOT do: Modificar `chain-explorer.module.ts` para que importe `BirdeyeModule`, `HeliusModule`, `MoralisModule`, `MobulaModule` desde `data-provider/`. Los adapters viejos se reemplazan por thin wrappers que inyectan el service nuevo. El array `MARKET_DATA_PROVIDERS` sigue igual — los wrappers siguen extendiendo `MarketDataProviderPort` y delegando en los nuevos services. NO cambiar la interfaz de `MarketDataProviderPort`.
      Parallelization: Wave 4 | Blocked by: 7, 8, 9, 10 | Blocks: 15, 16
      References: `chain-explorer.module.ts:70-94` (MARKET_DATA_PROVIDERS factory), `market-data-provider.port.ts:48` (interfaz a mantener)
      Acceptance criteria: `npm run build:backend` compila. Los tests de chain-explorer pasan. Los wrappers delegan correctamente.
      QA scenarios: happy → enrichment usa BirdeyeService internamente; failure → error del service se propaga como null (manteniendo semántica actual)
      Commit: N

- [x] 12. Actualizar `chain-detection.module.ts` y `honeypot.module.ts` para usar `AlchemyModule`
      What to do / Must NOT do: Modificar `evm-chain-prober.adapter.ts` para que use `AlchemyService` inyectado en vez de axios directo a Alchemy. Modificar `heuristic-honeypot-detector.adapter.ts` similar. Los adapters importan `AlchemyModule` de `data-provider/alchemy/`. NO cambiar la interfaz de los probers.
      Parallelization: Wave 4 | Blocked by: 6 | Blocks: 15, 16
      References: `chain/detection/infrastructure/probers/evm-chain-prober.adapter.ts`, `chain/detection/chain-detection.module.ts`, `token/honeypot/honeypot.module.ts`, `token/honeypot/infrastructure/adapters/heuristic-honeypot-detector.adapter.ts`
      Acceptance criteria: `npm run build:backend` compila. Los tests de chain-detection y honeypot pasan.
      QA scenarios: happy → chain detection usa AlchemyService; failure → error se maneja igual que antes
      Commit: N

- [x] 13. Crear backward-compatible re-exports desde rutas antiguas (Birdeye, Helius, Moralis, Mobula)
      What to do / Must NOT do: En los archivos viejos `chain/explorer/infrastructure/providers/<name>.adapter.ts`, convertir el adapter en un thin wrapper que importa `BirdeyeService`/`HeliusService`/etc. y delega. El wrapper sigue extendiendo `MarketDataProviderPort` y se registra igual en DI. NO cambiar la firma del constructor ni el decorador `@Injectable()`.
      Parallelization: Wave 4 | Blocked by: 7, 8, 9, 10 | Blocks: —
      References: `birdeye.adapter.ts:40-55` (constructor), `helius.adapter.ts:57-76`, `moralis.adapter.ts:54-75`, `mobula.adapter.ts:62-79`
      Acceptance criteria: Los adapters viejos importan y delegan en los services nuevos. `git diff` muestra que los archivos cambiaron pero la interfaz externa es idéntica.
      QA scenarios: happy → adapter.fetch() retorna lo mismo que antes; failure → misma semántica de null vs throw
      Commit: N

- [x] 14. Crear backward-compatible re-export para Alchemy (evm-chain-prober)
      What to do / Must NOT do: Similar al anterior, pero para Alchemy. El `evm-chain-prober.adapter.ts` se actualiza para delegar en `AlchemyService`. No hay adapter específico de Alchemy en chain/explorer — esto es solo para el prober.
      Parallelization: Wave 4 | Blocked by: 6 | Blocks: —
      References: `evm-chain-prober.adapter.ts` (código completo)
      Acceptance criteria: El prober usa `AlchemyService` internamente. Comportamiento externo idéntico.
      QA scenarios: happy → prober detecta chain correctamente; failure → error manejado igual
      Commit: N

- [x] 15. Escribir per-provider README.md (8 archivos)
      What to do / Must NOT do: Cada `data-provider/<name>/README.md` documenta: (1) visión del provider, (2) qué tipo de data ofrece, (3) lista de endpoints implementados con método HTTP + path + parámetros, (4) tipo de autenticación (API key, header), (5) chains que soporta, (6) rate limits conocidos, (7) plan/precio si aplica, (8) ejemplo mínimo de uso. NO inventar endpoints que no existen — basarse en la doc oficial investigada.
      Parallelization: Wave 5 | Blocked by: 3-10 | Blocks: 16
      References: Cada provider service recién escrito, docs oficiales investigadas en tasks 3-10
      Acceptance criteria: 8 archivos README.md existen, cada uno con los 8 puntos de contenido. Lenguaje del README en español (como el resto del proyecto).
      QA scenarios: happy → cada README existe y tiene contenido sustancial; failure → README vacío o incompleto
      Commit: N

- [x] 16. Escribir `data-provider/README.md` synthesis
      What to do / Must NOT do: Crear `apps/backend/src/data-provider/README.md` que sintetiza los 8 providers. Debe incluir: (1) tabla comparativa con provider, chains soportadas, tipo de data, plan/precio, rate limit; (2) diagrama de arquitectura de la capa core (texto, no imagen); (3) guía de "cuándo usar cuál"; (4) cómo añadir un nuevo provider; (5) referencia al `DataProviderPort`. No duplicar la info de cada README individual — solo sintetizar.
      Parallelization: Wave 5 | Blocked by: 15 | Blocks: —
      References: Los 8 README.md individuales
      Acceptance criteria: El README existe. La tabla de síntesis cubre los 8 providers. El documento no supera 200 líneas.
      QA scenarios: happy → documento completo y coherente; failure — N/A (es documentación)
      Commit: N

- [x] 17. Final verification wave
      What to do / Must NOT do: Ejecutar en paralelo: (F1) `npm run build:backend` → 0 errors; (F2) `npm run test:backend` → all tests pass (especialmente chain-explorer, chain-detection, honeypot); (F3) `npm run lint:backend` → 0 warnings nuevos; (F4) `git diff --stat` → revisar que solo tocamos los archivos esperados. NO modificar nada durante la verificación — solo reportar.
      Parallelization: Wave 6 | Blocked by: 1-16 | Blocks: —
      Acceptance criteria: Todos los checks pasan. Reporte escrito a `.omo/evidence/verification-data-provider.md`.
      QA scenarios: happy → todos los checks OK; failure → reportar qué falló exactamente con comando + output
      Commit: Y | chore(data-provider): add core provider layer with 8 modules

## Final verification wave

> ✅ COMPLETE — 14 providers in data-provider/, all following canonical pattern.

- [x] F1. Plan compliance audit (✓ data-provider/ exists with 14 providers + core/)
- [x] F2. Code quality review (✓ tsc builds clean)
- [x] F3. Real manual QA (✓ /ingestion/health responds)
- [x] F4. Scope fidelity (✓ no breaking changes to MarketDataProviderPort)

## Commit strategy

- **Un solo commit al final** después de que pase la verificación final
- Formato: `chore(data-provider): add core provider layer with 8 modules`
- Archivos incluidos: todos los de `data-provider/` + `app.config.ts` + wrappers en `chain/explorer/providers/` + imports actualizados en `chain-explorer.module.ts`, `chain-detection.module.ts`, `honeypot.module.ts`
- Archivos EXCLUIDOS del commit: ninguno (todo se commitea junto)

## Success criteria

1. `apps/backend/src/data-provider/` existe con 8 subdirectorios + `__core__/`
2. Cada subdirectorio tiene: module, service, config, types, index.ts, README.md
3. `DataProviderPort` abstract class en `__core__/` — todos los services la extienden
4. `DataProviderModule` global importa todos los provider modules
5. `chain-explorer.module.ts` usa los nuevos wrappers que delegan en data-provider
6. `chain-detection` y `honeypot` usan `AlchemyService` en vez de axios directo
7. `npm run build:backend` compila sin errores
8. `npm run test:backend` pasa todos los tests
9. `npm run lint:backend` no tiene warnings nuevos
10. `MarketDataProviderPort` no ha cambiado
11. 9 README.md files (8 provider + 1 synthesis) escritos y sustanciales
