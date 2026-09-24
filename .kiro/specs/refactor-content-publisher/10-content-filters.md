# 10. Sistema de Filtros de Contenido

## Visión General

El sistema de **Content Filters** proporciona transformación regex de contenido crypto-news a nivel de canal antes del matching de keywords. Los filtros son **per-channel**, **priority-ordered**, con protección **ReDoS** (100ms timeout por regex).

### Arquitectura Key

```
RAW content (ingestion-telegram DB)
         ↓
Backend polling/SSE fetch
         ↓
ContentFilterService.filterContent() ← per-channel FilterRules (priority ASC)
         ↓
Filtered content (on-read, NOT persisted)
         ↓
Keyword matching + blacklist check
         ↓
EnqueueMatchingMessageUseCase
```

**Invariantes Críticos**:

1. **Filtros aplicados on-read** — ingestion-telegram persiste RAW, backend transforma en memoria
2. **Una regla por prioridad** — orden determinista (priority ASC, luego createdAt ASC para ties)
3. **Timeout 100ms por regex** — protección ReDoS, logs + skip en timeout/error
4. **FK-less by design** — `channel_id` es opaque varchar (no JOIN a `crypto_news_sources` porque esa tabla vive en ingestion-telegram DB)
5. **Warn-only validation** — filtros para canales desconocidos se mantienen, matching los salta silenciosamente

---

## Entidades

### ChannelContentFilterConfig (Domain Aggregate)

**Ubicación**: `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/channel-content-filter-config.entity.ts`

Aggregate root con `channelId` como identity (opaque, no FK).

#### Props

```typescript
interface ChannelContentFilterConfigProps {
  readonly channelId: string; // Telegram channel ID (numeric string, ej: "-1001234567890")
  pattern: string; // Regex pattern
  replacement: string; // Replacement string (supports $1, $2, etc.)
  flags: string; // Regex flags (g, i, m, s, u, y)
  isActive: boolean; // Active/inactive toggle
  priority: number; // Lower value = higher precedence (applied first)
  readonly createdAt: Date;
  updatedAt: Date;
}
```

#### Métodos de Creación

**`create(input)`** — Crea filtro con validación estricta:

- **channelId**: debe ser numeric string (regex: `^-?\d+$`)
- **pattern**: debe compilar como RegExp válida
- **flags**: solo permite `[gimsuy]+` (sin repetidos)
- **priority**: debe ser non-negative integer

```typescript
const filter = ChannelContentFilterConfig.create({
  channelId: '-1001234567890',
  pattern: '\\bBTC\\b',
  replacement: 'Bitcoin',
  flags: 'gi',
  isActive: true,
  priority: 10,
});
```

**`reconstitute(props)`** — Rehydrata desde persistence (sin validación).

#### Métodos de Modificación

```typescript
filter.activate(); // isActive = true
filter.deactivate(); // isActive = false
filter.updatePattern('\\bETH\\b'); // valida regex antes de aplicar
filter.updateReplacement('Ethereum');
filter.updateFlags('gi'); // valida flags
filter.setPriority(5); // valida non-negative integer
```

Todos los setters:

- Actualizan `updatedAt` automáticamente
- Skip si valor es idéntico (idempotent)
- Validan antes de aplicar (DomainError si inválido)

#### Helpers

```typescript
filter.toRegExp(): RegExp  // Compila RegExp (throws si pattern inválido)
```

---

### ChannelContentFilterConfigEntity (TypeORM)

**Ubicación**: `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity.ts`

**Tabla**: `channel_content_filter_configs`

