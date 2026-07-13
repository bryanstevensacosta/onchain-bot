# deployment-prod - Work Plan (✅ COMPLETE)

## TL;DR (For humans)

**What you'll get:** Tu bot de Telegram desplegado en producción en un VPS de DigitalOcean, accesible solo por ti via Tailscale sin necesidad de dominio público. Postgres + Redis + Backend corriendo en Docker, con despliegue automático via **GitHub Actions (Free, repo privado, push a master)** y migraciones de base de datos controladas. Frontend disponible cuando lo necesites en `http://cryptoganster.tailf01c61.ts.net:5173`. Entornos de desarrollo y producción totalmente separados con sus propias cuentas de Telegram, sin riesgo de rate limiting compartido.

**Why this approach:** GitHub Free te da 2,000 Actions minutos/mes para repos privados — más que suficiente para cientos de deploys. Las variables de entorno de producción (30+ vars) se crean **una vez a mano** en el droplet; GitHub Secrets guardan solo la llave SSH. Esto evita tener 30+ secrets en GitHub y protege las API keys. El build se hace **directo en el droplet** (no usa GitHub Packages, que solo tiene 500 MB). docker-compose en un solo VPS es lo más simple y barato. Tailscale evita exponer puertos a internet. Cuentas Telegram separadas eliminan el rate limiting de raíz.

**What it will NOT do:** No tendrá zero-downtime real (hay segundos de caída al reiniciar container). No tendrá monitoreo/Prometheus (se añade después). No modificará la lógica de negocio existente. No usará GitHub Packages (build directo en droplet). No creará mocks de Telegram.

**Effort:** Large (6 waves, ~15 todos)
**Risk:** Medium — primer deploy, migraciones de DB requieren cuidado
**Decisions to sanity-check:** Push a `master` (no `main` ni `production`). .env.production se crea a mano en el droplet — respaldarlo localmente. Build on droplet (no GHCR).

---

> TL;DR (machine): Large effort | Medium risk | 6 waves / 18 todos | Dockerizar backend+frontend, docker-compose.prod con Tailscale, GH Actions CI/CD, TypeORM migrations, env separation, rollback runbook

## Scope

### Must have

