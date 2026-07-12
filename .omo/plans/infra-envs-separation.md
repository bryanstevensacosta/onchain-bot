# infra-envs-separation - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last - the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> - <one-line driver>
**Decisions to sanity-check:** <fill last - the few choices worth a human glance>

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

> # ITERACIÓN 1 — Branch Protection con Terraform + GitHub Provider
>
> **Qué:** Crear `infra/terraform/` con GitHub provider, definir protecciones de ramas como código, state en Terraform Cloud.
>
> **Master (confirmado):** PR como único camino, status checks (Tests, Lint, tsc), linear history, sin push directo. Sin approval requerido (solo dev). Sin conversation resolution.
>
> **Dev (confirmado):** Permisiva, push permitido, checks informativos.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Scope

### Must have

- `infra/terraform/` — provider github, backend terraform cloud
- Branch protection `master`: require PR, status checks (Tests, Lint), restrict push, linear history
- Branch protection `dev`: permisiva, status checks solos
- `scripts/setup-iac.sh` helper
- Documentar prerequisitos (GitHub PAT, Terraform Cloud token)

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No staging environment
- No pre-push hook
- No cambios al deploy actual de producción
- No modificar docker-compose actual
- No cambios a GitHub Actions actual

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (IaC se verifica con `terraform plan` + validación manual de reglas en GitHub UI)
- Evidence: .omo/evidence/task-1-\*.log

## Execution strategy

### Wave 1 — Terraform + GitHub Provider setup

### Dependency matrix

| Todo                                   | Depends on | Blocks | Can parallelize with |
| -------------------------------------- | ---------- | ------ | -------------------- |
| 1. GitHub PAT + TF Cloud token         | —          | 2, 3   | —                    |
| 2. Terraform provider + backend config | 1          | 3, 4   | —                    |
| 3. Branch protection master            | 2          | —      | —                    |
| 4. Branch protection dev               | 2          | —      | 3                    |
| 5. setup-iac.sh helper                 | 2          | —      | 3, 4                 |

## Todos

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Preparar secrets de IaC (GitHub PAT + Terraform Cloud token)
     What to do / Must NOT do:
  - Generar un GitHub PAT con scopes `repo` + `admin:org` (o `admin:repo_hook` si no es org)
  - Obtener el Terraform Cloud API token desde app.terraform.io
  - **NO** commitear los tokens al repo
  - Decidir si se guardan en 1Password / .env.local / GitHub Codespaces secrets
  - Documentar en `infra/terraform/SECRETS.md` qué tokens se necesitan y cómo generarlos
    Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3, 4, 5
    References (executor has NO interview context - be exhaustive):
    - GitHub PAT docs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
    - Terraform Cloud tokens: https://developer.hashicorp.com/terraform/cloud-docs/users-teams-organizations/api-tokens
      Acceptance criteria (agent-executable):
    - `infra/terraform/SECRETS.md` existe con instrucciones claras
    - Los tokens no aparecen en ningún archivo del repo
      QA scenarios:
    - Happy: las instrucciones son ejecutables por el usuario en <5min
    - Failure: el archivo no contiene valores reales (grep para tokens)
      Commit: Y | chore(infra): add SECRETS.md with IaC token prerequisites

- [ ] 2. Configurar Terraform provider + Terraform Cloud backend
     What to do / Must NOT do:
  - Crear `infra/terraform/providers.tf` con:
    - `required_version = ">= 1.6"`
    - `required_providers` github (hashicorp/github ~> 6.0)
  - Crear `infra/terraform/backend.tf` con:
    - `terraform { cloud { organization = "...", workspaces { name = "onchain-bot-infra" } } }`
  - Usar `TFE_TOKEN` (env var) para autenticación con Terraform Cloud
  - Usar `GITHUB_TOKEN` (env var) para autenticación con GitHub provider
  - **NO** hardcodear tokens, organization name, o workspace name
  - Agregar `infra/terraform/.terraform.lock.hcl` al repo (lock file)
    Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4, 5
    References (executor has NO interview context - be exhaustive):
  - Terraform GitHub Provider: https://registry.terraform.io/providers/integrations/github/latest/docs
  - Terraform Cloud backend: https://developer.hashicorp.com/terraform/language/settings/cloud
    Acceptance criteria (agent-executable):
  - `terraform init` succeeds desde `infra/terraform/`
  - `terraform validate` succeeds
    QA scenarios:
  - Happy: `terraform init` descarga provider y conecta con TF Cloud
  - Failure: sin GITHUB_TOKEN/TFE_TOKEN da error claro
    Commit: Y | chore(infra): add Terraform GitHub provider with Terraform Cloud backend

- [ ] 3. Definir branch protection para master
     What to do / Must NOT do:
  - Crear `infra/terraform/main.tf`
  - Recurso `github_branch_protection` para `master`:
    - `pattern = "master"`
    - **NO** incluir `required_pull_request_reviews` (un solo dev, nadie aprueba)
    - `required_status_checks { strict = true, contexts = ["Tests", "Lint", "tsc"] }`
    - `restrict_pushes { push_allowances = [] }` — NADIE puede pushear directo
    - **NO** `require_conversation_resolution` (un solo dev, sin conversaciones)
    - `required_linear_history = true`
  - **NO** incluir dev ni otras ramas
  - **NO** modificar protecciones existentes fuera de master
    Parallelization: Wave 1 | Blocked by: 2 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `github_branch_protection`: https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_protection
  - Los status checks deben coincidir con los job names en `.github/workflows/deploy.yml`
  - ⚠️ **ORDENAMIENTO CRÍTICO:** El job `tsc` no existe hasta la Iteración 3 (todo 7). Ejecutar este todo ANTES de que I3 esté completa hará que Terraform configure status checks apuntando a un job inexistente. **Secuencia correcta:** I3 (todo 7) → I1 (todo 3). Ver `## Execution order` más abajo.
  - Nota: `required_pull_request_reviews` se omite deliberadamente — solo dev, nadie aprueba. Igual el PR es el único camino porque `restrict_pushes` bloquea push directo.
    Acceptance criteria (agent-executable):
  - `terraform plan` muestra la creación de la protection rule para master
  - `terraform apply` la crea en GitHub
  - En GitHub UI → Settings → Branches → master, las reglas aparecen
    QA scenarios:
  - Happy: `terraform plan` output muestra create de `github_branch_protection.master`
  - Failure: intentar push directo a master desde local da error de GitHub
    Commit: Y | feat(infra): add branch protection for master (PR + checks + linear history)

