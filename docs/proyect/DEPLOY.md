# Despliegue local

Cómo arrancar `alpha-meta-token-scanner` en local, conectado a PostgreSQL vía Docker, sin tocar procesos de otras sesiones.

## Política: nunca matar procesos ajenos

En esta máquina conviven múltiples proyectos que pueden usar los mismos puertos (3000, 5432, 5050, etc.). **No se mata un proceso que no sea de esta sesión** aunque esté ocupando el puerto que queremos.

Si algo ya está escuchando en el puerto objetivo:

1. Se identifica al ocupante sólo para entender qué proyecto es.
2. Se elige un **puerto nuevo** para `alpha-meta-token-scanner` y se documenta aquí.
3. Nunca `kill` sobre un PID que no arrancamos en esta sesión.

Esto aplica también al `postgres` y `pgadmin` del `docker-compose.yml`: si los contenedores ya existen (`Up (healthy)`), se reutilizan, no se recrean.

## 1. Requisitos

- Node.js (mismo major que `package.json`)
- Docker + Docker Compose
- Archivo `.env` con claves reales (ver `.env.example`)

## 2. PostgreSQL en Docker

El `docker-compose.yml` define `postgres` (5432) y `pgadmin` (5050). Si ya están levantados de antes:

```bash
docker ps --filter name=alpha-meta-token-scanner-postgres --format "{{.Names}}\t{{.Status}}"
docker ps --filter name=alpha-meta-token-scanner-pgadmin --format "{{.Names}}\t{{.Status}}"
```

Esperar `Up (healthy)` para `alpha-meta-token-scanner-postgres`. Si no existe y hay que crearlo:

```bash
docker compose up -d postgres
docker exec alpha-meta-token-scanner-postgres pg_isready -U alpha_meta_token_scanner -d alpha_meta_token_scanner
```

No usar `docker compose down` a menos que se quiera borrar el volumen (y por tanto perder las tablas).

## 3. Puerto del bot

`PORT` en `.env` define dónde escucha el bot. Para evitar pisar otros proyectos ya corriendo en este host, **se usa un puerto fuera del rango común**:

| Servicio     | Puerto |
|--------------|--------|
| `alpha-meta-token-scanner`| `3030` |
| `postgres`   | `5432` |
| `pgadmin`    | `5050` |

Si `3030` también está ocupado, saltar al siguiente libre (`3031`, `3032`, …) y **anotarlo aquí**:

```
PORT actual: 3030  (cambiar a ____ si choca)
```

Comprobación rápida:

```bash
lsof -nP -iTCP:3030 -sTCP:LISTEN
# si devuelve algo, no es nuestro: cambiar PORT en .env
```

## 4. Activar Postgres desde la app

Para que el `DatabaseModule` se conecte al Postgres del Docker (en vez de caer a los repos in-memory), `.env` debe tener:

```bash
DATABASE_ENABLED=true
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=alpha_meta_token_scanner
POSTGRES_PASSWORD=alpha_meta_token_scanner
POSTGRES_DB=alpha_meta_token_scanner
DATABASE_SYNCHRONIZE=true
DATABASE_LOGGING=false
```

Con `DATABASE_ENABLED=false`, los 3 repos Tier-1 (`telegram-channel`, `canonical-token-call`, `channel-reputation-stats`) usan sus implementaciones in-memory.

## 5. Arranque

```bash
# build + watch (dev)
npm run start:dev

# producción
npm run build && npm run start:prod
```

Al levantar deberías ver en el log, en orden:

```
Nest application successfully started
Map(2) { 'postgres' => DataSource, ... }
[TelegramChannelSeeder] Auto-started Telegram listener on N channel(s).
[TelegramMtprotoAdapter] Subscribed to N channel(s)
```

Si falta el `Map` de DataSource, `DATABASE_ENABLED` está en `false`.

## 6. Verificación rápida

```bash
curl -s http://localhost:3030/ | head
# o el endpoint que exponga AppController (ver src/app.controller.ts)
```

PGAdmin queda en `http://localhost:5050` con las credenciales del `.env`.
