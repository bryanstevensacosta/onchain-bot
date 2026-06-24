# fix-1/solution · Eliminar texto crudo del KOL del pipeline

> **Severidad**: 🔴 crítica (ver `problem.md`).
> **Estimación**: 1 sprint de trabajo (5–8 días) con tests.
> **Estado**: solución lista para implementar.
> **Pre-requisito verificado**: DB vacía (no hay datos que purgar, ver `problem.md §10`).

---

## 0. TL;DR de la solución

Eliminar `rawText` de **persistencia + eventos**, pero **mantener el flujo del
texto en el call stack** entre ingestion → extraction → parsing. El parser sigue
recibiendo texto (lo necesita para extraer ticker/name/métricas/chart), pero
ese texto nunca se persiste ni se emite en eventos.

**Cambios resumidos**:
- 2 columnas TypeORM eliminadas (`extraction_results.raw_text`, `token_calls.raw_text`)
- 2 entities de dominio sin `rawText` en su state
- 2 mappers sin `rawText`
- 2 use cases sin `rawText` en sus outputs persistidos
- 2 eventos sin `text`/`rawText` en payload (`KolMessageIngestedEvent`, `CandidatesExtractedEvent`)
- 2 event handlers eliminados (callbacks directos en su lugar)
- 1 parser adapter sin cambios (sigue recibiendo `rawText` en su firma, pero ya no se persiste)
- ~6 specs actualizados + ~3 specs nuevos anti-scraping

---

## 1. Estrategia arquitectónica

### 1.1 Por qué el texto debe seguir fluyendo, pero sin persistir ni emitirse

El parser (`HeuristicParserAdapter`) extrae **info valiosa del texto**:
- Ticker (`$XYZ` o `Ticker: XYZ`)
- Name (`Name: ...`)
- Métricas (MC, LP, FDV, Holders)
- Chart URL

Si eliminamos el texto del pipeline, perdemos estos datos y el sistema colapsa
de valor (un `TokenCall` sin ticker/métricas/chart es inútil para traders).

**Conclusión**: el texto debe fluir **ingestion → extraction → parsing** (en el
call stack), pero nunca debe:
- Escapar del call stack hacia un evento global
- Persistirse en ninguna capa (DB, cache, log)

### 1.2 Cambios arquitectónicos

```
ANTES (problemático):
                                 event bus (in-process)
  StartKolIngestion ─── emit ──► KolMessageIngestedEvent { text }
                                     │
                                     ▼
                          KolMessageIngestedHandler
                                     │
                                     ▼
                          ExtractFromMessageUseCase.execute({ text })
                                     │
                                     ├──► persist ExtractionResult { rawText }
                                     │
                                     └──► emit CandidatesExtractedEvent { rawText }
                                                  │
                                                  ▼
                                       CandidatesExtractedHandler
                                                  │
                                                  ▼
                                       ParseFromCandidatesUseCase.execute({ rawText })
                                                  │
                                                  ├──► ParserPort.parse({ rawText })
                                                  │
                                                  └──► persist TokenCall { rawText }


DESPUÉS (correcto):
                                 event bus (in-process)
  StartKolIngestion ─── emit ──► KolMessageIngestedEvent { } ← SIN text
       │                                                     (observabilidad)
       │
       └──► ExtractFromMessageUseCase.execute({ text })  ← DIRECT CALL
              │
              ├──► persist ExtractionResult { }           ← SIN rawText
              │
              ├──► emit CandidatesExtractedEvent { }      ← SIN rawText
              │                                            (observabilidad)
              │
              └──► ParseFromCandidatesUseCase.execute({ text, candidates })
                     │
                     ├──► ParserPort.parse({ rawText: text })
                     │
                     └──► persist TokenCall { }          ← SIN rawText
```

**Cambios clave**:
- Los eventos siguen existiendo pero SOLO para observabilidad (no llevan texto).
- Las llamadas cross-BC pasan de **event bus → direct call**.
- El texto vive solo en el call stack de la cadena `consumeStream → extract → parse`.