- [ ] 4. Definir branch protection para dev (permisiva)
     What to do / Must NOT do:
  - En `infra/terraform/main.tf`:
    - `pattern = "dev"`
    - `required_pull_request_reviews = false` (no requerido)
    - `required_status_checks = false` (no bloquear, solo informar)
    - `restrict_pushes` = false
    - `required_linear_history = false`
  - **NO** bloqueos innecesarios en dev
  - **SÍ** incluir los mismos status checks como opcionales
    Parallelization: Wave 1 | Blocked by: 2 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - Misma doc que todo 3
    Acceptance criteria (agent-executable):
  - `terraform plan` muestra creación de protection para dev
  - Push directo a dev es posible
    QA scenarios:
  - Happy: `git push origin dev` funciona sin error
    Commit: Y | feat(infra): add permissive branch protection for dev

- [ ] 5. Crear script helper setup-iac.sh
     What to do / Must NOT do:
  - Crear `scripts/setup-iac.sh` ejecutable:

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    # 1. Verificar tokens
    : "${GITHUB_TOKEN:?Must set GITHUB_TOKEN}"
    : "${TFE_TOKEN:?Must set TFE_TOKEN}"

    cd "$(dirname "$0")/../infra/terraform"

    # 2. Verificar si ya existen recursos de GitHub (repo existente)
    #    Si la branch protection ya existe offline, hacer terraform import
    #    para evitar conflictos con el estado real de GitHub.
    echo "=== Checking existing GitHub resources ==="
    EXISTING_PROTECTION=$(gh api repos/$(gh repo view --json ownerWithOwner -q .ownerWithOwner)/branches/master/protection 2>/dev/null || echo "")

    if [ -n "$EXISTING_PROTECTION" ]; then
      echo "⚠️  Branch protection on master already exists (created manually or by previous apply)"
      echo "   Run 'terraform import' before apply, or use '--force-apply' to auto-import"
      IMPORT_CMD="terraform import github_branch_protection.master $(gh repo view --json ownerWithOwner -q .ownerWithOwner):master"
      echo "   Import command: $IMPORT_CMD"
    fi

    # 3. Init + plan
    terraform init
    terraform plan

    # 4. Apply con confirmación (o --yes para CI)
    if [[ "${1:-}" != "--yes" ]]; then
      read -p "Apply? (y/N) " confirm
      [[ "$confirm" == "y" ]] || exit 0
    fi
    terraform apply
    ```

  - **NO** incluir tokens en el script
  - **NO** hacer `terraform apply` sin confirmación
  - **SÍ** detectar si la branch protection ya existe y advertir sobre `terraform import`
  - Documentar uso en `infra/terraform/README.md`
    Parallelization: Wave 1 | Blocked by: 2 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - Script debe seguir el estilo de `scripts/` existente en el repo
  - `gh api repos/:owner/:repo/branches/:branch/protection` para detectar existencia
    Acceptance criteria (agent-executable):
  - `scripts/setup-iac.sh --help` muestra uso
  - `bash scripts/setup-iac.sh` detecta si ya hay protección en master y avisa
  - Fallo claro si GITHUB_TOKEN no está seteado
    QA scenarios:
  - Happy: script corre terraform plan si tokens están seteados
  - Warning: ya hay branch protection manual → muestra hint de import
  - Failure: mensaje claro si falta GITHUB_TOKEN o TFE_TOKEN
    Commit: Y | chore(infra): add setup-iac.sh helper script with pre-import detection

---

> ## ⚡ Orden de ejecución (corregido post-Momus review)
>
> Las iteraciones NO se ejecutan secuencialmente como están numeradas. El orden correcto:
>
> | Paso | Iteración       | Qué                                  | Por qué                             |
> | ---- | --------------- | ------------------------------------ | ----------------------------------- |
> | 1    | I8              | Release Please config                | No depende de nada                  |
> | 2    | I2              | Pre-push hook                        | Rápido, independiente               |
> | 3    | I3 (todo 7)     | Separar jobs test/lint/tsc           | **NECESARIO antes de I1**           |
> | 4    | I6              | SOPS + encrypt .envs                 | Instalar tools, crear .enc          |
> | 5    | I4              | Socat templates + script             | I5 lo necesita                      |
> | 6    | I3 (todos 8-10) | Staging compose + deploy base        | Depende de SOPS (.env.staging)      |
> | 7    | I5              | Staging mejorado (socat + Tailscale) | Depende de I4                       |
> | 8    | I1 (todos 1-5)  | Terraform branch protection          | **DESPUÉS** de I3(7) — jobs existen |
> | 9    | I7              | Rollback prod                        | Pipeline estable primero            |
> | 10   | I9              | Migración rollback + espacio         | Lo último                           |
>
> **⚠️ Regla de oro:** I1 (todo 3) NO puede ejecutarse antes de I3 (todo 7). Los status checks `Tests, Lint, tsc` deben existir como jobs en GitHub Actions antes de configurarlos en Terraform.

> ---

> # ITERACIÓN 2 — Pre-push hook local
>
> **Qué:** Modificar `.husky/pre-push` para bloquear push directo a master. El hook actual ejecuta `npm test`; se agrega detección de rama antes.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 2)

- [ ] 6. Modificar pre-push hook para bloquear push a master
     What to do / Must NOT do:
  - Editar `.husky/pre-push` (archivo existente, ejecutable)
  - **NO** reescribir ni eliminar la línea `npm test` existente
  - **NO** usar bash avanzado — mantener POSIX sh para compatibilidad con Husky v9
  - El hook debe:

    ```sh
    #!/bin/sh
    # ...existing shebang (Husky v9 usa sh, no tiene shebang explícito)
    while read local_ref local_sha remote_ref remote_sha; do
      if [ "$remote_ref" = "refs/heads/master" ]; then
        echo "❌ Push directo a master bloqueado. Crea un Pull Request desde dev."
        exit 1
      fi
    done

    npm test
    ```

  - **NO** afectar el comportamiento para dev, staging, feature branches
  - Verificar que el hook sigue siendo ejecutable (`chmod +x .husky/pre-push`)
    Parallelization: Wave 1 (rápida) | Blocked by: — | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.husky/pre-push` actual: contiene solo `npm test`
  - El pre-push de Git recibe stdin: `<local-ref> <local-sha> <remote-ref> <remote-sha>`
  - Husky v9 no usa shebang explícito en los hooks, usa el shim de `.husky/_/`
  - Probar con: `git push origin master` (debe bloquear) y `git push origin dev` (debe pasar)
    Acceptance criteria (agent-executable):
  - `git push origin master` desde cualquier rama local es bloqueado con el mensaje de error
  - `git push origin dev` ejecuta `npm test` y procede normalmente
    QA scenarios:
  - Happy: `git push origin dev` → pasa tests y push
  - Failure: `git push origin master` → sale con código 1 y mensaje "Push directo a master bloqueado"
    Commit: Y | feat(hooks): block direct push to master in pre-push hook

