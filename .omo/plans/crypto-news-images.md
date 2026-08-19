# crypto-news-images - Work Plan (✅ COMPLETE)

## TL;DR (For humans)

**What you'll get:** Las fotos de los canales de crypto-news de Telegram se descargarán automáticamente al recibir cada mensaje y se mostrarán en el dashboard (página /crypto-news). Se añade documentación del submódulo (AGENTS.md). ~11 commits, ~16 archivos tocados.

**Why this approach:** Telegram solo da acceso temporal al `fileReference` de las imágenes. Si no descargamos inmediatamente al ingerir, la imagen se pierde para siempre. El endpoint de imágenes usa un controller NestJS dedicado (no archivo estático) para permitir logging, validación y futuro control de acceso.

**What it will NOT do:** No ingestamos videos, stickers, GIFs animados ni documentos. No modificamos el pipeline de KOL. No hay S3/cloud storage. Las imágenes descargadas **son volátiles en Docker** — se pierden en cada `docker compose build backend` (producción) a menos que se configure un volumen externo. Esto está documentado y aceptado para esta iteración.

**Effort:** Medium-Large (~550 líneas, 16 archivos, 10 waves)
**Risk:** Medium — 3 bloqueantes resueltos: (1) persistencia Docker documentada como limitación, (2) FloodWait en descargas cubierto, (3) integración con IngestionCoordinator resuelta. Riesgo residual: el fileReference puede expirar entre extracción y descarga si el listener está bajo flood wait.

**Decisiones clave ya tomadas:**

- Descarga síncrona (no async/eventual) — el filePath se resuelve antes de persistir el mensaje
- Tabla separada `crypto_news_message_media` (no JSONB)
- Endpoint dedicado `GET /crypto-news/media/:id` (no archivo estático)
- `FloodWaitHandlerService` envuelve toda llamada `client.downloadMedia()`
- ON DELETE CASCADE a nivel DB, no solo ORM

## Scope

### Must have

- Extraer `msg.media.photo` del listener MTProto en los 3 paths (polling, events, backfill)
- Descargar la imagen inmediatamente via `client.downloadMedia()` (síncrono dentro del path)
- Aplicar `FloodWaitHandlerService.withRetry()` a toda descarga
- Sanitizar `channelId` contra path traversal
- Detectar MIME real (magic bytes) en lugar de hardcodear `.jpg`
- Almacenar en disco local en `uploads/crypto-news/media/{safeChannelId}/{messageId}_{index}.{ext}`
- Persistir metadatos en nueva tabla `crypto_news_message_media` (TypeORM entity, ON DELETE CASCADE)
- Extender entidad de dominio `CryptoNewsMessage` con campo `media: CryptoNewsMedia[]`
- Extender `IngestionCoordinator.route()` para usar `TelegramRawMessage` y pasar `media`
- Usar transacción atómica para guardar message + media (TypeORM `manager.transaction()`)
- Extender mappers, repos in-memory + TypeORM
- Extender API view `CryptoNewsMessageView` con media + manejar `mimeType: null`
- Nuevo endpoint `GET /crypto-news/media/:mediaId` para servir binarios (try/catch ENOENT → 404)
- Frontend: extender interfaz `CryptoNewsMessage` con media field + renderizar `<img>`
- Verificar que `hasMedia` no se usa en ningún otro lugar antes de eliminarlo
- Crear `telegram/ingestion/crypto-news/AGENTS.md`
- Registrar el nuevo AGENTS.md en `.docs-map.jsonc`

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO ingesta de videos, GIFs animados, stickers o documentos
- NO subida a S3/MinIO/cloud storage (documentado como limitación)
- NO resize, CDN, o transformación de imágenes
- NO modificar el pipeline de KOL
- NO headers de cache avanzados
- NO lazy loading más allá del nativo `loading="lazy"`
- NO modificar o eliminar archivos existentes no listados explícitamente
- NO cambiar el comportamiento de la entidad CryptoNewsMessage.create() existente (el campo media es opcional)
- NO exponer `filePath` ni `fileReference` en la API (solo el UUID de media)
- NO persistir imágenes en producción Docker sin volumen externo (aceptado como riesgo)
- NO modificar `CryptoNewsMessageIngestedEvent` para incluir media (fix-1 ToS compliance)

## Verification strategy

> Zero human intervention - all verification is agent-executable.

- **Test decision:** tests-after (se añaden tests unitarios para cada cambio)
- **QA evidence:** `.omo/evidence/crypto-news-images/` — capturas del frontend mostrando imágenes, logs de ingestión confirmando descarga, tests pasando
- **Cobertura mínima:** tests de mapper (domain↔orm), tests de repo in-memory, test de controller (el endpoint sirve binarios), test de frontend usando Vitest con renderizado de componentes
- **Verificación final:** Playwright real (no headless abstracción) — abrir `/crypto-news` con mock de API, verificar `<img>` en el DOM

## Execution strategy

### Parallel execution waves

**Wave 1** (Foundation):

- T1: Contrato TelegramRawMessage + TelegramMediaAttachment
- T2: CryptoNewsMedia value object + dominio

**Wave 2** (Bloqueado por T1):