- Dockerfile multi-stage para backend NestJS (build + production)
- Dockerfile para frontend (Vite build + nginx static serve)
- `.dockerignore` para backend y frontend
- `docker-compose.prod.yml` con: postgres, redis, backend, frontend (opcional)
- Separación de entornos: `.env.dev` + `.env.production` + `.env.production` en `.gitignore`
- Endpoint `GET /health` en backend (expandir el existente `/ingestion/health`)
- Scripts npm: `migration:generate`, `migration:run`, `db:backup`
- `synchronize: false` en producción (env var `DATABASE_SYNCHRONIZE=false`)
- GitHub Actions workflow: `.github/workflows/deploy.yml` — **trigger: push a master**
- **Estrategia de secrets híbrida:**
  - GitHub Secrets SOLO para: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`
  - `.env.production` se crea UNA VEZ a mano en `/opt/onchain-bot/.env.production` (contiene las 30+ vars)
  - El CI/CD NUNCA sobrescribe .env.production — solo lo referencia
- **Build directo en el droplet** (NO usa GitHub Packages/GHCR — el Free plan solo da 500 MB, insuficiente)
- Healthcheck en Dockerfile + docker-compose
- UFW config: abrir puertos 3030 y 5173 (Tailscale-only)
- Rollback runbook documentado en `.omo/runbooks/rollback-deploy.md`
- Respaldo automático de DB antes de migraciones

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO modificar la lógica de negocio del backend (ni una línea de los BCs)
- NO crear sistemas de mock/fake ingestion
- NO modificar TelegramListenerPort ni TelegramPublisherPort
- NO implementar zero-downtime (blue/green) — fuera de scope
- NO implementar monitoreo/Prometheus/ELK — fuera de scope
- NO comprar dominio ni SSL — se usa Tailscale
- NO migrar a Kubernetes — fuera de scope
- NO modificar el frontend React — solo Dockerfile y nginx config
- NO exponer Postgres/Redis al host — solo red interna Docker

## Verification strategy

> Zero human intervention — all verification is agent-executed.

- **Test decision:** tests-after (verificación manual post-deploy). Los tests unitarios existentes (306 tests Jest) se ejecutan en CI.
- **Evidence:** `.omo/evidence/` por cada tarea
- **Verificación de cada todo:** comandos exactos que demuestran que funciona (docker build, docker compose up, curl healthcheck, npm run migration:run, etc.)

## Execution strategy

### Parallel execution waves

| Wave | Nombre            | Descripción                                                                        | # Todos |
| ---- | ----------------- | ---------------------------------------------------------------------------------- | ------- |
| 0    | Foundation        | Infraestructura base: .dockerignore, .env separation, health endpoint, npm scripts | 4       |
| 1    | Backend Docker    | Dockerfile multi-stage + docker-compose.prod servicios core                        | 3       |
| 2    | Frontend Docker   | Dockerfile frontend + integración en compose (puede saltarse si no se necesita)    | 2       |
| 3    | CI/CD             | GitHub Actions workflow + secrets                                                  | 3       |
| 4    | Deploy & Rollback | Primer deploy, UFW, backup, rollback docs                                          | 3       |
| 5    | Validation        | Tests de integración post-deploy, documentación                                    | 2       |

**Orden estricto:** Wave 0 → Wave 1 → Wave 3 → Wave 4 → Wave 5. Wave 2 puede ir en paralelo con Wave 1.

### Dependency matrix

| Todo | Description            | Depends on | Blocks | Can parallelize with |
| ---- | ---------------------- | ---------- | ------ | -------------------- |
| 1    | .dockerignore          | —          | 5, 7   | —                    |
| 2    | .env separation        | —          | 13     | 1                    |
| 3    | health endpoint        | —          | —      | 1, 2                 |
| 4    | npm scripts            | —          | 10     | 1, 2, 3              |
| 5    | backend Dockerfile     | 1          | 6      | 7                    |
| 6    | docker-compose.prod    | 5          | 9, 11  | —                    |
| 7    | frontend Dockerfile    | 1          | 8      | 5                    |
| 8    | frontend in compose    | 7          | —      | 6                    |
| 9    | GH Actions workflow    | 6          | 12     | —                    |
| 10   | GH Secrets setup       | 4          | 12     | —                    |
| 11   | UFW + Tailscale        | 6          | 12     | —                    |
| 12   | First deploy           | 9, 10, 11  | 14     | —                    |
| 13   | Rollback runbook       | 2, 12      | —      | 14                   |
| 14   | Post-deploy validation | 12         | —      | 13                   |
| 15   | Deploy docs            | —          | —      | 14                   |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 0 — Foundation

- [x] 1. Crear `.dockerignore` para backend y frontend
     What to do / Must NOT do: Crear `.dockerignore` en raíz del repo y otro en `apps/backend/`. Excluir node_modules, dist, .env, .git, logs, .cache. NO incluir secrets.
     Parallelization: Wave 0 | Blocked by: — | Blocks: 5, 7
     References: Docker best practices: exclude build artifacts, dev deps, secrets. Metis finding #15.
     Acceptance criteria (agent-executable): `ls apps/backend/.dockerignore` y contiene "node_modules", "dist", ".env". `ls apps/frontend/.dockerignore` idem.
     QA scenarios (name the exact tool + invocation): happy: `cat apps/backend/.dockerignore` debe listar patrones. failure: no crear el archivo → build incluiría basura.
     Commit: Y | chore(docker): add .dockerignore for backend and frontend

- [x] 2. Separar variables de entorno: `.env.dev` + `.env.production`
     What to do / Must NOT do:
  - Renombrar `apps/backend/.env` → `apps/backend/.env.dev` (el .env actual es el de desarrollo)
  - Crear `apps/backend/.env.example` limpio (sin valores reales) — ya existe en raíz, actualizar
  - Crear `apps/backend/.env.production` con TODAS las mismas keys pero valores VACÍOS (solo como plantilla)
  - Añadir `.env.production` a `.gitignore` del repo raíz
  - NO incluir secrets reales de producción en ningún archivo commiteado
  - Para la ingesta Telegram: usar prefijo consistente `INGESTION_TELEGRAM_MTPROTO_*` (ya es así)
  - Para bot tokens: `TELEGRAM_BOT_TOKEN`, `VIP_CALLS_BOT_TOKEN`, `CHAIN_DEXTER_BOT_TOKEN`
    Parallelization: Wave 0 | Blocked by: — | Blocks: 15
    References:
  - apps/backend/.env (actual dev con secrets: lines 1-101)
  - .env.example (raíz del repo: 171 lines)
  - apps/backend/src/shared/common/config/app.config.ts:178-365 (env vars mapeadas)
  - Metis finding #6 y #13
    Acceptance criteria (agent-executable):
  - `cat .gitignore | grep ".env.production"` → existe entrada
  - `diff <(grep -oP '^[A-Z_]+(?==)' apps/backend/.env.dev | sort) <(grep -oP '^[A-Z_]+(?==)' apps/backend/.env.production | sort)` → sin diff de nombres de vars
  - `grep -c '=' apps/backend/.env.production` → mismos keys que .env.dev
    QA scenarios: happy: `cp apps/backend/.env.production apps/backend/.env.prod.local && vim ...` → production env listo. failure: commiterar .env.production con secrets → .gitignore lo previene.
    Commit: Y | chore(env): separate dev and production env files, add .env.production to gitignore

- [x] 3. Crear endpoint `GET /api/health` estándar (o expandir el existente)
     What to do / Must NOT do:
  - El proyecto ya tiene `/ingestion/health` (ingestion-health.controller.ts). Necesitamos un healthcheck GENERAL en `/api/health`.
  - NO modificar el ingestion-health existente.
  - Crear `apps/backend/src/health/` con HealthController que responda `{ status: 'ok', uptime, timestamp }`.
  - Registrar en AppModule o crear HealthModule.
  - Este endpoint es usado por Docker healthcheck y monitoreo.
    Parallelization: Wave 0 | Blocked by: — | Blocks: 7
    References:
  - apps/backend/src/telegram/ingestion/api/http/ingestion-health.controller.ts (existing health endpoint)
  - apps/backend/src/app.module.ts (para registrar nuevo módulo)
  - Metis finding #10 (no healthcheck endpoint)
    Acceptance criteria (agent-executable): `curl -f http://localhost:3030/api/health` → `{"status":"ok",...}`
    QA scenarios: happy: `curl -s http://localhost:3030/api/health | jq .status == "ok"`. failure: endpoint no existe → curl retorna 404.
    Commit: Y | feat(health): add general healthcheck endpoint for Docker health probes