---

> # ITERACIÓN 3 — GH Actions + Staging compose
>
> **Qué:** Refactorizar GH Actions con jobs paralelos (test, lint, tsc), crear docker-compose.staging.yml y auto-deploy a staging desde dev.
>
> **Puertos staging:** Postgres 5433, Redis 6380, Backend 3031, Frontend 4173
>
> **Containers:** `onchain-bot-staging-*` | **Volúmenes:** `onchain-bot-staging-*`
>
> **Tailscale socat:** Pendiente para Iteración posterior (exponer staging en Tailscale)
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 3)

- [ ] 7. Refactorizar deploy.yml: separar jobs test, lint, tsc en paralelo
     What to do / Must NOT do:
  - Renombrar el job `test` actual → NO (mantener nombre para compatibilidad con status checks)
  - El job `test` actual ejecuta `npm run test:backend` + `npm run test:frontend` — dejarlo así
  - Agregar job `lint` (paralelo a test):
    - `runs-on: self-hosted`
    - `npm ci` (cada job independiente necesita sus propias dependencias)
    - `npm run lint`
  - Agregar job `tsc` (paralelo a test y lint):
    - `runs-on: self-hosted`
    - `npm ci`
    - Backend: `cd apps/backend && npx tsc --noEmit --incremental false`
    - Frontend: `cd apps/frontend && npx tsc --noEmit --incremental false`
  - El job `deploy` debe depender de `[test, lint, tsc]` (needs)
  - **NO** modificar el job `deploy` existente (solo su `needs`)
  - **NO** cambiar la estructura del workflow actual más allá de separar jobs
  - **SÍ** mantener `continue-on-error: true` en lint si sigue siendo necesario
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.github/workflows/deploy.yml` actual: jobs `test` y `deploy`
  - Status checks en Terraform esperan contextos `Tests`, `Lint`, `tsc` — deben coincidir con job names
  - GitHub Actions docs: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
    Acceptance criteria (agent-executable):
  - El workflow tiene 4 jobs: `test`, `lint`, `tsc`, `deploy`
  - `deploy` depende de que `test`, `lint`, `tsc` pasen
  - `test`, `lint`, `tsc` corren en paralelo
  - `tsc` corre tanto backend como frontend
    QA scenarios:
  - Happy: push a master → los 4 jobs corren secuencial/paralelo según dependencias
  - Failure: si tsc falla, deploy se salta
    Commit: Y | ci: split test, lint, tsc into parallel jobs

- [ ] 8. Crear docker-compose.staging.yml
     What to do / Must NOT do:
  - Crear `apps/backend/docker-compose.staging.yml`
  - Copiar estructura de `docker-compose.prod.yml` con estos cambios:
    - `name: onchain-bot-staging`
    - Containers: `onchain-bot-staging-postgres`, `onchain-bot-staging-redis`, `onchain-bot-staging-backend`, `onchain-bot-staging-frontend`
    - Volúmenes: `onchain-bot-staging-pg-data`, `onchain-bot-staging-redis-data`
    - `env_file: .env.staging`
    - Postgres: `127.0.0.1:5433:5432` (puerto host 5433)
    - Redis: `127.0.0.1:6380:6379` (puerto host 6380)
    - Backend: `127.0.0.1:3031:3030`
    - Frontend: `127.0.0.1:4173:80`
    - Red: `onchain-bot-staging-net`
  - **NO** exponer staging en Tailscale (socat) — será Iteración posterior
  - **NO** compartir volúmenes con producción
  - **SÍ** mantener los mismos healthchecks
  - **SÍ** bind mount de `./uploads` y `./config` (como prod)
    Parallelization: Wave 1 | Blocked by: — | Blocks: 9, 10
    References (executor has NO interview context - be exhaustive):
  - `apps/backend/docker-compose.prod.yml` — estructura a copiar
  - Puertos verificados: 5433, 6380, 3031, 4173 libres en droplet
    Acceptance criteria (agent-executable):
  - `docker compose -f apps/backend/docker-compose.staging.yml config` es válido
  - Todos los puertos son distintos a prod
  - Todos los container names y volumes son distintos a prod
    QA scenarios:
  - Happy: `docker compose -f apps/backend/docker-compose.staging.yml config` muestra configuración correcta
  - Failure: conflicto de puertos con prod (grep para 5432, 6379, 3030, 5173)
    Commit: Y | feat(infra): add docker-compose.staging.yml with isolated ports and volumes

- [ ] 9. Crear .env.staging.template
     What to do / Must NOT do:
  - Crear `apps/backend/.env.staging.template`
  - Mismas variables que `.env.production` pero con valores placeholder
  - Variables clave:
    - `POSTGRES_DB=alpha_meta_token_scanner_staging`
    - `POSTGRES_USER=alpha_meta_token_scanner`
    - `INGESTION_TELEGRAM_SEED_NEWS_ENABLED=false` (staging no necesita ingerir)
    - `CRYPTO_NEWS_BOT_TOKEN=...` (bot token de staging, distinto al de prod)
    - `CRYPTO_NEWS_OUTPUT_CHANNEL=...` (canal de staging, distinto)
  - **NO** incluir valores reales (solo template)
  - **SÍ** documentar qué valores debe proveer el usuario
  - ⚠️ **Flujo completo de .env.staging:** 1. El usuario copia `.env.staging.template` → `.env.staging` 2. El usuario llena los valores reales (tokens de bot staging, URLs de DB staging, etc.) 3. El usuario SOPS-encrypta: `sops -e .env.staging > .env.staging.enc` 4. `.env.staging.enc` se commitea al repo 5. El workflow descifra en deploy time (I6)
    **Nadie más provee los valores — es responsabilidad del usuario.**
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `apps/backend/.env.production` (o `.env`) como referencia de variables necesarias
  - `.gitignore` ya ignora `.env*` (excepto `.env.template`)
  - SOPS encrypt workflow (I6, todo 16) para ver el paso 3
    Acceptance criteria (agent-executable):
  - `apps/backend/.env.staging.template` existe
  - No contiene valores reales (grep para tokens/emails)
    QA scenarios:
  - Happy: usuario sigue el flujo → .env.staging.enc en repo → workflow descifra OK
  - Failure: usuario no crea .env.staging → workflow crea desde template (I10) con WARNING
    Commit: Y | chore(infra): add .env.staging.template with user-provisioning workflow documented

- [ ] 10. Agregar auto-deploy a staging desde push a dev
      What to do / Must NOT do:
  - En `deploy.yml` (o un workflow separado), agregar trigger:
    ```yaml
    on:
      push:
        branches: [dev]
    ```
  - Job `deploy-staging`:
    - `runs-on: self-hosted`
    - `needs: [test, lint, tsc]`
    - `environment: staging`
    - Pasos:
      1. `actions/checkout@v4`
      2. rsync a `/opt/onchain-bot-staging/` (ruta separada de prod)
      3. **Crear `.env.staging` si no existe** (primer deploy):
         ```yaml
         - name: Ensure .env.staging exists
           run: |
             if [ ! -f /opt/onchain-bot-staging/apps/backend/.env.staging ]; then
               echo "=== First deploy: creating .env.staging from template ==="
               cp /opt/onchain-bot-staging/apps/backend/.env.staging.template \
                  /opt/onchain-bot-staging/apps/backend/.env.staging
               echo "⚠️  WARNING: .env.staging created from template — update secrets manually"
             fi
         ```
      4. Backup de DB staging (si existe) — usando `docker exec` + `pg_dump`:
         ```yaml
         - name: Backup staging DB (if exists)
           run: |
             if docker ps --format '{{.Names}}' | grep -q onchain-bot-staging-postgres; then
               docker exec onchain-bot-staging-postgres pg_dump -U alpha_meta_token_scanner \
                 alpha_meta_token_scanner_staging > /tmp/staging-backup-$(date +%Y%m%d-%H%M%S).sql
             fi
         ```
         **Nota:** Staging no tiene backup periódico como prod — su data es descartable. Este backup pre-deploy es solo por si el deploy falla y se pierde data de prueba.
      5. `docker compose -f apps/backend/docker-compose.staging.yml build --no-cache backend`
      6. `docker compose -f apps/backend/docker-compose.staging.yml up -d --force-recreate backend`
      7. Healthcheck: `curl -sf http://localhost:3031/api/health`
  - **SÍ** usar un workflow SEPARADO (ej. `deploy-staging.yml`) para mantener limpio el deploy de prod
  - **NO** mezclar con el workflow de deploy a producción
  - **NO** deployar frontend en staging si no es necesario (solo backend para validación)
  - **NO** exponer staging públicamente (solo Tailscale en Iteración posterior)
  - **SÍ** usar `.env.staging.template` como fallback (valores default conectan a staging DB/Redis)
  - **SÍ** loguear WARNING cuando se crea desde template para que el usuario recuerde actualizar secrets
    Parallelization: Wave 1 | Blocked by: 7, 8, 9 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.github/workflows/deploy.yml` actual como referencia
  - Ruta staging en droplet: `/opt/onchain-bot-staging/`
  - `.env.staging` debe existir en droplet antes del primer deploy
  - ⚠️ **Primer deploy:** Si `.env.staging` no existe, el workflow lo crea desde `.env.staging.template` y advierte al usuario
    Acceptance criteria (agent-executable):
  - Push a `dev` triggerea `deploy-staging.yml`
  - El workflow despliega backend en puerto 3031
  - Healthcheck en localhost:3031 pasa
    QA scenarios:
  - Happy: push a dev → tests pasan → staging deployado en :3031
  - Failure: push a dev con tsc roto → staging NO se deploya
    Commit: Y | ci: add auto-deploy to staging from dev branch

---

> # ITERACIÓN 4 — Socat systemd services como código
>
> **Qué:** Crear templates de systemd .service para socat (prod + staging) con un script de instalación. Todo versionado en el repo.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 4)

- [ ] 11. Crear templates systemd para socat (backend + frontend)
      What to do / Must NOT do:
  - Crear `infra/systemd/socat-backend.service.template` con variables:
    - `{ENV}` — nombre del entorno (prod / staging)
    - `{TAILSCALE_IP}` — IP de Tailscale (100.84.4.28)
    - `{HOST_PORT}` — puerto en Tailscale (3030 / 3031 / 5173 / 4173)
    - `{CONTAINER_PORT}` — puerto interno del container (3030 / 80)
  - Crear `infra/systemd/socat-frontend.service.template`
  - **NO** hardcodear valores en los templates
  - **NO** incluir secretos, IPs privadas, o tokens
  - **SÍ** documentar las variables requeridas
    Parallelization: Wave 1 | Blocked by: — | Blocks: 12
    References (executor has NO interview context - be exhaustive):
  - Servicio existente: `/etc/systemd/system/socat-3030.service` en droplet
  - Los templates usan sintaxis `{VAR}` para sed/awk substitution
    Acceptance criteria (agent-executable):
  - Los templates existen en `infra/systemd/`
  - No contienen valores hardcodeados de puertos/IPs
    QA scenarios:
  - Happy: los templates tienen las variables de sustitución
  - Failure: grep encuentra IPs o puertos hardcodeados
    Commit: Y | feat(infra): add systemd socat service templates

- [ ] 12. Crear script install-socat-services.sh
      What to do / Must NOT do:
  - Crear `scripts/install-socat-services.sh` ejecutable
  - Uso: `bash scripts/install-socat-services.sh <env>` donde env es `prod` o `staging`
  - Para `prod`:
    - Backend: Tailscale :3030 → localhost:3030
    - Frontend: Tailscale :5173 → localhost:5173
  - Para `staging`:
    - Backend: Tailscale :3031 → localhost:3031
    - Frontend: Tailscale :4173 → localhost:80
  - El script debe:
    1. Validar que `<env>` es prod o staging
    2. Validar que `TAILSCALE_IP` está seteada o usar default `100.84.4.28`
    3. Generar los .service desde los templates con sed
    4. Preguntar si deployar local (cp) o remoto (scp + ssh)
    5. Si es remoto: scp los archivos, ssh `systemctl daemon-reload && systemctl enable --now`
    6. Mostrar resumen de servicios instalados
  - **NO** ejecutar sin confirmación del usuario
  - **SÍ** usar colores/formatos consistentes con otros scripts del repo
  - **SÍ** ser idempotente (re-ejecución segura)
  - ⚠️ **Consistencia de puertos:** El template socat para staging frontend mapea Tailscale:4173 → localhost:80. Esto asume que el contenedor frontend sirve en puerto 80 (nginx). Verificar que `docker-compose.staging.yml` exponga `frontend:80` y no otro puerto.
    Parallelization: Wave 1 | Blocked by: 11 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `scripts/` existentes en el repo como referencia de estilo
  - Templates en `infra/systemd/`
  - Los .service se alojan en `/etc/systemd/system/`
    Acceptance criteria (agent-executable):
  - `bash scripts/install-socat-services.sh prod --dry-run` muestra qué haría sin ejecutar
  - `bash scripts/install-socat-services.sh` sin argumentos muestra uso
  - `bash scripts/install-socat-services.sh invalid` falla con error claro
    QA scenarios:
  - Happy dry-run: muestra los nombres de servicio, puertos, y comandos
  - Failure: env inválido muestra mensaje de error
  - Idempotent: ejecutar dos veces no duplica servicios
    Commit: Y | feat(infra): add install-socat-services.sh script

---

> # ITERACIÓN 5 — Mejorar GH Actions de staging
>
> **Qué:** Mejorar el auto-deploy a staging: desplegar frontend también, instalar socat post-deploy, healthcheck via Tailscale, rollback automático si falla.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 5)

- [ ] 13. Mejorar deploy-staging.yml con frontend + socat + healthcheck Tailscale + rollback
      What to do / Must NOT do:
  - Modificar `.github/workflows/deploy-staging.yml` (creado en I3 todo #10) con:
  **1. Antes del rebuild, hacer tag de la imagen actual como `:previous`:**
  - En el paso de build, justo antes de `docker compose build`:
    ```yaml
    - name: Tag current image as previous (for rollback)
      run: |
        docker tag onchain-bot-staging-backend:latest onchain-bot-staging-backend:previous 2>/dev/null || true
        docker tag onchain-bot-staging-frontend:latest onchain-bot-staging-frontend:previous 2>/dev/null || true
    ```
  **2. Deploy frontend también:**
  - Después del backend, agregar paso para build + deploy del frontend:
    ```yaml
    - name: Build and deploy frontend
      run: |
        docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml build --no-cache frontend
        docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml up -d --force-recreate frontend
    ```
  **2. Socat post-deploy:**
  - Después de deployar backend + frontend, ejecutar el script de socat para staging:
    ```yaml
    - name: Install socat services for staging
      run: |
        bash /opt/onchain-bot-staging/scripts/install-socat-services.sh staging
    ```
  **3. Healthcheck via Tailscale:**
  - Verificar backend en Tailscale (no solo localhost):
    ```yaml
    - name: Healthcheck backend (Tailscale)
      run: |
        sleep 10
        curl -sf http://100.84.4.28:3031/api/health || { echo "BACKEND HEALTHCHECK FAILED"; exit 1; }
    - name: Healthcheck frontend (Tailscale)
      run: |
        curl -sf -o /dev/null http://100.84.4.28:4173/ || { echo "FRONTEND HEALTHCHECK FAILED"; exit 1; }
    ```
  **4. Rollback automático:**
  - Si el healthcheck del backend falla, restaurar la imagen anterior:
    ```yaml
    - name: Rollback on healthcheck failure
      if: failure()
      run: |
        echo "=== Healthcheck failed — rolling back ==="
        # Restaurar imagen anterior del backend
        docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml up -d --force-recreate backend
        # Re-verificar
        sleep 10
        curl -sf http://100.84.4.28:3031/api/health && echo "Rollback successful" || echo "Rollback also failed — manual intervention required"
    ```
  - **NO** hacer rollback del frontend si el backend falla (independientes)
  - **NO** mezclar con el workflow de producción
  - **SÍ** mantener la misma estructura de pasos del deploy de producción como referencia
  - **SÍ** asegurar que rsync copia también los templates de systemd
    Parallelization: Wave 1 | Blocked by: 8, 10, 12 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.github/workflows/deploy-staging.yml` de I3 (todo #10)
  - `docker-compose.staging.yml` de I3 (todo #8)
  - `scripts/install-socat-services.sh` de I4 (todo #12)
  - `infra/systemd/` templates de I4 (todo #11)
  - Tailscale IP: 100.84.4.28
    Acceptance criteria (agent-executable):
  - El workflow deploya backend + frontend a staging
  - Post-deploy instala socat para staging
  - Healthcheck verifica backend en Tailscale :3031
  - Si healthcheck falla, rollback automático ocurre
    QA scenarios:
  - Happy: push a dev → tests pasan → staging deployado → socat activo → healthcheck pasa
  - Failure: push a dev con código roto → staging deploy falla → rollback a versión anterior → healthcheck pasa
    Commit: Y | ci: enhance staging deploy with frontend, socat, tailscale healthcheck, and rollback

---

> # ITERACIÓN 6 — SOPS para gestión de secrets como código
>
> **Qué:** Implementar Mozilla SOPS + age para encriptar .env.production y .env.staging como parte del repo. Un solo secret de GitHub. Workflows descifran en deploy time.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 6)

- [ ] 14. Instalar y configurar SOPS + age (local + droplet)
      What to do / Must NOT do:
  - Instalar localmente:
    - `brew install sops age` (macOS)
  - Instalar en el droplet (runner self-hosted):
    - `apt-get install -y sops age` (o descargar binarios)
  - Generar clave age:
    ```bash
    mkdir -p ~/.config/sops
    age-keygen -o ~/.config/sops/age.txt
    ```
  - Extraer la clave pública (`age1...`) que va en `.sops.yaml`
  - **NO** commitear `~/.config/sops/age.txt`
  - **SÍ** guardar `age.txt` en un lugar seguro (1Password / gestor de contraseñas)
  - **SÍ** agregar `*.enc` al `.gitattributes` como `linguist-language=SOPS` (para que GitHub no intente diff)
    Parallelization: Wave 1 | Blocked by: — | Blocks: 15, 16, 17
    References (executor has NO interview context - be exhaustive):
  - SOPS: https://github.com/getsops/sops
  - age: https://age-encryption.org/
  - GitHub Actions SOPS action: https://github.com/mozilla/sops-action (opcional)
    Acceptance criteria (agent-executable):
  - `sops --version` y `age --version` disponibles localmente
  - `~/.config/sops/age.txt` existe con clave privada
  - La clave pública está disponible para `.sops.yaml`
    QA scenarios:
  - Happy: `sops --version` muestra versión
  - Failure: sin instalación, `sops` falla con comando no encontrado
    Commit: N | (no commit todavía — solo setup local)

- [ ] 15. Configurar SOPS en el repo
      What to do / Must NOT do:
  - Crear `.sops.yaml` en la raíz del repo:
    ```yaml
    creation_rules:
      - path_regex: apps/backend/.env.production.enc
        age: <PUBLIC_KEY_AGE>
      - path_regex: apps/backend/.env.staging.enc
        age: <PUBLIC_KEY_AGE>
    ```
  - Crear `apps/backend/.env.production` a partir del `.env.production.template` existente + valores reales (extraer del droplet o que el usuario los provea)
  - Crear `apps/backend/.env.staging` a partir del `.env.staging.template` (creado en I3) + valores reales (el usuario los provee)
  - Encriptar ambos:
    ```bash
    sops -e apps/backend/.env.production > apps/backend/.env.production.enc
    sops -e apps/backend/.env.staging > apps/backend/.env.staging.enc
    ```
  - Agregar `.sops.yaml`, `.env.production.enc`, `.env.staging.enc` al repo
  - **NO** commitear `.env.production` ni `.env.staging` sin encriptar
  - **NO** commitear `.env.production` o `.env.staging` (solo los `.enc`)
  - **SÍ** verificar que `.gitignore` ignora `.env` pero NO `*.enc`
    Parallelization: Wave 1 | Blocked by: 14 | Blocks: 16, 17
    References (executor has NO interview context - be exhaustive):
  - `.sops.yaml` reference: https://github.com/getsops/sops#using-sops-yaml-conf-to-select-keys
  - `.env.production.template` existente en `apps/backend/`
  - `.env.staging.template` de I3
  - `.gitignore` debe permitir `*.enc`
    Acceptance criteria (agent-executable):
  - `.sops.yaml` existe con clave pública
  - `.env.production.enc` y `.env.staging.enc` existen y son encriptados (sops -d funciona)
  - No hay `.env.production` o `.env.staging` sin encriptar en el repo
  - `sops -d apps/backend/.env.production.enc` produce el .env original
    QA scenarios:
  - Happy: `sops -d .env.production.enc` muestra el contenido original
  - Failure: modificar el .enc manualmente → `sops -d` falla con error de integridad
    Commit: Y | feat(infra): add SOPS-encrypted .env files for production and staging

- [ ] 16. Agregar SOPS_AGE_KEY a GitHub secrets
      What to do / Must NOT do:
  - Agregar `SOPS_AGE_KEY` como **repository secret** en GitHub:
    ```
    Settings → Secrets and variables → Actions → New repository secret
    Name: SOPS_AGE_KEY
    Value: contenido completo de ~/.config/sops/age.txt
    ```
  - **NO** usar environment secret (un solo secret para todos los entornos)
  - **NO** pegar el valor en logs del workflow
    Parallelization: Wave 1 | Blocked by: 14 | Blocks: 17
    References (executor has NO interview context - be exhaustive):
  - GitHub repo secrets: Settings → Secrets and variables → Actions
    Acceptance criteria (agent-executable):
  - `SOPS_AGE_KEY` existe en GitHub repo secrets
  - No se imprime en logs del workflow
    QA scenarios:
  - Happy: workflow puede acceder a `${{ secrets.SOPS_AGE_KEY }}`
    Commit: N | (solo acción manual en GitHub UI)

- [ ] 17. Modificar workflows para descifrar .env con SOPS
      What to do / Must NOT do:
  - Modificar `.github/workflows/deploy.yml`:
    - Antes del paso "Backup database", agregar:
      ```yaml
      - name: Install SOPS and age (if not present)
        run: |
          if ! command -v sops &> /dev/null; then
            echo "=== Installing sops ==="
            wget -qO /tmp/sops https://github.com/getsops/sops/releases/latest/download/sops-$(uname -s)-$(uname -m)
            chmod +x /tmp/sops && sudo mv /tmp/sops /usr/local/bin/sops
          fi
          if ! command -v age &> /dev/null; then
            echo "=== Installing age ==="
            # Obtener última versión de age dinámicamente
            AGE_TAG=$(curl -sL https://api.github.com/repos/FiloSottile/age/releases/latest | grep '"tag_name":' | sed 's/.*: "\(.*\)",/\1/')
            AGE_ARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/amd64/')
            wget -qO /tmp/age.tar.gz "https://github.com/FiloSottile/age/releases/download/${AGE_TAG}/age-${AGE_TAG#v}-$(uname -s | tr '[:upper:]' '[:lower:]')-${AGE_ARCH}.tar.gz"
            tar -xzf /tmp/age.tar.gz -C /tmp
            sudo mv /tmp/age/age /tmp/age/age-keygen /usr/local/bin/
            rm -rf /tmp/age /tmp/age.tar.gz
          fi
          sops --version && age --version
      ```
    - Luego el paso de descifrado:
      ```yaml
      - name: Decrypt .env.production
        run: |
          sops -d /opt/onchain-bot/apps/backend/.env.production.enc > /opt/onchain-bot/apps/backend/.env.production
      ```
    - Inmediatamente después, validar que el .env descifrado funciona con docker compose:
      ```yaml
      - name: Validate compose config with decrypted env
        run: |
          docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml config --quiet
      ```
      Esto verifica que docker compose parsea correctamente el .env sin errores de sintaxis antes de proceder.
  - Aplicar el MISMO cambio en `.github/workflows/deploy-staging.yml`
  - **SÍ** anteponer el paso de instalación al de descifrado
  - **NO** hardcodear la ruta de sops — usar `/usr/local/bin/sops`
  - **NO** asumir que sops/age ya están instalados
    Parallelization: Wave 1 | Blocked by: 15, 16 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.github/workflows/deploy.yml` actual
  - `.github/workflows/deploy-staging.yml` de I3 + I5
  - SOPS age key env var: https://github.com/getsops/sops#31-encrypting-using-age
    Acceptance criteria (agent-executable):
  - El workflow de prod descifra .env.production.enc antes de ejecutar docker-compose
  - El workflow de staging descifra .env.staging.enc antes del deploy
  - La clave age nunca aparece en los logs
    QA scenarios:
  - Happy: push a master → SOPS descifra .env → deploy normal
  - Failure: secret SOPS_AGE_KEY no seteado → workflow falla con error claro
    Commit: Y | ci: add SOPS decryption step to deploy workflows

---

> # ITERACIÓN 7 — Rollback automático en producción
>
> **Qué:** Agregar rollback automático al workflow de producción: si el healthcheck falla post-deploy, restaurar la imagen anterior del backend.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 7)

- [ ] 18. Agregar rollback automático a deploy.yml
      What to do / Must NOT do:
  - Modificar `.github/workflows/deploy.yml` en el paso "Build and deploy"
  - Después del healthcheck, si falla, ejecutar rollback:
    ```yaml
    - name: Build and deploy
      run: |
        ...
        echo "=== Waiting for healthcheck ==="
        sleep 15
        curl -sf http://localhost:3030/api/health && echo "" || (
          echo "HEALTHCHECK FAILED — rolling back"
          docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml up -d --force-recreate backend
          sleep 15
          curl -sf http://localhost:3030/api/health && echo "Rollback successful" || {
            echo "ROLLBACK ALSO FAILED — manual intervention required"
            docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml logs backend --tail 50
            exit 1
          }
        )
    ```
  - **NO** cambiar la estructura general del workflow
  - **NO** hacer rollback del frontend si el backend falla (independientes)
  - **SÍ** copiar el mismo patrón de staging (I5)
  - **SÍ** loguear claramente si el rollback fue exitoso o no
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.github/workflows/deploy.yml` actual
  - `.github/workflows/deploy-staging.yml` (I5) como referencia del patrón de rollback
    Acceptance criteria (agent-executable):
  - El workflow de producción tiene rollback automático si healthcheck falla
  - El mensaje de rollback exitoso o fallido es claro en los logs
    QA scenarios:
  - Happy: deploy exitoso → healthcheck pasa → no rollback
  - Failure: healthcheck falla → rollback a imagen anterior → healthcheck pasa
  - Double failure: rollback también falla → mensaje claro de intervención manual
    Commit: Y | ci: add automatic rollback to production deploy

---

> # ITERACIÓN 8 — Release Please (releases automáticas con SemVer)
>
> **Qué:** Configurar Release Please como GH Action para generar releases y CHANGELOG automáticamente desde conventional commits.
>
> **Flujo:** Merge a master → Release Please detecta feat/fix → crea PR de release → tú mergeas → tag + release + changelog automático.
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 8)