### 1.3 Por qué este approach es compatible con tu arquitectura hexagonal

- **Eventos de observabilidad** siguen emitiéndose → tu sistema de métricas
  (Prometheus, dashboards) sigue funcionando.
- **El puerto del parser** (`ParserPort.parse({rawText})`) NO cambia. La firma
  sigue requiriendo texto. Solo cambia el calling site.
- **El puerto del extractor** (`ExtractorPort.extract({text})`) NO cambia.
- Los **adaptadores** (`RegexBasedExtractorAdapter`, `HeuristicParserAdapter`)
  NO cambian de lógica interna.
- Cambia la **orquestación** (cómo se llaman los use cases entre sí).

---

## 2. Fase A · Eliminar `rawText` de `extraction_results`

### A.1 Archivos afectados

| Archivo | Cambio |
|---|---|
| `apps/backend/src/token/intake/extraction/domain/entities/extraction-result.entity.ts` | Quitar `rawText` del state, constructor, getter, método `emitCandidatesExtracted` |
| `apps/backend/src/token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity.ts` | Quitar `@Column raw_text` |
| `apps/backend/src/token/intake/extraction/infrastructure/persistence/typeorm/mappers/extraction-result.mapper.ts` | Quitar `row.rawText = r.rawText` y `rawText: row.rawText` |
| `apps/backend/src/token/intake/extraction/application/mappers/extraction-result.mapper.ts` | Quitar `rawText` del tipo `ExtractionResultView` y del mapper |
| `apps/backend/src/token/intake/extraction/application/handlers/get-extraction-result.use-case.ts` | Quitar `rawText` del output |
| `apps/backend/src/token/intake/extraction/application/handlers/get-recent-results.use-case.ts` | Quitar `rawText` del output |

### A.2 Diff: `extraction-result.entity.ts`

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

   public static create(input: {
     kolId: string;
     messageId: number;
     occurredAt: Date;
-    rawText: string;
     contractAddresses: ReadonlyArray<ContractAddress>;
     tickers: ReadonlyArray<Ticker>;
     urls: ReadonlyArray<Url>;
   }): ExtractionResult {
     // ... validaciones ...
     return new ExtractionResult({
       id: `${input.kolId}:${input.messageId}`,
       kolId: input.kolId,
       messageId: input.messageId,
       occurredAt: input.occurredAt,
-      rawText: input.rawText,
       contractAddresses: input.contractAddresses,
       tickers: input.tickers,
       urls: input.urls,
     });
   }

   public static rehydrate(input: { /* ... */ }): ExtractionResult {
     // igual: quitar rawText del state
   }

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

### A.3 Diff: TypeORM entity

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
   @Column({ name: 'occurred_at', type: 'timestamptz' })
   public occurredAt!: Date;
-  @Column({ name: 'raw_text', type: 'text' })
-  public rawText!: string;
   @Column({ name: 'contract_addresses', type: 'jsonb' })
   public contractAddresses!: Array<{ value: string; chainHint: 'evm' | 'solana' | 'unknown' }>;
   @Column({ name: 'tickers', type: 'jsonb' })
   public tickers!: string[];
   @Column({ name: 'urls', type: 'jsonb' })
   public urls!: string[];
   @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
   public createdAt!: Date;
 }
```

### A.4 Diff: TypeORM mapper

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

### A.5 Tests que actualizar

```diff
// apps/backend/src/token/intake/extraction/application/handlers/extract-from-message.use-case.spec.ts
- it('persists rawText from input', async () => { ... });
+ it('does NOT persist rawText', async () => { ... });

// apps/backend/src/token/intake/extraction/application/handlers/get-extraction-result.use-case.spec.ts:32
- rawText: 'text',
+ // rawText removed

