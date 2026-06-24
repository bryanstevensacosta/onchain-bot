# When to Use This Architecture

## Use when

- Sistemas medio-grandes con múltiples dominios de negocio.
- Productos con ciclos de vida largos.
- Equipos de desarrollo múltiples.
- Lógica de negocio compleja (fintech, trading, SaaS, **crypto alpha tracking**).
- Sistemas que requieren alta mantenibilidad.
- **Monolitos modulares** o microservicios (la arquitectura funciona igual; la diferencia es el deploy).

## Avoid when

- CRUD simples.
- Prototipos o MVPs de un fin de semana.
- Proyectos muy pequeños con 1-2 devs.
- Proyectos sin reglas de negocio complejas.

## Cuándo empezar

Empezar simple. Añadir boundaries hexagonales a medida que crece la complejidad:

```
Phase 1: Flat structure (CRUD simple)
    ↓  (cuando aparece lógica de dominio)
Phase 2: Domain/Application/Infrastructure separation
    ↓  (cuando emergen múltiples dominios)
Phase 3: Bounded Contexts
    ↓  (cuando crece el equipo)
Phase 4: Extract a microservicios
```

> El core de SpyDefi **arranca directamente en Phase 3**: ya tiene 14 dominios identificados (`ingestion`, `extraction`, `parsing`, ...) con vocabulario y reglas propios. Empezar en Phase 1-2 sería over-engineering *hacia atrás*.

## Trade-offs pragmáticos

| Decisión | Cuándo relajar |
|---|---|
| DB separada por BC | Una sola DB con separación por schemas es OK para el core (v1) |
| Event bus | Llamadas directas entre BCs in-process es OK al principio (luego introducir `@nestjs/event-emitter`) |
| Value Objects | Primitivos plain pueden funcionar para tipos simples |
| CQRS completo | Solo commands + queries sin modelos separados es OK |
| In-memory repos | Solo válido para dev/MVP; migrar a TypeORM/Prisma en producción |

## Resumen

> Cada bounded context es un mini sistema independiente. Dentro de él, usar arquitectura hexagonal para proteger el dominio.

## Caso concreto: el core de SpyDefi

El core **encaja perfectamente** con esta arquitectura porque:

1. Tiene **múltiples dominios** con vocabularios distintos (un call de Telegram no es lo mismo que un snapshot de mercado, no es lo mismo que una reputación de canal).
2. La **lógica de negocio es rica** (reglas de scoring, heurísticas de honeypot, gates de filtrado, agregación de calls duplicados, dedup por `(chain, address)`).
3. El **dominio es longevo**: se va a iterar mucho (mejores heurísticas, más providers, más chains).
4. Hay **múltiples providers externos** (DexScreener, GeckoTerminal, Helius, Telegram MTProto) que se cambiarán/añadirán.
5. La **infraestructura cambia más rápido que el dominio** (repos in-memory → DB, MTProto mock → real, providers cambian de API).

Por todo esto, el coste de la arquitectura hexagonal + BCs se amortiza desde el día 1.
