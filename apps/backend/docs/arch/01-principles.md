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
