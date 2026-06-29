# Environments: Dev vs Production

Este repo corre en dos ambientes totalmente aislados. **Ninguno comparte credenciales, cuentas de Telegram, ni base de datos.**

## Resumen rápido

| | Development (local Mac) | Production (droplet DO) |
|---|---|---|
| **Dónde corre** | `npm run dev:backend` (o Docker local) | docker-compose.prod en `/opt/onchain-bot` |
| **Branch de Git** | cualquier feature branch | `master` (deploy automático) |
| **Env file** | `apps/backend/.env.dev` (en gitignore) | `/opt/onchain-bot/.env.production` (en el droplet) |
| **Telegram cuenta** | Tu cuenta personal de testing | Cuenta de Telegram DEDICADA a producción |
| **MTProto session** | Sesión de tu cuenta dev | Sesión de la cuenta de producción |
| **Bot tokens** | Bots de @BotFather para dev | Bots de @BotFather para prod (distintos tokens) |
| **Postgres** | Local en Docker (puerto 5432) | Docker container en droplet (sin puerto al host) |
| **Redis** | Local en Docker (puerto 6379) | Docker container en droplet (sin puerto al host) |
| **DB sync** | `synchronize: true` (autogenera schema) | `synchronize: false` (usa migrations) |
| **Acceso** | Tailscale no requerido (localhost) | Tailscale requerido (puertos cerrados a internet) |

## Por qué cuentas separadas de Telegram

Telegram rate-limita la ingesta de MTProto por **session/cuenta** (no por IP). Si local y prod usan el mismo `INGESTION_TELEGRAM_MTPROTO_SESSION`, comparten el mismo rate limit bucket — duplicar la frecuencia de polls = duplicar la velocidad de hit a FLOOD_WAIT.

**Regla:** una cuenta de Telegram por ambiente. La cuenta de producción se crea con un número dedicado (puede ser un SIM secundario o un número VoIP).

## Cómo crear una cuenta de Telegram dev (si aún no tienes)

1. Compra un SIM secundario o usa un servicio VoIP (Google Voice, TextNow) — número NO vinculado a tu cuenta personal.
2. Desde tu Mac, abre Telegram y registra el nuevo número.
3. Para MTProto: ve a https://my.telegram.org/apps y crea una app.
4. Guarda el `api_id` y `api_hash` en un lugar seguro.
5. Genera la `session`:
   ```bash
   cd apps/backend
   npm run telegram:gen-session
   ```
   Te pedirá `api_id`, `api_hash`, y `phone` (el número nuevo). Devuelve un session string que va en `INGESTION_TELEGRAM_MTPROTO_SESSION`.

## Cómo rotar/regenerar el session

⚠️ **Cuidado:** regenerar invalida la sesión anterior. Si lo haces en prod mientras está corriendo, el listener falla.

```bash
cd apps/backend
# Backup del anterior por si acaso
cp .env.dev .env.dev.backup
# Regenera
npm run telegram:gen-session
# Actualiza .env.dev con el nuevo session
```

## Crear bots de testing (dev)

1. Habla con @BotFather en Telegram.
2. `/newbot` → nombre → username.
3. Guarda el token en `TELEGRAM_BOT_TOKEN`, `VIP_CALLS_BOT_TOKEN`, `CHAIN_DEXTER_BOT_TOKEN` (todos distintos en dev vs prod).
4. Añade el bot a tu canal de testing (crea un canal privado con tus amigos bots, no uses canales de prod).

## ¿Cómo sabe el código si está en dev o prod?

`process.env.NODE_ENV` se setea en cada `.env`:
- `.env.dev` → `NODE_ENV=development`
- `/opt/onchain-bot/.env.production` → `NODE_ENV=production`

Luego en código: `if (process.env.NODE_ENV === 'production') { ... }` si hay branching condicional.

## Comandos clave

```bash
# Local dev
npm run dev:backend       # backend en :3030
npm run dev:frontend      # frontend en :5173
npm run dev               # ambos en paralelo

# Local migrations
npm run migration:generate -- -n NombreMigracion
npm run migration:run

# Production
ssh root@144.126.203.139
cd /opt/onchain-bot
bash scripts/backup-db.sh   # backup manual
docker compose -f apps/backend/docker-compose.prod.yml ps
docker compose -f apps/backend/docker-compose.prod.yml logs -f backend
```

## ¿Y si accidentalmente uso credenciales de dev en prod?

Rota inmediatamente:
1. Telegram: ve a my.telegram.org/apps, regenera api_hash, regenera session.
2. Bot tokens: @BotFather → /revoke → regenera.
3. API keys: en cada proveedor (Alchemy, Helius, etc.), regenera.
4. Actualiza `.env.production` con los nuevos valores.
5. `docker compose -f docker-compose.prod.yml restart backend`.