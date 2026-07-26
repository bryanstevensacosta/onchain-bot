---
slug: compound-group-modal
status: awaiting-approval
intent: unclear
pending-action: write .omo/plans/compound-group-modal.md
approach: Implementar botón separado "+ Add Compound Group" con modal que acepta múltiples frases a la vez
---

# Draft: compound-group-modal

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->

| Component                           | Outcome                            | Status  | Evidence                       |
| ----------------------------------- | ---------------------------------- | ------- | ------------------------------ |
| Backend batch endpoint blacklist    | POST /blacklist/batch acepta array | pending | blacklist.controller.ts:82-111 |
| Backend batch endpoint keywords     | POST /keywords/batch acepta array  | pending | keywords.controller.ts:122-148 |
| Frontend API batch create blacklist | createBlacklistBatch()             | pending | blacklist-api.ts               |
| Frontend API batch create keywords  | createKeywordBatch()               | pending | keywords-api.ts                |
| CompoundGroupModal blacklist        | Modal con N inputs de frase        | pending | blacklist-manager.tsx:40-235   |
| CompoundGroupModal keywords         | Modal con N inputs + template      | pending | keywords-section.tsx:46-200    |
| Integración botones blacklist       | 2 botones en header                | pending | blacklist-manager.tsx          |
| Integración botones keywords        | 2 botones en header                | pending | keywords-section.tsx           |

## Open assumptions (announced defaults)

<!-- Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto. -->

| Assumption    | Adopted default                              | Rationale                                                                         | Reversible? |
| ------------- | -------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| UX design     | Botón separado vs modal multi-phrase         | Botón separado es más limpio mentalmente - acciones distintas = botones distintos | Si          |
| Batch API     | Un andGroupId generado en backend para todas | Simplifica el frontend, garantiza consistencia                                    | Si          |
| Mínimo frases | 2 frases requeridas para compound            | Un compound group con 1 frase no tiene sentido                                    | Si          |

## Findings (cited - path:lines)

- Backend ya soporta `andGroupId` en blacklist y keywords (blacklist.controller.ts:36, keywords.controller.ts:47)
- Frontend ya tiene dropdown "Compound" en modales existentes (blacklist-manager.tsx:175-191)
- El matching pipeline ya evalúa AND groups correctamente (crypto-news-message-ingested.handler.ts:429-511)
- current UX requiere 3+ clicks para agregar 2+ frases al mismo grupo

## Decisions (with rationale)

1. **Botón separado "+ Add Compound Group"** - Más intuitivo que modificar el modal existente para aceptar múltiples frases. Mantiene el modal de "Add Phrase" simple para frases individuales.
2. **Batch endpoints en backend** - En vez de hacer N llamadas desde frontend, un solo endpoint que recibe el array y genera el UUID una vez.
3. **Reuse de componentes existentes** - BlacklistModal y KeywordsModal sirven como referencia, pero el nuevo CompoundGroupModal será independiente para mantener clean separation.

## Scope IN

- Backend: 2 batch endpoints (blacklist y keywords)
- Frontend API: 2 funciones batch create
- Frontend UI: 2 CompoundGroupModals (uno por feature)
- Integración: 2 botones nuevos por feature

## Scope OUT (Must NOT have)

- NO eliminar funcionalidad existente
- NO cambiar lógica de matching del pipeline
- NO modificar estructura de datos

## Open questions

- Ninguno - todo explorado y resuelto con defaults

## Approval gate

status: awaiting-approval
approach: Implementar botón separado "+ Add Compound Group" con modal que acepta múltiples frases a la vez
pending-action: none - plan listo para review