- T3: Listener MTProto extraer msg.media + descargar (sync, con FloodWait, sanitización, MIME detection)

**Wave 3** (Bloqueado por T2):

- T4: Tabla DB + TypeORM entity (ON DELETE CASCADE a nivel DB)
- T5: Mapper domain↔ORM
- T6: Repos + IngestionCoordinator.route() + StoreNewsMessageUseCase (con transacción)

**Wave 4** (Bloqueado por T3 + T5):

- T7: API controller (view + endpoint media)
- T8: Frontend (queries + render)

**Wave 5** (Final):

- T9: AGENTS.md + `.docs-map.jsonc`
- T10: Revisión Momus final

### Dependency matrix

| Todo                         | Depends on | Blocks     | Can parallelize with |
| ---------------------------- | ---------- | ---------- | -------------------- |
| T1. Contrato RAW → media     | —          | T3         | T2                   |
| T2. Domain VO + entity       | —          | T4, T5, T6 | T1                   |
| T3. Listener download        | T1         | T7         | T6                   |
| T4. TypeORM entity (CASCADE) | T2         | T5         | T3                   |
| T5. Mapper                   | T2, T4     | T7         | T3, T6               |
| T6. Repos + Coordinator      | T2, T4     | T7         | T3, T5               |
| T7. API controller           | T3, T5     | T8         | —                    |
| T8. Frontend                 | T7         | —          | T9                   |
| T9. AGENTS.md + docs-map     | —          | —          | T8                   |
| T10. Momus final review      | T1-T9      | —          | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [ ] 1. Extender `TelegramRawMessage` con media attachment + verificar `hasMedia` no usado
     What to do / Must NOT do:
  - **Verificar pre-condición:** ejecutar `grep -rn 'hasMedia' apps/backend/src/ --include='*.ts'` para confirmar que `hasMedia` no se lee en ningún consumer (tests, BCs, etc.). Si existe un consumer, documentarlo en el plan y adaptar en vez de eliminar.
  - En `telegram/ingestion/shared/domain/ports/telegram-listener.port.ts`:
    - Añadir interfaz `TelegramMediaAttachment` con: `type: 'photo'`, `fileId: bigint | string`, `accessHash: bigint | string`, `fileReference: string` (base64 del Buffer), `mimeType: string | null`
    - Reemplazar `hasMedia?: boolean` en `TelegramRawMessage` por `media?: ReadonlyArray<TelegramMediaAttachment>`
    - NO cambiar otros campos de `TelegramRawMessage`
    - NO modificar `ResolvedChannelMetadata` ni `JoinChannelResult`
      Parallelization: Wave 1 | Blocked by: — | Blocks: T3
      References (executor has NO interview context - be exhaustive):
  - `apps/backend/src/telegram/ingestion/shared/domain/ports/telegram-listener.port.ts:29-40` — interfaz actual de TelegramRawMessage
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:171,208,230` — puntos donde se construye TelegramRawMessage, ninguno puebla hasMedia
  - gramjs docs: `Message.media.photo.id`, `Message.media.photo.accessHash`, `Message.media.photo.fileReference` (Buffer)
    Acceptance criteria (agent-executable):
  - `grep -rn 'hasMedia' apps/backend/src/ --include='*.ts'` no encuentra referencias (o se documentan y manejan)
  - `interface TelegramMediaAttachment` existe con todos los campos
  - `TelegramRawMessage.media` es `ReadonlyArray<TelegramMediaAttachment> | undefined`
  - `hasMedia` ya no existe en la interfaz
  - TypeScript compila: `npx tsc --noEmit --project apps/backend/tsconfig.json`
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-1-crypto-news-images.md`
  - Happy: crear un objeto `TelegramRawMessage` con `media: [{ type: 'photo', fileId: '123', accessHash: '456', fileReference: Buffer.from('abc').toString('base64'), mimeType: 'image/jpeg' }]`
  - Failure: crear un `TelegramRawMessage` con `media: 'string'` — TypeScript debe rechazarlo
    Commit: Y | `feat(telegram): extend TelegramRawMessage with media attachment type`

