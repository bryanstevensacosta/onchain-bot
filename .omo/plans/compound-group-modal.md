# compound-group-modal - Work Plan

## TL;DR (For humans)

**What you'll get:** Nuevo flujo de UI con dos botones separados: "+ Add Phrase" (para frases independientes OR) y "+ Add Compound Group" (para grupos AND). El modal de compound permite agregar N frases a la vez, todas con el mismo `andGroupId`, sin tener que editar cada frase individualmente.

**Why this approach:** Botones separados es más intuitivo mentalmente — "crear frase simple" vs "crear grupo de frases" son acciones distintas. El modal de compoundgroup acepta múltiples frases en una sola operación, todas comparten el mismo grupo, eliminando el flujo actual de 3+ clicks para agregar 2+ frases al mismo grupo.

**What it will NOT do:** No eliminará el dropdown "Compound" existente del modal de frase individual — ese modal sigue funcionando para crear/editar frases individuales y agregarlas a grupos existentes.

**Effort:** Medium
**Risk:** Low — cambios de UI isolated, no toca lógica de matching del pipeline
**Decisions I made for you:** Implementé el diseño de "botón separado" en vez de "un modal con múltiples inputs de frase" porque es más limpio conceptualmente — acciones distintas = botones distintos.

Your next move: Approve o ejecutar high-accuracy review.

---

> TL;DR (machine): Medium effort, Low risk, 8 todos - agregar batch endpoints + nuevo modal compound group con múltiples inputs de frase

## Scope

### Must have

1. Backend: batch create endpoints para blacklist y keywords (aceptan array de frases)
2. Frontend API: funciones para llamar los batch endpoints
3. Frontend UI: nuevo modal `CompoundGroupModal` que acepta N frases
4. Integración: dos botones en blacklist-manager y keywords-section
5. Comportamiento correcto: todas las frases del modal comparten el mismo `andGroupId` (nuevo UUID)

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO eliminar funcionalidad existente de modal de frase individual
- NO cambiar lógica de matching del pipeline (el backend ya soporta andGroupId)
- NO crear componentes duplicados — reuse `BlacklistModal` y `KeywordsModal` como base o crea uno genérico
- NO modificar la estructura de datos — solo UI y batch endpoints

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + manual QA via browser
- Evidence: .omo/evidence/task-\*-compound-group-modal.<ext>

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave.

**Wave 1 (todos 1-4):** Backend batch endpoints + Frontend API
**Wave 2 (todos 5-8):** Frontend UI - CompoundGroupModal + botones

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | -          | 5,7    | 2,3,4                |
| 2    | -          | 5,7    | 1,3,4                |
| 3    | -          | 6,8    | 1,2,4                |
| 4    | -          | 6,8    | 1,2,3                |
| 5    | 1,2        | -      | -                    |
| 6    | 3,4        | -      | -                    |
| 7    | 1,2        | -      | -                    |
| 8    | 3,4        | -      | -                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Backend: agregar batch endpoint para blacklist (`POST /crypto-news-publisher/blacklist/batch`)
     What to do / Must NOT do: Crear `CreateBlacklistBatchDto` que acepta array de frases, cada una con `phrase`, `caseSensitive`, `matchMode`, `sourceChannelIds`, `requireMedia`. Un solo `andGroupId` generado en el controller para todas. Debe validar que mínimo 2 frases.
     Parallelization: Wave 1 | Blocked by: - | Blocks: 5
     References (executor has NO interview context - be exhaustive): apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts:82-111 (create single), apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts (entity con andGroupId)
     Acceptance criteria (agent-executable): `curl -X POST http://localhost:3030/crypto-news-publisher/blacklist/batch -H "Content-Type: application/json" -d '{"phrases":[{"phrase":"solana"},{"phrase":"presale"}]}'` retorna 201 con array de 2 BlacklistPhraseView
     QA scenarios: happy path con 2+ frases, error si 1 sola frase, error si frase vacía
     Commit: Y | feat(backend): add batch endpoint for blacklist phrases

- [ ] 2. Backend: agregar batch endpoint para keywords (`POST /crypto-news-publisher/keywords/batch`)
     What to do / Must NOT do: Similar a blacklist, crear `CreateKeywordBatchDto` con array de frases + `templateId` (compartido por todas). Mínimo 2 frases.
     Parallelization: Wave 1 | Blocked by: - | Blocks: 7
     References: apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts:122-148
     Acceptance criteria: `curl -X POST http://localhost:3030/crypto-news-publisher/keywords/batch -H "Content-Type: application/json" -d '{"phrases":[{"phrase":"BTC"},{"phrase":"ETH"}]}'` retorna 201 con array de 2 KeywordView
     QA scenarios: happy path, error si 1 frase, error si templateId inválido
     Commit: Y | feat(backend): add batch endpoint for keywords

