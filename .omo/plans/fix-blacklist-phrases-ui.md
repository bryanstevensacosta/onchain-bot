# Plan: Blacklist Phrases UI Improvements

## Overview

Actualizar la UI de Blacklist Phrases en el frontend para que sea consistente con Keywords:

1. Mover Blacklist como sub-contenedor dentro del contenedor de Keywords
2. Agregar tipo de match (EXACT/SUBSTRING)
3. Cambiar input de channel IDs por selector de sources
4. Agregar buscador

También necesita cambios en el backend para soportar `matchMode`.

## Changes Required

### Backend Changes

#### 1. Import Shared MatchMode Type

**File:** `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`

- Importar `MatchMode` desde `keyword.entity.ts`:
  ```typescript
  import { MatchMode } from './keyword.entity';
  ```
- NO crear tipo duplicado

#### 2. BlacklistPhrase Entity

**File:** `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`

- Agregar `matchMode` a `BlacklistPhraseProps`
- Agregar `matchMode` como parámetro opcional en `create()` (default: `'exact'`)
- Agregar `matchMode` como parámetro opcional en `reconstitute()` (default: `'substring'` - preservar comportamiento legacy)
- Agregar getter `matchMode()`
- Actualizar método `matches()` para usar `matchMode`:
  ```typescript
  if (this.state.matchMode === 'exact') {
    const flags = this.state.caseSensitive ? '' : 'i';
    const escaped = this.state.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, flags).test(content);
  }
  // substring mode
  if (this.state.caseSensitive) {
    return content.includes(this.state.phrase);
  }
  return content.toLowerCase().includes(this.state.phrase.toLowerCase());
  ```

#### 3. TypeORM Entity + Migration

**File:** `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity.ts`

- Agregar columna `matchMode`:
  ```typescript
  @Column({ name: 'match_mode', type: 'varchar', length: 20, default: 'substring' })
  matchMode: MatchMode;
  ```
- **CRÍTICO**: Default 'substring' para preservar comportamiento legacy de datos existentes

#### 4. BlacklistPhrase Mapper

**File:** `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/blacklist-phrase.mapper.ts`

- Agregar `matchMode` al mapping de entidad a domain

#### 5. Blacklist Controller

**File:** `apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts`

- Agregar `matchMode?: 'exact' | 'substring'` a `CreateBlacklistDto`
- Agregar `matchMode?: 'exact' | 'substring'` a `UpdateBlacklistDto`
- **POST**: Usar `dto.matchMode ?? 'exact'`
- **PATCH**: Implementar lógica como en KeywordsController:
  ```typescript
  const nextMatchMode =
    dto.matchMode !== undefined ? dto.matchMode : existing.matchMode;
  ```
- Actualizar método `toView()` para incluir `matchMode`

#### 6. Verify Repository (Port)

- Verificar que `BlacklistPhraseRepository` no tenga métodos que filtren por campos específicos
- Verificar que `crypto-news-message-ingested.handler.ts` no necesite cambios

---

### Frontend Changes

#### 1. API Types

**File:** `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts`

- Agregar `matchMode: 'exact' | 'substring'` a `BlacklistPhraseView`
- Agregar `matchMode?: 'exact' | 'substring'` a `CreateBlacklistBody`
- Agregar `matchMode?: 'exact' | 'substring'` a `UpdateBlacklistBody`

#### 2. Model Hooks (use-blacklist)

**File:** `apps/frontend/src/features/crypto-news-publisher/model/use-blacklist.ts`

- Verificar que los hooks soporten los nuevos campos

#### 3. New Combined Component

**File:** `apps/frontend/src/features/crypto-news-publisher/ui/keywords-manager.tsx`

- Crear nuevo componente combinado que contenga:
  - Keywords (ya existe, mantener)
  - Blacklist como sub-sección ( NUEVO - mover desde blacklist-manager.tsx)
  - Selector de matchMode para Blacklist (NUEVO) - usar dropdown como Keywords
  - SourceMultiSelect para Blacklist (NUEVO - como Keywords)
  - Buscador para Blacklist (NUEVO - como Keywords)
- Usar el mismo patrón de `SourceMultiSelect` que Keywords
- Usar paginación igual que Keywords
- Mantener estado independiente para Blacklist (search, pagination)

#### 4. Page Update

**File:** `apps/frontend/src/pages/crypto-news/index.tsx`

- Cambiar de:
  ```tsx
  <KeywordsManager />
  <details>Blacklist</details>
  ```
- A:
  ```tsx
  <KeywordsManagerWithBlacklist />
  ```

---

## Implementation Order

1. Backend: Import shared MatchMode type + Entity changes
2. Backend: TypeORM Entity + Migration (default 'substring')
3. Backend: Mapper updates
4. Backend: Controller updates
5. Backend: Verify Repository
6. Frontend: API types
7. Frontend: Verify hooks
8. Frontend: Combined component
9. Frontend: Page update
10. Test verification

---

## Risks / Considerations

### Critical

- **Migration**: Default 'substring' para preservar comportamiento legacy. Datos existentes seguirán usando substring matching.
- **Partial deploy**: Si frontend deploya antes que backend, manejar matchMode undefined gracefully

### Backward Compatibility

- El frontend actual debe seguir funcionando hasta que se haga el deploy completo
- Reconstitute usa default 'substring' para datos existentes sin matchMode
- API debe manejar requests sin matchMode (default a 'exact' en create)

### Tests

- Verificar tests existentes: `blacklist-phrase.entity.spec.ts`, `blacklist.controller.spec.ts`
- Agregar nuevos casos de test para matchMode

---

## Acceptance Criteria

- [ ] Blacklist aparece como sub-sección dentro de Keywords
- [ ] Se puede seleccionar EXACT o SUBSTRING para cada frase blacklist
- [ ] Se puede elegir sources de una lista (no manual por channel ID)
- [ ] Hay buscador para filtrar frases blacklist
- [ ] El backend persiste y retorna el matchMode correctamente
- [ ] La UI es consistente con la de Keywords
- [ ] Migration corre exitosamente (nueva columna creada)
- [ ] Frases blacklist existentes continúan funcionando (matchMode default 'substring')
- [ ] API retorna matchMode para todas las frases blacklist
- [ ] Frontend maneja respuestas sin matchMode gracefully
- [ ] Componente combinado tiene search/pagination independiente para Blacklist
- [ ] No hay console errors durante operaciones CRUD de Blacklist