// apps/backend/src/token/intake/extraction/application/handlers/get-recent-results.use-case.spec.ts:30
- rawText: '',
+ // rawText removed
```

---

## 3. Fase B · Eliminar `rawText` de `token_calls`

### B.1 Archivos afectados

| Archivo | Cambio |
|---|---|
| `apps/backend/src/token/intake/parsing/domain/entities/token-call.entity.ts` | Quitar `rawText` del state, constructor, getter, método `emitCallParsed` |
| `apps/backend/src/token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity.ts` | Quitar `@Column raw_text` |
| `apps/backend/src/token/intake/parsing/infrastructure/persistence/typeorm/mappers/token-call.mapper.ts` | Quitar `row.rawText = c.rawText` y `rawText: row.rawText` |
| `apps/backend/src/token/intake/parsing/application/mappers/token-call.mapper.ts` | Quitar `rawText` del tipo `TokenCallView` |
| `apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.ts` | No usar `rawText` para persistir |
| `apps/backend/src/token/intake/parsing/infrastructure/adapters/heuristic-parser.adapter.ts` | **NO CAMBIA** (sigue extrayendo del texto) |

### B.2 Diff: `token-call.entity.ts`

```diff
 export class TokenCall {
   private readonly state: {
     readonly id: string;
     readonly kolId: string;
     readonly messageId: number;
     readonly occurredAt: Date;
-    readonly rawText: string;
     readonly contractAddresses: ReadonlyArray<ContractAddress>;
     // ... resto igual
   };

   public static create(input: { /* ... */ }): TokenCall {
     // ... validaciones ...
     return new TokenCall({
       id: `${input.kolId}:${input.messageId}:${caHash}`,
       // ...
-      rawText: input.rawText,
       // ...
     });
   }

-  public get rawText(): string {
-    return this.state.rawText;
-  }

   public emitCallParsed(): CallParsedEvent {
     return new CallParsedEvent({
       // ... todos los campos EXCEPTO rawText
     });
   }
 }
```

### B.3 Diff: TypeORM entity

```diff
 @Entity({ name: 'token_calls' })
 export class TokenCallEntity {
   // ...
-  @Column({ name: 'raw_text', type: 'text' })
-  public rawText!: string;
   @Column({ name: 'contract', type: 'jsonb' })
   public contract!: { value: string; chainHint: 'evm' | 'solana' | 'unknown' };
   // ... resto igual
 }
```

### B.4 Tests que actualizar

```diff
// apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.spec.ts
- it('persists rawText', async () => { ... });
+ it('does NOT persist rawText', async () => { ... });

// apps/backend/src/token/intake/parsing/infrastructure/event-bus/candidates-extracted.handler.spec.ts (ELIMINADO — ver Fase C)
```

---

## 4. Fase C · Eliminar `text`/`rawText` de eventos + cambiar a direct calls

### C.1 Cambios

1. `KolMessageIngestedEvent` → quitar `text` del payload.
2. `CandidatesExtractedEvent` → quitar `rawText` del payload.
3. `KolMessageIngestedHandler` → **eliminar** (su única función era pasar text).
4. `CandidatesExtractedHandler` → **eliminar**.
5. `StartKolIngestionUseCase` → llamar `ExtractFromMessageUseCase` directamente.
6. `ExtractFromMessageUseCase` → llamar `ParseFromCandidatesUseCase` directamente.
7. `ParseFromCandidatesUseCase` → recibir `text` en su `execute()` input (no en evento).

### C.2 Diff: `KolMessageIngestedEvent`

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

### C.3 Diff: `CandidatesExtractedEvent`

```diff
 export class CandidatesExtractedEvent extends DomainEvent {
   public readonly payload: {
     readonly id: string;
     readonly kolId: string;
     readonly messageId: number;
     readonly occurredAt: Date;
-    readonly rawText: string;
     readonly contractAddresses: ReadonlyArray<{ value: string; chainHint: 'evm' | 'solana' | 'unknown' }>;
     readonly tickers: ReadonlyArray<string>;
     readonly urls: ReadonlyArray<string>;
   };

   // ... constructor igual pero SIN rawText en payload type
   // ... toPayload() SIN rawText
 }
