---
slug: crypto-news-images
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-images.md
approach: Extender el pipeline de crypto-news para ingestar imágenes desde Telegram MTProto, almacenarlas localmente, servirlas via API, y mostrarlas en el frontend. Crear AGENTS.md al final. Refinar con Momus.
---

# Draft: crypto-news-images

## Components (topology ledger)

| id  | outcome (one line)                                              | status   | evidence path                                                  |
| --- | --------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| C1  | Contrato TelegramRawMessage extendido con media attachments     | active   | telegram-listener.port.ts:29-40                                |
| C2  | Listener MTProto extrae msg.media en los 3 paths                | active   | telegram-mtproto-listener.adapter.ts:163-176, 208-213, 228-234 |
| C3  | Servicio de descarga y almacenamiento local de imágenes         | active   | nuevo archivo                                                  |
| C4  | Domain entity CryptoNewsMessage con campo media[]               | active   | crypto-news-message.entity.ts:13-21                            |
| C5  | Tabla DB crypto_news_message_media + TypeORM entity             | active   | nuevo + crypto-news-message.entity.ts:1-40                     |
| C6  | Mappers, repos (in-memory + pg) actualizados                    | active   | mapper.ts, repository files                                    |
| C7  | API extendida con media en view + endpoint para servir binarios | active   | crypto-news.controller.ts:6-14                                 |
| C8  | Frontend: types extendidos + renderizado <img>                  | active   | crypto-news-queries.ts:3-11, crypto-news/index.tsx:80-103      |
| C9  | AGENTS.md creado en telegram/ingestion/crypto-news/             | active   | nuevo archivo                                                  |
| C10 | Revisión Momus ejecutada                                        | deferred | se ejecuta al final                                            |

## Open assumptions (announced defaults)

| assumption             | adopted default                                                          | rationale                                                                        | reversible?                          |
| ---------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------ |
| Enfoque almacenamiento | Descarga inmediata + disco local (enfoque B)                             | Más robusto: no depende de MTProto para servir, latencia mínima, cache semántico | Sí — cambiar a S3/minio más adelante |
| Ruta de almacenamiento | `uploads/crypto-news/media/{channelId}/{messageId}_{index}.{ext}`        | Organizado por canal+mensaje, evita colisiones, fácil depuración                 | Sí                                   |
| Endpoint de servicio   | `GET /crypto-news/media/:mediaId` dedicado (no archivo estático directo) | Control de acceso, logging, futuro resize/cache headers                          | Sí                                   |
| Estructura DB          | Tabla separada `crypto_news_message_media` (no JSONB)                    | Normalizado, consultable, permite cascade delete, migraciones limpias            | Sí                                   |

## Findings (cited - path:lines)

1. **`TelegramRawMessage` ya tiene campo `hasMedia?: boolean`** pero nunca se puebla (`telegram-listener.port.ts:40`). Hay que transformarlo a `media?: TelegramMediaAttachment[]`.

2. **El listener MTProto ignora `msg.media`** en los 3 puntos de captura:
   - Polling loop: `startPollingLoop()` line:163-176 — solo extrae `id`, `message`, `date`
   - Live events: `handleEvent()` line:208-213 — idem
   - Backfill: `backfill()` line:228-234 — idem

3. **La entidad de dominio `CryptoNewsMessage`** (`crypto-news-message.entity.ts:13-21`) tiene solo `id, channelId, messageId, title, content, publishedAt, ingestedAt`. Sin campo media.

4. **La entidad TypeORM** (`infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts:19-39`) replica los mismos campos. Sin columna media.

5. **El mapper** (`mappers/crypto-news-message.mapper.ts:9-31`) mapea 1:1 los mismos campos.

6. **Los repos** — in-memory (`infrastructure/repositories/in-memory-crypto-news-message.repository.ts:10-38`) usa `Map<string, CryptoNewsMessage>` — se actualiza solo al tocar la entidad de dominio. TypeORM repo necesita cascade save/load.

