# bot-api-crypto-news-publisher-decompose - Work Plan

## TL;DR (For humans)

**What you'll get:** El archivo `bot-api-crypto-news-publisher.adapter.ts` pasa de 687 líneas a ~100 — se divide en 4 archivos más pequeños y enfocados. El adaptador principal queda como una fachada delgada que compone servicios especializados.

**Why this approach:** Mismo patrón probado en mtproto-adapter (794→346 líneas, 7 módulos). Extracción gradual y atómica — cada fase es un paso reversible sin cambio de comportamiento.

**What it will NOT do:** No cambia `TelegramPublisherPort`, no cambia firmas de métodos públicos, no modifica tests existentes, no altera la lógica de negocio.

**Effort:** Medium
**Risk:** Low — los módulos extraídos son puramente mecánicos (mover código, no reescribir). El archivo ya exporta 2 funciones puras, lo que facilita la extracción.
**Decisions to sanity-check:** 1) `BotApiHttpClient` como clase simple (no @Injectable) — mismos argumentos que el adapter, sin DI. 2) `guessMimeType` y `buildMultipartBody` como funciones exportadas (no clase).

---

> TL;DR (machine): Medium effort, Low risk — 5 extraction todos + 1 rewire + 1 verify. 687→~100 loc for adapter. 4 new files. 0 new @Injectable (pure functions + plain class).

## Scope

### Must have

- Extract `buildMultipartBody` + `buildMediaGroupMultipartBody` → `build-multipart-body.ts`
- Extract `guessMimeType` → `guess-mime-type.ts`
- Extract `postJson`, `postMultipart`, `postMultipartMediaGroup` → `bot-api-http-client.ts`
- Extract file-reading helpers (readFileWithValidation, readMultipleFilesWithValidation) → `telegram-file-utils.ts`
- Rewire adapter + verify module registration unchanged
- ESLint + tsc + tests must pass

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No changes to `TelegramPublisherPort` / `SendResult`
- No changes to existing test file (`bot-api-crypto-news-publisher.adapter.spec.ts`)
- No changes to public method signatures (`sendMessage`, `sendPhoto`, `sendVideo`, `sendMediaGroup`, `getChat`)
- No changes to `CryptoNewsPublisherModule` providers — the adapter is already registered as `TelegramPublisherPort`, and extracted modules are plain classes/functions (no new @Injectable needed)
- No behavior changes — extract, don't refactor
- No new dependencies

## File map (senders directory)

Before:

```
senders/
├── bot-api-crypto-news-publisher.adapter.ts   (687L)
└── bot-api-crypto-news-publisher.adapter.spec.ts (61L)
```

After:

```
senders/
├── bot-api-crypto-news-publisher.adapter.ts   (~100L) — facade
├── bot-api-crypto-news-publisher.adapter.spec.ts (61L) — unchanged
├── bot-api-http-client.ts                     (~190L) — postJson, postMultipart, postMultipartMediaGroup
├── build-multipart-body.ts                    (~80L)  — buildMultipartBody, buildMediaGroupMultipartBody
├── guess-mime-type.ts                         (~25L)  — guessMimeType
└── telegram-file-utils.ts                     (~60L)  — readFileWithValidation, readMultipleFilesWithValidation
```

## Verification strategy

> Zero human intervention — all verification is agent-executed.

- Test decision: tests-after — existing test suite + ESLint + tsc --noEmit
- Evidence: `.omo/evidence/bot-api-crypto-news-publisher-decompose/`

## Execution strategy

### Todos (sequential — each builds on previous)

| #   | Todo                       | What                                                           | File                                       |
| --- | -------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| T1  | Extract multipart builders | Move `buildMultipartBody`, `buildMediaGroupMultipartBody`      | `build-multipart-body.ts`                  |
| T2  | Extract MIME guesser       | Move `guessMimeType`                                           | `guess-mime-type.ts`                       |
| T3  | Extract file utils         | Extract file-reading/validation helpers                        | `telegram-file-utils.ts`                   |
| T4  | Extract HTTP client        | Extract `postJson`, `postMultipart`, `postMultipartMediaGroup` | `bot-api-http-client.ts`                   |
| T5  | Rewire adapter             | Compose extracted modules, keep thin facade                    | `bot-api-crypto-news-publisher.adapter.ts` |
| T6  | Final verification         | ESLint 0, tsc 0, tests pass                                    | —                                          |

### Dependency matrix

| Todo | Depends on | Blocks | Notes                          |
| ---- | ---------- | ------ | ------------------------------ |
| T1   | —          | T5     | Pure functions, zero deps      |
| T2   | —          | T5     | Pure function, zero deps       |
| T3   | —          | T5     | Pure functions, zero deps      |
| T4   | —          | T5     | Standalone class               |
| T5   | T1-T4      | T6     | Rewire depends on all extracts |
| T6   | T5         | —      | Final gate                     |

