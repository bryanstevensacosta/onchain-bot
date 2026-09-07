# Media Components Cohesion Refactor

**Status**: Draft  
**Created**: 2026-09-02  
**Goal**: Increase cohesion and reduce coupling in media-related components by identifying shared responsibilities and creating inheritance hierarchies.

---

## Problem Statement

El sistema tiene múltiples componentes manejando media con responsabilidades duplicadas y sin abstracciones compartidas:

### Components Identified

#### Ingestion Service

1. **MediaDownloaderService** (`apps/ingestion-service/src/media/application/services/`)
   - Descarga media desde Telegram MTProto
   - Sanitiza channelId contra path traversal
   - Detecta MIME type desde extensión
   - Guarda a disco en patrón `{messageId}_{index}.{ext}`
   - Maneja FloodWait con retry
   - Retorna `{filePath, mimeType, fileSize}`

2. **MediaController** (`apps/ingestion-service/src/media/api/http/`)
   - Sirve archivos vía HTTP GET
   - Lee desde `uploads/crypto-news/media/{channelId}/`
   - Busca patrón `{messageId}_{index}.*`
   - Detecta MIME type con `mime-types` library
   - Emite headers: Cache-Control, ETag, Accept-Ranges
   - Stream con `createReadStream`

3. **CryptoNewsMessageMediaEntity** (`apps/ingestion-service/src/telegram/crypto-news/infrastructure/persistence/typeorm/entities/`)
   - Persiste metadata: filePath, mimeType, fileSize, type, index
   - Relación con mensaje (messageId)

4. **TelegramMtprotoListenerAdapter.extractAndDownloadMedia()** (líneas 499-560)
   - Orquesta descarga de media
   - Construye `TelegramMediaAttachment` con metadata Telegram (fileId, accessHash, fileReference, dcId, date)
   - Wraps MediaDownloaderService

#### Backend Service

1. **MtprotoMediaDownloader** (`apps/backend/src/telegram/ingestion/crypto-news/infrastructure/api/mtproto/`)
   - Extiende `CryptoNewsMediaDownloader` (port)
   - Descarga media desde Telegram MTProto
   - Sanitiza channelId
   - Detecta MIME type
   - Guarda a disco con mismo patrón
   - Maneja FloodWait
   - **DUPLICA EXACTAMENTE** MediaDownloaderService del ingestion-service

2. **LocalAdMediaStorageAdapter** (`apps/backend/src/telegram/crypto-news-ads/infrastructure/storage/`)
   - Extiende `AdMediaStoragePort`
   - Guarda imágenes de ads en `uploads/crypto-news-ads/{adId}/`
   - Sanitiza nombres de archivo
   - Maneja escritura de buffers
   - Limpieza de archivos

3. **AdsMediaController** (`apps/backend/src/telegram/crypto-news-ads/api/http/`)
   - Sirve archivos de ads vía HTTP GET
   - Lee desde `uploads/crypto-news-ads/`
   - MIME detection
   - Cache headers
   - **DUPLICA** funcionalidad de MediaController (ingestion-service)

4. **MediaCleanupService** (`apps/backend/src/telegram/crypto-news-publisher/infrastructure/services/`)
   - Limpia archivos media antiguos basado en retención
   - Recorre directorios
   - Evalúa timestamps
   - Elimina archivos

5. **MediaRetentionCleanupScheduler** (`apps/backend/src/telegram/ingestion/crypto-news/infrastructure/scheduling/`)
   - Cron job para limpieza automática
   - Calcula tiempo de retención
   - Orquesta cleanup

6. **CryptoNewsMessageMediaEntity** (`apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/`)
   - **DUPLICA EXACTAMENTE** la entity del ingestion-service
   - Misma estructura, mismos campos

---

## Shared Responsibilities Analysis

### 1. **Path Building & Sanitization**

**Who**: MediaDownloaderService, MtprotoMediaDownloader, LocalAdMediaStorageAdapter, MediaController, AdsMediaController

**Operations**:

- Sanitizar channelId/adId contra path traversal (`[^a-zA-Z0-9-]`)
- Construir paths siguiendo convenciones: `uploads/{domain}/{entity}/{id}/`
- Crear directorios recursivamente con `mkdir -p`
- Resolver absolute paths

**Pattern Observed**:

```typescript
// Repetido en 5+ lugares
private sanitizeChannelId(channelId: string): string {
  return channelId.replace(/[^a-zA-Z0-9-]/g, '');
}

const channelDir = path.join(this.mediaPath, sanitizedChannelId);
await fs.mkdir(channelDir, { recursive: true });
```

**Cohesion Opportunity**: `MediaPathBuilder` abstract class con estrategias:

- `CryptoNewsMediaPathBuilder` → `uploads/crypto-news/media/{channelId}/{messageId}_{index}.{ext}`
- `AdMediaPathBuilder` → `uploads/crypto-news-ads/{adId}/{filename}`

---

### 2. **MIME Type Detection**

**Who**: MediaDownloaderService, MtprotoMediaDownloader, MediaController, AdsMediaController

**Operations**:

- Mapear extensión → MIME type
- Mapear Telegram mimeType → extensión
- Fallback a `application/octet-stream` o `.bin`

**Pattern Observed**:

```typescript
// Map duplicado en 4+ lugares
const mimeMap: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'video/mp4': '.mp4',
  // ...
};
```

**Cohesion Opportunity**: `MimeTypeResolver` utility class (stateless)

- `getExtensionFromMimeType(mime: string): string`
- `getMimeTypeFromExtension(ext: string): string`
- `getMimeTypeFromTelegramMedia(media: Api.MessageMedia): string`

---

### 3. **File I/O Operations**

**Who**: MediaDownloaderService, MtprotoMediaDownloader, LocalAdMediaStorageAdapter, MediaController, AdsMediaController, MediaCleanupService

**Operations**:

- Escribir Buffer a disco
- Leer archivo a Buffer
- Stream archivo con `createReadStream`
- Obtener stats (size, mtime)
- Eliminar archivo
- Buscar archivos con patrón (glob)

**Pattern Observed**:

```typescript
// Duplicado en múltiples servicios
await fs.writeFile(filePath, buffer);
const stat = await fs.stat(filePath);
const stream = createReadStream(filePath);
```

**Cohesion Opportunity**: `FileSystemAdapter` abstract class

- `write(path: string, buffer: Buffer): Promise<void>`
- `read(path: string): Promise<Buffer>`
- `stream(path: string): ReadStream`
- `stat(path: string): Promise<Stats>`
- `delete(path: string): Promise<void>`
- `findByPattern(dir: string, pattern: string): Promise<string[]>`

---

### 4. **HTTP Media Serving**

**Who**: MediaController (ingestion-service), AdsMediaController (backend)

**Operations**:

- Validar parámetros numéricos
- Buscar archivo por patrón
- Set headers: Content-Type, Content-Length, ETag, Cache-Control, Accept-Ranges
- Stream response
- Error handling: 404, 500

**Pattern Observed**:

```typescript
// Duplicado exacto en 2 controllers
response.setHeader('Content-Type', mimeType);
response.setHeader('Cache-Control', 'public, max-age=31536000');
response.setHeader('ETag', `"${stat.mtime.getTime()}-${stat.size}"`);
const stream = createReadStream(filePath);
stream.pipe(response);
```

**Cohesion Opportunity**: `MediaHttpServer` abstract class

- `serveFile(filePath: string, response: Response, options?: CacheOptions)`
- `handleNotFound(response: Response, message: string)`
- `handleServerError(response: Response, error: Error)`

---

### 5. **Media Download from Telegram**

**Who**: MediaDownloaderService (ingestion-service), MtprotoMediaDownloader (backend)

**Operations**:

- Llamar `client.downloadMedia(media, {})`
- Manejar resultado Buffer | string (path)
- Retry con FloodWaitHandler
- Logging de progress

**Pattern Observed**:

```typescript
// DUPLICACIÓN EXACTA (~150 líneas)
const result = await this.floodWaitHandler.withRetry(
  `media-download-${channelId}-${messageId}-${index}`,
  async () => await client.downloadMedia(media, {}),
);

let buffer: Buffer;
if (typeof result === 'string') {
  buffer = await fs.readFile(result);
  await fs.unlink(result);
} else if (Buffer.isBuffer(result)) {
  buffer = result;
}
```

**Cohesion Opportunity**: `TelegramMediaDownloader` abstract class base

- Ambos servicios heredan
- Template method pattern para customización de paths

---

### 6. **Media Metadata Persistence**

**Who**: CryptoNewsMessageMediaEntity (ingestion-service), CryptoNewsMessageMediaEntity (backend), AdMediaEntity, AdMediaLibraryEntity

**Operations**:

- Store: filePath, mimeType, fileSize, type, index
- Relación con entity padre (message, ad)
- TypeORM decorators

**Pattern Observed**:

```typescript
// Entity duplicada entre ingestion-service y backend
@Entity({ name: 'crypto_news_message_media' })
export class CryptoNewsMessageMediaEntity {
  @Column({ name: 'file_path' }) filePath: string;
  @Column({ name: 'mime_type' }) mimeType: string;
  @Column({ name: 'file_size' }) fileSize: number;
  // ...
}
```

**Cohesion Opportunity**: `BaseMediaEntity` abstract class

