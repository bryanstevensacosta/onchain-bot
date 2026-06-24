# Hexagonal Architecture (Ports & Adapters)

## Structure

Each Bounded Context follows a hexagonal (Ports & Adapters) layout:

```
                [ API / CLI / Queue Consumer ]
                         |
                    (Adapters In)
                         |
                 ┌─────────────────┐
                 │   APPLICATION   │
                 │   (Use Cases)   │
                 └─────────────────┘
                         |
                  (Ports / Interfaces)
                         |
                 ┌─────────────────┐
                 │     DOMAIN      │
                 │  (Entities +    │
                 │   Rules)        │
                 └─────────────────┘
                         |
                  (Ports Out)
                         |
             [ DB / APIs / Brokers ]
```

## Dependency Direction

**All dependencies point inward:** Domain ← Application ← Infrastructure

## Ports (Interfaces)

Define contracts. Two types:

| Port Type | Direction | Purpose |
|-----------|-----------|---------|
| **Inbound** | → Application | What the system does (use cases) |
| **Outbound** | Domain ← | What the system needs (repositories, clients) |

## Adapters (Implementations)

| Adapter Type | Examples |
|-------------|----------|
| **Inbound** | REST controller, GraphQL resolver, Queue consumer, CLI command |
| **Outbound** | TypeORM repository, Prisma adapter, HTTP client, Kafka producer |

## Rules

- Domain has **zero dependencies** on frameworks
- Application depends on domain, never on adapters
- Adapters depend on ports (interfaces), not on concrete implementations
- Swapping a DB, queue, or HTTP client should not change domain or application code