All extracts are independent — they could run in parallel. But sequential is simpler and still fast since each is a small extraction.

## Todos

- [ ] 1. **Extract multipart builders to `build-multipart-body.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/build-multipart-body.ts` and MOVE:
     - `buildMultipartBody` function (currently lines 590-624)
     - `buildMediaGroupMultipartBody` function (currently lines 626-664)

     Both functions are already exported — this is a pure file move:

     ```typescript
     // build-multipart-body.ts
     export function buildMultipartBody(
       boundary: string,
       textFields: ReadonlyArray<readonly [string, string]>,
       file: {
         fieldName: string;
         fileName: string;
         mimeType: string;
         bytes: Buffer;
       },
     ): Buffer {
       /* same body */
     }

     export function buildMediaGroupMultipartBody(
       boundary: string,
       textFields: ReadonlyArray<readonly [string, string]>,
       files: ReadonlyArray<{
         fieldName: string;
         fileName: string;
         mimeType: string;
         bytes: Buffer;
       }>,
     ): Buffer {
       /* same body */
     }
     ```

     In the adapter file, DELETE both functions and REPLACE with:

     ```typescript
     import {
       buildMultipartBody,
       buildMediaGroupMultipartBody,
     } from './build-multipart-body';
     ```

     Must NOT: Change function signatures, body, or behavior.
     Must NOT: Add any imports the functions don't need (they use `Buffer` from Node — no imports needed).

     References: adapter.ts:590-664
     Acceptance criteria: `tsc --noEmit` succeeds, adapter still works
     QA: `grep -n 'buildMultipartBody\|buildMediaGroupMultipartBody' adapter.ts` — 0 definitions, 3 references (import + 2 call sites)

- [ ] 2. **Extract MIME guesser to `guess-mime-type.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/guess-mime-type.ts` and MOVE:
     - `guessMimeType` function (currently lines 672-687)

     The function is currently module-internal (no `export`). Export it:

     ```typescript
     // guess-mime-type.ts
     export function guessMimeType(ext: string): string {
       const normalized = ext.toLowerCase();
       switch (normalized) {
         case '.jpg':
         case '.jpeg':
           return 'image/jpeg';
         case '.png':
           return 'image/png';
         case '.gif':
           return 'image/gif';
         case '.webp':
           return 'image/webp';
         default:
           return 'application/octet-stream';
       }
     }
     ```

     In the adapter file, DELETE the function and ADD import:

     ```typescript
     import { guessMimeType } from './guess-mime-type';
     ```

     Must NOT: Change the MIME mapping dictionary.

     References: adapter.ts:666-687
     Acceptance criteria: `tsc --noEmit` succeeds
     QA: `grep -n 'function guessMimeType' adapter.ts` — 0 matches

- [ ] 3. **Extract file utils to `telegram-file-utils.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/telegram-file-utils.ts` with:

     ```typescript
     import { existsSync, readFileSync, statSync } from 'node:fs';
     import type { Logger } from '@nestjs/common';

     export interface FileReadResult {
       bytes: Buffer;
       error?: string;
     }

     /**
      * Read a single file from disk. Inlines the exact validation + error
      * handling from the adapter's sendPhoto/sendVideo/sendMediaGroup.
      *
      * Returns { bytes, error? } — callers check `error` and propagate.
      */
     export function readFileWithValidation(
       filePath: string,
       logger: Logger,
       label: string,
     ): FileReadResult {
       try {
         const stats = statSync(filePath);
         if (!stats.isFile()) {
           return { bytes: Buffer.alloc(0), error: `not a file: ${filePath}` };
         }
         const bytes = readFileSync(filePath);
         return { bytes };
       } catch (err) {
         const message = err instanceof Error ? err.message : 'unknown error';
         logger.error(`failed to read ${label} at ${filePath}: ${message}`);
         return { bytes: Buffer.alloc(0), error: message };
       }
     }

     /**
      * Read multiple files from disk. Returns all on success or the first
      * error. Mirrors the exact error-handling from sendMediaGroup.
      */
     export function readMultipleFilesWithValidation(
       filePaths: string[],
       logger: Logger,
       label: string,
     ): { bytesArray: Buffer[]; error?: string } {
       const bytesArray: Buffer[] = [];
       for (const filePath of filePaths) {
         if (!existsSync(filePath)) {
           return { bytesArray: [], error: `file not found: ${filePath}` };
         }
         try {
           const stats = statSync(filePath);
           if (!stats.isFile()) {
             return {
               bytesArray: [],
               error: `not a file: ${filePath}`,
             };
           }
           bytesArray.push(readFileSync(filePath));
         } catch (err) {
           const message = err instanceof Error ? err.message : 'unknown error';
           logger.error(`failed to read ${label} at ${filePath}: ${message}`);
           return { bytesArray: [], error: message };
         }
       }
       return { bytesArray };
     }
     ```

     In the adapter, REPLACE all inline file-reading blocks:
     - `sendPhoto` lines 136-151 → `readFileWithValidation(imagePath, this.logger, 'photo')`
     - `sendVideo` lines 196-211 → `readFileWithValidation(videoPath, this.logger, 'video')`
     - `sendMediaGroup` lines 260-287 → `readMultipleFilesWithValidation(imagePaths, this.logger, 'image')`
     - Remove `import { existsSync, readFileSync, statSync } from 'node:fs'` from adapter

     Must NOT: Change error messages format or logging behavior.
     Must NOT: Add the `Logger` as a parameter to functions — the caller's logger is passed in.

     References: adapter.ts:136-151, :196-211, :260-287
     Acceptance criteria: All file-reading goes through helper functions
     QA: `grep -n 'statSync\|readFileSync\|existsSync' adapter.ts` — 0 matches