- [ ] 19. Configurar Release Please
      What to do / Must NOT do:
  - Crear `.github/release-please-config.json`:
    ```json
    {
      "release-type": "simple",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": false,
      "draft": false,
      "prerelease": false,
      "initial-version": "0.1.0",
      "packages": {
        ".": {
          "release-type": "simple",
          "changelog-path": "CHANGELOG.md"
        }
      }
    }
    ```
    **Nota:** Se usa `release-type: simple` porque es un monorepo donde backend y frontend comparten el mismo versionado (no tienen releases independientes). Release Please con `simple` trackea el root y todos los commits convencionales independientemente de la carpeta.
  - Crear `.github/release-please-manifest.json`:
    ```json
    { ".": "0.1.0" }
    ```
  - Crear `.github/workflows/release-please.yml`:
    ```yaml
    name: Release Please
    on:
      push:
        branches: [master]
    permissions:
      contents: write
      pull-requests: write
    jobs:
      release-please:
        runs-on: ubuntu-latest
        steps:
          - uses: googleapis/release-please-action@v4
            with:
              token: ${{ secrets.GITHUB_TOKEN }}
              config-file: .github/release-please-config.json
              manifest-file: .github/release-please-manifest.json
    ```
  - **NO** modificar los workflows existentes (deploy, staging)
  - **NO** requerir approvals en el PR de release (único dev)
  - **SÍ** verificar que `CHANGELOG.md` se genera correctamente con el primer release
  - **SÍ** configurar `bump-minor-pre-major: true` para que `feat:` haga minor incluso en `0.x`
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - Release Please: https://github.com/googleapis/release-please-action
  - Conventional commits: https://www.conventionalcommits.org/
  - Release Please config: https://github.com/googleapis/release-please-action#configuration
  - ⚠️ **Nota sobre deploy.yml:** Release Please PR mergea a master tocando solo `CHANGELOG.md` y `.github/`. Esto triggerea `deploy.yml` (push a master) innecesariamente. **No hace falta arreglarlo ahora** porque deploy.yml se ejecuta y descifra .env → build → no hay cambios en código → el healthcheck pasa igual. Si en el futuro se quiere optimizar, agregar `paths-ignore: ['CHANGELOG.md', '.github/**']` en deploy.yml.
    References (executor has NO interview context - be exhaustive):
  - Release Please: https://github.com/googleapis/release-please-action
  - Conventional commits: https://www.conventionalcommits.org/
  - Release Please config: https://github.com/googleapis/release-please-action#configuration
    Acceptance criteria (agent-executable):
  - `.github/release-please-config.json` y `release-please-manifest.json` existen
  - `.github/workflows/release-please.yml` existe
  - El workflow corre en push a master
    QA scenarios:
  - Happy: merge a master con `feat:` → Release Please crea PR de release → merge PR → tag v0.2.0 + GitHub Release + CHANGELOG actualizado
  - No-op: merge con solo `chore:` → Release Please no crea nada (no hay cambios que releasear)
    Commit: Y | ci: add Release Please for automated SemVer releases