```

### C.4 Diff: `StartKolIngestionUseCase`

```diff
 @Injectable()
 export class StartKolIngestionUseCase {
   constructor(
     private readonly kolRepo: KolRepository,
     private readonly listener: KolListenerPort,
     private readonly eventPublisher: KolEventPublisher,
+    private readonly extractFromMessage: ExtractFromMessageUseCase,
   ) {}

   private async consumeStream(kolIds: string[]): Promise<void> {
     try {
       for await (const raw of this.listener.subscribe(kolIds)) {
         const kolId = KolId.fromString(raw.kolId);
         const kol = await this.kolRepo.findById(kolId);
         if (!kol) continue;

-        kol.recordMessageIngested(raw.messageId, raw.occurredAt, raw.text);
-        await this.kolRepo.save(kol);
-        await this.eventPublisher.publishAll(kol.commit());
+        // Update KOL metadata (lastIngestedAt)
+        kol.recordMessageIngested(raw.messageId, raw.occurredAt);
+        await this.kolRepo.save(kol);
+        await this.eventPublisher.publishAll(kol.commit());
+
+        // ✅ Direct call to extraction — text stays in call stack
+        await this.extractFromMessage.execute({
+          kolId: raw.kolId,
+          messageId: raw.messageId,
+          occurredAt: raw.occurredAt,
+          text: raw.text,  // ← lives only in this scope
+        });
       }
     } catch (err) {
       throw err;
     }
   }

   public async backfillKol(
     kolId: string,
     limit: number,
   ): Promise<{ ingested: number; total: number }> {
     const id = KolId.fromString(kolId);
     const kol = await this.kolRepo.findById(id);
     if (!kol) return { ingested: 0, total: 0 };

     const messages = await this.listener.backfill(kolId, limit);
     let ingested = 0;
     for (const raw of messages) {
-      kol.recordMessageIngested(raw.messageId, raw.occurredAt, raw.text);
-      await this.kolRepo.save(kol);
-      await this.eventPublisher.publishAll(kol.commit());
+      kol.recordMessageIngested(raw.messageId, raw.occurredAt);
+      await this.kolRepo.save(kol);
+      await this.eventPublisher.publishAll(kol.commit());
+
+      await this.extractFromMessage.execute({
+        kolId: raw.kolId,
+        messageId: raw.messageId,
+        occurredAt: raw.occurredAt,
+        text: raw.text,
+      });
       ingested += 1;
     }
     return { ingested, total: messages.length };
   }
 }
