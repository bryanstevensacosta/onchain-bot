# Shared — Kernel + Common

> Código compartido por todos los Bounded Contexts: **kernel** (primitivas DDD universales + errores) y **common** (helpers transversales, config, persistencia, utils, y VOs cross-BC promovidos).

Forma parte de `src/shared/` y se importa vía alias de path `shared/*` (`tsconfig.json`). **No es un BC**: no expone HTTP, no tiene módulo NestJS propio ni emite eventos de dominio.

---

## 1. Propósito

Este paquete transversal resuelve tres concerns:

1. **Primitivas DDD** que cualquier agregado/entidad/VO/evento hereda (kernel).
2. **Errores de dominio centralizados** con un enum estable de `ErrorCode` para que BCs no se inventen códigos ad-hoc (kernel).
3. **Helpers, config, persistencia y VOs cross-BC** (common).

Tres preguntas clave que responde:

1. ¿Cómo se define un Value Object inmutable con igualdad estructural?
2. ¿Cómo emite eventos un Aggregate Root y cómo se hace commit?
3. ¿Dónde se carga la configuración de la app y qué env vars existen?

---

## 2. Estructura: kernel vs common

```
src/shared/
├── kernel/                    ← Primitivas DDD universales + errores (contrato universal)
│   ├── aggregate-root.ts      ← AggregateRoot<TId> con cola de eventos
│   ├── entity.ts              ← Entity<TId> con igualdad por id
│   ├── value-object.ts        ← ValueObject<TProps> con inmutabilidad y deep-equals
│   ├── domain-event.ts        ← DomainEvent con eventId/occurredAt UUID
│   └── domain-error.ts        ← ErrorCode + DomainError
└── common/                    ← Helpers transversales + VOs cross-BC
    ├── value-objects/         ← VOs promovidos desde BCs
    │   ├── chain-id.vo.ts        ← (promoted from ca/chain-detection)
    │   └── token-metrics.vo.ts   ← (promoted from ca/parsing)
    ├── config/                ← AppConfig + registerAs factory
    │   └── app.config.ts
    ├── persistence/           ← DatabaseModule (TypeORM root)
    │   └── database.module.ts
    └── utils/                 ← Uuid + DateTime helpers
        └── index.ts
```

### Reglas de promoción

| Carpeta                 | Qué contiene                                                      | Cambiar rompe                                   |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `kernel/`               | Primitivas DDD (AggregateRoot, Entity, VO, DomainEvent) + errores | **Toda la app** — son contrato universal        |
| `common/`               | Helpers, config, persistence, utils                               | Solo los BCs que importan el símbolo modificado |
| `common/value-objects/` | VOs cross-BC promovidos (ChainId, TokenMetrics)                   | Solo los BCs que los importan                   |
| **VO privado en BC**    | VOs de un solo BC                                                 | Solo ese BC                                     |

### Cuándo promover un VO de BC a `common/value-objects/`

1. **Es importado por ≥3 BCs**, O
2. **Forma parte de la identidad cross-cutting** del dominio (e.g., `ChainId` identifica el tipo de token), O
3. **Su movimiento reduce >5 imports** en una sola refactorización.

**Regla actual:** solo `ChainId` (9 BCs) y `TokenMetrics` (2 BCs, comparten aggregate cluster parsing↔normalization) califican.

---

## 3. Responsabilidades

| Responsabilidad                                                  | Dónde vive                                    |
| ---------------------------------------------------------------- | --------------------------------------------- |
| Base class `AggregateRoot<TId>` con cola de eventos              | `kernel/aggregate-root.ts:17`                 |
| Base class `Entity<TId>` con igualdad por id                     | `kernel/entity.ts:10`                         |
| Base class `ValueObject<TProps>` con inmutabilidad y deep-equals | `kernel/value-object.ts:12`                   |
| Base class `DomainEvent` con `eventId`/`occurredAt` UUID         | `kernel/domain-event.ts:13`                   |
| Enum `ErrorCode` y class `DomainError`                           | `kernel/domain-error.ts:7, 35`                |
| VO `ChainId` (promoted from `ca/chain-detection`)                | `common/value-objects/chain-id.vo.ts:27`      |
| VO `TokenMetrics` (promoted from `ca/parsing`)                   | `common/value-objects/token-metrics.vo.ts:16` |
| Carga de `AppConfig` desde `process.env`                         | `common/config/app.config.ts:137`             |
| `DatabaseModule` (TypeORM root, opcional)                        | `common/persistence/database.module.ts:33`    |
| Utilidades `Uuid` y `DateTime`                                   | `common/utils/index.ts:4, 10`                 |