---

> # ITERACIÓN 9 — Rollback de migraciones de base de datos
>
> **Qué:** Proteger contra el escenario donde la DB migra pero el healthcheck falla y el rollback del código deja la app vieja contra un schema nuevo e incompatible.
>
> **Problema:** `deploy → migration:run → healthcheck falla → rollback código → DB con schema nuevo ≠ app vieja`
>
> **Estado:** ✅ Confirmada por el usuario
>
> ---

## Todos (Iteración 9)

- [ ] 20. Agregar backup de schema pre-migración + down migration en rollback
      What to do / Must NOT do:
  - Modificar `.github/workflows/deploy.yml` en el paso "Build and deploy":

  **1. Snapshot de schema antes de migrar:**

  ```yaml
  - name: Snapshot database schema before migration
    run: |
      docker exec onchain-bot-postgres pg_dump -U alpha_meta_token_scanner -d alpha_meta_token_scanner --schema-only > /tmp/pre-migration-schema.sql
      echo "Schema snapshot saved to /tmp/pre-migration-schema.sql"
  ```
  - Nota: `pg_dump` no está instalado en el host del droplet, pero está disponible dentro del container de postgres via `docker exec`.

  **2. Ejecutar migración (existente):**

  ```yaml
  - name: Run migrations
    run: |
      POSTGRES_HOST=localhost ... npm run migration:run
  ```

  **3. En el rollback, revertir migraciones:**

  ```yaml
  - name: Rollback (healthcheck failed)
    if: failure()
    run: |
      echo "=== Healthcheck failed — rolling back ==="
      # 1. Revertir migraciones (si existe down)
      cd /opt/onchain-bot/apps/backend && \
      POSTGRES_HOST=localhost \
      POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      npm run migration:revert && \
        echo "✅ Migration revert successful" || {
          echo "⚠️ Migration revert failed or no migrations to revert"
          echo "   Schema snapshot saved at: /tmp/pre-migration-schema.sql"
          echo "   Manual restore: cat /tmp/pre-migration-schema.sql | docker exec -i onchain-bot-postgres psql -U alpha_meta_token_scanner"
        }

      # 2. Restaurar código anterior (se hace SIEMPRE, incluso si migration:revert falla)
      docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml up -d --force-recreate backend
  ```

  - **SÍ** usar `npm run migration:revert` que TypeORM provee nativamente
  - **SÍ** conservar el snapshot de schema como archivo temporal (se pierde al reiniciar el runner)
  - **NO** detener el rollback si `migration:revert` falla (el código se restaura igual)
  - **SÍ** loguear claramente si la reversión de migración fue exitosa o no
    Parallelization: Wave 1 | Blocked by: 7 (rollback prod) | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `.github/workflows/deploy.yml` actual (especialmente el paso de rollback de I7)
  - TypeORM migration:revert: https://typeorm.io/migrations#reverting
  - PostgreSQL pg_dump: https://www.postgresql.org/docs/current/app-pgdump.html
  - Comando existente en package.json: `npm run migration:run`
  - NOTA: puede que no exista `migration:revert` en package.json — crearlo si es necesario
    Acceptance criteria (agent-executable):
  - El workflow guarda snapshot de schema antes de migrar
  - Si el healthcheck falla, ejecuta `migration:revert` antes de restaurar el código
  - El rollback completo (migración revertida + código anterior) funciona
    QA scenarios:
  - Happy: deploy exitoso → schema snapshot tomado → migración corre → healthcheck pasa
  - Failure + rollback: healthcheck falla → migration:revert → código anterior → healthcheck pasa
  - Sin migraciones pendientes: migration:run es no-op → rollback no necesita revertir nada
    Commit: Y | ci: add database migration rollback to production deploy