7. **El controller** (`api/http/crypto-news.controller.ts:6-14`) expone `CryptoNewsMessageView` sin media. No hay endpoint para servir binarios.

8. **La página frontend** (`frontend/src/pages/crypto-news/index.tsx:80-103`) renderiza solo texto. Sin `<img>`.

9. **`IngestionCoordinator`** (`ingestion-coordinator.service.ts:119-148`) rutea mensajes a `StoreNewsMessageUseCase.execute()` pasando solo `{channelId, messageId, title, content, occurredAt}` — no pasa media. El use case (`store-news-message.use-case.ts:7-13`) tiene el mismo input limitado.

## Decisions (with rationale)

1. **Enfoque de almacenamiento: descarga inmediata + disco local (enfoque B)**
   - Rationale: Los fileReference de Telegram expiran (~1h). Con enfoque A (proxy on-demand), una imagen no vista en la primera hora quedaría rota. Descarga inmediata garantiza disponibilidad permanente sin depender de MTProto.
   - Tradeoff: se duplica storage (~100KB-1MB por imagen). Aceptable para decenas de canales de noticias.

2. **Tabla separada vs JSONB: tabla separada**
   - Rationale: Las imágenes pueden tener metadata variable (mimeType, tamaño, dimensión). Tabla separada permite consultas individuales, cascade delete, y migraciones ortogonales.

3. **Endpoint dedicado vs archivo estático: endpoint dedicado**
   - Rationale: Permite logging, validación de IDs, headers de cache, y futuro resize on-the-fly sin exponer el filesystem directamente.

## Scope IN

- Extraer `msg.media.photo` de los mensajes de Telegram (fotos fijas, no animaciones ni videos)
- Descargar la imagen al momento de ingestión
- Almacenar localmente en `uploads/crypto-news/media/`
- Persistir metadatos en tabla `crypto_news_message_media`
- Servir imágenes via `GET /crypto-news/media/:mediaId`
- Mostrar imágenes en la página `/crypto-news` del frontend
- Crear `telegram/ingestion/crypto-news/AGENTS.md`
- Ejecutar revisión Momus

## Scope OUT (Must NOT have)

- NO videos / GIFs animados / stickers (solo photos)
- NO subida a S3/MinIO (queda para futuro)
- NO resizes/CDN (se sirve la imagen original)
- NO modificar el pipeline de KOL (solo crypto-news)
- NO cache headers avanzados (se puede añadir después)
- NO lazy loading sofisticado (se usa `loading="lazy"` nativo de HTML)

## Open questions

Ninguna — todas resueltas por exploración + defaults adoptados.

## Momus review results

Momus identificó 14 gaps, 3 contradicciones, 5 constraints faltantes, 4 riesgos de scope creep, 6 asunciones sin validar, y 7 acceptance criteria débiles.

### Bloqueantes resueltos en el plan

| #   | Gap                                            | Resolución                                               |
| --- | ---------------------------------------------- | -------------------------------------------------------- |
| G-1 | Docker wipe: uploads/ se pierde en cada deploy | Documentado como limitación aceptada en TL;DR + must-NOT |
| G-2 | route() signatura no acepta media              | T6 actualiza a `TelegramRawMessage`                      |
| G-4 | FloodWait no aplicado a descargas              | T3 usa `FloodWaitHandlerService.withRetry()`             |
| G-5 | Estrategia no decidida                         | Elegido síncrono: filePath resuelto antes de persistir   |

### Cambios principales

- G-7: ON DELETE CASCADE en FK (no solo ORM cascade)
- G-8: sanitización channelId en T3
- G-9: MIME detection real (magic bytes)
- G-10: Port/Adapter pattern para downloader
- G-11: `.docs-map.jsonc` update en T9
- G-14: verificación de `use-crypto-news.ts`
- M-1: transacción atómica message+media
- M-5: null mimeType → derivar de extensión
- AC-6/F3: Playwright real como QA final

## Approval gate

status: approved

<!-- User said "procede". Executing the plan. -->