- Campos comunes: filePath, mimeType, fileSize, createdAt
- Subclasses añaden relaciones específicas

---

### 7. **Media Retention & Cleanup**

**Who**: MediaCleanupService, MediaRetentionCleanupScheduler

**Operations**:

- Calcular edad de archivos
- Filtrar por timestamp threshold
- Eliminar archivos antiguos
- Reportar resultados (deleted count, errors)

**Pattern Observed**:

```typescript
const age = Date.now() - stat.mtime.getTime();
if (age > retentionMs) {
  await fs.unlink(filePath);
}
```

**Cohesion Opportunity**: `MediaRetentionPolicy` abstract class

- `shouldDelete(filePath: string, createdAt: Date): Promise<boolean>`
- `cleanup(directory: string): Promise<CleanupResult>`

---

## Proposed Architecture

### Core Abstractions (Shared Package)

```
shared/media/
├── core/
│   ├── base-media-path-builder.ts         # Abstract: buildPath(), sanitize()
│   ├── base-file-system-adapter.ts        # Abstract: write(), read(), stream(), stat()
│   ├── base-media-http-server.ts          # Abstract: serveFile(), cacheHeaders()
│   ├── base-telegram-media-downloader.ts  # Abstract: download(), getExtension()
│   ├── base-media-retention-policy.ts     # Abstract: shouldDelete(), cleanup()
│   └── base-media.entity.ts               # Abstract: filePath, mimeType, fileSize
├── utils/
│   ├── mime-type-resolver.ts              # Static utility class
│   └── path-sanitizer.ts                  # Static utility class
└── types/
    ├── media-metadata.ts                  # Interfaces: DownloadedMedia, MediaPayload
    └── storage-config.ts                  # Interfaces: PathConfig, CacheConfig
```

### Concrete Implementations

#### Ingestion Service

```
apps/ingestion-service/src/media/
├── infrastructure/
│   ├── crypto-news-path-builder.ts        # extends BaseMediaPathBuilder
│   ├── local-file-system.adapter.ts       # extends BaseFileSystemAdapter
│   └── ingestion-telegram-downloader.ts   # extends BaseTelegramMediaDownloader
├── application/
│   └── services/
│       └── media-downloader.service.ts    # Uses ingestion-telegram-downloader
└── api/
    └── http/
        └── media.controller.ts            # Uses BaseMediaHttpServer
```

#### Backend

```
apps/backend/src/telegram/
├── crypto-news-ads/infrastructure/
│   ├── ad-media-path-builder.ts           # extends BaseMediaPathBuilder
│   └── local-ad-storage.adapter.ts        # extends BaseFileSystemAdapter + AdMediaStoragePort
├── crypto-news-publisher/infrastructure/
│   ├── retention-policy.impl.ts           # extends BaseMediaRetentionPolicy
│   └── media-cleanup.service.ts           # Uses retention-policy
└── ingestion/crypto-news/infrastructure/
    └── mtproto-media-downloader.ts        # extends BaseTelegramMediaDownloader
```

---

## Benefits

### 1. **Eliminación de Duplicación**

- MediaDownloaderService vs MtprotoMediaDownloader: ~150 líneas duplicadas → clase base compartida
- MediaController vs AdsMediaController: ~100 líneas de serving lógica → clase base compartida
- MIME maps: 4 lugares → 1 utility class
- Path sanitization: 5+ lugares → 1 utility

### 2. **Single Source of Truth**

- Cambios en path patterns se propagan automáticamente
- MIME type maps centralizados
- Lógica de cache headers unificada

### 3. **Testability**

- Test base classes una vez
- Mocking más fácil con abstracciones
- Concrete implementations solo test path-specific logic

### 4. **Type Safety**

- Interfaces compartidas previenen drift
- Mismo contrato entre servicios

### 5. **Extensibility**

- Nuevos tipos de media (e.g., audio) solo requieren nueva path builder
- Nuevos storage backends (S3) solo requieren nuevo FileSystemAdapter

---

## Migration Strategy

### Phase 1: Create Shared Abstractions ✅ COMPLETE (2026-09-02)

**Status**: All core abstractions created and tested.

**Delivered**:

- ✅ Core abstract base classes (5 classes, ~600 lines)
  - `BaseMediaPathBuilder` - path building strategies
  - `BaseFileSystemAdapter` - file I/O operations
  - `BaseMediaHttpServer` - HTTP serving with cache headers
  - `BaseTelegramMediaDownloader` - Telegram MTProto downloads
  - `BaseMediaRetentionPolicy` - cleanup policies
- ✅ Static utility classes (2 classes, ~250 lines)
  - `MimeTypeResolver` - MIME type detection and mapping
  - `PathSanitizer` - path sanitization and validation