```

### C.5 Diff: `Kol.recordMessageIngested`

```diff
- public recordMessageIngested(
-   messageId: number,
-   occurredAt: Date,
-   text?: string,
- ): void {
+ public recordMessageIngested(
+   messageId: number,
+   occurredAt: Date,
+ ): void {
   this.state.lastIngestedAt = occurredAt;
   this.apply(
     new KolMessageIngestedEvent({
       kolId: this.state.id.value,
       handle: this.state.handle?.value ?? null,
       messageId,
       occurredAt,
-      text,
     }),
   );
 }
```

### C.6 Diff: `ExtractFromMessageUseCase`

```diff
 export interface ExtractFromMessageInput {
   readonly kolId: string;
   readonly messageId: number;
   readonly occurredAt: Date;
   readonly text: string;  // ← lives only during execute()
 }

 @Injectable()
 export class ExtractFromMessageUseCase {
   public constructor(
     private readonly extractor: ExtractorPort,
     private readonly resultRepo: ExtractionResultRepository,
     private readonly eventPublisher: ExtractionEventPublisher,
+    private readonly parseFromCandidates: ParseFromCandidatesUseCase,
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

+    // ✅ Direct call to parsing — text still in scope
+    if (result.contractAddresses.length > 0) {
+      await this.parseFromCandidates.execute({
+        kolId: input.kolId,
+        messageId: input.messageId,
+        occurredAt: input.occurredAt,
+        text: input.text,        // ← still in call stack
+        contractAddresses: [...result.contractAddresses],
+      });
+    }

-    return ExtractionResultMapper.toView(result);
+    return ExtractionResultMapper.toView(result);
   }
 }
```

### C.7 Diff: `ParseFromCandidatesUseCase`

```diff
 export interface ParseFromCandidatesInput {
   readonly kolId: string;
   readonly messageId: number;
   readonly occurredAt: Date;
   readonly text: string;  // ← still required by parser
   readonly contractAddresses: ReadonlyArray<ContractAddress>;
 }

 @Injectable()
 export class ParseFromCandidatesUseCase {
   public constructor(
     private readonly parser: ParserPort,
     private readonly callRepo: TokenCallRepository,
     private readonly eventPublisher: ParsingEventPublisher,
   ) {}

   public async execute(
     input: ParseFromCandidatesInput,
   ): Promise<TokenCallView> {
     const parsed = await this.parser.parse({ rawText: input.text });

     const call = TokenCall.create({
       kolId: input.kolId,
       messageId: input.messageId,
       occurredAt: input.occurredAt,
-      rawText: input.text,
       contractAddresses: input.contractAddresses,
       ticker: parsed.ticker,
       name: parsed.name,
       metrics: parsed.metrics,
       chart: parsed.chart,
     });

     await this.callRepo.save(call);
     call.emitCallParsed();
     await this.eventPublisher.publishAll(call.commit());

     return TokenCallMapper.toView(call);
   }
 }
```

### C.8 Eliminar handlers

**Borrar estos archivos**:
- `apps/backend/src/token/intake/extraction/infrastructure/event-bus/kol-message-ingested.handler.ts`
- `apps/backend/src/token/intake/extraction/infrastructure/event-bus/kol-message-ingested.handler.spec.ts`
- `apps/backend/src/token/intake/parsing/infrastructure/event-bus/candidates-extracted.handler.ts`
- `apps/backend/src/token/intake/parsing/infrastructure/event-bus/candidates-extracted.handler.spec.ts`

**Actualizar wiring** en:
- `apps/backend/src/token/intake/extraction/extraction.module.ts`
- `apps/backend/src/token/intake/parsing/parsing.module.ts`

Quitar las referencias a los handlers eliminados.

---

## 5. Fase D · Actualizar el parser adapter (no requiere cambio de lógica)

El `HeuristicParserAdapter.parse({rawText})` **no cambia su lógica interna** —
sigue aplicando regex sobre el texto. Solo cambia su calling site (ahora desde
`ExtractFromMessageUseCase` directamente, no vía evento).

Si en el futuro quieres reducir dependencia del texto en el parser:
- Versión v2 podría operar solo sobre las entities estructuradas (candidates)
  + keywords extraídos.
- Pero esa es una evolución futura, no parte de fix-1.

---

## 6. Fase E · Tests de compliance (NUEVOS)

Añadir tests que aseguren el invariante: **ningún path de código puede llevar
texto del KOL más allá del call stack del extractor**.

### E.1 Test unitario: extracción no persiste rawText

```ts
// apps/backend/src/token/intake/extraction/application/handlers/extract-from-message.use-case.spec.ts

describe('Anti-scraping compliance', () => {
  it('ExtractionResult never persists rawText', async () => {
    const SENSITIVE = 'SENSITIVE TEXT FROM KOL — PEPE 0xabc...';

    await useCase.execute({
      kolId: 'k1',
      messageId: 1,
      occurredAt: new Date(),
      text: SENSITIVE,
    });

    const stored = await resultRepo.findByChannelAndMessage('k1', 1);
    expect(stored).not.toHaveProperty('rawText');
    expect(JSON.stringify(stored)).not.toContain('SENSITIVE');
  });

  it('CandidatesExtractedEvent never carries rawText', async () => {
    const SENSITIVE = 'SENSITIVE';
    const events: DomainEvent[] = [];
    // capture events...

    await useCase.execute({
      kolId: 'k1',
      messageId: 2,
      occurredAt: new Date(),
      text: SENSITIVE,
    });

    events.forEach((e) => {
      expect(JSON.stringify(e.toPayload())).not.toContain('SENSITIVE');
    });
  });
});
```

### E.2 Test unitario: parsing no persiste rawText

```ts
// apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.spec.ts

describe('Anti-scraping compliance', () => {
  it('TokenCall never persists rawText', async () => {
    const SENSITIVE = 'SENSITIVE TEXT';
    const ca = ContractAddress.fromEvm('0xabc...');

    await useCase.execute({
      kolId: 'k1',
      messageId: 1,
      occurredAt: new Date(),
      rawText: SENSITIVE,  // legacy param name kept for now (see Fase G)
      contractAddresses: [ca],
    });

    const stored = await callRepo.findByChannelAndMessage('k1', 1);
    expect(stored).not.toHaveProperty('rawText');
    expect(JSON.stringify(stored)).not.toContain('SENSITIVE');
  });
});
```

### E.3 Test de integración: Postgres no tiene columnas raw_text

```ts
// apps/backend/test/integration/postgres-schema-compliance.spec.ts (nuevo)

describe('Postgres schema compliance', () => {
  it('extraction_results has no raw_text column', async () => {
    const ds = app.get(DataSource);
    const cols = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'extraction_results'`,
    );
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain('raw_text');
  });

  it('token_calls has no raw_text column', async () => {
    const ds = app.get(DataSource);
    const cols = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'token_calls'`,
    );
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain('raw_text');
  });
});
```

### E.4 Test: eventos sin text

```ts
// apps/backend/src/kol/ingestion/domain/events/kol-message-ingested.event.spec.ts (nuevo)