- [x] 4. Añadir scripts npm para migrations y backup
     What to do / Must NOT do:
  - En `apps/backend/package.json` añadir scripts:
    - `"migration:generate": "npx typeorm-ts-node-commonjs migration:generate"`
    - `"migration:run": "npx typeorm-ts-node-commonjs migration:run"`
    - `"migration:revert": "npx typeorm-ts-node-commonjs migration:revert"`
    - `"db:backup": "pg_dump ..."` (script bash simple)
  - Verificar que TypeORM CLI esté configurado (tsconfig, dataSource, etc.)
  - Crear `.omo/scripts/backup-db.sh` para backup pre-deploy
  - NO modificar los scripts existentes (test, build, dev)
    Parallelization: Wave 0 | Blocked by: — | Blocks: 10
    References:
  - apps/backend/package.json (para añadir scripts:12-17)
  - TypeORM migrations docs
  - Metis finding #4 (no migration infrastructure)
    Acceptance criteria (agent-executable): `npm run migration:run --prefix apps/backend` → ejecuta sin error (en env vacío no hay nuevas migrations). `ls .omo/scripts/backup-db.sh` → existe.
    QA scenarios: happy: `npm run migration:generate --prefix apps/backend -- -n TestMigration` → genera archivo. failure: migration falla con error de conexión → muestra error claro.
    Commit: Y | chore(scripts): add migration and database backup npm scripts

