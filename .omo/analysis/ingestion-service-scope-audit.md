# Ingestion-Service Scope Audit

**Created:** 2026-09-08  
**Question:** "¿Qué hay en ingestion que debería estar en el backend? ¿Hay lógica de transformation, publishing, matching, filtering, LLM o bot?"

---

## TL;DR — Respuesta Rápida

**✅ Ingestion-service está CORRECTO.** NO tiene lógica de negocio del backend.

Lo que SÍ tiene:

- ✅ **Text extraction** — Técnica (parsear campos Telegram), NO semántica
- ✅ **Media download** — Infraestructura (MTProto → filesystem)
- ✅ **Message transformation** — Normalización de formato GramJS → DTO

Lo que NO tiene (correctamente en backend):

- ❌ Content filtering (regex transforms) — backend
- ❌ Keyword matching — backend
- ❌ Blacklist checking — backend
- ❌ LLM transformation — backend
- ❌ Publishing (Bot API) — backend
- ❌ Queue management — backend

---

## Análisis Detallado

### ✅ Responsabilidades CORRECTAS de Ingestion-Service

#### 1. **MTProto Session Management** ✅

**Qué hace:**

```
- Mantiene una ÚNICA sesión MTProto
- Lee mensajes de Telegram (realtime + polling)
- Maneja flood wait / anti-ban
- Resuelve peers (@ → numeric ID)
```

**Por qué está bien aquí:**

- Es **infraestructura**, no negocio
- Session única debe vivir en un solo lugar
- Backend no necesita MTProto (consume via SSE)

#### 2. **Text Extraction (4-source cascade)** ✅

**Qué hace (`CryptoNewsTextExtractor`):**

```typescript
extract(msg: any): string {
  // 1. msg.message (primary)
  // 2. msg.text (secondary)
  // 3. msg.media.caption (tertiary)
  // 4. msg.fwdFrom.message (fallback)
  return extracted || '';
}
```

**Por qué está bien aquí:**

- Es **parseo técnico** de estructura GramJS
- NO es transformación semántica de contenido
- Es agnóstico al negocio (solo extrae STRING)

**Lo que NO hace (backend lo hace):**

- ❌ Aplicar regex transforms (ContentFilterService)
- ❌ Evaluar keywords
- ❌ Checkear blacklist phrases

#### 3. **Media Download** ✅

**Qué hace (`MediaDownloaderService`):**

```typescript
download(client, channelId, messageId, index, media) {
  // 1. Sanitiza channelId/messageId
  // 2. Resuelve extension (photo→.jpg, video→.mp4)
  // 3. mkdir -p uploads/crypto-news/media/{channel}/
  // 4. client.downloadMedia() con flood wait retry
  // 5. Retorna {filePath, mimeType, fileSize}
}
```

**Por qué está bien aquí:**

- Es **infraestructura I/O** (MTProto API → filesystem)
- NO decide QUÉ descargar (solo crypto-news, KOL skip — decisión ya tomada)
- Backend solo necesita las URLs finales (served via HTTP)

#### 4. **Message Transformation (GramJS → DTO)** ✅

**Qué hace (`CryptoNewsMessageTransformer`):**

```typescript
transform(msg) {
  return {
    peerId: extractPeerId(msg),
    messageId: msg.id,
    occurredAt: toISO(msg.date),
    text: extractor.extract(msg),  // RAW text
    media: mediaExtractor.extract(msg),  // metadata only
    entities: normalizeEntities(msg.entities),
    groupedId: msg.groupedId,
    messageType: 'crypto-news'
  };
}
```

**Por qué está bien aquí:**

- Es **normalización de formato** (GramJS shapes → DTOs)
- NO es lógica de negocio
- Es el único servicio que habla con MTProto directamente

#### 5. **RAW Data Persistence** ✅

**Qué hace:**

```sql
-- Guarda contenido CRUDO (sin filtros)
INSERT INTO crypto_news_messages (content, ...) VALUES ('RAW text from Telegram', ...);
INSERT INTO crypto_news_message_media (url, ...) VALUES ('/api/media/...', ...);
```

