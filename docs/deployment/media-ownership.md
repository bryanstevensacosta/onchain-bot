# Media ownership: news cache vs ads library

**Last Updated:** 2026-09-19
**Scope:** `apps/backend/uploads/` vs `apps/ingestion-telegram/uploads/`

## Propiedad

| dir                                          | dueño                                                               | qué es                                    | este plan                                |
| -------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| `uploads/crypto-news/media/` (backend)       | ingestion-telegram (vía `GET /api/media/...`)                       | caché temporal de publish, re-descargable | fix B (tmp+borrar) + limpieza verificada |
| `uploads/` en ingestion-telegram             | ingestion-telegram                                                  | fuente de verdad + janitor 72h            | NO tocar                                 |
| `uploads/crypto-news-ads-library/` (backend) | backend (`local-ad-media-storage.adapter`, `ad-media-path-builder`) | librería propia de ads                    | NO tocar (vacía hoy, 0 bytes)            |

## Detalle operativo

- Fuente de verdad: `apps/ingestion-telegram/uploads/crypto-news/media/`.
  Janitor `CryptoNewsRetentionCleanupScheduler`, retención 72h, lock `9_421_373`.
- Backend solo cachea en publish: descarga vía `INGESTION_TELEGRAM_URL` +
  `GET /api/media/:channelId/:messageId/:index`, escribe en
  `uploads/crypto-news/media/` y debe borrar tras publicar.
- Prod monta `./uploads:/app/uploads` (bind mount, ver
  `apps/backend/docker-compose.prod.yml:104-105,193-200`). Dueño host UID 1000:

```bash
chown 1000:1000 apps/backend/uploads
```

## Qué NO respaldar

- `uploads/crypto-news/media/` del backend: caché re-descargable (T8 2026-09-16).
  No entra en `scripts/backup-db.sh`. Ante duda, re-descargar desde ingestion:

```bash
curl -s "$INGESTION_TELEGRAM_URL/api/media/<channelId>/<messageId>/0" -o /tmp/check.bin
```

## Nota ads-library

- `uploads/crypto-news-ads-library/` está vacía hoy (0 bytes) y fuera de este plan.
  No cambiar su ownership ni `sync-ad-images.sh`.