- [ ] 2. Añadir `CryptoNewsMedia` value object y extender `CryptoNewsMessage` domain entity
     What to do / Must NOT do:
  - Crear `telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts`:
    - Clase `CryptoNewsMedia` extends `ValueObject<CryptoNewsMediaProps>`
    - Props: `index: number; type: 'photo'; filePath: string; mimeType: string | null; fileSize: number | null`
    - Método estático `create(input)` con validación (index >= 0, filePath no vacío)
    - Getters públicos
    - El error de validación se loggea y el media se descarta (no lanza DomainError que interrumpa la ingestión del mensaje)
  - En `telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts`:
    - Añadir `media: ReadonlyArray<CryptoNewsMedia>` a `CryptoNewsMessageProps` (default `[]`)
    - Añadir `media?: CryptoNewsMediaInput[]` al input de `CryptoNewsMessage.create()` (campo opcional)
    - Añadir getter público `get media()` que retorna `this.props.media`
    - NO cambiar los campos existentes (id, channelId, messageId, title, content, publishedAt, ingestedAt)
    - NO romper `CryptoNewsMessage.reconstitute()` — el nuevo campo debe ser opcional también allí
      Parallelization: Wave 1 | Blocked by: — | Blocks: T4, T5, T6
      References:
  - `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts:13-91` — entidad actual
  - `apps/backend/src/shared/kernel/value-object.ts` — base class ValueObject
  - Patrón usado en `ChainCapabilities`, `TokenMetrics`, etc.
    Acceptance criteria (agent-executable):
  - `CryptoNewsMedia` class existe con `create()`, `reconstitute()`, getters
  - `CryptoNewsMessage.create({..., media: [...]})` funciona con media opcional
  - `CryptoNewsMessage.create({..., media: undefined})` funciona (backward compat)
  - `CryptoNewsMessage.reconstitute({..., media: []})` funciona
  - TypeScript compila sin errores
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-2-crypto-news-images.md`
  - Happy: crear `CryptoNewsMessage` con 2 media attachments — getter retorna el array
  - Happy: crear `CryptoNewsMessage` sin media — `media` retorna `[]`
  - Failure: `CryptoNewsMedia.create({index: -1, ...})` — se loggea y descarta, no interrumpe ingestión
    Commit: Y | `feat(crypto-news): add CryptoNewsMedia value object and extend domain entity`

- [ ] 3. Modificar `TelegramMtprotoListenerAdapter` para extraer `msg.media`, descargar fotos con FloodWait y MIME detection
     What to do / Must NOT do:
  - **ESTRATEGIA ELEGIDA (síncrona):** la descarga ocurre dentro del path de ingestión, antes de que el `TelegramRawMessage` salga del listener. El `filePath` ya está resuelto cuando el mensaje llega al `IngestionCoordinator`.
  - Crear `telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port.ts`:
    - Puerto abstracto `CryptoNewsMediaDownloader` con método `download(channelId: string, messageId: number, media: TelegramMediaAttachment): Promise<{ filePath: string; mimeType: string | null; fileSize: number | null }>`
    - Separa la abstracción de la implementación (arquitectura hexagonal)
  - Crear `telegram/ingestion/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader.ts`:
    - Implementa `CryptoNewsMediaDownloader`
    - Sanitiza `channelId` con `channelId.replace(/[^a-zA-Z0-9_-]/g, '_')` antes de usarlo en rutas de archivo
    - Detecta MIME real mediante `file-type` (npm package) o magic bytes (`Buffer.slice(0,4)` → `ffd8ffe0`=jpeg, `89504e47`=png)
    - Extensión de archivo derivada del MIME real (no hardcodea `.jpg`)
    - Ruta: `uploads/crypto-news/media/{safeChannelId}/{messageId}_{index}.{ext}`
    - Crea directorio si no existe (`mkdir -p` con `fs.mkdirSync` o `fs.promises.mkdir`)
    - Usa `FloodWaitHandlerService.withRetry('download', () => client.downloadMedia(...))` — importar `FloodWaitHandlerService` desde `telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service`
    - Algoritmo de refresh: intentar descarga con `fileReference` original; si falla con `FILE_REFERENCE_EXPIRED`, refrescar via `client.invoke(new Api.messages.GetMessages({...}))`; si falla otra vez, loggear y descartar ese media
    - Límite de tamaño: si el Buffer descargado excede `MAX_MEDIA_BYTES` (10MB default), loggear y descartar (no guardar)
    - Retorna `{ filePath, mimeType, fileSize }`
  - En `telegram-mtproto-listener.adapter.ts`, modificar los 3 paths:
    - `startPollingLoop()` línea 163-176: si `msg.media?.photo` existe, llamar `downloader.download()` y poblar `TelegramRawMessage.media` con los metadatos + filePath
    - `handleEvent()` línea 208-213: ídem
    - **backfill() línea 228-234**: extraer media metadata PERO **NO descargar** (los mensajes de backfill no se persisten actualmente — el endpoint solo retorna el conteo). La metadata de media se extrae igual por consistencia, pero el filePath queda vacío (no hay descarga).
    - Inyectar `CryptoNewsMediaDownloader` via constructor
  - NO modificar el flujo de mensajes sin media (texto plano)
  - NO modificar el contrato de `subscribe()` público
  - NO exponer fileReference en los logs (es dato sensible de Telegram)
    Parallelization: Wave 2 | Blocked by: T1 | Blocks: T7
    References:
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:39-45` — constructor donde inyectar dependencias
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:121-190` — startPollingLoop
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:192-219` — handleEvent
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:221-236` — backfill (solo extraer metadata, no descargar)
  - `apps/backend/src/telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service.ts` — FloodWaitHandlerService
  - `apps/backend/src/telegram/ingestion/shared/domain/ports/telegram-listener.port.ts:29-40` — interfaz actualizada en T1
  - gramjs: `client.downloadMedia(message.media, {outputFile: buffer})` retorna Buffer
  - gramjs: `API.messages.GetMessages` para refrescar fileReference
  - `file-type` npm package (o magic bytes manual) para detección MIME
  - `apps/backend/src/telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port.ts` — nuevo port (creado en este todo)
    Acceptance criteria (agent-executable):
  - Cuando se recibe un mensaje con `msg.media.photo` y `fileReference` válido, se descarga a `uploads/crypto-news/media/{safeId}/{msgId}_0.{ext}` y el `TelegramRawMessage` tiene `media[0].filePath` no vacío
  - La descarga usa `FloodWaitHandlerService.withRetry()` — verificar en el código
  - `channelId` como `@WatcherGuru` → sanitizado a `WatcherGuru` (sin `@`)
  - `channelId` como `-1001234567890` → sanitizado a `-1001234567890` (números y guión se preservan)
  - Cuando `msg.media` no existe, `TelegramRawMessage.media` es `undefined`
  - En backfill, el `TelegramRawMessage` tiene metadata de media pero `filePath = ''` (no descargado)
  - Si `downloadMedia` falla (fileReference expirado), reintenta con refresh; si falla otra vez, loggea y no rompe el mensaje
  - TypeScript compila sin errores
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-3-crypto-news-images.md`
  - Happy: mock `client.downloadMedia()` retorna Buffer válido — archivo se escribe en disco con extensión correcta
  - Happy: Buffer es JPEG (ffd8ffe0) → archivo termina en `.jpg`, mimeType = `image/jpeg`
  - Happy: Buffer es PNG (89504e47) → archivo termina en `.png`, mimeType = `image/png`
  - Failure: `downloadMedia` lanza error — se captura, se loggea, no rompe flujo del mensaje
  - Failure: `FloodWaitHandlerService` está paused → se respeta y reintenta después
  - Failure: download excede 10MB → se descarta y loggea
    Commit: Y | `feat(telegram): extract msg.media and download photos with flood wait in MTProto listener`

