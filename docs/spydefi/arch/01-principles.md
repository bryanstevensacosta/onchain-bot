# Core Principles

This architecture unites three key ideas:

1. **Domain-Driven Design (DDD)** — model the business
2. **Bounded Contexts** — isolated subdomains
3. **Hexagonal Architecture** — protect the domain from infrastructure

## The Golden Rule

> A bounded context should NEVER understand another context's internal model.

Interaction happens only through:
- Contracts (interfaces/ports)
- Domain Events
- DTOs

## Layered Dependency Rule

Dependencies point **inward**. The domain knows nothing about the outside world.

```
Adapters (in) → Application → Domain ← Application ← Adapters (out)
```

## Key Benefits

| Benefit | Description |
|---------|-------------|
| Modular scalability | Each BC scales independently |
| Team autonomy | Teams own entire contexts |
| Low coupling | BCs communicate via events/contracts |
| Testability | Domain tested without infrastructure |
| Infrastructure swap | Change DB, queue, API without touching domain |

## Aplicado al core de SpyDefi

En el core de SpyDefi, los 14 BCs del pipeline `ca` se construyen siguiendo estrictamente estas reglas:

- `ingestion` no sabe nada de `extraction`; publica el evento `MessageIngested` y se olvida.
- `enrichment` no sabe de qué fuente vino el candidato; consume `NormalizedCallExtracted` y produce `TokenSnapshot`.
- `scoring` no llama directamente a `channel-reputation`; lo consume como puerto (`ChannelReputationPort`) y un adapter in-memory lo implementa en el core (en el repo de producto, ese mismo puerto se reemplaza por uno que lea de la DB de KOL stats).
- Todos los puertos son `abstract class` (no `interface`) para que sirvan como tokens de DI de NestJS.
- Los repos son **in-memory con FIFO eviction** (capacity configurable). El swap a TypeORM/Prisma no toca ningún BC consumer.