**Fuera del scope:**

- Reglas de negocio específicas (viven en cada BC).
- Persistencia de BC (vive en `infrastructure/repositories` de cada BC; el `DatabaseModule` solo registra los TypeORM entities).
- Adaptadores externos (HTTP, MTProto, RPC) — viven en cada BC.
- Inyección de dependencias — NestJS solo se monta a nivel de BC.

---

## 4. Límites transaccionales

- `shared` no tiene agregados propios ni eventos propios. Es código sin estado que se importa.
- No hay publisher, no hay repositorio (excepto `DatabaseModule` que es un wrapper de TypeORM).
- Las clases base proveen los hooks (`apply`, `commit`, `mutate`) que cada BC implementa.

---

## 5. Lenguaje ubicuo (kernel)

| Término         | Definición                                                                                          | Referencia                     |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| `AggregateRoot` | Entidad que posee un cluster de dominio, emite eventos vía `apply()`, muta vía `mutate()` abstracto | `kernel/aggregate-root.ts:17`  |
| `Entity`        | Objeto definido por id, igualdad por id (vs VO por valor)                                           | `kernel/entity.ts:10`          |
| `ValueObject`   | Objeto inmutable definido por valor, `equals()` por deep-equal                                      | `kernel/value-object.ts:12`    |
| `DomainEvent`   | Hecho pasado, inmutable, con `eventId` UUID y `occurredAt`                                          | `kernel/domain-event.ts:13`    |
| `ErrorCode`     | Enum string-literal con códigos estables para `DomainError`                                         | `kernel/domain-error.ts:7-31`  |
| `DomainError`   | `Error` tipado con `code: ErrorCodeType` y `details?`                                               | `kernel/domain-error.ts:35-43` |

---

## 6. Lenguaje ubicuo (common)

| Término                     | Definición                                                                                        | Referencia                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `ChainId`                   | Identificador canónico de chain (`ethereum`/`solana`/`bsc`/`base`/`arbitrum`/`polygon`/`unknown`) | `common/value-objects/chain-id.vo.ts:27`      |
| `ChainId.fromString(raw)`   | Factory que valida y lanza `DomainError(UNSUPPORTED_CHAIN)` si raw no es válido                   | `common/value-objects/chain-id.vo.ts:49`      |
| `ChainId.isEvm`             | `true` para EVM chains (ethereum/bsc/base/arbitrum/polygon)                                       | `common/value-objects/chain-id.vo.ts:65`      |
| `ChainId.isSolana`          | `true` solo para `solana`                                                                         | `common/value-objects/chain-id.vo.ts:71`      |
| `TokenMetrics`              | Métricas USD parseadas de un alpha-call (MC, LP, FDV, holders)                                    | `common/value-objects/token-metrics.vo.ts:16` |
| `TokenMetrics.empty()`      | Factory con todos los campos `null`                                                               | `common/value-objects/token-metrics.vo.ts:21` |
| `TokenMetrics.completeness` | Ratio (0..1) de campos no-null vs total (4 campos)                                                | `common/value-objects/token-metrics.vo.ts:47` |
| `AppConfig`                 | Shape de la configuración cargada al boot                                                         | `common/config/app.config.ts:25-94`           |
| `HeliusNetworkConfig`       | Sub-config para cada red Helius (mainnet/devnet)                                                  | `common/config/app.config.ts:11-17`           |
| `DatabaseModule`            | Wrapper NestJS para `TypeOrmModule.forRootAsync()` opcional                                       | `common/persistence/database.module.ts:33`    |
| `isDatabaseEnabled()`       | Helper para decidir si activar Postgres                                                           | `common/persistence/database.module.ts:22`    |

---

## 7. API (HTTP — inbound)

`shared` no expone endpoints HTTP. La configuración se inyecta vía `ConfigService` de NestJS usando `appConfig` registrado como namespace `'app'`.

Para consumir la config en un módulo:

```ts
ConfigModule.forRoot({ load: [appConfig], isGlobal: true });
// luego inyectar: constructor(private config: ConfigService) { this.config.get('app.port'); }
```

---

## 8. Objetos y modelado del dominio (kernel)

### 8.1 `AggregateRoot<TId>`

Archivo: `kernel/aggregate-root.ts:17`.

```
AggregateRoot<TId> {
  readonly id: TId;
  private _uncommittedEvents: DomainEvent[];
  protected autoCommit: boolean;       // default false

  protected apply(event: DomainEvent): void   // muta + encola; si autoCommit, dispara commit()
  protected abstract mutate(event: DomainEvent): void
  public commit(): DomainEvent[]              // retorna y limpia _uncommittedEvents
  public getUncommittedEvents(): DomainEvent[] // peek sin consumir
  public loadFromHistory(events: DomainEvent[]): void  // para event sourcing rebuild
  public uncommit(): void                     // descarta pendientes (rollback)
}
```

