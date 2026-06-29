---
slug: telegram-kol-ingestion-split
status: approved
intent: clear
pending-action: write .omo/plans/telegram-kol-ingestion-split.md
approach: Extract 10 files from kol/ingestion → telegram/ingestion (renamed); absorb 4 residual files into kol/identity; delete kol/ingestion/; update 6 external consumers.
---

# Draft: telegram-kol-ingestion-split

## Components (topology ledger)
| id | outcome | status | evidence |
|---|---|---|---|
| telegram/ingestion/ dir + files | New directory with 10 files (6 renamed classes) | active | plan todos |
| kol/identity absorption | 4 files absorbed, module updated | active | plan todos |
| External consumer updates | 6 files import paths updated | active | plan todos |
| kol/ingestion/ deletion | Directory removed, module replaced | active | plan todos |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Naming convention | Classes que migran a telegram/ pierden prefijo "Kol" | Ya no pertenecen al BC kol | Yes (naming) |
| Module circularity | TelegramIngestionModule se marca @Global() para que IdentityModule acceda a sus providers sin import circular | Es la solución más simple y NestJS soporta @Global() | Yes |
| `StartKolIngestionUseCase` | Se mueve completo a telegram/ (incluyendo activateKols()) | La activación KOL es parte del flujo de ingestión | Yes |

## Findings (cited - path:lines)
- tsconfig.json ya tiene alias `telegram/*` → `src/telegram/*` (line 21) — no requiere cambios
- 0 spec files dependen de kol/ingestion/ — sin riesgo de tests rotos ocultos
- KolIngestionModule actualmente exporta KolRepository, KolEventPublisher, KolListenerPort, StartKolIngestionUseCase, IngestionSafetyConfig
- IdentityModule actualmente importa KolIngestionModule y re-exporta KolRepository

## Decisions (with rationale)
1. **TelegramIngestionModule @Global()** — evita circular dependency. AppModule lo importa, IdentityModule no necesita importarlo.
2. **TelegramIngestionModule importa IdentityModule** — para obtener KolRepository + KolEventPublisher.
3. **Clases sin rename** (IngestionSafetyConfig, SleepWindowService, etc.) se quedan con su nombre — son suficientemente genéricos.
4. **Todo en un solo PR** — un único commit por cada todo, pero todos en una misma branch.

## Scope IN
- 10 archivos de kol/ingestion → telegram/ingestion (con rename de clase/archivo donde aplica)
- 4 archivos residuales de kol/ingestion → kol/identity (sin rename de clase)
- Nuevo TelegramIngestionModule (@Global)
- IdentityModule actualizado (nuevos providers, sin import KolIngestionModule)
- 6 archivos externos con imports actualizados
- kol/ingestion/ eliminado

## Scope OUT (Must NOT have)
- NO cambiar lógica de negocio (el comportamiento debe ser idéntico)
- NO renombrar KolRepository, KolEventPublisher, KolMessageIngestedEvent, MessageId, InProcessKolEventPublisher
- NO mover archivos de token/ o shared/
- NO crear nuevos tests unitarios (solo verificar que los existentes pasan)
- NO cambiar interfaz pública de los módulos (solo paths)

## Open questions
Ninguna — todas resueltas en el brief.

## Approval gate
status: approved
<!-- Approved by user on "cambiarás nombres de clases y archivos, una refactorización masiva pero efectiva" -->
