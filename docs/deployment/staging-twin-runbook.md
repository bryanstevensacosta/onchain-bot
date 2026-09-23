# Staging twin runbook (per-env-ingestion)

> Per-env model (2026-09-22): cada env corre SU ingestion-telegram (misma
> imagen, 1:1 con su backend). Este runbook cubre el TWIN staging.
> Prod vive en `docs/deployment/ingestion-service-runbook.md` (cutover +
> fases). Seeding del twin: `staging-twin-channels.md` (mismo directorio).
> Rollback rápido: `ingestion-rollback.md` (mismo directorio, T6).

## 0. Twin vs prod (tabla DNS/puertos/DBs)

| Cosa                           | Prod                                                       | Staging twin                                                                                      |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Compose                        | `apps/backend/docker-compose.ingestion.yml`                | `apps/backend/docker-compose.staging-ingestion.yml`                                               |
| Project / container            | `onchain-bot-ingestion` / `onchain-bot-ingestion-telegram` | `onchain-bot-staging-ingestion` / `onchain-bot-ingestion-telegram-staging`                        |
| Host:container port            | `127.0.0.1:3032:3031`                                      | `127.0.0.1:3033:3031` (interno siempre `:3031`)                                                   |
| Env file (Oracle server, real) | `/opt/onchain-bot/apps/ingestion-telegram/.env.production` | `/opt/onchain-bot-staging/apps/ingestion-telegram/.env.staging`                                   |
| Env template (repo)            | `apps/ingestion-telegram/.env.production.template`         | `apps/ingestion-telegram/.env.staging.template`                                                   |
| Triple MTProto                 | cuenta ACTUAL                                              | VIEJA cuenta de dev (jamás la misma que prod)                                                     |
| DB                             | `alpha_meta_token_scanner_ingestion`                       | `alpha_meta_token_scanner_staging_ingestion` (VACÍA por diseño)                                   |
| Uploads                        | bind prod                                                  | named volume `onchain-bot-staging-ingestion-uploads`                                              |
| Red Docker                     | `onchain-bot-net` (+ staging)                              | SOLO `onchain-bot-staging-net` (external)                                                         |
| Backend que lo lee             | prod (`:3030`)                                             | staging (`:3031`) vía `INGESTION_TELEGRAM_URL=http://onchain-bot-ingestion-telegram-staging:3031` |
| Frontend que lo lee            | prod (`:80`) vía `nginx.conf` singleton upstream           | staging (`:4173`) vía `nginx.staging.conf` twin upstream (bake `VITE_APP_ENV=staging`)            |
| GHCR rollback pin              | `:prev`                                                    | `:staging-prev` (nunca compartidos)                                                               |

## 1. Env files (nombres, nunca valores)

- Repo (plantillas, commiteadas): `apps/ingestion-telegram/.env.production.template`,
  `apps/ingestion-telegram/.env.staging.template` (triple VACÍA = pendiente de operador).
- Oracle (reales, gitignored, `chmod 600`): las dos rutas de la tabla.
- Backend staging también reapunta en DOS sitios: `docker-compose.staging.yml`
  (`environment:`, gana en runtime) + real
  `/opt/onchain-bot-staging/apps/backend/.env.staging` (ver `staging-twin-channels.md` §5).
- JAMÁS: dos `.env` con la misma triple, `compose config` con env real
  (interpolaría la sesión al output), secretos en evidencias/PRs.

## 2. Pre-boot: triple-inequality assert (OBLIGATORIO)

Dos instancias con la misma triple = `AUTH_KEY_DUPLICATED` y sesión tumbada.
Antes del primer boot del twin (hashes, nunca valores — aborta si coinciden):

```bash
for f in /opt/onchain-bot/apps/ingestion-telegram/.env.production \
         /opt/onchain-bot-staging/apps/ingestion-telegram/.env.staging; do
  grep -h '^INGESTION_TELEGRAM_MTPROTO_SESSION=' "$f" | sha256sum
done | sort | uniq -d | grep -q . \
  && { echo 'FATAL: duplicated MTProto triple across envs — abort boot'; exit 1; } \
  || echo 'triple-inequality OK'
```

Checklist: [ ] hash prod registrado [ ] hash staging difiere [ ] `:3033` libre (`ss -ltn | grep 3033` vacío salvo socat).

## 3. Startup order

1. Red: la crea el stack staging (`docker-compose.staging.yml` default net) o
   `docker network create onchain-bot-staging-net` a mano (el twin la declara `external: true`).
2. Firewall/socat `:3033` (bootstrap re-run + `install-socat-services.sh` staging lane) ANTES del primer healthcheck.
3. Twin: `docker compose -f docker-compose.staging-ingestion.yml up -d`
   (migraciones staging corren en el lane de deploy; en manual: una-off `migration:run` primero).
4. Gate: `curl -sf http://localhost:3033/api/feed/sources` → `200` con `[]`
   (explicit-empty-OK: vacío es el estado sano de un twin fresco).
5. Backend staging recreate (ya reapuntado) → `printenv INGESTION_TELEGRAM_URL`
   dentro del container muestra el twin.
6. Seeding 2-3 canales test + traffic checkpoint (`staging-twin-channels.md` §§1-2:
   0 mensajes tras una ventana de polling = FAIL, no advisory).

## 4. Deploy / dispatch / rollback (punteros)

- Deploy twin: dispatch manual `deploy-ingestion.yml` con `target=staging`
  (nunca corre en push a master; requiere GitHub environment `staging` creado
  por el operador o el job pende). Smoke: `SMOKE_INGESTION_URL=http://localhost:3033`
  (`deploy-staging.yml:414-419`) + sources-count (`[]` vacío-OK vs N esperado).
- Rollback: `ingestion-rollback.md` (T6) — re-levanta `:staging-prev` verificado +
  healthcheck gate; single-flight estricto (stop-verificado-antes-de-start,
  dos contenedores con la misma triple JAMÁS coexisten).
- Orden code-before-schema: ingestion PRIMERO (`:3033` sirviendo), backend DESPUÉS.

## 5. Empty-by-design (no es un bug)

El twin arranca VACÍO: sin seed, sin mirror prod, sin fuentes. El janitor nunca
borra sources (solo messages + media >72h). Cada alta es reversible
(`PATCH .../toggle` soft, `DELETE` hard — ver `staging-twin-channels.md` §4).
Nunca sembrar prod desde esta guía; nunca copiar la DB prod al twin.