- [ ] 4. Crear tabla `crypto_news_message_media` + TypeORM entity con ON DELETE CASCADE
     What to do / Must NOT do:
  - Crear `infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts`:
    - `@Entity({ name: 'crypto_news_message_media' })`
    - Columnas: `id` (UUID PK, auto-generado), `messageId` (UUID FK), `index` (SMALLINT), `type` (VARCHAR(16) default 'photo'), `filePath` (TEXT), `mimeType` (VARCHAR(64), nullable), `fileSize` (INTEGER, nullable), `createdAt` (TIMESTAMPTZ default now)
    - `@ManyToOne(() => CryptoNewsMessageEntity, msg => msg.media)` con `@JoinColumn({ name: 'message_id', foreignKeyConstraintName: 'fk_media_message' })` y `onDelete: 'CASCADE'`
    - `@Index('idx_media_message_id', ['messageId'])`
  - En `CryptoNewsMessageEntity` existente:
    - Añadir `@OneToMany(() => CryptoNewsMessageMediaEntity, m => m.message, { cascade: ['insert', 'update'], eager: true })` propiedad `media`
    - NOTA: `cascade: true` solo afecta inserts/updates, **no deletes**. El `onDelete: 'CASCADE'` en el FK de la tabla hija maneja los deletes.
    - NO modificar columnas existentes
  - Verificar que TypeORM `synchronize: true` genera el FK con ON DELETE CASCADE (puede necesitar verificar en Postgres con `\d crypto_news_message_media`)
    Parallelization: Wave 3 | Blocked by: T2 | Blocks: T5, T6
    References:
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts:13-39` — entidad existente
  - `apps/backend/docs/spydefi/arch/09-anti-patterns.md` — "No @Entity in domain layer" (esto está en infrastructure, OK)
  - TypeORM docs: `@JoinColumn({ onDelete: 'CASCADE' })` — `onDelete` en el decorador del lado ManyToOne
  - TypeORM docs: `cascade: ['insert', 'update']` — no incluir 'remove' si el FK CASCADE lo maneja
  - `apps/backend/tsconfig.json` — verificar que el nuevo archivo está cubierto por `include`
    Acceptance criteria (agent-executable):
  - `CryptoNewsMessageMediaEntity` existe con todas las columnas listadas
  - `CryptoNewsMessageEntity.media` es `CryptoNewsMessageMediaEntity[]`
  - El FK `message_id` tiene `ON DELETE CASCADE` (verificar en el decorador `@JoinColumn`)
  - TypeScript compila sin errores
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-4-crypto-news-images.md`
  - Happy: guardar un `CryptoNewsMessageEntity` con `media: [mediaEntity]` — se persiste en cascada
  - Happy: borrar el mensaje → media rows se borran en cascada
  - Failure: crear `CryptoNewsMessageMediaEntity` sin `messageId` FK → error de DB
    Commit: Y | `feat(crypto-news): add crypto_news_message_media TypeORM entity with ON DELETE CASCADE`

