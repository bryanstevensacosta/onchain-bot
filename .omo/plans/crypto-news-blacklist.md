# crypto-news-blacklist - Work Plan

## TL;DR (For humans)

**What you'll get:** Nueva funcionalidad de blacklist en el pipeline de crypto-news: frases que bloquean posts incluso cuando matchean keywords. Incluye UI dedicada (agregar/editar/listar frases), registro de posts bloqueados en la DB (status `BLOCKED`), y paginación de 5/página tanto en la lista de blacklist como en los posts bloqueados.

**Why this approach:** Mismo patrón que Keywords existente — domain entity + TypeORM + REST controller + frontend feature — para consistencia y menor carga cognitiva. La blacklist se aplica en el handler que ya procesa mensajes (donde están los keywords), después del match de keywords pero antes de encolar.

**What it will NOT hacer:** No bloquea posts que no matchean keywords (solo filtra los ya aprobados por keyword). No guarda contenido de posts bloqueados — solo metadata+rawContent como PENDING. No afecta el daily cap ni la lógica de publicación.

**Effort:** Large
**Risk:** Medium — cambios en el pipeline de ingest, pero con guardar siempre (no silencioso)

**Decisions to sanity-check:** Ninguna — el diseño ya fue discutido y aprobado (Opción A: no encolar, guardar con status BLOCKED).

Your next move: **approve** para ejecutar. Full execution detail follows below.

---

> TL;DR (machine): Large effort, Medium risk — nueva blacklist entity + DB + handler + UI para filtrar posts que matchean keywords

## Scope

### Must have

1. **Domain**: Nueva entidad `BlacklistPhrase` (phrase, caseSensitive, sourceChannelIds[], enabled)
2. **Persistence**: TypeORM entity + mapper + repository (CRUD: findAll, findEnabled, save, delete)
3. **REST API**: `/crypto-news-publisher/blacklist` (GET list, POST create, PATCH update, DELETE)
4. **Pipeline change**: Handler `CryptoNewsMessageIngestedHandler` — tras match de keywords, verificar blacklist phrases activas para el source. Si matchea → guardar queue entry con status `BLOCKED` + razón
5. **Frontend**: Nueva sección "Blacklist" en crypto-news publisher (al lado de Keywords y Templates)
   - Tabla con paginación 5/página (igual que Keywords)
   - Modal para agregar/editar blacklist phrase
   - Ver posts bloqueados con paginación 5/página
6. **Queue status**: Nuevo status `BLOCKED` en `PublisherQueueStatus`

### Must NOT have (guardrails, anti-slop, scope boundaries)

- La blacklist NO se aplica a mensajes que no matchean keywords (solo filtra los aprobados)
- No hacer soft-delete de blacklist phrases (enabled=false funciona igual que Keywords)
- No guardar contenido del post bloqueado en tabla separada (solo en queue entry como PENDING)
- No crear evento de dominio para BLOCKED (solo log DEBUG)

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (Jest backend + Vitest frontend)
- Evidence: .omo/evidence/task-<N>-crypto-news-blacklist.<ext>

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

**Wave 1**: Domain + Persistence (CRUD completo para BlacklistPhrase)
**Wave 2**: Pipeline integration (handler + queue status BLOCKED)
**Wave 3**: Backend REST API (controller + routes)
**Wave 4**: Frontend UI (lista + paginación + modal + blocked posts)
**Wave 5**: Testing + verification

### Dependency matrix

