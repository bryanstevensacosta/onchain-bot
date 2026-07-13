---
slug: frontend-prod-deploy
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/frontend-prod-deploy.md
approach: Add frontend build + deploy steps to deploy.yml (production workflow)
---

# Draft: frontend-prod-deploy

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id                             | outcome                                                           | status | evidence                                                                                     |
| ------------------------------ | ----------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| deploy.yml modification        | Add frontend build + deploy steps to production workflow          | active | `.github/workflows/deploy.yml:122-152` - current "Build and deploy" step only builds backend |
| docker-compose.prod.yml        | Frontend service already defined, only needs workflow to use it   | active | `apps/backend/docker-compose.prod.yml:126-155` - frontend service exists                     |
| nginx.conf                     | Ready for production, proxies API routes to backend:3030          | active | `apps/frontend/nginx.conf` - all API routes proxied                                          |
| staging frontend build context | `context: ../frontend` is BROKEN - Dockerfile paths won't resolve | active | `apps/backend/docker-compose.staging.yml:57-61` vs `apps/frontend/Dockerfile:5-12`           |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption            | adopted default                                           | rationale                                  | reversible? |
| --------------------- | --------------------------------------------------------- | ------------------------------------------ | ----------- |
| Frontend port in prod | Use existing 5173 (host:container 5173:80)                | Already defined in docker-compose.prod.yml | Yes         |
| Healthcheck           | Add frontend healthcheck via port 5173 to deploy workflow | Staging does this, prod should too         | Yes         |
| Rollback strategy     | Include frontend in rollback if backend healthcheck fails | Keep service consistent                    | Yes         |

## Findings (cited - path:lines)

### Backend env setup

- `.env.dev`/`.env` for dev, `.env.staging` on droplet, `.env.production` on droplet
- ConfigModule `envFilePath: ['.env.dev', '.env']` (`apps/backend/src/shared/common/config/app.config.ts`)
- Template files committed: `.env.staging.template`, `.env.production.template`

### Frontend env setup

- Single `apps/frontend/src/shared/config/env.ts:1-4`:
  - `API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3030'`
  - `WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3030'`
- No `.env.development` / `.staging` / `.production` files
- Dockerfile sets `VITE_API_BASE_URL=""` and `VITE_WS_URL=""` at build time (line 14-15)
- **Note**: empty string `""` is used as-is (not null, so `??` fallback doesn't trigger), making API calls relative → nginx proxy

### Deployment

- **Dev frontend**: Vite dev server `:5173` with hot reload, proxy config in `vite.config.ts`
- **Staging frontend**: Docker nginx on `:4173` (auto-deployed via workflow on push to dev)
- **Prod frontend**: ❌ Service in `docker-compose.prod.yml` but never built/started by `deploy.yml`

### Critical: staging frontend Docker build broken

`apps/backend/docker-compose.staging.yml:57-61`:

```yaml
frontend:
  build:
    context: ../frontend # = apps/frontend/
    dockerfile: Dockerfile
```

But `apps/frontend/Dockerfile:5-12`:

```dockerfile
COPY package.json package-lock.json ./          # ✓ exists in apps/frontend/
COPY tsconfig.base.json ./                      # ✗ does NOT exist in apps/frontend/
COPY apps/frontend/package.json ./apps/frontend/  # ✗ apps/frontend/apps/frontend/package.json
...
```

The Dockerfile expects repo root context, but staging provides `apps/frontend/` as context. This means staging frontend build likely **never succeeded** on CI.

### Production deploy workflow gap

`apps/backend/docker-compose.prod.yml:126-155` has full frontend service:

- Build from repo root (`context: ../..` + `dockerfile: apps/frontend/Dockerfile`) ✓
- Nginx on port 80, host port 5173
- Healthcheck configured
  But `deploy.yml:122-152` never references `frontend` - no build, no `up`, no healthcheck.

## Decisions (with rationale)

1. **Fix staging build context FIRST** before prod - staging docker-compose has broken frontend build context
2. **Prod deploy should mirror staging pattern** - separate build step + add to `up -d --force-recreate`
3. **Include frontend in rollback** - if backend healthcheck fails, roll back both (keep in sync)
4. **Add frontend healthcheck** - curl port 5173 after deploy

## Scope IN

### 1. Crear `.env.dev.template`

- Crear `apps/backend/.env.dev.template` similar a `.env.staging.template` y `.env.production.template`
- Mismas secciones, placeholders vacíos, sin secrets reales

### 2. Limpiar `.env` vs `.env.dev`

- **Hallazgo**: `.env` no existe localmente, está gitignored, solo es un fallback legacy
- `main.ts:17` y `app.module.ts:48` referencian `['.env.dev', '.env']`
- Simplificar: eliminar `.env` de la lista, dejar solo `.env.dev`
- Si existe `.env` en algún entorno, migrar su contenido a `.env.dev`

### 3. Arreglar build context de staging frontend

- `apps/backend/docker-compose.staging.yml:57-61`:
  - Cambiar de `context: ../frontend` a `context: ../..` (root del repo)
  - Ajustar `dockerfile: apps/frontend/Dockerfile`
- Coincidir con el patrón de prod: `context: ../..` + `dockerfile: apps/frontend/Dockerfile`

### 4. Auto-deploy frontend en producción

- `deploy.yml`: agregar build step para frontend (después de backend build)
- `deploy.yml`: agregar frontend a `up -d --force-recreate`
- `deploy.yml`: agregar frontend healthcheck (curl puerto 5173)
- `deploy.yml`: incluir frontend en rollback si backend healthcheck falla

## Scope OUT (Must NOT have)

- No crear `.env.development` / `.staging` / `.production` en frontend (no necesarios, nginx proxy resuelve)
- No cambios a `nginx.conf` (ya funciona)
- No cambios al workflow de dev (`npm run dev`)
- No cambios a la config de producción droplet/IPs

## Open questions

Ninguna — intento claro.

## Approval gate

status: awaiting-approval

<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
