# Plan: mtproto-adapter-refactor

**Status:** awaiting-approval  
**Date:** 2025-07-17  
**Momus review 1:** PASS-WITH-FIXES (5 gaps corregidos)  
**Momus review 2:** PASS-WITH-FIXES (1 gap crítico corregido — ver abajo)

---

## TL;DR (For humans)

Archivo `telegram-mtproto-listener.adapter.ts` (883 líneas, 38 métodos) con extracción de media duplicada **3 veces** (photo, video, document). Aunque el output `TelegramMediaAttachment` ya unifica photo+video, la lógica de extracción está triplicada.

**Solución:** Un solo `MediaExtractor` con slots configurables que consolida las 3 rutas en ~50 líneas. No se necesita herencia photo/video — los campos extraídos son idénticos; solo cambia dónde buscar dentro de `media` y el label `type`.

**Resultado:** 883 → ~700 líneas, eliminación de ~140 líneas de duplicación.

---

## Tasks

### Phase 1: Extract shared utilities

- [ ] **T1.1** Extraer `fileReferenceToBuffer(raw: unknown): Buffer | null` — **crear como función de módulo al inicio del archivo** (junto a `safeToString`). Reemplaza 3 duplicados en líneas ~416-422, ~497-503, ~547-553.

  ```typescript
  function fileReferenceToBuffer(v: unknown): Buffer | null {
    if (Buffer.isBuffer(v)) return v;
    if (typeof v === 'string') return Buffer.from(v, 'binary');
    if (Array.isArray(v)) return Buffer.from(v);
    return null;
  }
  ```

  **QA:**
  | Input | Expected |
  |-------|----------|
  | `Buffer.from([1,2,3])` | mismo Buffer |
  | `'binary'` | `Buffer.from('binary', 'binary')` |
  | `[1,2,3]` | `Buffer.from([1,2,3])` |
  | `null / undefined` | `null` |
  | `123` (number) | `null` |

- [ ] **T1.2** Crear `coerceToString(v: unknown): bigint | string` como función de módulo (reemplaza 3 duplicados locales). Esta función maneja objetos llamando `.toString()` y preserva bigint/string primitivos.

  ```typescript
  function coerceToString(v: unknown): bigint | string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'bigint') return v;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'symbol') return v.toString();
    return (v as { toString(): string }).toString();
  }
  ```

  ✅ **Momus fix #2 (crítico):** `coerceToString` devuelve `bigint | string`, que matchea exactamente con `TelegramMediaAttachment.fileId` y `TelegramMediaAttachment.accessHash`. **NO** usar `coerceToLong(safeToString(...))` que devolvería `BigInteger` (tipo incompatible).

  **Verificación:** `grep -n 'coerceToString'` solo encuentra 1 definición (la compartida) + referencias a ella, no 3 locales.

### Phase 2: Create unified MediaExtractor

- [ ] **T2.1** Definir tipos e interfaces al inicio del archivo:

  ```typescript
  type MediaSlot = {
    field: 'photo' | 'video' | 'document';
    type: 'photo' | 'video';
    validate?: (raw: RawMediaObject) => boolean;
  };

  interface RawMediaObject {
    id?: unknown;
    accessHash?: unknown;
    fileReference?: unknown;
    mimeType?: unknown;
    dcId?: unknown;
    date?: unknown;
  }
  ```