**Por qué está bien aquí:**

- Es **almacenamiento técnico** (append-only log)
- NO evalúa el contenido
- Backend aplica filtros ON-READ (Opción A)

#### 6. **SSE Fan-Out** ✅

**Qué hace (`StreamService`):**

```typescript
broadcast(event) {
  // Envía a todos los clientes SSE conectados
  // Heartbeat cada 30s
  // Limpia clientes desconectados
}
```

**Por qué está bien aquí:**

- Es **infraestructura de transporte** (pub/sub)
- NO decide QUÉ enviar (solo distribuye lo que recibe)

#### 7. **Media HTTP Serving** ✅

**Qué hace (`MediaController`):**

```typescript
GET /api/media/:channelId/:messageId/:index
// Stream file desde uploads/crypto-news/media/
```

**Por qué está bien aquí:**

- Es **static file server** (nginx pattern)
- NO decide QUIÉN puede acceder (no auth — gap 19, pero es infra issue)

---

### ❌ Responsabilidades del BACKEND (correctamente NO en ingestion)

#### 1. **Content Filtering (ContentFilterService)** ❌

**Dónde está:** `apps/backend/src/telegram/ingestion/crypto-news/application/services/content-filter.service.ts`

**Qué hace:**

```typescript
applyFilters(channelId, content) {
  // 1. Load per-channel regex rules (priority-ordered)
  // 2. Apply transforms: s/pattern/replacement/flags
  // 3. 100ms timeout (ReDoS protection)
  // 4. Invalid patterns → skip + log
}
```

**Por qué está en backend:**

- Es **lógica de negocio** (transformación semántica)
- Per-channel rules (configuración del operador)
- Security sensitive (ReDoS)

#### 2. **Keyword Matching** ❌

**Dónde está:** `apps/backend/src/telegram/crypto-news-integration/application/services/filtered-crypto-news.service.ts`

**Qué hace:**

```typescript
matchKeywords(message) {
  // 1. Simple keywords (case-insensitive substring)
  // 2. AND-group keywords (all must match)
  // 3. Returns matched keywords array
}
```

**Por qué está en backend:**

- Es **lógica de negocio** (decisión de enqueue)
- Configurable per-source
- Afecta publisher queue

#### 3. **Blacklist Phrase Checking** ❌

**Dónde está:** `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`

**Qué hace:**

```typescript
checkBlacklist(content) {
  // Block if any phrase matches
  // Used to filter out scams/spam
}
```

**Por qué está en backend:**

- Es **lógica de negocio** (quality gate)
- Configurable (CRUD via API)
- Prevents bad content from reaching queue

#### 4. **LLM Transformation** ❌

**Dónde está:** `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts`

**Qué hace:**

```typescript
transformWithLLM(content, template) {
  // 1. Resolve prompt template
  // 2. Call OpenAI/gateway
  // 3. Validate output (rejectNonLatin filter)
  // 4. Return refined content
}
```

**Por qué está en backend:**

- Es **lógica de negocio** (content generation)
- Caro (API costs)
- Quality control (non-Latin rejection)

#### 5. **Bot API Publishing** ❌

**Dónde está:** `apps/backend/src/telegram/vip-calls/vip-channel/` + `crypto-news-publisher/`

**Qué hace:**

```typescript
publishToTelegram(content, media) {
  // 1. Rate limit (1 msg/min)
  // 2. sendMessage/sendPhoto via Bot API
  // 3. Markdown formatting
  // 4. Chunk long messages (>4096 chars)
}
```

**Por qué está en backend:**

- Es **lógica de negocio** (publishing pipeline)
- Rate limiting
- State tracking (PUBLISHED/FAILED status)

#### 6. **Publisher Queue Management** ❌

**Dónde está:** `apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts`

**Qué hace:**

```typescript
// Queue with 36-cap, 24h TTL, status tracking
// Priority ordering, dedup by content hash
// Expire stale entries
```