| Todo | Depends on | Blocks  | Can parallelize with |
| ---- | ---------- | ------- | -------------------- |
| 1    | -          | 3,5,6,7 | -                    |
| 2    | 1          | 3,5     | -                    |
| 3    | 1,2        | 8       | 4                    |
| 4    | 1          | 8       | 3                    |
| 5    | 1          | 8       | -                    |
| 6    | 1          | 9       | -                    |
| 7    | 1          | 9       | -                    |
| 8    | 3,4        | 10      | 5,6,7                |
| 9    | 6,7        | 10      | 5                    |
| 10   | 8,9        | F1-F4   | -                    |
| ---  | ---        | ---     | ---                  |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. **Domain entity BlacklistPhrase + PublisherQueueStatus BLOCKED**
     What to do / Must NOT do:
  - Crear `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`
    - Misma estructura que `Keyword`: `AggregateRoot<string>`, props `{ phrase, caseSensitive, sourceChannelIds[], enabled, createdAt }`
    - `create()` valida phrase no vacía, max 200 chars, trimmed
    - `reconstitute()` para persistencia
    - `matches(content: string): boolean` — case-sensitive/insensitive substring match
    - `isApplicableTo(channelId: string): boolean` — true si `sourceChannelIds` está vacío o incluye channelId
  - Agregar `BLOCKED` a `PublisherQueueStatus` (archivo `publisher-queue-entry.entity.ts`)
  - Agregar `blockedReason` a props + create() + accessor de `PublisherQueueEntry`
  - No agregar domain events para BLOCKED

  Parallelization: Wave 1 | Blocked by: none | Blocks: 2,3,5,6,7
  References:
  - Keyword entity: `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts:35-208`
  - PublisherQueueStatus: `apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts`
    Acceptance criteria (agent-executable):
  - `tsc --noEmit` backend pasa
  - Unit test: BlacklistPhrase.create() con phrase >200 chars → DomainError
  - Unit test: BlacklistPhrase.matches() case-insensitive
  - Unit test: BlacklistPhrase.isApplicableTo() empty sourceChannels → true
  - Unit test: PublisherQueueEntry.create() con status=BLOCKED → ok
    QA: tests-after, archivo `.omo/evidence/task-1-crypto-news-blacklist.spec.ts`
    Commit: fea(crypto-news): add BlacklistPhrase domain entity and BLOCKED queue status

- [ ] 2. **Persistence: TypeORM entity + mapper + repository for BlacklistPhrase**
     What to do / Must NOT do:
  - Crear `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity.ts`
    - `@Entity('blacklist_phrases')`, columns: id (uuid), phrase (text), caseSensitive (bool), sourceChannelIds (text[]), enabled (bool), createdAt (timestamp)
  - Crear mapper: `blacklist-phrase.mapper.ts` (entityToDomain / domainToEntity)
  - Crear port: `apps/backend/src/telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository.ts`
    - findAll(), findEnabled(), save(), delete()
  - Crear impl TypeORM: `typeorm-blacklist-phrase.repository.ts`
  - Registrar en TypeOrmModule.forFeature() en el módulo
  - Registrar provider en el módulo del crypto-news-publisher
  - **Must NOT**: crear directorio infrastructure/persistence/typeorm/repositories — usar el existente

  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3,5
  References:
  - Keyword entity/mapper/repo patterns: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity.ts`
  - Keyword mapper: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/keyword.mapper.ts`
  - Keyword repository: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-keyword.repository.ts`
  - Port: `apps/backend/src/telegram/crypto-news-publisher/application/ports/keyword.repository.ts`
  - Module registration: `apps/backend/src/telegram/crypto-news-publisher/api/http/crypto-news-publisher.module.ts`
  - In-memory repo para tests: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/repositories/`
    Acceptance:
  - `tsc --noEmit` backend pasa
  - `findAll()` returns all rows; `findEnabled()` returns only where enabled=true
    QA: test con in-memory repo
    Commit: fea(crypto-news): add BlacklistPhrase TypeORM entity, mapper, and repository

- [ ] 3. **REST API: Blacklist CRUD controller**
     What to do / Must NOT do:
  - Crear `apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts`
    - `@Controller('crypto-news-publisher/blacklist')`
    - Endpoints:
      - `GET /` → list all blacklist phrases (return `BlacklistPhraseView[]`)
      - `POST /` → create (body: { phrase, caseSensitive?, sourceChannelIds?, enabled? })
        - dedup check: conflict si phrase already exists (case-insensitive)
      - `PATCH /:id` → update partial
      - `DELETE /:id` → hard delete
  - Definir `BlacklistPhraseView` interface (exportada para tests)
  - Registrar en el módulo

  Parallelization: Wave 2 | Blocked by: 1,2 | Blocks: 8
  References:
  - KeywordsController: `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts`
    Acceptance:
  - `tsc --noEmit` backend pasa
  - POST `/crypto-news-publisher/blacklist` con phrase existente → 409
  - GET / devuelve lista completa
    QA: integration test via http (puede ser e2e o mock del service)
    Commit: fea(crypto-news): add Blacklist CRUD REST API