### Wave 1 — Backend Dockerization

- [x] 5. Crear Dockerfile multi-stage para backend (NestJS)
     What to do / Must NOT do:
  - Crear `apps/backend/Dockerfile` con dos stages:
    - **build stage**: `node:22-alpine`, instalar dependencias (npm ci), `npm run build`
    - **production stage**: `node:22-alpine`, copiar solo `dist/`, `node_modules/` (production), `package.json`
  - Copiar `.dockerignore` ya creado
  - Exponer puerto `3030` (no `3000`)
  - Healthcheck: `CMD wget --no-verbose --tries=1 --spider http://localhost:3030/api/health || exit 1`
  - `USER node` (no correr como root)
  - NO instalar devDependencies
  - NO copiar .env, src/, tests/
  - NO usar `npm run start:prod` (usar `node dist/main.js` directo)
    Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6
    References:
  - NestJS Docker best practices
  - apps/backend/package.json (deps, scripts)
  - apps/backend/nest-cli.json (build config)
  - Metis finding #1 y #14
    Acceptance criteria (agent-executable): `docker build -t onchain-bot-backend:test -f apps/backend/Dockerfile .` → build exitoso en <5min. `docker run --rm onchain-bot-backend:test node -e "require('./dist/main')"` → no error.
    QA scenarios: happy: build + run → healthcheck pasa. failure: build sin .dockerignore → imagen >1GB. failure: healthcheck sin endpoint → container marked unhealthy.
    Commit: Y | feat(docker): add multi-stage Dockerfile for NestJS backend

- [x] 6. Crear `docker-compose.prod.yml` con servicios core (postgres + redis + backend + healthchecks)
     What to do / Must NOT do:
  - Crear `apps/backend/docker-compose.prod.yml`
  - Servicios:
    - `postgres`: image postgres:16-alpine, **sin puertos expuestos al host**, restart unless-stopped, volume persistente, healthcheck (copiado de dev compose), env vars desde archivo env
    - `redis`: image redis:7-alpine, **sin puertos expuestos al host**, restart unless-stopped, volume persistente, --requirepass desde env
    - `backend`: build desde Dockerfile, puerto `3030:3030` (expuesto al host para Tailscale), restart unless-stopped, env_file: .env.production, depends_on con condition: healthy para postgres y redis, healthcheck: `wget --spider http://localhost:3030/api/health`, deploy.resources.limits: memory 512M
  - Red personalizada `onchain-net` (bridge) para los 3 servicios
  - Incluir healthchecks para los 3 servicios (backend, postgres, redis)
  - NO exponer puertos de postgres/redis al host
  - NO incluir pgAdmin
  - NO usar .env dev — usar env_file: .env.production
  - Variables críticas: DATABASE_SYNCHRONIZE=false, NODE_ENV=production
    Parallelization: Wave 1 | Blocked by: 5 | Blocks: 9, 11
    References:
  - apps/backend/docker-compose.yml (dev version, 62 lines)
  - apps/backend/.env.production (env vars)
  - apps/backend/Dockerfile (creado en task 5, healthcheck incluido)
  - Metis finding #7 (exposed ports), #10 (healthcheck), #11 (no restart), #16 (resource limits)
    Acceptance criteria (agent-executable): `docker compose -f apps/backend/docker-compose.prod.yml config` → salida válida sin errores. `grep healthcheck apps/backend/docker-compose.prod.yml` → 3 healthchecks (postgres, redis, backend).
    QA scenarios: happy: `docker compose -f apps/backend/docker-compose.prod.yml up -d` → 3 containers up, healthchecks healthy. failure: backend no conecta a postgres → depends_on condition:healthy lo frena.
    Commit: Y | feat(docker): add production docker-compose with healthchecks, resource limits, and internal network