- [ ] **T2.2** Crear clase `MediaExtractor` (módulo-level, después de `coerceToString` y `fileReferenceToBuffer`):

  ```typescript
  class MediaExtractor {
    private readonly slots: MediaSlot[] = [
      { field: 'video', type: 'video' },
      {
        field: 'document',
        type: 'video',
        validate: (raw) =>
          ((raw.mimeType as string) ?? '').toLowerCase().startsWith('video/'),
      },
      { field: 'photo', type: 'photo' },
    ];

    extract(media: unknown): TelegramMediaAttachment | null {
      for (const slot of this.slots) {
        const result = this.trySlot(media, slot);
        if (result) return result;
      }
      return this.extractWebpagePreview(media);
    }

    private trySlot(
      media: unknown,
      slot: MediaSlot,
    ): TelegramMediaAttachment | null {
      if (!media || typeof media !== 'object') return null;
      const obj = (media as Record<string, unknown>)[slot.field];
      if (!obj || typeof obj !== 'object') return null;
      const raw = obj as RawMediaObject;
      if (slot.validate && !slot.validate(raw)) return null;
      return this.buildAttachment(raw, slot.type);
    }

    private buildAttachment(
      raw: RawMediaObject,
      type: 'photo' | 'video',
    ): TelegramMediaAttachment | null {
      if (!this.isValidId(raw.id)) return null;
      const fileRef = fileReferenceToBuffer(raw.fileReference);
      if (!fileRef) return null;
      return {
        type,
        fileId: coerceToString(raw.id),
        accessHash: coerceToString(raw.accessHash),
        fileReference: fileRef.toString('base64'),
        mimeType: (raw.mimeType as string) ?? null,
        dcId: (raw.dcId as number) ?? undefined,
        date: (raw.date as number) ?? undefined,
      };
    }

    private extractWebpagePreview(
      media: unknown,
    ): TelegramMediaAttachment | null {
      if (!media || typeof media !== 'object') return null;
      const webpage = (media as { webpage?: Record<string, unknown> }).webpage;
      if (!webpage || typeof webpage !== 'object') return null;
      const wpPhoto = webpage.photo;
      if (!wpPhoto || typeof wpPhoto !== 'object') return null;
      const photoResult = this.buildAttachment(
        wpPhoto as RawMediaObject,
        'photo',
      );
      if (!photoResult) return null;
      return {
        ...photoResult,
        webpageUrl: (webpage.url as string) ?? null,
        webpageTitle: (webpage.title as string) ?? null,
        webpageDescription: (webpage.description as string) ?? null,
        webpageSiteName: (webpage.siteName as string) ?? null,
      };
    }

    private isValidId(v: unknown): boolean {
      return (
        typeof v === 'bigint' ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'object'
      );
    }
  }
  ```

- [ ] **T2.3** Reemplazar en `TelegramMtprotoListenerAdapter`:
  - **Eliminar** métodos privados: `extractPhotoFromPhotoObject`, `extractRawPhotoAttachment`, `extractRawVideoAttachment`, `extractWebpagePreview`
  - **Modificar** `extractMediaAttachments`:

    ```typescript
    // Antes (line ~605):
    const attachment =
      this.extractRawPhotoAttachment(msg.media) ??
      this.extractRawVideoAttachment(msg.media);

    // Después:
    const attachment = new MediaExtractor().extract(msg.media);
    ```

  - Verificar imports huérfanos con `npx eslint --fix`
  - **Nota técnica:** Para evitar `new MediaExtractor()` en cada llamada, considerar instancia singleton o static class. **El implementador decide** si merece la pena según frecuencia de llamadas.

  **QA:**
  | Escenario | Input | Expected |
  |-----------|-------|----------|
  | Photo | `{ photo: { id: bigint, fileReference: Buffer, ... } }` | `{ type:'photo', fileId, ... }` |
  | Direct video | `{ video: { id: bigint, fileReference: Buffer, mimeType:'video/mp4' } }` | `{ type:'video', ... }` |
  | Document video | `{ document: { mimeType:'video/mp4', ... } }` | `{ type:'video', ... }` |
  | Document non-video | `{ document: { mimeType:'application/pdf', ... } }` | `null` (pasa a webpage) |
  | Webpage with photo | `{ webpage: { photo: { id:bigint, ... }, url:'...' } }` | `{ type:'photo', webpageUrl:'...' }` |
  | Empty media | `{}` | `null` |
  | Webpage no photo | `{ webpage: {} }` | `null` |

### Phase 3: Rename

- [ ] **T3.1** Renombrar `GramjsRawMessage` → `RawTelegramMessage` en:
  - Definición de interfaz (línea ~38)
  - `messages as GramjsRawMessage[]` → `messages as RawTelegramMessage[]` (línea ~210)
  - `msg as GramjsRawMessage` → `msg as RawTelegramMessage` (línea ~281)
  - `m as GramjsRawMessage` → `m as RawTelegramMessage` (línea ~340)
  - No renombrar `GramjsMessageEntity` (es específico de entidades Telegram, no media)