- [ ] 4. **Queue status BLOCKED → TypeORM entity + controller toView**
     What to do / Must NOT do:
  - Agregar `'BLOCKED'` al enum de PublisherQueueStatus en el domain entity
  - Agregar columna `blocked_reason` a `PublisherQueueEntity` TypeORM entity (text, nullable)
  - Agregar `blockedReason` a `PublisherQueueEntryProps` domain + create() (opcional)
  - Agregar `blockedReason` a `QueueEntryView` (controller)
  - Agregar `blockedReason` a `QueueEntryView` frontend API interface
  - Mostrar `blockedReason` en frontend DetailsModal (si existe)

  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 8
  References:
  - PublisherQueueStatus: `publisher-queue-entry.entity.ts`
  - TypeORM entity: `publisher-queue.entity.ts`
  - Controller view: `queue.controller.ts`
  - Frontend interface: `queue-api.ts`
  - Frontend DetailsModal: `queue-view.tsx`
    Acceptance:
  - `tsc --noEmit` both apps pass
  - Queue entry with BLOCKED status + blockedReason renders in DetailsModal
    Commit: fea(crypto-news): add BLOCKED status and blockedReason to queue entry

- [ ] 5. **Pipeline: blacklist filtering in CryptoNewsMessageIngestedHandler**
     What to do / Must NOT do:
  - Inyectar `BlacklistPhraseRepository` en `CryptoNewsMessageIngestedHandler`
  - Agregar cache TTL para blacklist phrases (mismo patrón 10s que keywords)
  - En `handle()`, **después** del match de keywords y antes de `enqueue.execute()`:
    1. Si encontró `matchedKeyword`, cargar enabled blacklist phrases (cached)
    2. Filtrar blacklist phrases aplicables al source (isApplicableTo)
    3. Si alguna matchea → crear `PublisherQueueEntry` a mano con status `BLOCKED` + `blockedReason`
    4. Guardar via `queueRepo.enqueue()`
    5. Loggear `logger.debug` con keyword y blacklist phrase que matcheó
  - No modificar `EnqueueMatchingMessageUseCase`
  - Actualizar `matchedKeywordIds` para guardar TODOS los keywords que matchearon (no solo 1):
    - Cambiar `EnqueueMatchingMessageInput` para que acepte `matchedKeywords: Keyword[]`
    - Pasar array al `PublisherQueueEntry.create()

  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 6,7,8
  References:
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts`
  - `apps/backend/src/telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case.ts`
    Acceptance:
  - `tsc --noEmit` backend passes
  - Message with keyword "BTC" + blacklist "scam" → queue entry with status BLOCKED
  - Message with keyword "BTC" + no blacklist → queue entry with status PENDING
  - Message with keyword on source A + blacklist only for source B → still PENDING enqueued
    QA: test handler con keywords + blacklists mockeadas
    Commit: fea(crypto-news): add blacklist filtering to message handler

- [ ] 6. **Frontend: BlacklistPhrase type API + hooks**
     What to do / Must NOT do:
  - Crear API types and fetch functions:
    - `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts`
      - `BlacklistPhraseView` interface
      - `fetchBlacklist()`, `createBlacklist()`, `updateBlacklist()`, `deleteBlacklist()`
  - Crear hooks:
    - `apps/frontend/src/features/crypto-news-publisher/model/use-blacklist.ts`
      - `useBlacklist()` con refetchInterval: 10_000s (like useKeywords)
      - `useCreateBlacklist()`, `useUpdateBlacklist()`, `useDeleteBlacklist()`
  - No poner barrel exports hasta que exista el UI

  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 9
  References:
  - keywords API: `apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts`
  - keywords hooks: `apps/frontend/src/features/crypto-news-publisher/model/use-keywords.ts`
  - Frontend @ alias: `@/features/crypto-news-publisher/api/blacklist-api`
    Acceptance:
  - `tsc --noEmit` frontend passes
    Commit: fea(crypto-news): add BlacklistPhrase API and hooks

- [ ] 7. **Frontend: blocked queue entries fetch + hooks**
     What to do / Must NOT do:
  - Crear función `fetchBlocked()` en `queue-api.ts` o archivo aparte
    - Endpoint backend: agregar query param `?status=BLOCKED` al GET /queue existente
      O crear endpoint `/crypto-news-publisher/queue/blocked` con paginación
    - **Decisión**: mejor un controller filter param reusable: `GET /queue?status=BLOCKED&limit=5`
  - Agregar hook `useBlockedQueue(limit=5)` con paginación
  - Hint: modificar el `QueueController.list()` para aceptar `@Query('status') status?: string` opcional

  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 9
  References:
  - `queue-api.ts`
  - `queue.controller.ts:list()`
    Acceptance:
  - `tsc --noEmit` frontend + backend
    Commit: fea(crypto-news): add blocked queue fetch with status filter