### Wave 2 — Frontend Dockerization (opcional, paralelo con Wave 1)

- [x] 7. Crear Dockerfile multi-stage para frontend (React + Vite)
     What to do / Must NOT do:
  - Crear `apps/frontend/Dockerfile`:
    - **build stage**: `node:22-alpine`, npm ci, `npm run build` → genera `dist/`
    - **production stage**: `nginx:alpine`, copiar `dist/` a `/usr/share/nginx/html`, copiar nginx.conf personalizado
  - Crear `apps/frontend/nginx.conf`:
    - SPA fallback: `try_files $uri $uri/ /index.html`
    - proxy `/api/` al backend: `proxy_pass http://backend:3030`
  - NO exponer a internet — solo interno en Docker o Tailscale
  - NO usar Vite dev server en producción
    Parallelization: Wave 2 | Blocked by: 1 | Blocks: 8
    References:
  - apps/frontend/package.json
  - Vite build output to dist/
  - Metis finding #9
    Acceptance criteria (agent-executable): `docker build -t onchain-bot-frontend:test -f apps/frontend/Dockerfile .` → build exitoso. `docker run --rm -p 8080:80 onchain-bot-frontend:test` → curl localhost:8080 retorna HTML.
    QA scenarios: happy: build + run → nginx sirve app SPA. failure: build falla → verificar dist/ existe.
    Commit: Y | feat(docker): add multi-stage Dockerfile for Vite frontend with nginx

- [x] 8. Integrar frontend en docker-compose.prod.yml
     What to do / Must NOT do:
  - Añadir servicio `frontend` en `docker-compose.prod.yml`:
    - build desde `apps/frontend/Dockerfile`
    - puerto `5173:80` (expuesto para Tailscale)
    - restart unless-stopped
    - depends_on: backend (condition: started)
    - NO exponer a internet públicamente
  - El nginx.conf debe proxy_pass al backend por nombre de servicio Docker (`http://backend:3030`)
  - NO modificar docker-compose.prod.yml si el usuario no quiere frontend desplegado
    Parallelization: Wave 2 | Blocked by: 7 | Blocks: —
    References:
  - apps/frontend/nginx.conf (creado en task 7)
  - docker-compose.prod.yml (creado en task 6)
    Acceptance criteria (agent-executable): `docker compose -f apps/backend/docker-compose.prod.yml config | grep -A 5 frontend` → frontend service existe. `curl -s http://localhost:5173 | head -1` → contiene "<!DOCTYPE html>".
    QA scenarios: happy: curl 5173 → HTML renderizado. failure: backend caído → frontend carga pero API falla.
    Commit: Y | feat(docker): integrate frontend nginx service in production compose

### Wave 3 — CI/CD Pipeline