- [ ] 21. **(HUMAN — SSH manual)** Limpieza inicial de imágenes Docker no usadas + cache corrupto
      What to do / Must NOT do:
  - ⚠️ **INTERVENCIÓN HUMANA REQUERIDA — un agente NO puede ejecutar esto**
  - SSH al droplet (`ssh CryptoGanster`) y ejecutar EN ESTE ORDEN:

    ```bash
    # 1. Limpiar build cache corrupto (19GB, 13GB reclaimable)
    docker builder prune --force

    # 2. Eliminar imágenes no usadas del stack anterior
    docker rmi postgres:15-alpine
    docker rmi ghcr.io/berriai/litellm-database:main-latest

    # 3. Mostrar espacio liberado
    docker system df
    ```

  - **NO** eliminar imágenes en uso (`postgres:16`, `backend:latest`, `frontend:latest`)
  - **NO** hacer `docker system prune -a` (eliminaría el build cache limpio que acabamos de crear)
  - **SÍ** verificar que el espacio libre aumentó con `docker system df`
  - **SÍ** agregar crontab para limpieza semanal de workspaces:
    `bash
    crontab -e
    # Agregar: 0 3 * * 0 find /opt/actions-runner/_work -maxdepth 2 -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null
    `
    Parallelization: Wave 1 (manual — no ejecutable por agente) | Blocked by: — | Blocks: 22
    References (executor has NO interview context - be exhaustive):
  - Acceso SSH: `ssh CryptoGanster` (desde local)
  - Estado actual: 22GB libres de 77GB, build cache 19GB (13GB reclaimable)
    Acceptance criteria (agent-executable):
  - `docker system df` muestra < 6GB en build cache
  - `docker images` ya no muestra postgres:15 ni litellm:main-latest
    QA scenarios:
  - Happy: builder prune elimina 13GB → build cache queda ~6GB → imágenes extra eliminadas
    Commit: N (manual SSH — no hay código)