**Por qué está en backend:**

- Es **lógica de negocio** (resource management)
- Business rules (cap, TTL, dedup)
- Affects publisher behavior

---

## Architectural Boundaries (What Goes Where)

### Ingestion-Service Responsibilities

```
┌──────────────────────────────────────────────────────┐
│ INGESTION-SERVICE (Infrastructure Layer)             │
├──────────────────────────────────────────────────────┤
│ ✅ MTProto session (single source of truth)          │
│ ✅ Message fetching (realtime + polling)             │
│ ✅ Text extraction (technical parsing)               │
│ ✅ Media download (I/O operations)                   │
│ ✅ Format normalization (GramJS → DTO)               │
│ ✅ RAW data persistence (append-only)                │
│ ✅ SSE streaming (transport layer)                   │
│ ✅ Media HTTP serving (static files)                 │
│                                                      │
│ ❌ NO business logic                                 │
│ ❌ NO content transformation                         │
│ ❌ NO quality gates                                  │
│ ❌ NO publishing decisions                           │
└──────────────────────────────────────────────────────┘
                         │
                         │ HTTP/SSE (RAW DTOs)
                         ▼
┌──────────────────────────────────────────────────────┐
│ BACKEND (Business Logic Layer)                        │
├──────────────────────────────────────────────────────┤
│ ✅ Content filtering (regex transforms)              │
│ ✅ Keyword matching (enqueue decision)               │
│ ✅ Blacklist checking (quality gate)                 │
│ ✅ LLM transformation (content generation)           │
│ ✅ Bot API publishing (sendMessage)                  │
│ ✅ Queue management (cap, TTL, status)               │
│ ✅ Rate limiting (1 msg/min)                         │
│ ✅ Deduplication (content hash)                      │
│                                                      │
│ ❌ NO MTProto access                                 │
│ ❌ NO media download                                 │
│ ❌ NO GramJS parsing                                 │
└──────────────────────────────────────────────────────┘
```

---

## Common Confusion Points

### 1. "Text Extraction = Content Filtering?" ❌

**NO.**

**Text extraction (ingestion):**

- Technical: "Which GramJS field has the text?"
- Result: RAW string from Telegram

**Content filtering (backend):**

- Semantic: "Transform mentions → cashtags"
- Result: Business-rule-transformed string

### 2. "Message Transformation = LLM?" ❌

**NO.**

**Message transformation (ingestion):**

- Format: GramJS shapes → JSON DTOs
- No AI, no semantic changes
- Just structure normalization

**LLM transformation (backend):**

- Content: RAW text → refined/summarized
- Uses AI (OpenAI/gateway)
- Quality gates (non-Latin rejection)

### 3. "Media Download = Publishing?" ❌

**NO.**

**Media download (ingestion):**

- Infrastructure: MTProto API → filesystem
- Happens at ingestion time (sync)
- Result: file on disk + URL in DTO

**Publishing (backend):**

- Business: file URL → Bot API sendPhoto
- Happens at publish time (async, queue)
- Rate limited, status tracked

---

## Refactor Document (`message-transformation-pipeline-refactor.md`)

**Context:** That refactor document is about **consolidating DUPLICATED transformation logic** between backend and ingestion-service.

**What it moves:**

- ❌ NO business logic moves
- ✅ Shared **parsing utilities** → single source of truth

**Example:**

```
Before:
  Backend: extractAllText() inline
  Ingestion: extractAllText() inline

After:
  Ingestion: CryptoNewsTextExtractor (canonical)
  Backend: imports FROM ingestion (or uses DTOs)
```

**Goal:** DRY, not moving responsibilities.

---

## Evidence: No Business Logic in Ingestion

### Grep Results Analysis

**Searched for:** `(keyword|filter|match|llm|publish|transform.*content)`

**Results:**

- `keyword` — 0 matches (only in backend)
- `filter` — 0 business logic (only file pattern matching)
- `match` — 0 semantic matching (only regex pattern matching for filenames)
- `llm` — 0 matches
- `publish` — 0 matches (only timestamps, not publishing logic)
- `ContentFilter` — 0 matches