- [ ] 3. Frontend API: agregar función batch create para blacklist
     What to do / Must NOT do: Agregar `createBlacklistBatch(phrases: CreateBlacklistBody[])` en `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts`. Llama a `POST /blacklist/batch`.
     Parallelization: Wave 1 | Blocked by: - | Blocks: 6
     References: apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts:1-50
     Acceptance criteria: La función hace HTTP POST a `/crypto-news-publisher/blacklist/batch` y retorna array de BlacklistPhraseView
     QA scenarios: Llamar la función mocked, verificar URL y payload
     Commit: Y | feat(frontend): add batch create for blacklist phrases

- [ ] 4. Frontend API: agregar función batch create para keywords
     What to do / Must NOT do: Agregar `createKeywordBatch(phrases: CreateKeywordBody[])` en `apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts`.
     Parallelization: Wave 1 | Blocked by: - | Blocks: 8
     References: apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts
     Acceptance criteria: La función hace HTTP POST a `/crypto-news-publisher/keywords/batch` y retorna array de KeywordView
     QA scenarios: Llamar la función mocked, verificar URL y payload
     Commit: Y | feat(frontend): add batch create for keywords

- [ ] 5. Frontend UI: crear CompoundGroupModal para blacklist
     What to do / Must NOT do: Crear componente que acepta lista dinámica de frases (agregar/eliminar inputs). Shared props con BlacklistModal existente. State interno: array de objetos `{phrase: string, ...options}`. Submit genera UUID y llama a batch API.
     Parallelization: Wave 2 | Blocked by: 1,2 | Blocks: -
     References: apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx:40-235 (BlacklistModal como referencia)
     Acceptance criteria: Modal con múltiples inputs de frase, cada uno con checkboxes de opciones. Botón "+ Add phrase" agrega nuevo input. Botón "X" elimina input. Mínimo 2 frases para submit.
     QA scenarios: Agregar 3 frases, eliminar la del medio, submit con 2 frases
     Commit: Y | feat(frontend): add CompoundGroupModal for blacklist

- [ ] 6. Frontend UI: crear CompoundGroupModal para keywords
     What to do / Must NOT do: Similar a blacklist pero con campos extra de template selection. Reuse lógica de CompoundGroupModal o crea versión genérica.
     Parallelization: Wave 2 | Blocked by: 3,4 | Blocks: -
     References: apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx:46-200 (KeywordsModal como referencia)
     Acceptance criteria: Mismos inputs que blacklist + template selector. Submit llama batch API.
     QA scenarios: Crear grupo con 3 keywords, verificar template se aplica a todas
     Commit: Y | feat(frontend): add CompoundGroupModal for keywords

- [ ] 7. Integración: agregar botón "+ Add Compound Group" en blacklist-manager
     What to do / Must NOT do: Agregar segundo botón junto a "+ Add Phrase". El nuevo botón abre CompoundGroupModal. Mantener botón existente sin cambios.
     Parallelization: Wave 2 | Blocked by: 1,2 | Blocks: -
     References: apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx (buscar donde está el botón Add)
     Acceptance criteria: Header muestra "Blacklist Phrases (N)" con dos botones: [+] Add Phrase y [+] Add Compound Group
     QA scenarios: Click en Add Compound Group abre modal correcto
     Commit: Y | feat(frontend): add compound group button to blacklist

- [ ] 8. Integración: agregar botón "+ Add Compound Group" en keywords-section
     What to do / Must NOT do: Igual que blacklist — segundo botón para compound groups.
     Parallelization: Wave 2 | Blocked by: 3,4 | Blocks: -
     References: apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx
     Acceptance criteria: Keywords header muestra dos botones
     QA scenarios: Click en Add Compound Group abre modal correcto
     Commit: Y | feat(frontend): add compound group button to keywords

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit - verificar todos los items del scope completados
- [ ] F2. Code quality review - lint + typescript pasan
- [ ] F3. Real manual QA - abrir frontend, verificar UI con los dos botones y el modal de compound
- [ ] F4. Scope fidelity - no se agregó funcionalidad extra no planificada

## Commit strategy

- 4 commits en backend (1 por endpoint)
- 4 commits en frontend (1 por API + 1 por cada modal + 1 por integración)
- Push a dev branch para testing

## Success criteria

1. Los dos botones aparecen en blacklist y keywords
2. El modal de compound group acepta múltiples frases
3. Las frases se guardan con el mismo andGroupId
4. El matching pipeline evalúa correctamente grupos AND (verificable en logs o con mensaje de test)
5. No hay regressions en funcionalidad existente (modal de frase individual funciona igual)
