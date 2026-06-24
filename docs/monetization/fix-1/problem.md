# fix-1 · NO persistir el texto crudo del KOL en Postgres

> **Severidad**: 🔴 crítica. Es el riesgo #1 del análisis en `01-telegram-tos-summary.md §2.3`.
> **Estimación**: ~6–10 horas de trabajo + 1 migración de DB.
> **Ventana de peligro**: ya activa. Cualquier fila actual en `extraction_results.raw_text`
> es evidencia de scraping a escala de tu base de datos.
> **Antes de leer esto**: ejecuta `SELECT count(*) FROM extraction_results WHERE raw_text IS NOT NULL AND raw_text != '';`

---

## 0. TL;DR

Tu pipeline actual lee el mensaje completo del KOL desde MTProto y lo **persiste
en Postgres** en la tabla `extraction_results` columna `raw_text`. Esto es
exactamente lo que el ToS de Telegram prohíbe como scraping, y se hace a escala
de tu base de datos (una fila por cada mensaje ingerido). El fix tiene 6 fases
ordenadas por urgencia.

---

## 1. Evidencia (lo que tu código hace hoy)

### 1.1 Extracción desde Telegram (MTProto)

**Archivo**: `apps/backend/src/telegram-kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts:170,204`

```ts
// Línea 167–172 (live updates)
const raw: RawKolMessage = {
  kolId,
  messageId: message.id,
  text: message.message ?? '',   // ← texto crudo del KOL
  occurredAt: new Date(message.date * 1000),
};

// Línea 200–206 (backfill)
return messages.map((m) => ({
  kolId,
  messageId: m.id,
  text: m.message ?? '',          // ← texto crudo del KOL
  occurredAt: new Date(m.date * 1000),
}));
```

**Archivo**: `apps/backend/src/telegram-kol/ingestion/domain/ports/kol-listener.port.ts:47`

```ts
export interface RawKolMessage {
  readonly kolId: string;
  readonly messageId: number;
  readonly text: string;   // ← contrato del port exige text
  readonly occurredAt: Date;
}
```

### 1.2 Propagación por el event bus in-process

**Archivo**: `apps/backend/src/telegram-kol/ingestion/domain/events/kol-message-ingested.event.ts:17-23`

```ts
public readonly payload: {
  readonly kolId: string;
  readonly handle: string | null;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly text?: string;   // ← viaja en el evento
};
```

**Archivo**: `apps/backend/src/token/intake/extraction/infrastructure/event-bus/kol-message-ingested.handler.ts:31`

```ts
await this.extract.execute({
  kolId: event.payload.kolId,
  messageId: event.payload.messageId,
  occurredAt: event.payload.occurredAt,
  text: event.payload.text,    // ← pasa al use case
});
```

### 1.3 Persistencia en Postgres (el smoking gun)

**Archivo**: `apps/backend/src/token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity.ts:31-32`

```ts
@Column({ name: 'raw_text', type: 'text' })
public rawText!: string;       // ← columna persistida en Postgres
```

**Archivo**: `apps/backend/src/token/intake/extraction/application/handlers/extract-from-message.use-case.ts:35-43`

```ts
const result = ExtractionResult.create({
  kolId: input.kolId,
  messageId: input.messageId,
  occurredAt: input.occurredAt,
  rawText: input.text,         // ← el texto se guarda como parte del agregado
  contractAddresses: candidates.contractAddresses,
  tickers: candidates.tickers,
  urls: candidates.urls,
});

await this.resultRepo.save(result);   // ← INSERT en extraction_results
```

### 1.4 Round-trip (lectura desde DB)

**Archivo**: `apps/backend/src/token/intake/extraction/infrastructure/persistence/typeorm/mappers/extraction-result.mapper.ts:14`

```ts
row.rawText = r.rawText;   // ← al escribir
// línea 39: rawText: row.rawText,   // al leer
```

El mapper expone `rawText` en la view que sale por HTTP (controller en
`apps/backend/src/token/intake/extraction/api/http/extraction.controller.ts`).

### 1.5 También viaja en `CandidatesExtractedEvent`

**Archivo**: `apps/backend/src/token/intake/extraction/domain/events/candidates-extracted.event.ts:12`