- [ ] 5. Actualizar mapper domain↔ORM
     What to do / Must NOT do:
  - En `mappers/crypto-news-message.mapper.ts`:
    - `toEntity()`: mapear `message.media` → `entity.media` como array de `CryptoNewsMessageMediaEntity`
    - `toDomain()`: mapear `entity.media` → `CryptoNewsMessage.media` como array de `CryptoNewsMedia`
    - Crear helpers: `mediaToEntity(media: CryptoNewsMedia): CryptoNewsMessageMediaEntity` y `mediaToDomain(entity: CryptoNewsMessageMediaEntity): CryptoNewsMedia`
    - NO cambiar el mapeo de campos existentes
    - NO modificar `CryptoNewsSourceMapper`
  - Actualizar tests del mapper (`__tests__/crypto-news-message.mapper.spec.ts`):
    - Añadir test con media (1 foto, múltiples fotos)
    - Añadir test sin media (backward compat) — verificar que `media = []`
      Parallelization: Wave 3 | Blocked by: T2, T4 | Blocks: T7
      References:
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-message.mapper.ts:9-31` — mapper actual
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/__tests__/crypto-news-message.mapper.spec.ts` — tests existentes
  - `apps/backend/src/telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts` — creado en T2
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts` — creado en T4
    Acceptance criteria (agent-executable):
  - `toEntity()` con `CryptoNewsMessage` que tiene `media` → retorna `CryptoNewsMessageEntity.media` poblado con los mismos valores
  - `toEntity()` sin media → `entity.media = []`
  - `toDomain()` con media entity → retorna `CryptoNewsMessage.media` con los mismos valores
  - `toDomain()` sin media → `media = []`
  - Round-trip (domain → entity → domain) es idéntico para todos los campos incluyendo media
  - Tests existentes del mapper siguen pasando
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-5-crypto-news-images.md`
  - Happy: round-trip con 3 fotos — todos los campos se preservan
  - Happy: round-trip sin media — `media` es `[]` en ambos lados
  - Failure: entity con media fields inválidos — mapper lanza error controlado
    Commit: Y | `feat(crypto-news): update mapper with media field support`