describe('KolMessageIngestedEvent compliance', () => {
  it('payload does not contain text', () => {
    const event = new KolMessageIngestedEvent({
      kolId: 'k1',
      handle: '@kol',
      messageId: 1,
      occurredAt: new Date(),
    });

    expect(event.payload).not.toHaveProperty('text');
    expect(JSON.stringify(event.toPayload())).not.toContain('text');
  });
});

// apps/backend/src/token/intake/extraction/domain/events/candidates-extracted.event.spec.ts (nuevo)

describe('CandidatesExtractedEvent compliance', () => {
  it('payload does not contain rawText', () => {
    const event = new CandidatesExtractedEvent({
      id: 'k1:1',
      kolId: 'k1',
      messageId: 1,
      occurredAt: new Date(),
      contractAddresses: [],
      tickers: [],
      urls: [],
    });

    expect(event.payload).not.toHaveProperty('rawText');
    expect(JSON.stringify(event.toPayload())).not.toContain('rawText');
  });
});
```

### E.5 Test E2E: flujo completo no filtra texto

```ts
// apps/backend/test/e2e/pipeline-no-text-leak.spec.ts (nuevo)

describe('Pipeline E2E no-text-leak', () => {
  it('text from KOL never reaches any persistence or event payload', async () => {
    const SENSITIVE = 'TOP SECRET KOL MESSAGE — $XYZ 0xaaa...';
    const messages = [{
      kolId: 'k1',
      messageId: 1,
      text: SENSITIVE,
      occurredAt: new Date(),
    }];

    // Mock the listener
    jest.spyOn(listener, 'subscribe').mockReturnValue(
      (async function* () { for (const m of messages) yield m; })(),
    );

    // Capture ALL events emitted by the system
    const capturedEvents: DomainEvent[] = [];
    eventBus.onAny((event: DomainEvent) => capturedEvents.push(event));

    // Run the pipeline
    await startKolIngestion.execute({ kolIds: ['k1'] });
    await new Promise((r) => setTimeout(r, 100)); // wait for async

    // Assert no captured event contains SENSITIVE
    capturedEvents.forEach((e) => {
      const payloadStr = JSON.stringify(e.toPayload());
      expect(payloadStr).not.toContain('SENSITIVE');
    });

    // Assert no persisted entity contains SENSITIVE
    const extraction = await extractionRepo.findByChannelAndMessage('k1', 1);
    expect(JSON.stringify(extraction)).not.toContain('SENSITIVE');

    const calls = await callRepo.findByChannelAndMessage('k1', 1);
    if (calls) {
      expect(JSON.stringify(calls)).not.toContain('SENSITIVE');
    }
  });
});
```

---

## 7. Fase F · Métricas y alertas

Añadir a `apps/backend/src/shared/observability/`:

```ts
// Métrica que SIEMPRE debe ser 0
export const rawTextLeakCounter = new Counter({
  name: 'alpha_meta_raw_text_leak_total',
  help: 'Should always be 0. Non-zero means raw text leaked into persistence or event payload.',
  registers: [promRegistry],
});

