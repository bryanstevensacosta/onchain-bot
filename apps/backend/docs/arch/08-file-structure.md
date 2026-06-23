# File Structure

## Single Bounded Context

```
src/
└── user/                              # Bounded Context
    ├── index.ts                       # Module barrel export
    │
    ├── domain/                        # Pure business logic
    │   ├── entities/
    │   │   └── user.entity.ts
    │   ├── value-objects/
    │   │   ├── user-id.vo.ts
    │   │   └── email.vo.ts
    │   ├── events/
    │   │   └── user-created.event.ts
    │   ├── services/
    │   │   └── user-uniqueness.service.ts
    │   └── ports/
    │       └── user.repository.port.ts
    │
    ├── application/                   # Use cases orchestration
    │   ├── commands/
    │   │   ├── create-user.command.ts
    │   │   └── create-user.handler.ts
    │   ├── queries/
    │   │   ├── get-user.query.ts
    │   │   └── get-user.handler.ts
    │   ├── dto/
    │   │   ├── create-user.dto.ts
    │   │   └── user.dto.ts
    │   └── mappers/
    │       └── user.mapper.ts
    │
    ├── infrastructure/                # Adapters & framework
    │   ├── api/                       # Inbound adapters (REST/GraphQL)
    │   │   └── user.controller.ts
    │   ├── repositories/              # Outbound adapters
    │   │   └── typeorm-user.repository.ts
    │   ├── consumers/                 # Message consumers
    │   │   └── payment-event.consumer.ts
    │   └── clients/                   # External API clients
    │       └── notification.client.ts
    │
    └── user.module.ts                 # NestJS module
```

## Multiple Bounded Contexts

```
src/
├── user/                              # BC 1
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── user.module.ts
│
├── payment/                           # BC 2
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── payment.module.ts
│
├── trading/                           # BC 3
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── trading.module.ts
│
├── shared/                            # Cross-cutting
│   ├── ddd/                           # Base classes (AggregateRoot, ValueObject)
│   │   ├── aggregate-root.ts
│   │   ├── value-object.ts
│   │   └── domain-event.ts
│   ├── interfaces/                    # Shared DTOs
│   │   └── event.interface.ts
│   └── utils/
│       └── pagination.ts
│
└── main.ts
```

## Minimal BC (for simple features)

```
src/
└── notification/
    ├── domain/
    │   ├── notification.entity.ts
    │   └── notification.repository.port.ts
    ├── application/
    │   ├── send-notification.use-case.ts
    │   └── notification.dto.ts
    ├── infrastructure/
    │   ├── api/notification.controller.ts
    │   └── repositories/prisma-notification.repository.ts
    └── notification.module.ts
```

## File Naming Conventions

| Layer | Suffix | Example |
|-------|--------|---------|
| Entity | `.entity.ts` | `user.entity.ts` |
| Value Object | `.vo.ts` | `email.vo.ts` |
| Domain Event | `.event.ts` | `user-created.event.ts` |
| Port | `.port.ts` | `user.repository.port.ts` |
| Command | `.command.ts` | `create-user.command.ts` |
| Command Handler | `.handler.ts` | `create-user.handler.ts` |
| Query | `.query.ts` | `get-user.query.ts` |
| DTO | `.dto.ts` | `user.dto.ts` |
| Controller | `.controller.ts` | `user.controller.ts` |
| Repository impl | `.repository.ts` | `typeorm-user.repository.ts` |
| Module | `.module.ts` | `user.module.ts` |