- [x] 9. Crear GitHub Actions workflow `.github/workflows/deploy.yml` con build on droplet, backup y migrations
     What to do / Must NOT do:
  - Crear `.github/workflows/deploy.yml` con jobs:
    - **test**: `npm ci`, `npm test` (los 306 tests existentes)
    - **deploy** (solo si tests pasan):
      - SSH al droplet con la key de GitHub Secrets
      - `cd /opt/onchain-bot`
      - `git pull origin master`
      - `bash scripts/backup-db.sh` (backup PRE-migration)
      - `docker compose -f docker-compose.prod.yml build` (build DIRECTO en el droplet)
      - `docker compose -f docker-compose.prod.yml run --rm -T backend npm run migration:run`
      - `docker compose -f docker-compose.prod.yml up -d --force-recreate`
  - Trigger: **push a `master`** (branch única)
  - **NO usar GitHub Packages/GHCR** — build directo en droplet (Free plan: 500 MB insuficiente para imágenes Docker)
  - **NO sobrescribir .env.production** — el droplet ya lo tiene, el CI/CD lo referencia
  - Si migration falla, el workflow se detiene antes del `up -d`
  - Usar `-T` flag en docker compose run para evitar TTY issues en CI
  - NO incluir secrets en el YAML (usar `${{ secrets.X }}`)
  - NO hacer deploy si tests fallan
    Parallelization: Wave 3 | Blocked by: 6 | Blocks: 12
    References:
  - GitHub Actions docs
  - GitHub Free pricing: 2,000 min/mes para privados, 500 MB Packages
  - apps/backend/package.json scripts (creados en task 4)
  - Metis finding #2, #3, #4
    Acceptance criteria (agent-executable):
  - `ls .github/workflows/deploy.yml` → existe
  - `cat .github/workflows/deploy.yml | grep "git pull origin master"` → paso existe
  - `cat .github/workflows/deploy.yml | grep "docker compose build"` → build en droplet
  - `cat .github/workflows/deploy.yml | grep -A 5 "migration:run"` → paso existe antes de `up -d`
  - `cat .github/workflows/deploy.yml | grep -A 5 "backup"` → backup antes de migration
  - `cat .github/workflows/deploy.yml | grep -c "secrets\."` > 0
    QA scenarios: happy: push a master → tests → SSH → build → backup → migration → deploy. failure: test falla → no deploy. failure: migration falla → backup listo para rollback.
    Commit: Y | ci(workflow): add GitHub Actions deploy pipeline (build on droplet, backup, migrations, push to master)

- [x] 10. Configurar GitHub Secrets (solo SSH — estrategia híbrida)

### Wave 4 — Deploy & Rollback

- [x] 11. Configurar UFW y Tailscale para acceso seguro
      What to do / Must NOT do:
  - En el droplet, ejecutar:
    - `ufw allow 3030/tcp` (backend)
    - `ufw allow 5173/tcp` (frontend, opcional)
  - Idealmente restringir a subnet Tailscale: `ufw allow from 100.64.0.0/10 to any port 3030`
  - Verificar que Tailscale esté corriendo: `tailscale status`
  - Confirmar que `cryptoganster.tailf01c61.ts.net` resuelve a la IP del droplet
  - Verificar que los puertos de postgres/redis NO estén abiertos en UFW
  - NO abrir puertos a 0.0.0.0/0 — restringir a Tailscale subnet
  - NO desactivar UFW
    Parallelization: Wave 4 | Blocked by: 6 | Blocks: 12
    References:
  - Droplet audit: UFW active con puertos 22,80,443,4845 abiertos
  - Tailscale IP: 100.84.4.28, subnet: 100.64.0.0/10
  - MagicDNS: cryptoganster.tailf01c61.ts.net
    Acceptance criteria (agent-executable): `ssh root@144.126.203.139 "ufw status | grep 3030"` → "3030 ALLOW". `curl -s http://cryptoganster.tailf01c61.ts.net:3030/api/health` desde tu Mac → responde.
    QA scenarios: happy: curl desde Mac funciona, curl desde internet no. failure: puerto no abierto → curl timeout.
    Commit: N (server config, no code to commit)

