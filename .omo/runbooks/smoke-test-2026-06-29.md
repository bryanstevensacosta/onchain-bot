# Smoke Test Results — 2026-06-29

## Objetivo

Validar la infraestructura de deployment en el droplet (DigitalOcean 2 vCPU, 3.8GB RAM, Ubuntu 24.04, Tailscale activo) antes del deploy real con credenciales de producción.

## Procedimiento ejecutado

1. **Source code transferido** al droplet vía `tar + ssh` (excluyendo `node_modules`, `dist`, `.git`)
2. **`.env.production` creado** en `/opt/onchain-bot/apps/backend/.env.production` con valores **placeholder** (NO credenciales reales)
3. **`.env` symlink** creado (`ln -sf .env.production .env`) para que docker compose auto-cargue las vars para interpolación
4. **`docker compose build`** ejecutado — imágenes construidas exitosamente:
   - `onchain-bot-prod-backend`: 1.35 GB
   - `onchain-bot-prod-frontend`: 74 MB
5. **`docker compose up -d`** ejecutado — 4 containers UP

## Resultados

| Componente | Estado | Observación |
|------------|--------|-------------|
| **postgres** | ✅ healthy | `pg_isready` returns "accepting connections" |
| **redis** | ✅ healthy | `PING` returns `PONG` |
| **frontend (nginx)** | ✅ sirve HTTP 200 | Sirve HTML de React/Vite correctamente |
| **backend** | ⚠️ UP pero no listening en 3030 | Node process running, CPU 0%, MEM 140MB. NO binds a 3030 |
| **Networking** | ✅ DNS interno OK | `getent hosts postgres` y `getent hosts redis` resuelven |
| **Healthchecks** | ✅ Configurados | postgres, redis: healthy. frontend: unhealthy* (porque nginx config no devuelve 200 al root) |
| **UFW** | ✅ Correcto | 3030/5173 solo Tailscale (100.64.0.0/10), 5432/6379 NO expuestos |
| **Tailscale** | ✅ Activo | `cryptoganster.tailf01c61.ts.net` → 100.84.4.28 |

## Hallazgo: backend se queda en init con placeholders

**Síntoma:** El container del backend arranca, el proceso `node dist/src/main.js` corre, usa 140MB de RAM, pero:
- NO loguea nada a stdout (logs vacíos)
- NO escucha en puerto 3030 (`/proc/net/tcp` muestra ports random, no 3030)
- CPU 0% (idle, no está en loop)
- Healthcheck Docker marca "unhealthy"

**Causa raíz probable:** Los placeholders de Telegram (`INGESTION_TELEGRAM_MTPROTO_SESSION=smoke_test_session_placeholder_invalid`) hacen que el `TelegramMtprotoListenerAdapter` intente autenticar con un session string inválido. La librería `telegram` (gramJS) probablemente se queda esperando respuesta del servidor o hace retry infinito. El bootstrap de NestJS no completa (no llega a `app.listen(3030)`) porque el `onModuleInit()` de `TelegramIngestionModule` no retorna.

**Implicación para el deploy real:** Con credenciales reales (session string válido), este problema desaparece. El backend arrancará normalmente y bind a 3030.

## Fixes aplicados durante el smoke test

1. **docker-compose.prod.yml** — Añadido `env_file: .env.production` a los servicios `postgres` y `redis`. Sin esto, `${POSTGRES_PASSWORD:?...}` falla porque la interpolación de variables ocurre ANTES de cargar el `env_file` del servicio. (Commit `81ef7b7`)

2. **`.env` symlink** — El `env_file` en docker compose para interpolación se llama específicamente `.env` (no configurable). Se creó symlink `ln -sf .env.production .env` para resolver esto.

## Cleanup

Stack bajado con `docker compose down -v` después del smoke test. Volúmenes eliminados (sin data residual).

## Pendiente para el deploy real (acción del usuario)

1. Sustituir `apps/backend/.env.production` en el droplet con credenciales reales de PRODUCCIÓN
2. Re-crear el symlink `.env` (si se borró): `cd /opt/onchain-bot/apps/backend && ln -sf .env.production .env`
3. `docker compose up -d` desde `/opt/onchain-bot/apps/backend`
4. Esperar ~40s para healthchecks maduren
5. `curl http://localhost:3030/api/health` → debe responder `{"status":"ok",...}`
6. `curl http://localhost:5173/` → debe servir HTML
7. Configurar GitHub Secrets (`SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`) y push a `master` para deploys automatizados

## Comando de validación post-deploy real

```bash
ssh root@cryptoganster.tailf01c61.tsnet
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.prod.yml ps        # todos UP
curl -sf http://localhost:3030/api/health          # OK
curl -sf http://localhost:5173/ | head -3          # HTML
docker compose logs backend --tail 20               # sin errores críticos
```

Desde tu Mac (vía Tailscale):
```bash
curl -sf http://cryptoganster.tailf01c61.ts.net:3030/api/health
curl -sf http://cryptoganster.tailf01c61.ts.net:5173/
```

Verificar que NO se puede acceder desde internet público:
```bash
nc -zv 144.126.203.139 5432    # connection refused
nc -zv 144.126.203.139 6379    # connection refused
```