Convenciones de uso en BCs:

- `apply(event)` se llama desde constructores `static create()` o métodos de comando.
- Tras persistir, el use case hace `aggregate.commit()` y pasa los eventos al publisher (`kernel/aggregate-root.ts:51-55`).
- `mutate()` es obligatorio incluso si es no-op (ver `ExtractionResult.mutate` en `ca/extraction/domain/entities/extraction-result.entity.ts:117-120`).

### 8.2 `Entity<TId>`

Archivo: `kernel/entity.ts:10`. Mucho más simple: solo id + `equals(other)`. Casi no se usa directamente — la mayoría de entidades son agregados.

### 8.3 `ValueObject<TProps>`

Archivo: `kernel/value-object.ts:12`.

- `props` se congela con `Object.freeze({ ...props })` en el constructor (`:16`).
- `equals(other)` (`:22-26`) — primero compara `constructor` (distintos tipos nunca son iguales), luego `deepEquals` recursivo.
- `deepEquals` (`:28-45`) — maneja primitivos, `null` y objetos con keys comparadas recursivamente. No compara arrays como keys.
- `toObject()` (`:51-53`) — shallow copy para exponer estado sin romper inmutabilidad.

### 8.4 `DomainEvent`

Archivo: `kernel/domain-event.ts:13`.

```
DomainEvent {
  readonly occurredAt: Date;           // new Date() en constructor
  readonly eventId: string;            // crypto.randomUUID() en constructor
  readonly eventName: string;          // pasado al super()
  readonly aggregateId: string;        // pasado al super()
  public abstract toPayload(): Record<string, unknown>;
}
```

Subclases concretas (en cada BC) extienden `DomainEvent`, llaman `super(eventName, aggregateId)`, congelan su payload con `Object.freeze` y exponen `toPayload()`.

### 8.5 Errores

`ErrorCode` (`kernel/domain-error.ts:7-31`) — enum `as const`:

| Categoría          | Códigos                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Genérico           | `INTERNAL`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED` |
| Token context      | `TOKEN_NOT_FOUND`, `INVALID_ADDRESS`, `UNSUPPORTED_CHAIN`, `HONEYPOT_DETECTED`                 |
| Trading            | `INSUFFICIENT_BALANCE`, `SLIPPAGE_EXCEEDED`, `ORDER_FAILED`                                    |
| discovery pipeline | `NO_CONTRACT_ADDRESS`, `NO_PARSED_CALL`                                                        |

`DomainError extends Error` (`:35-43`) — constructor `(code, message, details?)`. `details` se conserva como `Record<string, unknown>` para que handlers HTTP/loggers lo serialicen.

---

## 9. VOs promovidos (common)

### 9.1 `ChainId`

Archivo: `common/value-objects/chain-id.vo.ts:27`.

```
ChainId {
  readonly value: 'ethereum' | 'solana' | 'bsc' | 'base' | 'arbitrum' | 'polygon' | 'unknown'
  readonly isEvm: boolean
  readonly isSolana: boolean
}
```

- **Provenance:** promovido desde `ca/chain-detection/domain/value-objects/chain-id.vo.ts` el 2026-06-19.
- **Consumers (9 BCs):** chain-detection, classification, scoring, filters, enrichment, honeypot, analytics, publishing/telegram, y parsing (a través de eventos con `chain: string`).
- **Cambio breaking:** cualquier modificación a `ChainIdValue` (agregar/quitar chain) o a las reglas de validación rompe los 9 BCs consumidores.

### 9.2 `TokenMetrics`

Archivo: `common/value-objects/token-metrics.vo.ts:16`.

```
TokenMetrics {
  readonly marketCapUsd: number | null
  readonly liquidityUsd: number | null
  readonly fdvUsd: number | null
  readonly holders: number | null
  readonly completeness: number          // ratio (0..1)
}
```

- **Provenance:** promovido desde `ca/parsing/domain/value-objects/token-metrics.vo.ts` el 2026-06-19.
- **Consumers (2 BCs):** parsing (productor) y normalization (consumidor). Comparten aggregate cluster — la promoción reduce cross-BC acoplamiento.
- **Cambio breaking:** renombrar campos o cambiar tipos rompe parsing + normalization.

---

## 10. Configuración (`AppConfig`)

Archivo: `common/config/app.config.ts:137`. Registrado vía `registerAs('app', factory)`.

| Sección                                                                          | Env vars                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port`                                                                           | `PORT` (default `3000`)                                                                                                                                                                                                   |
| `nodeEnv`                                                                        | `NODE_ENV` (default `'development'`)                                                                                                                                                                                      |
| `alchemy.apiKey`                                                                 | `ALCHEMY_API_KEY`                                                                                                                                                                                                         |
| `birdeye.apiKey`                                                                 | `BIRDEYE_API_KEY`                                                                                                                                                                                                         |
| `fluxrpc.{apiKey, rpcUrl, wsUrl?}`                                               | `FLUXRPC_API_KEY`, `FLUXRPC_RPC`, `FLUXRPC_WS`                                                                                                                                                                            |
| `helius.apiKey`                                                                  | `HELIUS_API_KEY`                                                                                                                                                                                                          |
| `helius.mainnet.*`                                                               | `HELIUS_RPC_URL_MAINNET`, `HELIUS_GATEKEEPER_RPC_URL_MAINNET`, `HELIUS_PARSE_SOLANA_TRANSACTION_MAINNET`, `HELIUS_PARSE_SOLANA_TRANSACTION_HISTORY_MAINNET`, `HELIUS_WS_MAINNET`                                          |
| `helius.devnet.*`                                                                | mismo set con sufijo `_DEVNET`                                                                                                                                                                                            |
| `mobula.apiKey`                                                                  | `MOBULA_API_KEY`                                                                                                                                                                                                          |
| `moralis.apiKey`                                                                 | `MORALIS_API_KEY`                                                                                                                                                                                                         |
| `pumpdev.{apiKey, walletPublic, walletPrivate}`                                  | `PUMPDEV_API_KEY`, `PUMPDEV_WALLET_PUBLIC`, `PUMPDEV_WALLET_PRIVATE`                                                                                                                                                      |
| `telegram.{botToken (deprecated), mtprotoApiId, mtprotoApiHash, mtprotoSession}` | `TELEGRAM_BOT_TOKEN` (deprecated — use specific bot tokens: `VIP_CALLS_BOT_TOKEN`, `CRYPTO_NEWS_BOT_TOKEN`, `CHAIN_DEXTER_BOT_TOKEN`), `TELEGRAM_MTPROTO_API_ID`, `TELEGRAM_MTPROTO_API_HASH`, `TELEGRAM_MTPROTO_SESSION` |
| `ingestion.telegram.*`                                                           | `INGESTION_TELEGRAM_SEED_*`, `INGESTION_TELEGRAM_METADATA_CACHE_FILE`, `INGESTION_TELEGRAM_BACKFILL_*`                                                                                                                    |
| `publishing.telegram.useRealMtproto`                                             | `PUBLISHING_TELEGRAM_USE_REAL_MTPROTO`                                                                                                                                                                                    |
| `analytics.*`                                                                    | `ANALYTICS_EVALUATION_HORIZONS_HOURS`, `ANALYTICS_SCHEDULER_*`                                                                                                                                                            |
| `database.*`                                                                     | `DATABASE_ENABLED`, `POSTGRES_*`, `DATABASE_SYNCHRONIZE`, `DATABASE_LOGGING`                                                                                                                                              |

Strings vacíos son valores por defecto para todas las api keys. El caller debe validar antes de usar.

---

## 11. Persistencia (`DatabaseModule`)

Archivo: `common/persistence/database.module.ts:33`.

`DatabaseModule.forRootFromEnv()` retorna un `DynamicModule` que activa `TypeOrmModule.forRootAsync()` solo si `DATABASE_ENABLED=true`. Si está desactivado, retorna módulo vacío y los repos in-memory se usan.

Tres TypeORM entities registrados desde diferentes BCs:

```ts
const PERSISTED_ENTITIES = [
  TelegramChannelEntity, // ca/ingestion/telegram
  CanonicalTokenCallEntity, // ca/normalization
  ChannelReputationStatsEntity, // ca/analytics
];
```

---

## 12. Utilidades (`common/utils/index.ts`)

- `Uuid.v4()` — wrapper sobre `crypto.randomUUID()` (`:6`).
- `DateTime.now()` — `new Date()` (`:11`).
- `DateTime.addMinutes(date, minutes)` — suma en milisegundos (`:15-17`).
- `DateTime.isBefore(a, b)` / `isAfter(a, b)` — comparación por `.getTime()` (`:19-25`).

No hay otras utilidades (logger, retry, etc.). Si se necesitan, se prefieren librerías del ecosistema o un helper local en el BC correspondiente.

---

## 13. Casos de uso

`shared` no tiene casos de uso (no es un BC). Es código reutilizable. Ejemplos de uso por los BCs:

| BC                                                                                                                                              | Cómo lo usa                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ca/extraction`                                                                                                                                 | `ExtractionResult extends AggregateRoot<string>`; lanza `DomainError(VALIDATION)`, `DomainError(INVALID_ADDRESS)`, `DomainError(NOT_FOUND)` |
| `ca/parsing`                                                                                                                                    | `TokenCall extends AggregateRoot<string>`; lanza `DomainError(NO_CONTRACT_ADDRESS)`, `DomainError(NO_PARSED_CALL)`                          |
| `ca/ingestion/telegram`                                                                                                                         | `TelegramChannel` y otros agregados extienden `AggregateRoot`; eventos extienden `DomainEvent`                                              |
| `ca/chain-detection`, `ca/enrichment`, `ca/classification`, `ca/scoring`, `ca/filters`, `ca/honeypot`, `ca/analytics`, `ca/publishing/telegram` | Importan `ChainId` desde `common/value-objects/chain-id.vo`                                                                                 |
| `ca/parsing`, `ca/normalization`                                                                                                                | Importan `TokenMetrics` desde `common/value-objects/token-metrics.vo`                                                                       |
| `ca/*` (todos)                                                                                                                                  | Los VOs extienden `ValueObject<TProps>` con factories estáticas que lanzan `DomainError`                                                    |

---

## 14. Wiring (NestJS DI)

`shared` **no tiene módulo NestJS propio**. La carga de configuración se hace una sola vez en el módulo raíz de la app:

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ load: [appConfig], isGlobal: true }),
    ExtractionModule,
    ParsingModule,
    // ...
  ],
})
export class AppModule {}
```

`AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent`, `DomainError`, `Uuid`, `DateTime`, `ChainId`, `TokenMetrics`, `AppConfig`, `DatabaseModule` se importan directamente desde `shared/*` en cada archivo del BC.

---

## 15. Errores de dominio

`shared` define los códigos en `ErrorCode` (`kernel/domain-error.ts:7-31`) pero no lanza ninguno por sí mismo. La lista completa está cubierta arriba (§8.5).

`DomainError` se lanza desde los BCs cuando una invariante se rompe. Los handlers HTTP/adapters de cada BC son responsables de mapear `code` a status HTTP.

---

## 16. Pruebas

`shared` no tiene specs propios. La cobertura llega transitivamente desde los specs de cada BC (los VOs/aggregados se ejercitan en sus use cases).

**Gaps conocidos:**

- Sin specs para `ValueObject.deepEquals` (edge cases: arrays, `Date`, `Map`, ciclos).
- Sin specs para `AggregateRoot.{commit, uncommit, loadFromHistory, autoCommit}`.
- Sin specs para `DomainEvent` (validar `eventId` UUID, `occurredAt` no nula).
- Sin specs para `Uuid`/`DateTime` (trivial, pero debería existir).

> Estos gaps no son bloqueantes: las primitivas son lo bastante simples como para que su comportamiento se verifique por uso. Si en el futuro alguna primitiva acumula lógica, añadir su spec.

---

## 17. Extensiones sugeridas

1. **Más Value Object bases** — ej. `PositiveInt`, `NonEmptyString` para reusar validaciones repetidas en BCs.
2. **DomainEvent base con `version`** — útil cuando se introduce event sourcing real.
3. **Outbox helper** — `SharedOutboxPort` para evitar reinventar el patrón en cada BC.
4. **Config typed accessors** — funciones `heliusConfig(configService)` en lugar de `configService.get('app.helius.mainnet.rpcUrl')` para evitar typos.
5. **Logging estructurado** — interface `LoggerPort` y adapter que los BCs puedan inyectar (en lugar de `new Logger(...)` directo, ver `InProcessExtractionEventPublisher.logger`).
6. **Specs de las primitivas** — cubrir los gaps listados arriba.
7. **Considerar promover `TokenScoredEvent`** a `common/events/` cuando 3+ BCs lo consuman (hoy: filters, honeypot, analytics — ya son 3, **considerar promoción**).

---

## 18. Mapa rápido de archivos

```
src/shared/
├── kernel/
│   ├── aggregate-root.ts
│   ├── domain-error.ts
│   ├── domain-event.ts
│   ├── entity.ts
│   └── value-object.ts
├── common/
│   ├── value-objects/
│   │   ├── chain-id.vo.ts
│   │   └── token-metrics.vo.ts
│   ├── config/
│   │   └── app.config.ts
│   ├── persistence/
│   │   └── database.module.ts
│   └── utils/
│       └── index.ts
└── README.md
```