- [ ] 4. **Extract HTTP client to `bot-api-http-client.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-http-client.ts` with:

     ```typescript
     import { Logger } from '@nestjs/common';
     import { request as httpsRequest } from 'node:https';
     import type { SendResult } from 'telegram/shared';

     export class BotApiHttpClient {
       constructor(
         private readonly logger: Logger,
         private readonly apiBase: string,
         private readonly botToken: string,
         private readonly outputChannel: string,
       ) {}

       async postJson(method: string, payload: Record<string, unknown>): Promise<SendResult> { ... }
       async postMultipart(method: string, boundary: string, body: Buffer): Promise<SendResult> { ... }
       async postMultipartMediaGroup(method: string, boundary: string, body: Buffer): Promise<SendResult> { ... }
     }
     ```

     Move the 3 private HTTP methods from the adapter:
     - `postJson` (lines 452-512)
     - `postMultipart` (lines 514-582)
     - `postMultipartMediaGroup` (lines 335-406)
       - NOTE: move `postMultipartMediaGroup` BEFORE `postJson` since it's called by `sendMediaGroup` which is after `sendVideo`

     The adapter currently uses `this.postJson(...)`, `this.postMultipart(...)`, `this.postMultipartMediaGroup(...)`.

     In the adapter, after extraction:

     ```typescript
     private readonly httpClient = new BotApiHttpClient(
       this.logger,
       BotApiCryptoNewsPublisherAdapter.API_BASE,
       this.botToken,
       this.outputChannel,
     );
     ```

     Replace all `this.postJson(...)` → `this.httpClient.postJson(...)`, etc.

     Must NOT: Change HTTP request logic or URL construction.
     Must NOT: Make `BotApiHttpClient` an `@Injectable()` — it's composed, not injected.
     Must NOT: Include `requireConfig()` validation (stays in adapter).

     Remove `import { request as httpsRequest } from 'node:https'` from adapter.

     References: adapter.ts:335-406, :452-582
     Acceptance criteria: All 3 HTTP helpers moved, adapter delegates to `httpClient`
     QA: `grep -n 'postJson\|postMultipart' adapter.ts` — 0 definitions, 4 references (import + 3 call sites)