```ts
readonly rawText: string;    // ← otro evento in-process con el texto
```

Cualquier consumidor downstream de `token.candidates.extracted` recibe el texto.

---

## 2. Por qué es peligroso (los ToS concretos)

### 2.1 Bot Developer ToS §4.3

> *"Always prohibited uses include any form of data collection aimed at creating
> large datasets, machine learning models and AI products, **such as scraping
> public group or channel contents**."*
> — [https://telegram.org/tos/bot-developers]

Cada fila en `extraction_results` con `raw_text` lleno = un row de dataset
construido a partir de contenido scrapeado de canales públicos.

### 2.2 Content Licensing ToS

> *"Telegram firmly prohibits the scraping, indexing, harvesting, aggregation
> or use of data obtained from its platform to train, fine-tune, validate or
> otherwise engage in the development, enhancement, benchmarking or deployment
> of artificial intelligence, machine learning models and similar technologies."*
> — [https://telegram.org/tos/content-licensing]

> *"Any such data is licensed on a retractable, limited, non-exclusive,
> non-transferable and **non-sublicensable** basis **solely to the extent
> strictly required to operate the relevant service**."*
> — [https://telegram.org/tos/content-licensing]

Tu DB no cumple "strictly required to operate the relevant service": para
detectar CAs/tickers/URLs solo necesitas los matches (las `contractAddresses`,
`tickers`, `urls` que ya extraes). El texto crudo de más es excedente.

### 2.3 Lo que pasaría si Telegram audita (API ToS §4)

> *"If your app violates these terms, we will notify the Telegram account
> responsible for the app about the breach of terms. If you do not update the
> app to fix the highlighted issues within 10 days, we will have to discontinue
> your access to Telegram API and contact the app stores about the removal of
> your apps that are using the Telegram API in violation of these terms."*
> — [https://core.telegram.org/api/terms]

⏱️ **10 días de reloj** para:
1. Migrar la DB.
2. Cambiar el contrato de eventos.
3. Borrar el texto persistido.
4. Demostrar el fix a Telegram.

Si no llegas, te cierran el bot + report a Apple/Google.

### 2.4 Lo que pasaría si un KOL te demanda

Un KOL podría argumentar:
- *"Almacenaste mis mensajes en tu DB sin mi opt-in."*
- *"Usaste mi contenido para construir un producto comercial."*
- *"Vendiste acceso a derivados de mi trabajo sin licencia."*

Sin opt-in (ver `04-architecture-gaps.md §1.4`), tu defensa es débil.

---

## 3. El fix en 6 fases

### Fase 1 — Purgar la data existente (URGENTE, día 1)

**Objetivo**: la DB deja de tener texto crudo de KOLs.

```sql
-- Backup antes (para auditoría interna, no producción)
CREATE TABLE extraction_results_pre_fix_1 AS
SELECT id, kol_id, message_id, occurred_at, raw_text, contract_addresses,
       tickers, urls, created_at
FROM extraction_results
WHERE raw_text IS NOT NULL AND raw_text != '';

-- Purga inmediata
ALTER TABLE extraction_results DROP COLUMN raw_text;
```

**Down-time**: cero si Postgres permite `ALTER TABLE DROP COLUMN` sin lock exclusivo
(12+ lo permite). Si lockea, hacerlo en ventana de mantenimiento (< 1s en
tabla mediana).

**Verificación post-Fase 1**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'extraction_results' AND column_name = 'raw_text';
-- Esperado: 0 filas
```

⚠️ Si `DATABASE_ENABLED=false` (default en dev), la DB es in-memory y se borra
al reiniciar el proceso. Verifica también el `InMemoryExtractionResultRepository`
(`apps/backend/src/token/intake/extraction/infrastructure/repositories/
in-memory-extraction-result.repository.ts`).

---

### Fase 2 — Quitar el campo del entity TypeORM (día 1)

**Archivo a editar**: `apps/backend/src/token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity.ts`

```diff
 @Entity({ name: 'extraction_results' })
 @Index('idx_extraction_results_occurred_at', ['occurredAt'])
 export class ExtractionResultEntity {
   @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
   public id!: string;

   @PrimaryColumn({ name: 'kol_id', type: 'varchar', length: 64 })
   public kolId!: string;

   @PrimaryColumn({ name: 'message_id', type: 'bigint' })
   public messageId!: string;

   @Column({ name: 'occurred_at', type: 'timestptz' })
   public occurredAt!: Date;

-  @Column({ name: 'raw_text', type: 'text' })
-  public rawText!: string;
-
   @Column({ name: 'contract_addresses', type: 'jsonb' })
   public contractAddresses!: Array<{
     value: string;
     chainHint: 'evm' | 'solana' | 'unknown';
   }>;

   @Column({ name: 'tickers', type: 'jsonb' })
   public tickers!: string[];

   @Column({ name: 'urls', type: 'jsonb' })
   public urls!: string[];

   @CreateDateColumn({ name: 'created_at', type: 'timestptz' })
   public createdAt!: Date;
 }
```

**Mapper** (`apps/backend/src/token/intake/extraction/infrastructure/persistence/typeorm/mappers/extraction-result.mapper.ts`):

```diff
 export const ExtractionResultMapper = {
   toRow(r: ExtractionResult): ExtractionResultEntity {
     const row = new ExtractionResultEntity();
     row.id = r.id;
     row.kolId = r.kolId;
     row.messageId = String(r.messageId);
     row.occurredAt = r.occurredAt;
-    row.rawText = r.rawText;
     row.contractAddresses = [...r.contractAddresses];
     row.tickers = [...r.tickers];
     row.urls = [...r.urls];
     return row;
   },

   toDomain(row: ExtractionResultEntity): ExtractionResult {
     return ExtractionResult.rehydrate({
       id: row.id,
       kolId: row.kolId,
       messageId: Number(row.messageId),
       occurredAt: row.occurredAt,
-      rawText: row.rawText,
       contractAddresses: row.contractAddresses,
       tickers: row.tickers,
       urls: row.urls,
     });
   },
 };
```

---

### Fase 3 — Quitar el campo del entity de dominio (día 1)

**Archivo**: `apps/backend/src/token/intake/extraction/domain/entities/extraction-result.entity.ts`

Quitar `rawText` de:
- el state interno (línea 13).
- el constructor `create` (línea 40).
- el constructor `rehydrate` (línea 74).
- el getter (línea 102).
- el método que construye `CandidatesExtractedEvent` (línea 128).

```diff
 export class ExtractionResult {
   private readonly state: {
     readonly id: string;
     readonly kolId: string;
     readonly messageId: number;
     readonly occurredAt: Date;
-    readonly rawText: string;
     readonly contractAddresses: ReadonlyArray<ContractAddress>;
     readonly tickers: ReadonlyArray<Ticker>;
     readonly urls: ReadonlyArray<Url>;
   };

-  public get rawText(): string {
-    return this.state.rawText;
-  }

   public emitCandidatesExtracted(): CandidatesExtractedEvent {
     return new CandidatesExtractedEvent({
       id: this.state.id,
       kolId: this.state.kolId,
       messageId: this.state.messageId,
       occurredAt: this.state.occurredAt,
-      rawText: this.state.rawText,
       contractAddresses: [...this.state.contractAddresses],
       tickers: [...this.state.tickers],
       urls: [...this.state.urls],
     });
   }
 }
```

**View mapper** (`apps/backend/src/token/intake/extraction/application/mappers/extraction-result.mapper.ts:11,33`):
quitar `rawText` del tipo y del objeto.

---

### Fase 4 — Cambiar el contrato de extracción (día 2)

**Archivo**: `apps/backend/src/token/intake/extraction/application/handlers/extract-from-message.use-case.ts`

```diff
 export interface ExtractFromMessageInput {
   readonly kolId: string;
   readonly messageId: number;
   readonly occurredAt: Date;
   readonly text: string;     // ← input temporal, solo vive en este método
 }

 @Injectable()
 export class ExtractFromMessageUseCase {
   public constructor(
     private readonly extractor: ExtractorPort,
     private readonly resultRepo: ExtractionResultRepository,
     private readonly eventPublisher: ExtractionEventPublisher,
   ) {}

   public async execute(
     input: ExtractFromMessageInput,
   ): Promise<ExtractionResultView> {
     const candidates = await this.extractor.extract(input);

     const result = ExtractionResult.create({
       kolId: input.kolId,
       messageId: input.messageId,
       occurredAt: input.occurredAt,
-      rawText: input.text,
       contractAddresses: candidates.contractAddresses,
       tickers: candidates.tickers,
       urls: candidates.urls,
     });

     await this.resultRepo.save(result);
     result.emitCandidatesExtracted();
     await this.eventPublisher.publishAll(result.commit());

-    // ⚠️ `input.text` se queda en el heap hasta que GC lo recoja
-    // No podemos forzar esto en JS. Pero tampoco lo copiamos a ningún lado.
+    // ✅ `input.text` vive solo durante este execute(). Después de este return
+    // no hay ninguna referencia en el heap. El GC lo limpiará.

     return ExtractionResultMapper.toView(result);
   }
 }
```

**Cambio crítico de comportamiento**: el `text` ya NO se persiste, NO se mete
en eventos downstream, NO aparece en views HTTP. Solo vive en el heap durante
la duración del `execute()` (típicamente < 50ms).

---

### Fase 5 — Quitar `text` del evento upstream (día 2)

**Archivo**: `apps/backend/src/telegram-kol/ingestion/domain/events/kol-message-ingested.event.ts`

```diff
 export class KolMessageIngestedEvent extends DomainEvent {
   public readonly payload: {
     readonly kolId: string;
     readonly handle: string | null;
     readonly messageId: number;
     readonly occurredAt: Date;
-    readonly text?: string;
   };

   constructor(payload: {
     kolId: string;
     handle: string | null;
     messageId: number;
     occurredAt: Date;
-    text?: string;
   }) {
     super('telegram.message.ingested', `${payload.kolId}:${payload.messageId}`);
     this.payload = Object.freeze(payload);
   }

   public toPayload(): Record<string, unknown> {
     return {
       kolId: this.payload.kolId,
       handle: this.payload.handle,
       messageId: this.payload.messageId,
       occurredAt: this.payload.occurredAt.toISOString(),
-      text: this.payload.text,
     };
   }
 }
```

**Archivo**: `apps/backend/src/telegram-kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts`

```diff
 // Línea 167–172 (live updates)
 const raw: RawKolMessage = {
   kolId,
   messageId: message.id,
-  text: message.message ?? '',
   occurredAt: new Date(message.date * 1000),
 };

 // Línea 200–206 (backfill)
 return messages.map((m) => ({
   kolId,
   messageId: m.id,
-  text: m.message ?? '',
   occurredAt: new Date(m.date * 1000),
 }));
```

**Problema aquí**: el extractor necesita el texto para hacer regex. Hay 2
opciones:

**Opción A (recomendada)**: hacer la extracción INLINE en el listener, antes
de descartar el texto.

**Opción B**: pasar el texto por un canal efímero (no event bus global), solo
entre el listener y el extractor.

**Implementación A**: nuevo use case `IngestAndExtractUseCase` que reemplaza
la cadena `ingestion → event bus → extraction handler → extract use case`.

```ts
// apps/backend/src/telegram-kol/ingestion/application/handlers/ingest-and-extract.use-case.ts

@Injectable()
export class IngestAndExtractUseCase {
  constructor(
    private readonly extractor: ExtractorPort,
    private readonly resultRepo: ExtractionResultRepository,
    private readonly kolRepo: KolRepository,
    private readonly eventPublisher: ExtractionEventPublisher,
  ) {}

  public async execute(input: {
    kolId: string;
    messageId: number;
    occurredAt: Date;
    text: string;             // ← vive solo aquí dentro
  }): Promise<void> {
    const candidates = await this.extractor.extract(input);

    // input.text sale del scope inmediatamente al volver de extract()
    const result = ExtractionResult.create({
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contractAddresses: candidates.contractAddresses,
      tickers: candidates.tickers,
      urls: candidates.urls,
    });

    await this.resultRepo.save(result);
    await this.eventPublisher.publish(result.toEvent());
    // aquí `input.text` ya no existe en el scope
  }
}
```

El listener llama a `IngestAndExtractUseCase.execute({kolId, messageId,
occurredAt, text})` directamente — el `text` nunca aparece en un evento global,
solo en la firma de la llamada (que vive solo en el call stack).

---

### Fase 6 — Tests que aseguren el invariante (día 3)

Añadir a `apps/backend/test/` o en cada BC:

```ts
// apps/backend/src/token/intake/extraction/application/handlers/extract-from-message.use-case.spec.ts

describe('Anti-scraping compliance', () => {
  it('ExtractionResult never persists rawText', async () => {
    await useCase.execute({
      kolId: 'k1',
      messageId: 1,
      occurredAt: new Date(),
      text: 'SENSITIVE TEXT FROM KOL — PEPE 0xabc...',
    });

    const stored = await resultRepo.findByKolAndMessage('k1', 1);
    expect(stored).not.toHaveProperty('rawText');
    expect(JSON.stringify(stored)).not.toContain('SENSITIVE TEXT');
  });

  it('CandidatesExtractedEvent never carries rawText', async () => {
    const events: DomainEvent[] = [];
    await useCase.execute({
      kolId: 'k1',
      messageId: 2,
      occurredAt: new Date(),
      text: 'SENSITIVE',
    });

    events.forEach((e) => {
      expect(JSON.stringify(e.toPayload())).not.toContain('SENSITIVE');
    });
  });
});

// apps/backend/test/integration/persistence-compliance.spec.ts (nuevo)

describe('Postgres compliance', () => {
  it('extraction_results has no raw_text column', async () => {
    const ds = app.get(DataSource);
    const columns = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'extraction_results'`,
    );
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain('raw_text');
  });

  it('no existing row contains KOL message text', async () => {
    const ds = app.get(DataSource);
    const rows = await ds.query(
      `SELECT id, kol_id, message_id FROM extraction_results LIMIT 1`,
    );
    rows.forEach((r) => {
      expect(r).not.toHaveProperty('raw_text');
    });
  });
});
```

**Métrica Prometheus** (en `apps/backend/src/shared/observability/`):

```ts
// Counter que SIEMPRE debe ser 0
new Counter({
  name: 'extraction_results_with_raw_text_total',
  help: 'Should always be 0. Non-zero means raw text leaked into persistence.',
  registers: [registry],
});
```

En `extract-from-message.use-case.ts` después del `save()`:

```ts
// ❌ NUNCA debe ejecutarse
if (result.rawText) {
  rawTextLeakCounter.inc();
}
```

Si esto se incrementa → alerta P0.

---

## 4. Orden de despliegue

```
Día 1 mañana:
  1. Backup de extraction_results a tabla pre_fix_1
  2. ALTER TABLE extraction_results DROP COLUMN raw_text
  3. Deploy del código Fase 2+3 (entity changes)
  4. Verificar con queries que no hay raw_text en ningún row

Día 1 tarde:
  5. Implementar Fase 4 (extract use case sin rawText)
  6. Implementar Fase 5 (opción A: IngestAndExtractUseCase)
  7. Tests unitarios + integration

Día 2:
  8. Tests E2E
  9. Métrica Prometheus + alerta
  10. Deploy a staging
  11. Smoke test: ingestar 10 mensajes reales, verificar DB sin texto

Día 3:
  12. Deploy a producción
  13. Monitorear `extraction_results_with_raw_text_total` durante 7 días
  14. Si 0 → cerrar el ticket
  15. Actualizar `docs-money/03-dos-and-donts.md` si hay learnings
```

---

## 5. Riesgos residuales post-fix

| Riesgo | Mitigación |
|---|---|
| Logs de aplicación que imprimen el texto por error | Revisar `Logger.*` en cada use case; añadir test que greps logs en CI |
| Backups de DB contienen texto pre-fix | Backup a tabla `pre_fix_1` → eliminar tras 30 días; o cifrar el backup |
| Memoria del proceso (heap dump) puede contener el texto durante la ejecución | No podemos controlar esto en JS; aceptable porque el heap dump no es accesible externamente sin acceso al proceso |
| Cache de Redis (si lo añades después) puede contener texto | No uses Redis para `ExtractionResult`; si lo haces, el cache key debe ser derivado y nunca serializar texto |
| Réplicas de Postgres (read replicas) | El `DROP COLUMN` se replica automáticamente; verificar que las réplicas tampoco tienen la columna |

---

## 6. Verificación post-fix (checklist)

- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name = 'extraction_results'` → no aparece `raw_text`.
- [ ] `SELECT * FROM extraction_results LIMIT 1` → ningún campo contiene texto del KOL (verificar manualmente con un mensaje conocido).
- [ ] `grep -r "rawText" apps/backend/src/` → 0 matches fuera de backups/git history.
- [ ] `grep -r "raw_text" apps/backend/src/` → 0 matches.
- [ ] Suite de tests pasa con el nuevo test `Anti-scraping compliance`.
- [ ] Métrica `extraction_results_with_raw_text_total = 0` durante 7 días.
- [ ] Logs de aplicación (stdout, archivos) no contienen el texto de los KOLs.
- [ ] Backups de DB cifrados o purgados.

---

## 7. Si encuentras texto crudo en más sitios

Otros lugares donde buscar (por si hay más):

```bash
# Buscar texto crudo en TODA la codebase
grep -rn "rawText\|raw_text\|messageText\|text:" apps/backend/src/ \
  --include="*.ts" \
  | grep -v ".spec.ts" \
  | grep -v "test"

# Buscar columnas 'text' en TODAS las entidades TypeORM
grep -rn "@Column.*type.*text\|@Column.*type.*varchar" apps/backend/src/ \
  --include="*.ts" | xargs -I{} echo {}

# Buscar 'text' en eventos del dominio
grep -rn "text" apps/backend/src/*/domain/events/ --include="*.ts"
```

Cualquier hit → evaluar y migrar.

---

## 8. Próximo fix

`fix-2.md` (a crear tras cerrar este) debería atacar:
- In-memory `InMemoryExtractionResultRepository` que pueda tener texto en runtime.
- `kol.message.ingested` event handlers de terceros (si los hay).
- Logs estructurados que puedan contener el texto.

Esto es trabajo en cadena hasta que **ningún path de código pueda llevar texto
del KOL más allá del call stack del extractor**.

---

## 9. UPDATE — Segunda persistencia descubierta (token_calls.raw_text)

> **Importante**: durante la verificación se descubrió que el texto se persiste
> en **DOS tablas**, no una. La cadena de eventos propaga el texto de un BC a otro.

### 9.1 Segunda columna persistida

**Archivo**: `apps/backend/src/token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity.ts:32-33`

```ts
@Column({ name: 'raw_text', type: 'text' })
public rawText!: string;       // ← SEGUNDA columna persistida en Postgres
```

### 9.2 Flujo completo del texto (peor de lo que parecía)

```
KolMessageIngestedEvent ─── text? ──┐
                                    ▼
                  ExtractFromMessageUseCase
                                    │
                                    ├──► ExtractionResult.create({ rawText: text })
                                    │       └──► resultRepo.save()
                                    │             └──► DB: extraction_results.raw_text  ❌ PERSISTE
                                    │
                                    └──► result.emitCandidatesExtracted()
                                            └──► CandidatesExtractedEvent { rawText }  ❌ VIAJA
                                                    │
                                                    ▼
                                      CandidatesExtractedHandler
                                                    │
                                                    └──► ParseFromCandidatesUseCase.execute({ rawText })
                                                            │
                                                            ├──► parser.parse({ rawText })
                                                            │
                                                            └──► TokenCall.create({ rawText })
                                                                    └──► callRepo.save()
                                                                          └──► DB: token_calls.raw_text  ❌ PERSISTE
```

### 9.3 Archivos adicionales a tocar

Para que el fix sea completo, también hay que modificar:

| Archivo | Cambio |
|---|---|
| `apps/backend/src/token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity.ts:32-33` | DROP `@Column raw_text` |
| `apps/backend/src/token/intake/parsing/infrastructure/persistence/typeorm/mappers/token-call.mapper.ts:14,54` | Quitar `row.rawText = c.rawText` y `rawText: row.rawText` |
| `apps/backend/src/token/intake/parsing/domain/entities/token-call.entity.ts:13,44,79,98,110,129-130` | Quitar `rawText` del state, constructor y getter |
| `apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.ts:16,37,43` | No pasar `rawText` al parser ni persistirlo |
| `apps/backend/src/token/intake/parsing/application/mappers/token-call.mapper.ts:11,33` | Quitar `rawText` del view |
| `apps/backend/src/token/intake/parsing/domain/ports/parser.port.ts:11` | Quitar `text` del port (cambiar a no recibir texto o recibir solo lo mínimo) |
| `apps/backend/src/token/intake/parsing/infrastructure/event-bus/candidates-extracted.handler.ts:43` | No pasar `rawText` al use case |
| `apps/backend/src/token/intake/extraction/domain/events/candidates-extracted.event.ts:12,28,45` | Quitar `rawText` del evento |
| `apps/backend/src/token/intake/extraction/application/mappers/extraction-result.mapper.ts:11,33` | Quitar `rawText` del view |
| `apps/backend/src/token/intake/parsing/infrastructure/adapters/heuristic-parser.adapter.ts:54` | El parser ya no debe recibir texto (recibirá structured input) |

### 9.4 Refactor del parser

`ParserPort.parse({ rawText })` es hoy un parser de texto libre. El refactor:

**Opción A** (mínima): cambiar la firma a `ParserPort.parse(candidates)` donde
`candidates` es el output estructurado del extractor (lista de addresses, tickers,
URLs, y un `context` con palabras clave extraídas, NO el texto completo).

**Opción B** (más invasiva): el parser se vuelve un "interpretador de candidatos"
que razona sobre los entities estructurados sin texto. Pierde capacidad de
interpretar el contexto del mensaje.

Recomendación: **Opción A**. Mantén el parser capaz de extraer sentiment/contexto,
pero pásale un `StructuredContext` con:

```ts
interface StructuredContext {
  // Entidades ya extraídas por el regex adapter
  contractAddresses: ReadonlyArray<ContractAddress>;
  tickers: ReadonlyArray<Ticker>;
  urls: ReadonlyArray<Url>;
  // Palabras clave relevantes (no el texto completo)
  keywords: ReadonlyArray<string>;     // ej: ["alpha", "10x", "early"]
  // Mensaje completo solo como flag opcional para audit/debug, NO para lógica
  hasFullText?: never;                  // ← imposible a nivel TS
}
```

### 9.5 Tests adicionales

```ts
// Añadir a apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.spec.ts

it('TokenCall never persists rawText', async () => {
  await useCase.execute({
    kolId: 'k1',
    messageId: 1,
    occurredAt: new Date(),
    rawText: 'SENSITIVE TEXT',
    contractAddresses: [ContractAddress.fromEvm('0xabc...')],
  });

  const stored = await callRepo.findByChannelAndMessage('k1', 1);
  expect(stored).not.toHaveProperty('rawText');
});
```

### 9.6 Verificación final del fix

```bash
# Después de Fase 2+3+9:
grep -rn "rawText\|raw_text" apps/backend/src/ --include="*.ts" \
  | grep -v ".spec.ts" \
  | grep -v "test"
# Esperado: 0 matches
```

---

## 10. Estado del fix

| Fase | Status | Notas |
|---|---|---|
| 1. Purgar data existente | ✅ **No aplica** | DB está vacía (sin tablas), `synchronize=true` aún no se ejecutó |
| 2. Quitar columna TypeORM extraction_results | 🔴 Pendiente | |
| 2b. Quitar columna TypeORM token_calls | 🔴 Pendiente | **descubierto en verificación** |
| 3. Quitar campo del entity de dominio | 🔴 Pendiente | |
| 4. Cambiar contrato de extracción | 🔴 Pendiente | |
| 5. Quitar text del evento upstream + refactor parser | 🔴 Pendiente | |
| 6. Tests de compliance | 🔴 Pendiente | |

**Verificación DB** (completada): `docker exec alpha-meta-token-scanner-postgres
psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "\dt"` →
"Did not find any relations." → DB vacía. El fix es preventivo: el problema se
materializa el primer día que se active `DATABASE_ENABLED=true` con `synchronize=true`
(`apps/backend/src/shared/common/config/app.config.ts:260`).