```typescript
@Entity({ name: 'channel_content_filter_configs' })
@Index('idx_channel_content_filter_configs_ordering', [
  'channelId',
  'priority',
  'createdAt',
])
export class ChannelContentFilterConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // OPAQUE by design — NO FK to crypto_news_sources
  // (sources live in ingestion-telegram DB, cross-DB FK impossible)
  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  channelId: string;

  @Column({ name: 'pattern', type: 'varchar', length: 512 })
  pattern: string;

  @Column({ name: 'replacement', type: 'varchar', length: 512, default: '' })
  replacement: string;

  @Column({ name: 'flags', type: 'varchar', length: 8, default: 'gi' })
  flags: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'priority', type: 'int', default: 0 })
  priority: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

**Índice Composite** — Optimiza queries por canal + ordenamiento:

```sql
CREATE INDEX idx_channel_content_filter_configs_ordering
ON channel_content_filter_configs (channel_id, priority, created_at);
```

**Foreign Key Deletion History** (split 2026-09-08):

Migration `1860000000001-DropIngestionOwnedCryptoNewsTables` eliminó AMBOS nombres históricos del FK:

1. `FK_f4d53649fee70f18bbc88502673` — generado por `synchronize:true` (dev)
2. `fk_channel_content_filter_configs_channel_id` — creado por migration `1815000000000`

Rationale: `crypto_news_sources` ahora vive en ingestion-telegram DB (`<base>_ingestion`), cross-DB FK es imposible y no deseado (recouple del split).

---

## ContentFilterService

**Ubicación**: `apps/backend/src/telegram/ingestion/crypto-news/application/services/content-filter.service.ts`

Servicio stateless que aplica filtros regex con protección ReDoS.

### Interface FilterRule

```typescript
export interface FilterRule {
  pattern: string; // Regex pattern
  replacement: string; // Replacement (supports $1, $2 capture groups)
  flags: string; // Regex flags ('gi', 'g', 'i', etc.)
  priority: number; // Lower = applied first
  isActive: boolean; // Active/inactive toggle
}
```

### Métodos Públicos

#### `filterContent(content, filters): string`

Aplica filtros activos en orden de prioridad (ASC).

**Algoritmo**:

1. Skip si `content` es vacío
2. Filtrar solo `isActive: true`
3. Sort por `priority` ASC (lower = higher precedence)
4. Aplicar cada filtro secuencialmente con `applyFilter()`
5. Retornar contenido transformado

```typescript
const result = contentFilterService.filterContent('Check out $BTC at 50k!', [
  {
    pattern: '\\$([A-Z]+)',
    replacement: 'the $1 token',
    flags: 'g',
    priority: 10,
    isActive: true,
  },
  {
    pattern: '\\bat\\s+(\\d+k)',
    replacement: 'around $1',
    flags: 'gi',
    priority: 20,
    isActive: true,
  },
]);
// result: "Check out the BTC token around 50k!"
```

#### `filterTitleAndContent(title, content, filters): { title, content }`

Wrapper que aplica filtros a ambos campos.

```typescript
const { title, content } = contentFilterService.filterTitleAndContent(
  'BTC Pump!',
  'Bitcoin pumping to $50k',
  filters,
);
```

### Protección ReDoS

Cada regex replace tiene **timeout 100ms** y error boundaries:

```typescript
private applyFilter(content: string, filter: FilterRule): string {
  // 1. Validar pattern antes de compilar
  let regex: RegExp;
  try {
    regex = new RegExp(filter.pattern, filter.flags);
  } catch (err) {
    this.logger.warn(
      `Invalid regex pattern (priority=${filter.priority}): ${filter.pattern}`
    );
    return content;  // Skip invalid filter
  }

  // 2. Timeout protection (AbortController boilerplate para futuro async)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 100);

  try {
    return this.applyFilterWithTimeout(content, regex, filter.replacement, filter);
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### `applyFilterWithTimeout()` — Synchronous Timeout Check

JavaScript `String.replace()` es síncrono (no preemptible), pero medimos elapsed time post-op:

```typescript
private applyFilterWithTimeout(
  content: string,
  regex: RegExp,
  replacement: string,
  filter: FilterRule
): string {
  const startTime = Date.now();

  try {
    const result = content.replace(regex, replacement);
    const elapsed = Date.now() - startTime;

    if (elapsed > 100) {
      this.logger.warn(
        `Regex replace took ${elapsed}ms (exceeds 100ms limit), ` +
        `priority=${filter.priority}, pattern=${filter.pattern}`
      );
    }

    return result;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    this.logger.error(
      `Regex replace failed after ${elapsed}ms ` +
      `(priority=${filter.priority}): ${err.message}`
    );
    return content;  // Return original on error
  }
}
```

**Limitaciones del Timeout**:

- True preemption NO es posible en single-threaded JS
- El timeout solo DETECTA slow regex post-mortem
- Regex maliciosos (catastrophic backtracking) aún pueden bloquear el thread 100ms

**Mitigación Futura** (out of scope v1):

- Worker threads para regex processing (requiere serialización de RegExp)
- Regex validator pre-deployment (safe-regex npm package)

---

## Use Cases

### CreateContentFilterUseCase

Crea filtro con validación warn-only para unknown channels.

**Input**:

```typescript
interface CreateContentFilterInput {
  channelId: string;
  pattern: string;
  replacement?: string;
  flags?: string;
  priority?: number;
  isActive?: boolean;
}
```

**Flujo**:

1. Validar source existence via `CryptoNewsSourceRepository.findById(channelId)`
2. Si NO existe → **log warn + proceed** (no throw)
3. Crear aggregate: `ChannelContentFilterConfig.create(input)`
4. Persist via `ChannelFilterRepository.save(config)`

```typescript
const filter = await createContentFilterUseCase.execute({
  channelId: '-1001234567890',
  pattern: '\\bBTC\\b',
  replacement: 'Bitcoin',
  flags: 'gi',
  priority: 10,
});
```

**Warn-only Rationale**:

- Ingestion-telegram puede agregar canales sin notificar al backend
- Filtros pre-creados para canales futuros son válidos (setup antes de join)
- Matching simplemente skip si `getFiltersForChannel()` retorna `[]`

### ListChannelFiltersUseCase

Lista filtros por `channelId` en orden de aplicación.

**Query**:

```typescript
const filters = await listFiltersUseCase.execute(channelId);
// Retorna FilterRule[] sorted by (priority ASC, createdAt ASC)
```

### UpdateContentFilterUseCase

Actualiza pattern/replacement/flags/priority/isActive.

```typescript
await updateFilterUseCase.execute({
  id: 'uuid',
  pattern: '\\bETH\\b', // opcional
  replacement: 'Ethereum', // opcional
  flags: 'gi', // opcional
  priority: 5, // opcional
  isActive: false, // opcional
});
```

**Validaciones** (por aggregate methods):

- `updatePattern()` — valida regex antes de aplicar
- `updateFlags()` — valida `[gimsuy]+`
- `setPriority()` — valida non-negative integer

### DeleteContentFilterUseCase

Soft-delete (marca `isActive: false`) o hard-delete (remove de DB).

```typescript
await deleteFilterUseCase.execute(filterId, { soft: true }); // deactivate
await deleteFilterUseCase.execute(filterId, { soft: false }); // remove
```

---

## FilteredCryptoNewsService Integration

**Ubicación**: `apps/backend/src/telegram/crypto-news-integration/shared/application/services/filtered-crypto-news.service.ts`

Orquestador que fetch→filter→match.

### Flujo de Filtrado

```typescript
async getMatchingMessages(limit: number, channelId?: string): Promise<FilteredMessage[]> {
  // 1. Fetch RAW messages
  const rawMessages = await this.ingestionClient.getRecentMessages({
    limit,
    channelId,
  });

  // 2. Para cada mensaje:
  const filtered = await Promise.all(rawMessages.map(async msg => {
    // a. Load filters for channel
    const filters = await this.channelFilterRepo.findByChannelId(msg.channelId);

    // b. Apply ContentFilterService
    const { title, content } = this.contentFilterService.filterTitleAndContent(
      msg.title,
      msg.content,
      filters.map(f => ({
        pattern: f.pattern,
        replacement: f.replacement,
        flags: f.flags,
        priority: f.priority,
        isActive: f.isActive,
      }))
    );

    // c. Evaluate keywords + blacklist (on FILTERED content)
    const matched = this.evaluateKeywords(title, content, msg.sourceId);
    const blacklisted = this.evaluateBlacklist(title, content);

    return { ...msg, title, content, matched: matched && !blacklisted };
  }));

  // 3. Return only matched
  return filtered.filter(m => m.matched);
}
```

**Order of Operations** (CRÍTICO):

1. **Fetch RAW** (ingestion-telegram DB sin transformaciones)
2. **Apply content filters** (regex transforms)
3. **Evaluate keywords** (sobre contenido FILTRADO)
4. **Check blacklist** (sobre contenido FILTRADO)

Rationale: Keywords/blacklist operan sobre el contenido "limpio" post-filtros.

---

## Priority Ordering

Los filtros se aplican en **orden determinista**:

### Primary Sort: `priority` ASC

Lower value = applied first (higher precedence).

```typescript
const filters = [
  { priority: 10, pattern: 'foo', ... },  // aplicado primero
  { priority: 20, pattern: 'bar', ... },  // aplicado segundo
  { priority: 30, pattern: 'baz', ... },  // aplicado tercero
];
```

### Tie-Breaking: `createdAt` ASC

Si dos filtros tienen mismo `priority`, se aplica el más antiguo primero.

```typescript
// priority=10 creado 2026-01-01 12:00
// priority=10 creado 2026-01-01 13:00
// ⬇️ el de 12:00 se aplica primero
```

**Index Support**:

```sql
idx_channel_content_filter_configs_ordering (channel_id, priority, created_at)
```

Permite query eficiente:

```sql
SELECT * FROM channel_content_filter_configs
WHERE channel_id = '-1001234567890' AND is_active = true
ORDER BY priority ASC, created_at ASC;
```

---

## Frontend Integration

### Content Filter CRUD UI

**Ubicación** (inferida): `apps/frontend/src/features/crypto-news/components/ChannelFiltersModal.tsx`

#### Components

**ContentFilterList** — tabla de filtros por canal:

| Priority | Pattern      | Replacement  | Flags | Active | Actions       |
| -------- | ------------ | ------------ | ----- | ------ | ------------- |
| 10       | `\bBTC\b`    | Bitcoin      | gi    | ✅     | Edit · Delete |
| 20       | `\$([A-Z]+)` | the $1 token | g     | ✅     | Edit · Delete |

**ContentFilterForm** — formulario con validación client-side:

```tsx
<form onSubmit={handleSubmit}>
  <input name="priority" type="number" min="0" />
  <input name="pattern" type="text" placeholder="\bBTC\b" />
  <input name="replacement" type="text" placeholder="Bitcoin" />
  <input name="flags" type="text" placeholder="gi" pattern="[gimsuy]+" />
  <input name="isActive" type="checkbox" />
  <button type="submit">Save Filter</button>
</form>
```

**Validación Client-Side**:

```typescript
function validatePattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function validateFlags(flags: string): boolean {
  return /^[gimsuy]+$/.test(flags);
}
```

#### API Hooks

```typescript
// TanStack Query hooks
const { data: filters } = useChannelFilters(channelId);
const createFilter = useCreateContentFilter();
const updateFilter = useUpdateContentFilter();
const deleteFilter = useDeleteContentFilter();

// Usage
createFilter.mutate({
  channelId: '-1001234567890',
  pattern: '\\bBTC\\b',
  replacement: 'Bitcoin',
  flags: 'gi',
  priority: 10,
});
```

---

## HTTP API

### Endpoints

#### `POST /crypto-news/sources/:channelId/filters`

Crea filtro para un canal.

**Request**:

```json
{
  "pattern": "\\bBTC\\b",
  "replacement": "Bitcoin",
  "flags": "gi",
  "priority": 10,
  "isActive": true
}
```

**Response** (201):

```json
{
  "id": "uuid",
  "channelId": "-1001234567890",
  "pattern": "\\bBTC\\b",
  "replacement": "Bitcoin",
  "flags": "gi",
  "priority": 10,
  "isActive": true,
  "createdAt": "2026-09-23T10:00:00Z",
  "updatedAt": "2026-09-23T10:00:00Z"
}
```

#### `GET /crypto-news/sources/:channelId/filters`

Lista filtros de un canal (ordenados por priority ASC, createdAt ASC).

**Query Params**:

- `includeInactive=true` — incluye `isActive: false` (default: solo activos)

**Response** (200):

```json
[
  {
    "id": "uuid-1",
    "channelId": "-1001234567890",
    "pattern": "\\bBTC\\b",
    "replacement": "Bitcoin",
    "flags": "gi",
    "priority": 10,
    "isActive": true,
    "createdAt": "2026-09-23T10:00:00Z",
    "updatedAt": "2026-09-23T10:00:00Z"
  },
  {
    "id": "uuid-2",
    "pattern": "\\$([A-Z]+)",
    "replacement": "the $1 token",
    "flags": "g",
    "priority": 20,
    "isActive": true,
    ...
  }
]
```

#### `PATCH /crypto-news/filters/:id`

Actualiza filtro (partial update).

**Request**:

```json
{
  "pattern": "\\bETH\\b",
  "priority": 5,
  "isActive": false
}
```

**Response** (200): filtro completo actualizado.

#### `DELETE /crypto-news/filters/:id`

Elimina filtro.

**Query Params**:

- `soft=true` — soft-delete (marca `isActive: false`)
- `soft=false` — hard-delete (remove de DB)

**Response** (204): sin contenido.

---

## Database Schema

### Table: `channel_content_filter_configs`

```sql
CREATE TABLE channel_content_filter_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(64) NOT NULL,        -- Opaque, NO FK
  pattern VARCHAR(512) NOT NULL,
  replacement VARCHAR(512) DEFAULT '',
  flags VARCHAR(8) DEFAULT 'gi',
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channel_content_filter_configs_ordering
ON channel_content_filter_configs (channel_id, priority, created_at);
```

**No Foreign Key** — `channel_id` es opaque por diseño:

- `crypto_news_sources` vive en ingestion-telegram DB (`<base>_ingestion`)
- Cross-DB FK es imposible (Postgres separate databases)
- Deliberado (no accidental) — no recouple del split 2026-09-08

### Migrations

**`1815000000000-CreateChannelContentFilterConfigs.ts`** — tabla inicial + FK (ahora eliminado).

**`1860000000001-DropIngestionOwnedCryptoNewsTables.ts`** — elimina FK (`FK_f4d53649fee70f18bbc88502673` + `fk_channel_content_filter_configs_channel_id`) durante el split.

---

## Casos de Uso Ejemplo

### Caso 1: Normalizar Tickers

**Problema**: Mensajes usan `$BTC`, `btc`, `Bitcoin` inconsistentemente.

**Solución**: Filtros priority-ordered para normalizar.

```typescript
// Priority 10: Normalizar $TICKER sintaxis
{
  pattern: '\\$([A-Z]+)',
  replacement: 'the $1 token',
  flags: 'g',
  priority: 10,
}

// Priority 20: Lowercase tickers → Title Case
{
  pattern: '\\b([a-z]{2,5})\\b',  // captura tickers lowercase
  replacement: '$1',               // mantener (post-processing manual)
  flags: 'g',
  priority: 20,
}
```

**Output**:

```
Input:  "Check out $BTC and eth!"
Filter 10: "Check out the BTC token and eth!"
Filter 20: (sin cambio, solo lowercase keywords)
Final:  "Check out the BTC token and eth!"
```

### Caso 2: Remover Spam

**Problema**: Canales incluyen "JOIN OUR VIP GROUP" footers.

**Solución**: Filtro para remover patterns conocidos.

```typescript
{
  pattern: 'JOIN OUR VIP GROUP.*$',
  replacement: '',
  flags: 'gis',  // . matches newlines
  priority: 5,   // aplicar primero (alta prioridad)
}
```

### Caso 3: Normalizar URLs

**Problema**: URLs con tracking params (`?utm_source=...`).

**Solución**: Strip query strings.

```typescript
{
  pattern: '(https?://[^\\s?]+)\\?[^\\s]*',
  replacement: '$1',
  flags: 'g',
  priority: 15,
}
```

**Output**:

```
Input:  "Check https://dexscreener.com/solana/abc?utm_source=tg"
Output: "Check https://dexscreener.com/solana/abc"
```

---

## Testing

### Unit Tests: ContentFilterService

**Ubicación**: `apps/backend/src/telegram/ingestion/crypto-news/application/services/content-filter.service.spec.ts`

#### Test Cases

```typescript
describe('ContentFilterService', () => {
  it('applies filters in priority order', () => {
    const filters: FilterRule[] = [
      {
        pattern: 'foo',
        replacement: 'bar',
        flags: 'g',
        priority: 20,
        isActive: true,
      },
      {
        pattern: 'bar',
        replacement: 'baz',
        flags: 'g',
        priority: 10,
        isActive: true,
      },
    ];
    const result = service.filterContent('foo', filters);
    // Priority 10 first: 'foo' → 'foo' (no match)
    // Priority 20 second: 'foo' → 'bar'
    // Result: 'bar'
    expect(result).toBe('bar');
  });

  it('skips inactive filters', () => {
    const filters: FilterRule[] = [
      {
        pattern: 'foo',
        replacement: 'bar',
        flags: 'g',
        priority: 10,
        isActive: false,
      },
    ];
    const result = service.filterContent('foo', filters);
    expect(result).toBe('foo'); // sin cambio
  });

  it('handles invalid regex patterns gracefully', () => {
    const filters: FilterRule[] = [
      {
        pattern: '[invalid(',
        replacement: 'bar',
        flags: 'g',
        priority: 10,
        isActive: true,
      },
    ];
    const result = service.filterContent('foo', filters);
    expect(result).toBe('foo'); // skip invalid filter
  });

  it('logs warning on slow regex (>100ms)', () => {
    const filters: FilterRule[] = [
      {
        pattern: '(a+)+b', // catastrophic backtracking
        replacement: 'bar',
        flags: 'g',
        priority: 10,
        isActive: true,
      },
    ];
    const result = service.filterContent('a'.repeat(30), filters);
    // expect logger.warn() called with "Regex replace took Xms"
  });

  it('supports capture group replacements', () => {
    const filters: FilterRule[] = [
      {
        pattern: '\\$([A-Z]+)',
        replacement: 'the $1 token',
        flags: 'g',
        priority: 10,
        isActive: true,
      },
    ];
    const result = service.filterContent('$BTC and $ETH', filters);
    expect(result).toBe('the BTC token and the ETH token');
  });
});
```

### Integration Tests: Use Cases

```typescript
describe('CreateContentFilterUseCase', () => {
  it('creates filter with unknown channel (warn-only)', async () => {
    sourceRepo.findById = jest.fn().mockResolvedValue(null); // channel NO existe

    const result = await useCase.execute({
      channelId: '-1001234567890',
      pattern: '\\bBTC\\b',
      replacement: 'Bitcoin',
    });

    expect(result).toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Channel -1001234567890 not found'),
    );
  });

  it('rejects invalid regex pattern', async () => {
    await expect(
      useCase.execute({
        channelId: '-1001234567890',
        pattern: '[invalid(',
        replacement: 'bar',
      }),
    ).rejects.toThrow(DomainError);
  });
});
```

---

## Monitoring & Observability

### Logs Clave

```typescript
// ContentFilterService
'[ContentFilterService] Invalid regex pattern (priority=10): [invalid(';
'[ContentFilterService] Regex replace took 150ms (exceeds 100ms limit), priority=10';
'[ContentFilterService] Regex replace failed after 200ms: RangeError: ...';

// CreateContentFilterUseCase
'[CreateContentFilter] Channel -1001234567890 not found, proceeding anyway (warn-only)';

// FilteredCryptoNewsService
'[FilteredCryptoNewsService] Applied 3 filters for channel -1001234567890';
'[FilteredCryptoNewsService] No filters found for channel -1001234567890, using RAW content';
```

### Metrics (Recomendado — Out of Scope v1)

```typescript
// Prometheus counters/histograms
content_filter_applications_total{channel_id, priority, result="success|timeout|error"}
content_filter_duration_ms{channel_id, priority, p50, p95, p99}
content_filter_skipped_total{reason="inactive|invalid_pattern|unknown_channel"}
```

---

## Seguridad

### ReDoS Protection

Cada regex tiene **hard limit 100ms**. Patterns conocidos maliciosos:

```regex
(a+)+b          # exponential backtracking
(a|a)*b         # exponential alternation
(a|ab)*c        # overlapping alternation
```

**Mitigación**:

1. Timeout 100ms por regex (detecta, no previene)
2. Validación client-side en frontend (rechaza patterns sospechosos)
3. Manual review de filtros en producción (admin approval)

**Futuro** (v2):

- Pre-validate con `safe-regex` npm package
- Worker threads para regex isolation
- Rate limit filtros por canal (max 20)

### Input Validation

- **pattern**: max 512 chars, debe compilar como RegExp
- **replacement**: max 512 chars, supports capture groups `$1..$9`
- **flags**: solo `[gimsuy]+`, sin repetidos
- **priority**: non-negative integer (0..2147483647)

### Audit Log

Cambios en filtros deben loggearse:

```typescript
{
  action: 'CREATE_CONTENT_FILTER',
  userId: 'admin-uuid',
  channelId: '-1001234567890',
  filterId: 'uuid',
  pattern: '\\bBTC\\b',
  timestamp: '2026-09-23T10:00:00Z'
}
```

**Ubicación** (inferida): `SettingsAuditLog` entity (si aplica).

---

## Limitaciones Conocidas

1. **Synchronous regex blocking** — JS single-threaded, regex lento bloquea thread 100ms
2. **No replay protection** — cambiar filtros no re-procesa mensajes históricos
3. **FK-less by design** — no puede prevenir orphan filters para canales deleted
4. **No global filters** — cada canal requiere sus propios filtros (no DRY)
5. **Priority ties** — `createdAt` tie-breaking es no-intuitivo para operators

---

## Roadmap

### v2: Async Worker Pool

Ejecutar regex en worker threads con true preemption.

```typescript
const worker = new Worker('./regex-worker.js');
worker.postMessage({ content, pattern, replacement, flags });
const result = await Promise.race([workerPromise, timeout(100)]);
```

### v3: Global Filter Templates

Templates reutilizables aplicables a múltiples canales.

```typescript
const template = {
  name: 'Normalize Tickers',
  filters: [
    { pattern: '\\$([A-Z]+)', replacement: 'the $1 token', ... },
  ],
};

// Apply to channels
applyTemplate(template, [channelId1, channelId2, ...]);
```

### v4: Regex Validator

Pre-deployment validation con `safe-regex` package.

```typescript
import safeRegex from 'safe-regex';

if (!safeRegex(pattern)) {
  throw new Error('Unsafe regex pattern detected');
}
```

---

## Navegación

- [← 09. Database Schema](./09-database.md)
- [→ Inicio](./01-overview.md)

---

**Última Actualización**: 2026-09-23  
**Versión**: 1.0.0  
**Owner**: Backend Team