- [ ] 5. **Rewire adapter**
     What to do / Must NOT do:
     After all T1-T4 are done, transform the adapter into a thin facade:

     1. Remove moved code:
        - `buildMultipartBody` function ✓ (T1)
        - `buildMediaGroupMultipartBody` function ✓ (T1)
        - `guessMimeType` function ✓ (T2)
        - `readFileWithValidation` usage replaces inline file reads ✓ (T3)
        - `postJson`, `postMultipart`, `postMultipartMediaGroup` methods ✓ (T4)

     2. Remove imports no longer needed:
        - `import { existsSync, readFileSync, statSync } from 'node:fs'` ✓ (moved to telegram-file-utils)
        - `import { request as httpsRequest } from 'node:https'` ✓ (moved to bot-api-http-client)
        - `import { basename, extname } from 'node:path'` ✓ (moved to build-multipart-body and guess-mime-type... actually `basename` is used inline in sendPhoto/sendVideo/sendMediaGroup for filename. Check: after T3, `basename` is still used in sendMediaGroup lines 298-328 for constructing the mediaArray with attach:// filenames. Keep `basename` import if used directly.)

        Actually, let me re-check. `basename` is used in:
        - `sendPhoto` line 164: `const fileName = basename(imagePath);`
        - `sendVideo` line 224: `const fileName = basename(videoPath);`
        - `sendMediaGroup` line 325: `fileName: basename(imagePaths[index]),`

        After T3 extracts file reading but `basename` is still needed for the filename in multipart construction. So keep `import { basename, extname } from 'node:path'` — but `extname` is only used for `guessMimeType(extname(...))`. After T2, `extname` calls stay in the adapter since `sendPhoto`, `sendVideo`, `sendMediaGroup` pass `extname(videoPath)` to `guessMimeType()`.

        Final adapter imports:

        ```typescript
        import { Injectable, Logger } from '@nestjs/common';
        import { ConfigService } from '@nestjs/config';
        import {
          TelegramPublisherPort,
          type SendResult,
        } from 'telegram/shared';
        import { formatUrlsAsMarkdown } from 'shared/common/utils/telegram-url-formatter';
        import { basename, extname } from 'node:path';
        import { guessMimeType } from './guess-mime-type';
        import {
          buildMultipartBody,
          buildMediaGroupMultipartBody,
        } from './build-multipart-body';
        import {
          readFileWithValidation,
          readMultipleFilesWithValidation,
        } from './telegram-file-utils';
        import { BotApiHttpClient } from './bot-api-http-client';
        ```

     3. Constructor stays the same (reads config from ConfigService).

     4. Add httpClient field:

        ```typescript
        private readonly httpClient = new BotApiHttpClient(
          this.logger,
          BotApiCryptoNewsPublisherAdapter.API_BASE,
          this.botToken,
          this.outputChannel,
        );
        ```

     5. `sendMessage` — stays mostly same, becomes:
        - Same `requireConfig()` guard
        - Same `formatUrlsAsMarkdown` + payload construction
        - Replace `return this.postJson('sendMessage', payload)` → `return this.httpClient.postJson('sendMessage', payload)`

     6. `sendPhoto` — becomes:
        - Same `requireConfig()` guard
        - Replace file read block with `readFileWithValidation(imagePath, this.logger, 'photo')`
        - Same caption truncation
        - Same multipart construction calling `buildMultipartBody`
        - Replace `return this.postMultipart('sendPhoto', boundary, body)` → `return this.httpClient.postMultipart('sendPhoto', boundary, body)`

     7. `sendVideo` — same pattern as sendPhoto:
        - Same `requireConfig()`
        - `readFileWithValidation(videoPath, this.logger, 'video')`
        - Same caption truncation
        - Same multipart construction with `supports_streaming`
        - Replace `return this.postMultipart('sendVideo', boundary, body)` → `return this.httpClient.postMultipart('sendVideo', boundary, body)`

     8. `sendMediaGroup` — becomes:
        - Same `requireConfig()` + validation
        - `readMultipleFilesWithValidation(imagePaths, this.logger, 'image')`
        - Same caption truncation
        - Same mediaArray + multipart construction
        - Replace `return this.postMultipartMediaGroup('sendMediaGroup', boundary, body)` → `return this.httpClient.postMultipartMediaGroup('sendMediaGroup', boundary, body)`

     9. `getChat` — stays as-is (no change, it's a standalone GET request not going through postJson)

     10. Run `npx eslint --fix` on adapter

     Must NOT: Change public method signatures or behavior.
     Must NOT: Change `requireConfig()` or `getChat()`.
     Must NOT: Add `BotApiHttpClient` to the NestJS module providers (it's composed manually).

     References: entire adapter file
     Acceptance criteria: Adapter compiles, imports clean (0 unused), ESLint 0 err
     QA: `npx eslint --fix` passes, `tsc --noEmit` passes

- [ ] 6. **Final verification**
     What to do:
     1. `wc -l` on adapter → target ~100 lines
     2. `npx eslint apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts` → 0 errors, 0 warnings
     3. `npx tsc --noEmit` (from `apps/backend`) → 0 errors
     4. `npx jest --testPathPattern="bot-api-crypto-news-publisher"` → all pass
     5. Verify each new file exists:
        - `build-multipart-body.ts`
        - `guess-mime-type.ts`
        - `telegram-file-utils.ts`
        - `bot-api-http-client.ts`
     6. `npx eslint` on all 4 new files → 0 errors

     References: all files
     Acceptance criteria: All 6 checks pass
     Commit: (squashed with T5)

## Commit strategy

- 4 atomic commits (one per extraction T1-T4) + 1 rewire commit (T5)
- Squash T6 into T5 if clean
- All commits on `dev` branch

## Success criteria

- Adapter: 687 → ~100 lines (-85%)
- 4 new files, each with single responsibility
- Zero new @Injectable providers (all pure functions + BotApiHttpClient composed manually)
- ESLint 0, tsc 0, tests pass
- Zero behavior changes verified by existing tests