// Hook en los puntos críticos (defensive programming)
function assertNoRawText(label: string, obj: unknown): void {
  const str = JSON.stringify(obj);
  // Heurística: si el string contiene "0x" + 40 hex chars, probablemente es un CA extraído, no texto
  // Si contiene palabras comunes en mensajes de KOL, probablemente es texto crudo.
  const suspiciousPatterns = [
    /\balpha\b/i,
    /\bcall\b/i,
    /\b10x\b/i,
    /\bentry\b/i,
    /\bchart\b/i,
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(str)) {
      rawTextLeakCounter.inc();
      logger.error(`RAW TEXT LEAK DETECTED at ${label}: ${str.substring(0, 200)}`);
      throw new Error(`Compliance violation: raw text in ${label}`);
    }
  }
}
```

Llamar `assertNoRawText('extraction-result-save', result)` antes de cada
`resultRepo.save()`.

---

## 8. Fase G · Plan de deploy

### Día 1 (mañana) — Migration + entity changes

```bash
# 1. Branch + commit los cambios de Fase A+B (entity changes)
git checkout -b fix-1/no-raw-text
# ... aplicar cambios Fase A+B ...

# 2. Correr tests
npm run test:backend -- --testPathPattern="token/intake/(extraction|parsing)"

# 3. Si pasan, mergear a main + deploy a staging
```

### Día 1 (tarde) — Fase C (event handlers → direct calls)

```bash
# 1. Aplicar cambios de Fase C
# 2. Correr tests
npm run test:backend
npm run test:e2e

# 3. Verificar manualmente
DATABASE_ENABLED=true npm run dev:backend
# Trigger un ingestion manual, verificar que:
# - DB no tiene raw_text
# - Eventos emitidos no contienen texto
```

### Día 2 — Fase D+E (tests de compliance)

```bash
# 1. Añadir tests de compliance (Fase E)
# 2. Verificar que pasan en CI
npm run test:backend
npm run test:integration
npm run test:e2e

# 3. Deploy a staging
```

### Día 3 — Producción

```bash
# 1. Backup antes del deploy
pg_dump alpha_meta_token_scanner > pre_fix_1_$(date +%Y%m%d).sql

# 2. Deploy
git pull origin main
npm install
npm run build
npm run docker:down
npm run docker:up
npm run migration:run  # si tienes migraciones, o synchronize se encarga
npm run start:prod

# 3. Smoke test
curl -X POST http://localhost:3030/ca/kol-ingestion/start \
  -H "Content-Type: application/json" \
  -d '{"kolIds":["test-kol-1"]}'
# Esperar 10s, verificar DB:
docker exec alpha-meta-token-scanner-postgres psql ... \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='token_calls'"
# Confirmar: NO aparece 'raw_text'