- [ ] 8. **Frontend: Blacklist Manager UI + pagination**
     What to do / Must NOT do:
  - Nueva sección "Blacklist" en página crypto-news (al lado de Keywords y Templates)
  - Componente `BlacklistManager` en `apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx`
    - Tabla paginada 5/página con columnas: phrase, caseSensitive count, enabled toggle
    - Modal "Add Blacklist Phrase" (phrase input, caseSensitive toggle, enabled por defectito)
    - Fila con enable/disable toggle + delete button
  - Agregar pestaña "Blacklist" en la navegación de la página
  - `index.ts` export para la feature
  - No copiar código — reutilizar patrones de `KeywordsManager`

  Parallelization: Wave 4 | Blocked by: 3,4 | Blocks: 10
  References:
  - KeywordsManager: `apps/frontend/src/features/crypto-news-publisher/ui/keywords-manager.tsx`
  - Page routing: `apps/frontend/src/pages/crypto-news/index.tsx`
    Acceptance:
  - `tsc --noEmit` frontend pasa
  - Puede crear/editar/eliminar blacklist phrases
  - Paginación funciona 5/página
    Commit: fea(crypto-news): add BlacklistManager UI with pagination

- [ ] 9. **Frontend: Blocked Posts list**
     What to do / Must NOT do:
  - En la página de crypto-news, debajo de la tabla de blacklist, mostrar "Blocked Posts" section
  - `BlockedPostsList` component:
    - Lista paginada 5/página de queue entries con status=BLOCKED
    - Cada fila: channelId, messageId, rawTitle (si tiene), blockedReason, timestamp
    - Paginación (anterior/siguiente)
    - Usar `useBlockedQueue()` hook
  - No mostrar imagen/rawContent completo (solo status row como PENDING pero roja)

  Parallelization: Wave 4 | Blocked by: 6,7 | Blocks: 10
  References:
  - QueueRow in queue-view.tsx para el patron de fila
    Acceptance:
  - `tsc --noEmit` frontend pasa
  - Muestra posts BLOCKED paginados
    Commit: fea(crypto-news): add BlockedPostsList UI

- [ ] 10. **Test suite + verification**
      What to do / Must NOT do:
      - Backend tests:
        - `blacklist-phrase.spec.ts`: create, matches, isApplicableTo, Source channel filter
        - `blacklist.controller.spec.ts`: CRUD, dedup, 404
        - `crypto-news-message-ingested.handler.spec.ts`: blacklist blocking flow
      - Frontend tests: agregar `matchedBlacklistPhraseIds` / blocked posts display tests
      - **No modificar** tests existentes sin verificar que sigan pasando

  Parallelization: Wave 5 | Blocked: 5,8,9 | Blocks: F1-F4
  References: test patterns in `apps/backend/src/telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case.spec.ts`
  Acceptance: - `npm run test:backend` passes - `npm run test:frontend` passes
  Commit: test(crypto-news): add blacklist domain, controller, and handler tests

  > Runs in parallel after ALL todos. All must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — all todos complete, scope complete
- [ ] F2. Code quality review — no slop, patterns consistent with keywords
- [ ] F3. Real manual QA — `npm run test:backend && npm run test:frontend`
- [ ] F4. Scope fidelity — Must have checklist verified, Must NOT having verified

## Commit strategy

- Commit por cada todo wave (1-5 commits):
  - fea(crypto-news): add BlacklistPhrase domain entity and BLOCKED queue status
  - fea(crypto-news): add BlacklistPhrase TypeORM entity, mapper, and repository
  - fea(crypto-news): add Blacklist CRUD controller and queue status filter
  - fea(crypto-news): add blacklist filtering to message handler
  - fea(crypto-news): add BlacklistManager and BlockedPostsList UI
  - test(crypto-news): add blacklist tests

## Success criteria

- [ ] Backend `tsc --noEmit` passes
- [ ] Frontend `tsc --noEmit` passes
- [ ] All backend test suites pass (new + existing)
- [ ] All frontend test suites pass (new + existing)
- [ ] Blacklist phrase can be created via API/POST
- [ ] Message with matched keyword + matched blacklist → queue entry with status BLOCKED
- [ ] Message with matched keyword + unmatched blacklist → queue entry with status PENDING
- [ ] BLOCKED entry visible in frontend queue list
- [ ] Blacklist phrase listed in frontend Blacklist tab with pagination
