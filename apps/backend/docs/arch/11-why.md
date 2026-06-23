# When to Use This Architecture

## ✅ Use when

- Medium-to-large systems with multiple business domains
- Products with long lifecycles
- Multiple development teams
- Complex business logic (fintech, trading, SaaS)
- Systems needing high maintainability
- Microservices or modular monoliths

## ❌ Avoid when

- Simple CRUD applications
- Prototypes or MVPs (can introduce over time)
- Very small projects with 1-2 developers
- Projects with no complex business rules

## When to Start

Start simple. Add hexagonal boundaries as complexity grows:

```
Phase 1: Flat structure (simple CRUD)
    ↓  (when domain logic appears)
Phase 2: Domain/Application/Infrastructure separation
    ↓  (when multiple domains emerge)
Phase 3: Bounded Contexts
    ↓  (when team grows)
Phase 4: Extract to microservices
```

## Pragmatic Trade-offs

| Decision | When to relax |
|----------|---------------|
| Separate DB per BC | Single DB with schema separation is OK for monolith |
| Event bus | Direct method calls between in-process BCs is fine early on |
| Value Objects | Plain primitives can work for simple types |
| Full CQRS | Just commands + queries without separate models is fine |

## Summary

> Each bounded context is a mini independent system. Inside it, use hexagonal architecture to protect the domain.
