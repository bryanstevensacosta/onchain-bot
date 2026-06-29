# Rollback Runbook

Si después de un deploy algo va mal (el backend no arranca, las migrations fallaron, o el comportamiento es incorrecto), sigue este procedimiento para volver a un estado conocido.

## Prereq

- Acceso SSH al droplet: `ssh root@144.126.203.139`
- Backups existen en `/opt/onchain-bot/backups/pre-deploy-*.dump`
- Imagen Docker previa etiquetada (el último build antes del actual)

## Procedimiento

### 1. SSH al droplet

```bash
ssh root@144.126.203.139
cd /opt/onchain-bot
```

### 2. Rollback de base de datos (si la migration falló o introdujo datos malos)

Lista los backups disponibles:

```bash
ls -lh /opt/onchain-bot/backups/
```

Restaura el más reciente (ajusta el nombre):

```bash
# Detén el backend primero (libera conexiones a Postgres)
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.prod.yml stop backend

# Restaura el dump
docker exec -i onchain-bot-postgres \
  pg_restore -U alpha_meta_token_scanner -d alpha_meta_token_scanner \
  --clean --if-exists --no-owner --no-acl \
  < /opt/onchain-bot/backups/pre-deploy-YYYYMMDD_HHMMSS.dump
```

### 3. Rollback de imagen Docker (rebuild desde commit anterior)

```bash
# Ve el último commit bueno
git log --oneline | head -10

# Checkout a ese commit
git checkout <commit-sha>

# Rebuild + restart
cd apps/backend
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```

### 4. Si nada de lo anterior funciona — último recurso

```bash
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### 5. Verificación post-rollback

```bash
curl -s http://localhost:3030/api/health | jq .
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail 30
```

## Cuándo NO hacer rollback

- Si solo una API key está mal: edita `.env.production` y `docker compose restart backend`.
- Si el problema es de performance: revisa `docker stats` antes de rollbackear.

## Prevención: por qué este runbook es seguro

- Cada deploy genera un `pre-deploy-YYYYMMDD_HHMMSS.dump` antes de migrations.
- Solo se retienen 7 días de backups (cleanup automático en `backup-db.sh`).
- Las images Docker previas quedan en el droplet (no se borran automáticamente).

## Respaldo manual de emergencia (sin deploy)

```bash
ssh root@144.126.203.139 "cd /opt/onchain-bot && \
  POSTGRES_CONTAINER=onchain-bot-postgres \
  POSTGRES_USER=alpha_meta_token_scanner \
  POSTGRES_DB=alpha_meta_token_scanner \
  POSTGRES_PASSWORD=\$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2-) \
  bash scripts/backup-db.sh"
```