- [x] 12. Realizar el primer deploy manual + automatizado
      What to do / Must NOT do:
  - Preparar droplet:
    - `mkdir -p /opt/onchain-bot /opt/onchain-bot/scripts /opt/onchain-bot/backups`
    - Copiar `docker-compose.prod.yml` a `/opt/onchain-bot/`
    - Crear `/opt/onchain-bot/.env.production` con valores reales (NUNCA commiteados)
    - Copiar `scripts/backup-db.sh` a `/opt/onchain-bot/scripts/`
  - Construir imágenes Docker localmente y pushearlas a GHCR
  - `docker compose -f /opt/onchain-bot/docker-compose.prod.yml up -d`
  - Verificar: `docker compose ps`, `curl localhost:3030/api/health`, logs
  - Luego verificar que GH Actions deploy funciona con un push a production
  - NO usar --force-recreate sin antes verificar health de postgres
  - NO perder el backup pre-migration
    Parallelization: Wave 4 | Blocked by: 9, 10, 11 | Blocks: 15
    References:
  - Droplet path: /opt/onchain-bot
  - docker-compose.prod.yml (creado en task 6)
  - .github/workflows/deploy.yml (creado en task 9)
    Acceptance criteria (agent-executable):
  - `ssh root@144.126.203.139 "curl -sf http://localhost:3030/api/health"` → OK
  - `ssh root@144.126.203.139 "docker compose -f /opt/onchain-bot/docker-compose.prod.yml ps --services"` → lista postgres, redis, backend
  - `ssh root@144.126.203.139 "docker compose -f /opt/onchain-bot/docker-compose.prod.yml ps --status running"` → 3 running
    QA scenarios: happy: todo UP, healthcheck OK. failure: postgres no arranca → backend depende de él, no inicia.
    Commit: N (infra setup, no code)

- [x] 13. Crear runbook de rollback
      What to do / Must NOT do:
  - Crear `.omo/runbooks/rollback-deploy.md` con procedimiento paso a paso
  - Crear `.omo/scripts/backup-db.sh` que:
    1. Corre `pg_dump` contra postgres del container Docker
    2. Guarda en `/opt/onchain-bot/backups/pre-deploy-$(date +%Y%m%d_%H%M%S).dump`
    3. Limpia backups > 7 días
  - El runbook debe incluir:
    - Backup DB si migration falló
    - Revertir a imagen Docker previa (por SHA tag)
    - Restart compose
    - Verificar health
  - NO asumir que el deploy siempre funciona
  - NO borrar imágenes Docker viejas inmediatamente
    Parallelization: Wave 4 | Blocked by: 2, 12 | Blocks: —
    References: Metis finding #11 (no rollback strategy), #18 (no backup)
    Acceptance criteria (agent-executable): `ls .omo/runbooks/rollback-deploy.md` → existe. `ls .omo/scripts/backup-db.sh` → existe. `cat .omo/scripts/backup-db.sh | grep pg_dump` → usa pg_dump.
    QA scenarios: happy: backup script funciona → dump en /opt/onchain-bot/backups/. failure: sin backup → rollback manual requiere dump previo.
    Commit: Y | docs(rollback): add deployment rollback runbook and db backup script

### Wave 5 — Validation & Documentation

- [x] 14. Validación post-deploy completa
      What to do / Must NOT do:
  - Verificar integración completa desde la Mac:
    - `curl http://cryptoganster.tailf01c61.ts.net:3030/api/health` → OK
    - `curl http://cryptoganster.tailf01c61.ts.net:3030/kols` → lista de KOLs
    - `curl http://cryptoganster.tailf01c61.ts.net:3030/ingestion/health` → health de ingesta
    - `curl http://cryptoganster.tailf01c61.ts.net:5173` → frontend HTML (si está desplegado)
  - Verificar que NO se puede acceder desde internet público:
    - Usar port-scanner online en puerto 3030 desde otra red
  - Verificar que postgres NO está expuesto:
    - `nc -zv 144.126.203.139 5432` → connection refused
  - Verificar logs del backend: `docker compose logs backend --tail 50`
  - NO asumir que funciona sin verificar cada endpoint
    Parallelization: Wave 5 | Blocked by: 12 | Blocks: —
    References:
  - Droplet IP: 144.126.203.139
  - Tailscale MagicDNS: cryptoganster.tailf01c61.ts.net
  - Endpoints: /api/health, /kols, /ingestion/health
    Acceptance criteria (agent-executable): Todos los curls retornan 200 OK. Puerto 5432 no responde desde internet.
    QA scenarios: happy: todos los endpoints OK, DB no expuesta. failure: backend no responde → revisar logs.
    Commit: N (validation, no code)