- [ ] 6. Actualizar repositorios + `IngestionCoordinator.route()` + `StoreNewsMessageUseCase`
     What to do / Must NOT do:
  - **CRÍTICO — `IngestionCoordinator.route()`:** Actualizar la signatura del parámetro `raw` en `route()` (línea 119-124) para usar `TelegramRawMessage` en lugar del structural type inline. Esto garantiza que `raw.media` esté disponible.
    - Antes: `private async route(raw: { peerId: string; messageId: number; text: string; occurredAt: Date })`
    - Después: `private async route(raw: TelegramRawMessage)`
    - Verificar que `kolOrchestrator.onMessageReceived(raw)` acepte `TelegramRawMessage` (actualmente acepta un tipo compatible).
  - **StoreNewsMessageUseCase** (`handlers/store-news-message.use-case.ts`):
    - Extender `StoreNewsMessageInput` con `media?: CryptoNewsMedia[]` opcional
    - Pasar `media` a `CryptoNewsMessage.create()` en `execute()`
    - NO romper llamadas existentes (media es opcional)
    - El event `CryptoNewsMessageIngestedEvent` NO debe incluir media ni filePath (fix-1 ToS compliance)
  - **TypeORM repo** (`persistence/typeorm/repositories/typeorm-crypto-news-message.repository.ts`):
    - En `save()`, usar `await this.dataSource.transaction(async (manager) => { await manager.save(message); })` para garantizar atomicidad message + media
    - TypeORM `cascade: ['insert', 'update']` en T4 + `eager: true` cargan media automáticamente
    - SNA: verificar que cascade+eager funcionan, ajustar código si es necesario
  - **In-memory repo** (`repositories/in-memory-crypto-news-message.repository.ts`):
    - El `Map<string, CryptoNewsMessage>` ya almacena la entidad de dominio completa — como el campo `media` ahora está en `CryptoNewsMessage` (T2), se guarda automáticamente
    - SNA: verificar que `findRecent` y `findByChannelId` retornan media correctamente
  - **IngestionCoordinator.route():** update references:
    - `raw.peerId` → igual
    - `raw.messageId` → igual
    - `raw.text` → igual (pero ahora via TelegramRawMessage)
    - `raw.occurredAt` → igual
    - NUEVO: `raw.media` → pasar como `media` a `StoreNewsMessageUseCase.execute()`
    - Si `raw.media` es `undefined` o `[]`, pasar `undefined`
  - **Verificar `use-crypto-news.ts`** en frontend (`apps/frontend/src/entities/crypto-news/model/use-crypto-news.ts`): leer el archivo para confirmar que no redefine tipos de `CryptoNewsMessage` localmente. Si lo hace, actualizar.
    Parallelization: Wave 3 | Blocked by: T2, T4 | Blocks: T7
    References:
  - `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts:119-148` — route() (structural type actual)
  - `apps/backend/src/telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case.ts:7-53` — use case + input
  - `apps/backend/src/telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository.ts:9-19` — repositorio interface
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository.ts:10-38` — in-memory repo
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-crypto-news-message.repository.ts` — TypeORM repo
  - `apps/frontend/src/entities/crypto-news/model/use-crypto-news.ts` — modelo frontend (verificar types)
  - `apps/backend/src/telegram/ingestion/shared/domain/ports/telegram-listener.port.ts:29-40` — TelegramRawMessage actualizado en T1
  - TypeORM `DataSource.transaction()` docs
    Acceptance criteria (agent-executable):
  - `IngestionCoordinator.route()` acepta `TelegramRawMessage` y extrae `raw.media`
  - `StoreNewsMessageInput` tiene `media?: CryptoNewsMedia[]`
  - `StoreNewsMessageUseCase.execute()` pasa `media` a `CryptoNewsMessage.create()`
  - TypeORM repo `save()` usa `dataSource.transaction()` para atomicidad
  - In-memory repo retorna mensajes con media correctamente
  - `kolOrchestrator.onMessageReceived()` no se rompe con la nueva signatura
  - `use-crypto-news.ts` no redefine tipos localmente (o se actualiza)
  - Los tests existentes siguen pasando
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-6-crypto-news-images.md`
  - Happy: `IngestionCoordinator.route()` recibe `TelegramRawMessage` con media → pasa al use case
  - Happy: `IngestionCoordinator.route()` recibe mensaje sin media → no pasa media, backward compat
  - Happy: `StoreNewsMessageUseCase.execute()` con media — se guarda con transacción atómica
  - Happy: `StoreNewsMessageUseCase.execute()` sin media — backward compat
  - Failure: transacción falla → ambos message y media se revierten
    Commit: Y | `feat(crypto-news): update repositories and coordinator with media support`

- [ ] 7. Extender API controller para incluir media en views + endpoint de servicio de binarios
     What to do / Must NOT do:
  - En `crypto-news.controller.ts`:
    - Añadir interfaz `CryptoNewsMediaView` con: `id: string`, `index: number`, `type: string`, `url: string`, `mimeType: string | null`
    - Añadir `media: ReadonlyArray<CryptoNewsMediaView>` a `CryptoNewsMessageView`
    - En `listMessages()` y `getMessage()`, mapear `message.media` → `media: [{ id, index, type, url: \`/api/crypto-news/media/${mediaId}\`, mimeType }]`
    - Inyectar `CryptoNewsMessageMediaEntity` repo (o usar `CryptoNewsMessageRepository.findById()` + navegar la relación)
  - Nuevo endpoint `GET /crypto-news/media/:mediaId`:
    - Buscar el `CryptoNewsMessageMediaEntity` por `mediaId` usando un nuevo método en `CryptoNewsMessageRepository`: `findMediaById(mediaId: string): Promise<CryptoNewsMessageMediaEntity | null>`
    - Si no existe → retornar 404
    - Leer el archivo de `filePath` con `fs.promises.readFile()` o `createReadStream()`
    - **Manejar ENOENT**: si el archivo no existe en disco aunque la DB tenga el row, loggear y retornar 404 con mensaje útil (no 500)
    - **Si `mimeType` es `null`**: derivar de la extensión del filename (`.jpg` → `image/jpeg`, `.png` → `image/png`)
    - Setear `Content-Type` desde mimeType
    - Setear `Cache-Control: public, max-age=86400, immutable`
    - Usar `@Res()` con Express response directo o `StreamableFile`
    - Recomendación: `@Get('media/:mediaId')` con `@Res() res: Response` y `res.sendFile()` o `res.send(buffer)`
  - NO eliminar/modificar endpoints existentes
  - NO exponer filePath directamente en la API (solo el ID)
  - NO exponer fileReference en ningún endpoint
    Parallelization: Wave 4 | Blocked by: T3, T5 | Blocks: T8
    References:
  - `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts:6-96` — controller actual
  - `apps/backend/src/telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository.ts:9-19` — repo interface (necesita nuevo método `findMediaById`)
  - NestJS `StreamableFile` docs (context7)
  - Express `Response.sendFile()` pattern
  - Node.js `fs.constants` para ENOENT detection
  - `mime-types` npm package (o lookup manual por extensión)
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts` — entidad media
    Acceptance criteria (agent-executable):
  - `CryptoNewsMessageView.media` existe y es `ReadonlyArray<CryptoNewsMediaView>`
  - `listMessages()` retorna `media` con URLs del tipo `/api/crypto-news/media/{uuid}`
  - `getMessage()` retorna `media` igual
  - Nuevo método `findMediaById(mediaId)` en `CryptoNewsMessageRepository`
  - `GET /crypto-news/media/{id}` retorna 200 con Content-Type correcto (image/jpeg, image/png, etc.)
  - `GET /crypto-news/media/{id}` retorna headers `Cache-Control: public, max-age=86400, immutable`
  - `GET /crypto-news/media/{inexistente}` retorna 404 (no 500)
  - Si `mimeType` es null en DB y la extensión es `.jpg`, Content-Type es `image/jpeg`
  - Los tests existentes del controller siguen pasando
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-7-crypto-news-images.md`
  - Happy: `GET /crypto-news/messages` con mensaje que tiene media — `media` array poblado
  - Happy: `GET /crypto-news/media/{id}` con file existente — retorna 200, Content-Type correcto, body es binario
  - Happy: `Cache-Control` header presente
  - Failure: `GET /crypto-news/media/{uuid-no-existe}` — retorna 404
  - Failure: `GET /crypto-news/media/{id}` con filePath en DB pero archivo borrado del disco — retorna 404 (no 500)
  - Failure: `GET /crypto-news/media/{malformed-id}` — retorna 400
    Commit: Y | `feat(crypto-news): extend API with media views and binary serving endpoint`

- [ ] 8. Frontend: extender tipos + renderizar imágenes
     What to do / Must NOT do:
  - En `entities/crypto-news/api/crypto-news-queries.ts`:
    - Añadir interfaz `CryptoNewsMediaView`: `{ id: string; index: number; type: string; url: string; mimeType: string | null }`
    - Añadir `media: CryptoNewsMediaView[]` a `CryptoNewsMessage`
  - **Verificar** `entities/crypto-news/model/use-crypto-news.ts`: No redefine tipos localmente. Si lo hace, importar desde el API correcto.
  - En `pages/crypto-news/index.tsx`:
    - Después del `</p>content</p>` (línea 100), añadir:
      ```tsx
      {
        msg.media?.length > 0 && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {msg.media.map((m) => (
              <img
                key={m.id}
                src={m.url}
                alt={`${msg.title ?? 'image'} ${m.index + 1}`}
                className="rounded-lg object-cover max-h-96 w-full"
                loading="lazy"
              />
            ))}
          </div>
        );
      }
      ```
    - NO modificar el layout existente de los mensajes
    - NO cambiar el filtrado, loading, error states
    - Si el mensaje no tiene media, exactamente el mismo render que hoy
  - **Test de frontend** (Vitest): añadir test en `pages/crypto-news/__tests__/crypto-news-page.test.tsx` que mockee `useCryptoNewsMessages` y verifique:
    - Mensaje con media → `<img>` está en el DOM con `src` correcto
    - Mensaje sin media → sin `<img>` en el DOM
    - `media: undefined` (backward compat) → sin error, sin `<img>`
      Parallelization: Wave 4 | Blocked by: T7 | Blocks: —
      References:
  - `apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts:3-11` — interfaz actual
  - `apps/frontend/src/pages/crypto-news/index.tsx:80-103` — render actual de mensajes
  - `apps/frontend/src/entities/crypto-news/model/use-crypto-news.ts` — hooks de query (verificar tipos)
  - Tailwind CSS: `object-cover`, `rounded-lg`, `grid-cols-1 sm:grid-cols-2`
  - Vitest + `@testing-library/react` para test de DOM (ver `apps/frontend/package.json` para versiones)
  - Patrón de tests frontend en: `apps/frontend/src/` — buscar `*.test.tsx` existentes
    Acceptance criteria (agent-executable):
  - `CryptoNewsMessage.media` existe y es `CryptoNewsMediaView[]`
  - `use-crypto-news.ts` no redefine tipos localmente (verificado con grep)
  - Test Vitest: `<img>` se renderiza cuando `media.length > 0`
  - Test Vitest: sin media (undefined o []), no hay `<img>` en el DOM
  - TypeScript compila: `npx tsc --noEmit --project apps/frontend/tsconfig.json`
  - ESLint pasa: `npx eslint apps/frontend/src/pages/crypto-news/ apps/frontend/src/entities/crypto-news/`
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-8-crypto-news-images.md`
  - Happy (vitest): mock `messages.data` con `[{... msg, media: [{id: 'm1', url: '/api/media/m1', ...}]}]` → verificar `<img src="/api/media/m1">` en DOM
  - Happy (vitest): mock sin media → verificar que NO hay `<img>` en DOM
  - Happy (vitest): mock con `media: undefined` → sin error, sin `<img>`
  - Failure: src roto (404) — la imagen muestra broken state del navegador, no crashea la app
    Commit: Y | `feat(frontend): add image rendering to crypto-news page`

- [ ] 9. Crear `telegram/ingestion/crypto-news/AGENTS.md` + registrar en `.docs-map.jsonc`
     What to do / Must NOT do:
  - Crear `telegram/ingestion/crypto-news/AGENTS.md` documentando el submódulo:
    - Visión general del BC de crypto-news (propósito, qué resuelve)
    - Estructura del BC (api/, application/, domain/, infrastructure/)
    - Mapa de símbolos clave: `CryptoNewsMessage`, `CryptoNewsSource`, `CryptoNewsMedia`, `StoreNewsMessageUseCase`, `CryptoNewsSeeder`, `CryptoNewsMediaDownloader`, `CryptoNewsMessageMediaEntity`
    - Tabla de endpoints API
    - Tabla de tablas DB (crypto_news_messages, crypto_news_message_media, crypto_news_sources)
    - Flujo de datos: MTProto → Listener → IngestionCoordinator → StoreNewsMessage → DB → API → Frontend
    - Sección sobre imágenes: se descargan inmediatamente (fileReference expira ~1h), se almacenan en `uploads/`, se sirven via `GET /crypto-news/media/:id`
    - Nota sobre fix-1 ToS: el contenido raw no cruza el event bus; media tampoco
    - No requiere notas de deploy/secrets
    - Seguir el formato de los AGENTS.md existentes
  - **Registrar en `.docs-map.jsonc`:**
    - Añadir entrada: `{ "path": "apps/backend/src/telegram/ingestion/crypto-news", "doc": "telegram/ingestion/crypto-news/AGENTS.md", "level": 3 }`
    - (Reemplazar `telegram/ingestion/crypto-news` con la ruta absoluta real si es relativa)
  - NO modificar el AGENTS.md raíz de `telegram/` ni otros existentes
  - NO incluir info de despliegue/secrets
  - Ejecutar `npm run docs:check` desde la raíz para verificar que no hay problemas de staleness
    Parallelization: Wave 5 | Blocked by: — | Blocks: —
    References:
  - `apps/backend/src/telegram/AGENTS.md` — formato y estructura a seguir
  - `apps/backend/AGENTS.md` — estructura general: OVERVIEW, STRUCTURE, WHERE TO LOOK, CODE MAP, CONVENTIONS, ANTI-PATTERNS, UNIQUE STYLES, COMMANDS, NOTES
  - `.docs-map.jsonc` — archivo de registro (ver ejemplo existente para `telegram/vip-calls`)
  - `scripts/check-docs-staleness.mjs` — script de verificación
    Acceptance criteria (agent-executable):
  - Archivo `telegram/ingestion/crypto-news/AGENTS.md` existe
  - Contiene secciones: OVERVIEW, STRUCTURE, CODE MAP, CONVENTIONS, ANTI-PATTERNS
  - Menciona el soporte de imágenes y la descarga inmediata
  - `.docs-map.jsonc` tiene la entrada para el nuevo L3 AGENTS.md
  - `npm run docs:check` desde raíz — no hay errores
  - TypeScript compila sin errores
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-9-crypto-news-images.md`
  - Happy: el archivo se lee correctamente, tiene todas las secciones requeridas
  - Happy: `npm run docs:check` desde raíz — no hay errores
  - Failure: `.docs-map.jsonc` no actualizado — `npm run docs:check` lo reporta
    Commit: Y | `docs(crypto-news): add AGENTS.md for crypto-news bounded context`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verificar que cada todo completó su acceptance criteria (revisar `.omo/evidence/task-*-crypto-news-images.md`)
- [ ] F2. Code quality review — ESLint + tsc pasan en backend y frontend:
  - Backend: `cd apps/backend && npx tsc --noEmit` + `npx eslint src/telegram/ingestion/crypto-news/`
  - Frontend: `cd apps/frontend && npx tsc --noEmit` + `npx eslint src/`
- [ ] F3. Real manual QA (agent-executable) — Playwright real:
  - Iniciar backend + frontend
  - Abrir `/crypto-news` y ejecutar `document.querySelectorAll('img')` — verificar count > 0
  - Verificar que las imágenes tienen `src` que empieza con `/api/crypto-news/media/`
  - Verificar que imágenes sin media no muestran `<img>` tags rotos
- [ ] F4. Scope fidelity — confirmar que NO se modificó:
  - El pipeline de KOL
  - Endpoints existentes de crypto-news
  - El event `CryptoNewsMessageIngestedEvent`
  - La entidad `CryptoNewsSource`
  - El seeder de KOL

## Commit strategy

Commits convencionales, uno por todo. Orden:

1. `feat(telegram): extend TelegramRawMessage with media attachment type`
2. `feat(crypto-news): add CryptoNewsMedia value object and extend domain entity`
3. `feat(telegram): extract msg.media and download photos with flood wait in MTProto listener`
4. `feat(crypto-news): add crypto_news_message_media TypeORM entity with ON DELETE CASCADE`
5. `feat(crypto-news): update mapper with media field support`
6. `feat(crypto-news): update repositories and coordinator with media support`
7. `feat(crypto-news): extend API with media views and binary serving endpoint`
8. `feat(frontend): add image rendering to crypto-news page`
9. `docs(crypto-news): add AGENTS.md for crypto-news bounded context`

Los commits 1 y 2 son independientes (pueden hacerse en paralelo). Commits 4 y 5 pueden squashear.

## Success criteria

- ✅ Los mensajes de crypto-news con fotos muestran las imágenes en el frontend
- ✅ Las imágenes se descargan **inmediatamente** al ingerir (antes de que expire el fileReference)
- ✅ Las descargas de imágenes usan `FloodWaitHandlerService.withRetry()`
- ✅ Las imágenes se almacenan con extensión y MIME correctos (no hardcodeado `.jpg`)
- ✅ El `channelId` se sanitiza contra path traversal
- ✅ La tabla `crypto_news_message_media` tiene ON DELETE CASCADE a nivel DB
- ✅ El save message+media es atómico (TypeORM transaction)
- ✅ Los mensajes sin media se muestran exactamente igual que antes (backward compat)
- ✅ El endpoint `GET /crypto-news/media/:id` sirve binarios con Content-Type correcto, sin exponer filePath
- ✅ `GET /crypto-news/media/:id` retorna 404 si el archivo no existe en disco (no 500)
- ✅ `telegram/ingestion/crypto-news/AGENTS.md` documenta el BC + imágenes
- ✅ `.docs-map.jsonc` actualizado con el nuevo AGENTS.md
- ✅ Todos los tests existentes siguen pasando
- ✅ TypeScript compila sin errores en backend y frontend
- ✅ **Limitación documentada:** las imágenes descargadas son volátiles en producción Docker sin volumen externo