### Phase 4: Verify

- [ ] **T4.1** ESLint: `npx eslint src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts` → **0 errores, 0 warnings**
- [ ] **T4.2** Tests: `npx jest --testPathPatterns="telegram-mtproto-listener|ingestion-coordinator"` → **todos los tests pasan** (no forzar número específico)
- [ ] **T4.3** `wc -l src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts` → **≤ 710 líneas**

---

## Dependencies

```
T1.1 (fileReferenceToBuffer) ──┐
T1.2 (coerceToString shared) ──┤
                                ├──→ T2.2 (MediaExtractor) ──→ T2.3 (reemplazar métodos) ──→ T4
T2.1 (types) ──────────────────┘
T3.1 (rename) ════════════════════════════════ (paralelo con T2)
```

---

## Momus reviews: gaps y correcciones

### Review 1 → 5 gaps corregidos

| #   | Gap                                          | Severidad | Corrección                                |
| --- | -------------------------------------------- | --------- | ----------------------------------------- |
| 1   | T1.1 sin ubicación exacta                    | Media     | ✅ "al inicio junto a safeToString"       |
| 2   | T2.1 validate solo recibía `{mimeType}`      | Alta      | ✅ Ahora recibe `RawMediaObject` completo |
| 3   | T2.3 sin verificación de imports             | Baja      | ✅ Añadido `npx eslint --fix`             |
| 4   | T4.2 forzaba "5/5"                           | Media     | ✅ "todos los tests pasan"                |
| 5   | Instanciación MediaExtractor en cada llamada | Baja      | ✅ Nota técnica                           |

### Review 2 → 1 gap crítico corregido

| #        | Gap                                                                                    | Severidad   | Corrección                                                                                                      |
| -------- | -------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| **6** ⚡ | **T2.2: `coerceToLong(safeToString(...))` devuelve `BigInteger`, no `bigint\|string`** | **Crítica** | ✅ Cambiado a `coerceToString(raw.id)` que devuelve `bigint\|string` (matchea `TelegramMediaAttachment.fileId`) |

### Resumen de correcciones de tipos

| Símbolo          | Antes (erróneo)                                     | Ahora (correcto)                              | Razón                                                  |
| ---------------- | --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `fileId`         | `coerceToLong(safeToString(raw.id))` → `BigInteger` | `coerceToString(raw.id)` → `bigint \| string` | `TelegramMediaAttachment.fileId: bigint \| string`     |
| `accessHash`     | `coerceToLong(safeToString(...))` → `BigInteger`    | `coerceToString(...)` → `bigint \| string`    | `TelegramMediaAttachment.accessHash: bigint \| string` |
| `coerceToString` | 3 definiciones locales (duplicadas)                 | 1 función de módulo compartida                | DRY                                                    |

---

## Must-NOT-Have

- No cambiar `TelegramMediaAttachment` (type compartido en `telegram-listener.port.ts`)
- No cambiar `TelegramRawMessage` (también en `telegram-listener.port.ts`)
- No cambiar la firma de `extractMediaAttachments` (sigue recibiendo `{ id: number; media?: unknown }` y devolviendo `Promise<ReadonlyArray<TelegramMediaAttachment> | undefined>`)
- No cambiar tests existentes
- No cambiar la interfaz `TelegramListenerPort`
- No usar `coerceToLong` para los campos `fileId`/`accessHash` (devolvería `BigInteger`, incompatible con `bigint | string`)

---

## Commit

```
refactor(telegram): unify photo/video extraction into single MediaExtractor

- Extract fileReferenceToBuffer() helper to eliminate 3x duplication
- Extract coerceToString() shared function to eliminate 3x duplication
- Create unified MediaExtractor with configurable slots (photo/video/document)
- Remove extractPhotoFromPhotoObject, extractRawPhotoAttachment,
  extractRawVideoAttachment (consolidated into MediaExtractor)
- Rename GramjsRawMessage → RawTelegramMessage
- Consolidate ~140 lines → ~50 lines of media extraction logic
- File: 883 → ~700 lines
```
