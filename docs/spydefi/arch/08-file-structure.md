# File Structure

## Estructura general del repositorio del core

```
spydefi-core/
├── src/
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   ├── main.ts
│   │
│   ├── telegram/
│   │   ├── ingestion/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   ├── api/                      (opcional — sin HTTP en v1)
│   │   │   └── telegram-ingestion.module.ts
│   │   └── publishing/
│   │       ├── domain/
│   │       ├── application/
│   │       ├── infrastructure/
│   │       ├── api/
│   │       └── publishing.module.ts
│   │
│   ├── token/
│   │   ├── intake/
│   │   │   ├── extraction/
│   │   │   │   ├── domain/
│   │   │   │   ├── application/
│   │   │   │   ├── infrastructure/
│   │   │   │   ├── api/                  (opcional)
│   │   │   │   └── extraction.module.ts
│   │   │   └── parsing/
│   │   │       ├── domain/
│   │   │       ├── application/
│   │   │       ├── infrastructure/
│   │   │       ├── api/                  (opcional)
│   │   │       └── parsing.module.ts
│   │   ├── normalization/
│   │   ├── market-data/
│   │   │   └── enrichment/
│   │   ├── classification/
│   │   ├── scoring/
│   │   ├── honeypot/
│   │   ├── token-gating/
│   │   │   └── filters/
│   │   ├── call-tracking/
│   │   └── channel-reputation/
│   │
│   ├── chain/
│   │   ├── detection/
│   │   └── registry/
│   │
│   └── shared/
│       ├── common/
│       │   ├── config/
│       │   ├── persistence/
│       │   └── events/
│       └── domain/
│           ├── aggregate-root.ts
│           ├── entity.ts
│           ├── value-object.ts
│           ├── domain-event.ts
│           └── domain-error.ts
│
├── docs/
│   └── arch/                              (esta documentación)
│
├── test/
├── package.json
├── tsconfig.json
├── nest-cli.json
└── docker-compose.yml
```

## Estructura interna de un BC (plantilla)

```
src/<area>/<bc>/
├── README.md                              (estructura fijada por docs/proyect/README-BC-GUIDE.md)
│
├── domain/                                # Pure business logic
│   ├── entities/
│   │   └── <bc>.entity.ts                 # p.ej. token-call.entity.ts
│   ├── value-objects/
│   │   ├── <bc>-id.vo.ts
│   │   └── <vo>.vo.ts
│   ├── events/
│   │   └── <bc>-<evento>.event.ts
│   ├── services/
│   │   └── <bc>-<servicio>.service.ts
│   └── ports/
│       └── <bc>.repository.port.ts        # abstract class (no interface)
│
├── application/                           # Use cases orchestration
│   ├── use-cases/
│   │   └── <bc>-<caso>.use-case.ts
│   ├── event-handlers/
│   │   └── <evento-consumido>.handler.ts
│   ├── commands/
│   │   └── <comando>.command.ts
│   ├── queries/
│   │   └── <query>.query.ts
│   ├── dto/
│   │   └── <dto>.dto.ts
│   └── mappers/
│       └── <bc>.mapper.ts
│
├── infrastructure/                        # Adapters & framework
│   ├── api/                               # Inbound (REST/CLI/event-handler bindings)
│   ├── repositories/                      # Outbound: InMemory*Repository
│   ├── consumers/                         # (opcional, in-process)
│   └── clients/                           # Outbound: HTTP clients a providers
│
├── api/                                   # (opcional) HTTP inbound
│   ├── input/
│   │   └── <input>.input.ts               # DTOs validados con class-validator
│   └── <bc>.controller.ts
│
└── <bc>.module.ts                         # NestJS module
```

## Convenciones de nombrado

| Capa | Sufijo | Ejemplo |
|---|---|---|
| Entity | `.entity.ts` | `token-call.entity.ts` |
| Value Object | `.vo.ts` | `contract-address.vo.ts` |
| Domain Event | `.event.ts` | `token-call-parsed.event.ts` |
| Port | `.port.ts` | `token-call.repository.port.ts` |
| Use Case | `.use-case.ts` | `score-token-call.use-case.ts` |
| Command | `.command.ts` | `enrich-token-call.command.ts` |
| Event Handler | `.handler.ts` | `token-call-parsed.handler.ts` |
| DTO | `.dto.ts` | `enrich-token-call.dto.ts` |
| Input | `.input.ts` | `add-channel.input.ts` |
| Controller | `.controller.ts` | `extraction.controller.ts` |
| Repository impl | `.repository.ts` | `in-memory-token-call.repository.ts` |
| HTTP Client | `.client.ts` | `dexscreener.client.ts` |
| Module | `.module.ts` | `extraction.module.ts` |

## Convenciones fijas del core (no romper)

1. **Hexagonal estricto:** `domain/` no importa de `application/`, `infrastructure/` ni `api/`. Verificable con `tsc --noEmit` y un `eslint-plugin-boundaries` (o equivalente).
2. **Puertos como `abstract class`** (no `interface`) para ser tokens DI de NestJS. Ver `domain/ports/*.port.ts`.
3. **Inputs en `api/input/`** validados con `class-validator` (`@IsString`, `@IsInt`, `@IsOptional`, etc.).
4. **VOs como `ValueObject<TProps>`** con factories `fromX(...)` que lanzan `DomainError(ErrorCode.VALIDATION)` o código específico. Ver `shared/domain/value-object.ts`.
5. **Errores centralizados** en `shared/domain/domain-error.ts` (`ErrorCode.NOT_FOUND`, `VALIDATION`, `INVALID_ADDRESS`, `NO_CONTRACT_ADDRESS`, etc.).
6. **Eventos extienden `DomainEvent`** con `eventName` y payload inmutable (`Object.freeze`). Publisher siempre vía `publishAll` después de `aggregate.commit()`.
7. **In-memory repos con FIFO eviction** (capacity 500–10 000 según BC). Reemplazables por TypeORM/Prisma sin tocar BC consumers.
8. **Un `*.module.ts` por BC** que se monta en `src/app.module.ts` y nada más.