- [x] 15. Documentar la configuración de entorno y despliegue
      What to do / Must NOT do:
  - Actualizar `apps/backend/README.md` con sección de deploy:
    - Requisitos: Docker, Tailscale, acceso SSH
    - Variables de entorno necesarias
    - Cómo hacer deploy manual
    - Cómo funciona CI/CD
  - Crear `docs/deployment/ENVIRONMENTS.md`:
    - Dev vs Prod: qué cambia
    - Cuentas Telegram separadas
    - Cómo crear una cuenta dev de Telegram (segundo número, my.telegram.org)
    - Cómo regenerar session string para dev
  - NO incluir secrets reales
  - NO duplicar info del runbook de rollback
    Parallelization: Wave 5 | Blocked by: — | Blocks: —
    References:
  - apps/backend/README.md (backend readme existente)
  - .omo/runbooks/rollback-deploy.md
    Acceptance criteria (agent-executable): `cat apps/backend/README.md | grep -c "deploy\|production\|Docker"` → >0. `ls docs/deployment/ENVIRONMENTS.md` → existe.
    QA scenarios: happy: README actualizado → nuevo dev puede deployar. failure: documentación faltante → confusión en el futuro.
    Commit: Y | docs(deployment): add production deployment guide and environment setup

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — Verificar que cada todo del plan se completó, evidencia existe
- [x] F2. Security review — .env.production no está en git, secrets usan GitHub Secrets, puertos no expuestos a internet, Postgres/Redis solo red interna
- [x] F3. Real QA — Desde la Mac (con Tailscale): curl health, curl API, curl frontend, verificar que NO hay acceso desde internet público
- [x] F4. Rollback test — Ejecutar backup-db.sh, verificar que el dump se crea, simular rollback

## Commit strategy

- Wave 0 (Foundation): 4 commits independientes, `chore:` y `feat:`
- Wave 1 (Backend Docker): 2 commits, `feat(docker):`
- Wave 2 (Frontend Docker): 2 commits, `feat(docker):`
- Wave 3 (CI/CD): 2 commits (workflow + secrets doc), `ci(workflow):` y `docs(secrets):`
- Wave 4 (Deploy): 1 commit (scripts + runbook), `docs(rollback):`
- Wave 5 (Docs): 1 commit, `docs(deployment):`
- **Total**: ~12 commits. Push directo a `master`.

## Success criteria

1. Backend corriendo en droplet: `curl http://cryptoganster.tailf01c61.ts.net:3030/api/health` → 200 OK
2. Frontend accesible: `curl http://cryptoganster.tailf01c61.ts.net:5173` → HTML
3. Postgres NO accesible desde internet: puerto 5432 no responde externamente
4. CI/CD funcional: **push a master** → GitHub Actions corre test → SSH → build on droplet → backup → migration → deploy automático
5. Estrategia híbrida de secrets: GitHub Secrets solo tiene SSH_PRIVATE_KEY, SSH_HOST, SSH_USER. `.env.production` existe solo en el droplet.
6. Migraciones controladas: `npm run migration:run` aplica cambios sin synchronize
7. Backup funcional: backup-db.sh genera dump en /opt/onchain-bot/backups/
8. Cuentas Telegram separadas: dev usa una cuenta, prod usa otra — sin rate limits compartidos
9. Rollback documentado: runbook en `.omo/runbooks/rollback-deploy.md`
