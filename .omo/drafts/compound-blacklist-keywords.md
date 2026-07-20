---
name: compound-blacklist-keywords
status: awaiting-plan
approach: andGroupId
---

# Compound Blacklist & Keywords — Draft

## Intent

**CLEAR** — Simple y Compound items en Blacklist + Keywords

## Decisiones tomadas (usuario)

| Decisión              | Opción                                |
| --------------------- | ------------------------------------- |
| UX Compound           | Fila expandible en la tabla           |
| Naming                | **Simple** / **Compound**             |
| Duplicados cross-tipo | Permitidos                            |
| requireMedia          | En ambos, renombrar `image` → `media` |
| Match per sub-frase   | Cada sub-frase tiene su matchMode     |
| Case per sub-frase    | Cada sub-frase tiene su caseSensitive |

## Modelo

```
andGroupId: string | null
  null    → Simple (OR)
  "uuid"  → Compound (AND entre frases del mismo grupo)

requireMedia: boolean (default false)
  true  → solo match si el mensaje tiene media
  false → ignorar media
```

## Scope (archivos a modificar)

### Backend

- `keyword.entity.ts`, `blacklist-phrase.entity.ts` (dominio) — +andGroupId, rename requireMedia
- `KeywordEntity`, `BlacklistPhraseEntity` (TypeORM) — columnas
- `keyword.mapper.ts`, `blacklist-phrase.mapper.ts` — mapear campos
- `keywords.controller.ts`, `blacklist.controller.ts` — DTOs
- `crypto-news-message-ingested.handler.ts` — matching AND + requireMedia

### Frontend

- `keywords-api.ts`, `blacklist-api.ts` — views + bodies
- `keywords-section.tsx`, `blacklist-manager.tsx` — UI

### Tests

- `keyword.entity.spec.ts`, `blacklist-phrase.entity.spec.ts`
- `crypto-news-message-ingested.handler.spec.ts`
- `keywords.controller.spec.ts`, `blacklist.controller.spec.ts`