- ✅ Shared types (1 file, ~80 lines)
  - `DownloadedMedia`, `MediaPayload`, `PathConfig`, `CacheConfig`, `CleanupResult`
- ✅ Comprehensive tests (2 suites, 45 tests)
  - `mime-type-resolver.spec.ts` - 21 tests, all passing
  - `path-sanitizer.spec.ts` - 24 tests, all passing
- ✅ Documentation
  - `README.md` with usage examples for all components
  - API documentation in JSDoc comments

**Files Created**:

```
apps/ingestion-service/src/shared/media/
├── core/
│   ├── base-media-path-builder.ts          (104 lines)
│   ├── base-file-system-adapter.ts         (189 lines)
│   ├── base-media-http-server.ts           (201 lines)
│   ├── base-telegram-media-downloader.ts   (152 lines)
│   └── base-media-retention-policy.ts      (104 lines)
├── utils/
│   ├── mime-type-resolver.ts               (149 lines)
│   ├── mime-type-resolver.spec.ts          (122 lines)
│   ├── path-sanitizer.ts                   (152 lines)
│   └── path-sanitizer.spec.ts              (156 lines)
├── types/
│   └── media-metadata.ts                   (78 lines)
├── index.ts                                 (38 lines)
└── README.md                                (485 lines)

Total: 1,930 lines of new code (production + tests + docs)
```

**Impact**: Foundation laid for ~400+ lines of deduplication in Phases 2-3.

**Next**: Phase 2 - Migrate ingestion-service concrete implementations.

---

### Phase 2: Migrate Ingestion Service (Medium Risk) - READY TO START

1. Create concrete implementations extending base classes
2. Update MediaDownloaderService to use new hierarchy
3. Update MediaController to use BaseMediaHttpServer
4. Run full test suite + E2E tests
5. Deploy to staging, verify media download/serving works

### Phase 3: Migrate Backend (Medium Risk)

1. Update MtprotoMediaDownloader to extend BaseTelegramMediaDownloader
2. Update AdsMediaController to use BaseMediaHttpServer
3. Update LocalAdMediaStorageAdapter to use BaseFileSystemAdapter
4. Run full test suite
5. Deploy to staging

### Phase 4: Entity Consolidation (High Risk - Requires Migration)

1. Create shared BaseMediaEntity
2. Generate TypeORM migration to ensure schema compatibility
3. Update both CryptoNewsMessageMediaEntity classes
4. Test persistence layer thoroughly
5. Deploy with migration

### Phase 5: Cleanup & Documentation (Low Risk)

1. Remove deprecated code
2. Update AGENTS.md files
3. Add architecture diagrams
4. Document extension points for future media types

---

## Ownership Clarification ⚠️ CRITICAL

**INGESTION-SERVICE = OWNER of crypto-news media**

- Downloads from Telegram MTProto
- Stores in `uploads/crypto-news/media/`
- Serves via `GET /api/media/:channelId/:messageId/:index`
- Backend consumes via HTTP (read-only volume in Docker)

**BACKEND**:

- `MtprotoMediaDownloader` → **LEGACY/DEPRECATED** (delete in refactor)
- `LocalAdMediaStorageAdapter` → **VALID** (ads are backend-only feature)
- `AdsMediaController` → **VALID** (ads are backend-only feature)

**Conclusion**:

- Crypto-news media = ingestion-service responsibility ONLY
- Ads media = backend responsibility ONLY
- Shared abstractions live in `apps/ingestion-service/src/shared/media/` (not `packages/`)
- Backend ads components inherit from ingestion-service abstractions

## Open Questions

1. **Shared Abstractions Location**: Mantener en `apps/ingestion-service/src/shared/media/` y backend importa desde ahí
2. **Migration Timing**: Phase 4 (entities) debe esperar porque entity está en ingestion-service
3. **Backend MtprotoMediaDownloader**: ¿Eliminar completamente o mantener deprecated con warning?
4. **S3 Future**: YAGNI por ahora, FileSystemAdapter puede extenderse después

---

## Next Steps

1. **Review**: Usuario revisa y aprueba arquitectura propuesta
2. **Prioritize**: ¿Empezar con Phase 1 o hay alguna urgencia específica?
3. **Spike**: Crear POC de BaseTelegramMediaDownloader para validar approach
4. **Test Coverage**: Asegurar coverage actual antes de refactor para detectar regressions

---

## References

- Ingestion Service AGENTS.md: Line "15-provider adapter pattern"
- Backend docs: `apps/backend/docs/spydefi/arch/09-anti-patterns.md`
- Current gap: Gap 19 (sin auth en media endpoints) - resolver después de refactor
- Current gap: Gap 20 (Accept-Ranges ficticio) - resolver en BaseMediaHttpServer