- [ ] 22. **(WORKFLOW automation)** Quitar `--no-cache` + prune post-deploy automático
      What to do / Must NOT do:
  - ⚠️ Ejecutar SOLO después de haber completado el todo 21 (limpieza manual del cache corrupto)
  - En el workflow `deploy.yml`, después del healthcheck (o en `if: always()`):

    **a. Quitar `--no-cache` de docker compose build** (usar cache existente ya limpio):

    ```diff
    - docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml build --no-cache backend
    + docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml build backend
    ```

    **b. Aplicar el MISMO cambio en `deploy-staging.yml`** (también quitar --no-cache):

    ```diff
    - docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml build --no-cache backend
    + docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml build backend
    ```

    **c. Agregar prune de imágenes post-deploy (solo staging — prod se managea solo):**

    ```yaml
    - name: Clean up old Docker images (staging)
      if: always()
      run: |
        # Eliminar imágenes intermedias de más de 24h (no afecta imágenes en uso)
        docker image prune --force --filter "until=24h"
        echo "=== Docker disk usage after prune ==="
        docker system df
    ```

    **d. NO hacer prune en deploy a producción** (las imágenes de prod deben mantenerse)

  - **NO** hacer `docker system prune -a`
  - **SÍ** hacer el prune SOLO en el workflow de staging (las imágenes de staging son desechables)
  - **SÍ** aplicar los cambios en AMBOS workflows (prod + staging)
    Parallelization: Wave 1 | Blocked by: 21 | Blocks: —
    References (executor has NO interview context - be exhaustive):
  - `docker image prune`: https://docs.docker.com/engine/reference/commandline/image_prune/
  - `docker system df`: https://docs.docker.com/engine/reference/commandline/system_df/
  - Estado actual: 22GB libres de 77GB, build cache 19GB (13GB reclaimable), postgres:15 (392MB), litellm duplicado (1.55GB)
    Acceptance criteria (agent-executable):
  - `docker compose build` ya no usa `--no-cache`
  - El workflow tiene paso de prune post-deploy
  - postgres:15-alpine y litellm-database:main-latest ya no existen en el droplet
  - `docker system df` muestra menos espacio usado en build cache y en imágenes
    QA scenarios:
  - Happy: deploy usa cache → build más rápido → prune al final → espacio controlado
  - Failure: docker image prune no encuentra nada que limpiar (no falla)
  - Medición: antes vs después de la iteración, comparar `docker system df`
    Commit: Y | ci: enable Docker build cache and add post-deploy image prune

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

### Must NOT have (guardrails, anti-slop, scope boundaries)

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: <TDD | tests-after | none> + framework
- Evidence: .omo/evidence/task-<N>-infra-envs-separation.<ext>

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. <title>
     What to do / Must NOT do: <...>
     Parallelization: Wave <N> | Blocked by: <...> | Blocks: <...>
     References (executor has NO interview context - be exhaustive): <src/path:lines>
     Acceptance criteria (agent-executable): <exact command or assertion>
     QA scenarios (name the exact tool + invocation): happy + failure, Evidence .omo/evidence/task-1-infra-envs-separation.<ext>
     Commit: <Y/N> | <type>(<scope>): <summary>

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

## Success criteria