**Conclusion:** Ingestion-service is **clean**. No leaked business logic.

---

## Recommendations

### ✅ Keep Ingestion-Service As-Is

**Why:**

- Scope is correct (infrastructure only)
- No business logic found
- Clean separation of concerns

### ✅ Keep Backend Publisher Logic

**Why:**

- Already in correct place
- Filters/matching/LLM belong to backend
- Publishing is business logic

### ❌ Do NOT Move Anything

**What NOT to move:**

- Text extraction → stays in ingestion (technical parsing)
- Media download → stays in ingestion (MTProto I/O)
- Transformation → stays in ingestion (format normalization)

---

## Comparison Table: Ingestion vs Backend

| Responsibility           | Ingestion | Backend       | Why                   |
| ------------------------ | --------- | ------------- | --------------------- |
| **MTProto Session**      | ✅ Owns   | ❌ Never      | Single session, infra |
| **Fetch Messages**       | ✅ Owns   | ❌ Never      | Telegram API access   |
| **Text Extraction**      | ✅ Owns   | ❌ Uses DTOs  | Technical parsing     |
| **Media Download**       | ✅ Owns   | ❌ Reads URLs | MTProto I/O           |
| **Format Normalization** | ✅ Owns   | ❌ Consumes   | GramJS → DTO          |
| **RAW Persistence**      | ✅ Owns   | ❌ Reads HTTP | Append-only log       |
| **SSE Streaming**        | ✅ Owns   | ❌ Consumes   | Transport layer       |
| **Media Serving**        | ✅ Owns   | ❌ Proxies    | Static files          |
|                          |           |               |                       |
| **Content Filtering**    | ❌ Never  | ✅ Owns       | Business logic        |
| **Keyword Matching**     | ❌ Never  | ✅ Owns       | Enqueue decision      |
| **Blacklist Check**      | ❌ Never  | ✅ Owns       | Quality gate          |
| **LLM Transform**        | ❌ Never  | ✅ Owns       | Content generation    |
| **Bot API Publishing**   | ❌ Never  | ✅ Owns       | sendMessage/Photo     |
| **Queue Management**     | ❌ Never  | ✅ Owns       | Cap/TTL/status        |
| **Rate Limiting**        | ❌ Never  | ✅ Owns       | 1 msg/min             |
| **Deduplication**        | ❌ Never  | ✅ Owns       | Content hash          |

---

## Mental Model

```
┌────────────────┐     RAW DTOs      ┌────────────────┐
│   Ingestion    │ ──────────────────► │    Backend     │
│   (Plumbing)   │                     │   (Business)   │
└────────────────┘                     └────────────────┘
      │                                        │
      │ Responsibilities:                     │ Responsibilities:
      │ • Fetch from Telegram                 │ • Transform content
      │ • Parse GramJS                        │ • Match keywords
      │ • Download media                      │ • Check blacklist
      │ • Store RAW                           │ • Generate LLM
      │ • Stream via SSE                      │ • Publish to Bot
      │                                        │ • Manage queue
      └────────────────────────────────────────┘
```

---

## Conclusion

**Answer to original question:**

> "¿Qué hay en ingestion que debería estar en el backend?"

**NADA.** Ingestion-service está correctamente scoped.

**What's there:**

- ✅ Infrastructure (MTProto, I/O, transport)
- ✅ Technical parsing (GramJS → DTOs)
- ✅ RAW storage (no business rules)

**What's NOT there (correctly in backend):**

- ❌ Content transformation (filters, LLM)
- ❌ Business logic (matching, blacklist)
- ❌ Publishing (Bot API, queue)

**Refactor document context:**

- Consolidates DUPLICATED parsing utils
- Does NOT move business logic
- Goal is DRY, not responsibility shift

**Final recommendation:** ✅ **Keep architecture as-is.** Separation of concerns is correct.