# 4. Monitorear métrica durante 7 días
watch -n 60 'curl http://localhost:3030/metrics | grep raw_text_leak'
# Debe ser 0 siempre.
```

---

## 9. Verificación post-fix

```bash
# 1. Schema check
docker exec alpha-meta-token-scanner-postgres psql -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner -c "
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_name IN ('extraction_results', 'token_calls')
      AND column_name LIKE '%text%' OR column_name LIKE '%raw%';
  "
# Esperado: 0 filas.

# 2. Source check
grep -rn "rawText\|raw_text" apps/backend/src/ --include="*.ts" \
  | grep -v ".spec.ts"
# Esperado: 0 matches.

# 3. Event check
grep -rn "text?:" apps/backend/src/*/domain/events/ --include="*.ts"
# Esperado: 0 matches.

# 4. Test suite
npm run test:backend
npm run test:e2e
# Todos pasan.

# 5. Métricas
curl http://localhost:3030/metrics | grep alpha_meta_raw_text_leak_total
# Esperado: 0.
```

---

## 10. Rollback plan

Si en producción algo se rompe:

### Opción A: Rollback completo del fix

```bash
git revert <commit-hash-fix-1>
npm run build
npm run docker:restart
```

⚠️ Esto **revive el bug del raw_text**. Solo hacerlo si el nuevo código tiene
bugs críticos.

### Opción B: Rollback quirúrgico de un solo cambio

Si solo Fase C (direct calls) causa problemas (e.g., circular dependency
inesperada):

```bash
# Restaurar solo Fase C: volver a event-driven
git revert <commit-fase-c>
npm run build
```

Esto deja Fase A+B (sin rawText en DB) pero restaura el flujo event-driven.
El texto volvería a estar en eventos, lo cual es peor que el estado actual
post-fix, pero permite investigar.

### Opción C: Rollback de DB migration

Si la DB se actualizó con `synchronize=true` y la columna `raw_text` se eliminó,
pero hay queries en runtime que la esperan:

```sql
-- Añadir la columna de vuelta como nullable
ALTER TABLE extraction_results ADD COLUMN raw_text TEXT;
ALTER TABLE token_calls ADD COLUMN raw_text TEXT;
```

⚠️ No la rellenes con datos (no tenemos). Solo déjala null.

---

## 11. Riesgos residuales post-fix

| Riesgo | Mitigación |
|---|---|
| Logs de aplicación imprimen texto por error | Code review + test que greps stdout/stderr |
| Backups de DB con datos pre-fix | Los backups pre-fix están vacíos (DB nunca tuvo datos, ver `problem.md §10`); para futuros, cifrar o purgar backups antiguos |
| Heap dump contiene texto en runtime | Aceptable — heap dump no es accesible sin acceso al proceso |
| Cache Redis (futuro) podría serializar texto | Documentar: "no uses Redis para entidades que puedan contener texto crudo" |
| Read replicas de Postgres | `DROP COLUMN` se replica automáticamente; verificar réplicas no tienen la columna |
| Un developer añade `text: string` a un nuevo event en el futuro | Code review checklist + grep en CI: `grep -rn "rawText\|raw_text\|text:" apps/backend/src/*/domain/events/` debe ser 0 |
| El parser se rompe si el texto está vacío | Tests deben cubrir el caso `text: ''` → parser devuelve `ticker: null, name: null, metrics: empty` |

---

## 12. Próximo paso

1. Code review del equipo de los diffs de Fase A–C.
2. Merge a `main`.
3. Deploy a staging → smoke test → deploy a producción.
4. Monitorear `alpha_meta_raw_text_leak_total` durante 7 días.
5. Si 0 → cerrar fix-1 → renombrar carpeta `fix-1/` → `fix-no-raw-text/`.
6. Iniciar `fix-2.md` (logs + observabilidad).
7. Volver a `04-architecture-gaps.md` Fase 0 y continuar el roadmap.
