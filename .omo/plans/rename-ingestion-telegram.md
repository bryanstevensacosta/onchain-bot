# rename-ingestion-telegram - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** la carpeta de ingestión pasa a llamarse ingestion-telegram en código, Docker, CI, imagen de GitHub, variables de entorno, documentación y releases antiguos, sin cambiar puertos ni base de datos y sin duplicar nunca la sesión de Telegram.

**Why this approach:** el nombre está enredado en 181 ficheros, así que el plan avanza en olas que no se pueden saltar (primero que compile, luego contenedores y CI, luego el servidor, al final docs y releases); la imagen y las variables conviven vieja+nueva una temporada para no romper el servidor a mitad del cambio.

**What it will NOT do:** no toca puertos (3031/3032) ni el nombre de la base de datos; no crea un segundo servicio de ingestión; no copia las credenciales de Telegram; no reescribe el historial de código, solo las etiquetas de release.

**Effort:** Large
**Risk:** High - un paso en falso en el servidor duerme la única sesión de Telegram o rompe el despliegue
**Decisions to sanity-check:** variable nueva INGESTION_TELEGRAM_URL confallback de 1 release; imagen dual (nueva + antigua 1-2 releases); tags viejos se borran solo tras verificar los nuevos; CHANGELOGs pasados no se reescriben.

Your next move: arrancar el trabajo ($start-work) o pasar primero la revisión de alta precisión (doble Momus). Full execution detail follows below.

---

> TL;DR (machine): Large/High — apps/ingestion-telegram end-to-end rename (code, Docker, CI dual-push, env fallback, DNS, docs, tag rewrite) with ports/DB unchanged.

## Scope

### Must have

- `git mv apps/ingestion-service` → `apps/ingestion-telegram`; workspace npm → `@alpha-meta-token-scanner/ingestion-telegram`; alias TS `@ingestion-service/*` → `@ingestion-telegram/*` (tsconfig + 2 jest mappers + `main.ts` dist alias + 3 importadores vivos); lock regenerado con `npm install` (nunca sed).
- Dockerfiles (COPYs + CMD), compose (`dockerfile:`, `env_file:`, service/container/image/DNS → `ingestion-telegram` / `onchain-bot-ingestion-telegram`), nginx upstream + vite proxy target, scripts `*.sh` con paths hardcoded.
- Env `INGESTION_SERVICE_URL` → `INGESTION_TELEGRAM_URL` con fallback (nuevo > antiguo > default) en TODOS los lectores (`app.config.ts:383`, `queue.controller.ts:97`, `process-next-queued-article:481`, threads client, SSE listener, registration client) + warn on old; `INGESTION_TELEGRAM_MTPROTO_*` NO cambia (ya es telegram-scoped); `VITE_INGESTION_BASE_URL` NO existe — solo proxy target + upstream + docs.
- CI/GHCR: `deploy-ingestion.yml` (path filter, `file:`, tags + cache DUAL nuevo/antiguo, pull ambos, droplet paths `/opt/onchain-bot/apps/ingestion-telegram/`, dataSource dist) + `ci.yml` (build `-w`, artifact path) + lint-staged glob + scripts root (cierra drift conocido: ingestion sin lint/build en root).
- Droplet cutover stop-the-world con runbook (nunca copiar session string; sin doble contenedor por `AUTH_KEY_DUPLICATED`).
- `docker-compose.with-ingestion.yml`: actualizar paths + DNS in place (no borrar; variante local legacy).
- Docs vivos (67 md/txt: README badges, 3 AGENTS.md, runbooks, templates) + histórico `.omo/.kiro/specs` con tabla case-sensitive (incl. snake_case del playbook); CHANGELOGs pasados INMUTABLES; `.bak/.backup` se BORRAN, no se renombran.
- `RELEASE-FLOW.md` al nuevo esquema + reetiquetado histórico por inventario (`git tag --list '*ingestion*'` manda; conocido `ingestion-service-v1.0.0`, incluir `ingestion-v*` si aparece, no asumir ninguno) con backup previo.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO renombrar `INGESTION_DATABASE_NAME` (`alpha_meta_token_scanner_ingestion`), DBs lógicas, ni dataSource salvo el prefijo de path.
- NO cambiar puertos 3031 interno / 3032 host; el diff final NO debe contener cambios de puerto/DB (assert en verificación).
- NO tocar `infra/terraform`, `pgadmin/servers.json`, `scripts/deploy.sh` (legacy backend-only).
- NO definir ingestion en `docker-compose.staging.yml` / `.prod.yml` (invariante singleton).
- NO duplicar sesión MTProto ni copiar el session string para probar; credenciales solo en `apps/ingestion-telegram/.env`.
- NO reescribir prosa histórica de CHANGELOGs; NO renombrar `VITE_INGESTION_BASE_URL` (fantasma: no existe en código).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (backend 170 suites / ingestion 43 suites) + tsc --noEmit (backend+ingestion) + Vitest/frontend build + `docker build` (ambos Dockerfiles) + `docker compose config` + `gh release list` / `git ls-remote --tags` + smoke `:3032/api/health` (donde sea ejecutable localmente; droplet solo vía runbook + validación de ficheros).
- Matriz env obligatoria: solo-nueva / solo-antigua / ambas / ninguna → assert de `serviceUrl` resuelto + warning on old.
- Evidencia: .omo/evidence/task-<N>-rename-ingestion-telegram.<ext>
- Gate global: `rg -n "ingestion-service|ingestion_service|INGESTION_SERVICE" --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!.git/**' --glob '!coverage/**'` debe dar CERO hits salvo excepciones listadas (CHANGELOGs históricos, notas de migración documentadas).

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (pre-flight + filesystem): todos 1-2.
- Wave 2 (build wiring): todos 3-4 (paralelizables entre sí; bloquean todo lo demás).
- Wave 3 (runtime: env + proxy + compose + scripts): todos 5-8 (paralelizables entre sí tras Wave 2).
- Wave 4 (CI/CD + droplet runbook): todos 9-10 en paralelo; todo 11 tras 5, 6, 7, 8 y 9.
- Wave 5 (docs + releases): todos 12 y 13 paralelizables; 14 tras 12; 15 tras 1 y 14 (al final por riesgo aunque el inventario sea de Wave 1).
- Wave 6 (verificación global): todo 16. Luego Final verification wave F1-F4.

### Dependency matrix

| Todo                                       | Depends on    | Blocks    | Can parallelize with |
| ------------------------------------------ | ------------- | --------- | -------------------- |
| 1 pre-flight                               | —             | 2, 15     | —                    |
| 2 git mv + workspace + lock                | 1             | 3, 4      | —                    |
| 3 alias TS + jest + main.ts + importadores | 2             | 5, 6, 7   | 4                    |
| 4 Dockerfiles + .bak cleanup               | 2             | 9, 10, 16 | 3                    |
| 5 env rename + fallback + readers          | 3             | 11, 16    | 6, 7, 8              |
| 6 frontend proxy + nginx                   | 3             | 11, 16    | 5, 7, 8              |
| 7 compose + DNS + with-ingestion           | 3             | 9, 11, 16 | 5, 6, 8              |
| 8 scripts \*.sh + gen-session string       | 2             | 11, 16    | 5, 6, 7              |
| 9 deploy-ingestion.yml dual-push           | 4, 7          | 11, 16    | 10                   |
| 10 ci.yml + lint-staged + root scripts     | 4             | 16        | 9                    |
| 11 droplet cutover runbook                 | 5, 6, 7, 8, 9 | 16        | 10                   |
| 12 docs vivos bulk                         | 5, 6, 7       | 14, 16    | 13                   |
| 13 histórico .omo/.kiro/specs              | —             | 16        | 12                   |
| 14 RELEASE-FLOW.md                         | 12            | 15, 16    | 13                   |
| 15 reetiquetado histórico gh               | 1, 14         | 16        | 12, 13               |
| 16 verificación global + tests             | 5-15          | F1-F4     | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Pre-flight: rama limpia, inventario de tags/releases y backup
     What to do: crear rama `feat/rename-ingestion-telegram` desde `dev`; verificar árbol limpio (`git status --porcelain` vacío salvo este plan); ejecutar `git tag --list '*ingestion*'` y `gh release list` y guardar salida en evidencia; el inventario MANDA (conocido 2026-09-17: `ingestion-service-v1.0.0`, cero `ingestion-v*`; si aparece cualquier otro patrón `*ingestion*`, incluirlo; no asumir ningún nombre). Must NOT do: no mover nada aún; no borrar tags.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 15
     References: GOVERNANCE.md (branch model), RELEASE-FLOW.md (esquema tags), .omo/drafts/rename-ingestion-telegram.md
     Acceptance criteria: existe `.omo/evidence/task-1-rename-ingestion-telegram.md` con `git status`, lista de tags y lista de releases; rama creada desde `dev`.
     QA scenarios: happy — comandos corren y evidencia existe; failure — árbol sucio → abortar y pedir limpieza (evidencia del `git status`). Evidence .omo/evidence/task-1-rename-ingestion-telegram.md
     Commit: N (pre-flight, sin cambios de código)

- [x] 2. Filesystem: git mv + workspace npm + lock regenerado
     What to do: `git mv apps/ingestion-service apps/ingestion-telegram`; en `apps/ingestion-telegram/package.json:2` name → `@alpha-meta-token-scanner/ingestion-telegram`; en root `package.json:23-24` flags `-w @alpha-meta-token-scanner/ingestion-telegram`; correr `npm install` para regenerar `package-lock.json` (entradas `apps/ingestion-service` → `apps/ingestion-telegram`). Must NOT do: no sed al lockfile; no tocar versiones; no renombrar `INGESTION_*` aquí.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4
     References: apps/ingestion-service/package.json:2, package.json:7-9,23-24, package-lock.json:417,501
     Acceptance criteria: `npm ls -w @alpha-meta-token-scanner/ingestion-telegram` OK; `rg -n "apps/ingestion-service" package.json package-lock.json apps/ingestion-telegram/package.json` cero hits.
     QA scenarios: happy — `npm run test:ingestion` arranca (puede fallar por alias aún viejos, solo debe RESOLVER el workspace); failure — `npm ci --dry-run` falla → revisar lock. Evidence .omo/evidence/task-2-rename-ingestion-telegram.md
     Commit: Y | chore(ingestion): rename workspace to ingestion-telegram

- [x] 3. Build wiring A: alias TS + jest + main.ts + 3 importadores vivos
     What to do: `apps/backend/tsconfig.json:33-35` paths `@ingestion-service/*` → `@ingestion-telegram/*` con targets `../ingestion-telegram/src/shared/...`; `apps/backend/package.json:144-145` y `apps/backend/test/jest-e2e.json:24-25` moduleNameMapper igual; `apps/backend/src/main.ts:44-56` alias runtime → `apps/ingestion-telegram/dist/src/shared/...`; actualizar imports en `apps/backend/src/telegram/crypto-news-ads/infrastructure/ad-media-path-builder.ts:1`, `apps/backend/src/telegram/crypto-news-ads/infrastructure/storage/local-ad-media-storage.adapter.ts:7-8`, `apps/backend/src/telegram/ingestion/shared/transformers/transformation-import.spec.ts:12`. Must NOT do: no cambiar lógica; no tocar aliases propios de ingestion (`shared/*`, `telegram/*` relativos).
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 5, 6, 7
     References: los 6 ficheros de arriba + apps/ingestion-telegram/tsconfig.json:14-23 (self-alias, referencia de no-cambio)
     Acceptance criteria: `npx tsc --noEmit` en backend e ingestion-telegram verdes; `npx jest src/telegram/ingestion/shared/transformers/transformation-import.spec.ts` en backend verde.
     QA scenarios: happy — tsc + spec verde; failure — TS2307 → el mapper/COPY correspondiente quedó viejo (ver todo 4). Evidence .omo/evidence/task-3-rename-ingestion-telegram.md
     Commit: Y | refactor(ingestion): rename TS alias to @ingestion-telegram

- [x] 4. Build wiring B: Dockerfiles + limpieza .bak
     What to do: `apps/ingestion-telegram/Dockerfile:14,18,21,28,44,51,54,80` todos los `apps/ingestion-service` → `apps/ingestion-telegram` y `--workspace=@alpha-meta-token-scanner/ingestion-telegram` (L18,28,51) + CMD `apps/ingestion-telegram/dist/src/main.js`; `apps/backend/Dockerfile:17-20` comentario + COPY; BORRAR (no renombrar) exactamente estos 9 verificados 2026-09-17: `apps/ingestion-service/src/shared/common/config/app.config.ts.bak`, `app.config.ts.bak2` (mismo dir), `apps/backend/src/token/scoring/infrastructure/event-bus/token-classified.handler.spec.ts.bak`, `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.spec.ts.bak`, `apps/ingestion-service/.env.production.template.bak`, `apps/ingestion-service/.env.backup-before-regen`, `apps/backend/src/shared/common/config/app.config.ts.backup`, `apps/backend/src/main.backup.ts`, `.kiro/specs/centralized-ingestion-service/tasks.md.backup`. Si `rg --glob '*.bak*' --glob '*.backup*'` encuentra otros, borrarlos también y listarlos en evidencia. Must NOT do: no cambiar EXPOSE/HEALTHCHECK/puertos; no renombrar `.bak` a otro nombre.
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 9, 10, 16
     References: ambos Dockerfiles completos, `rg --glob '*.bak*' --glob '*.backup*'` para cazar restos
     Acceptance criteria: `docker build -f apps/ingestion-telegram/Dockerfile -t rename-check:ingestion .` y `docker build -f apps/backend/Dockerfile -t rename-check:backend apps/backend` (con contexto correcto) OK; cero ficheros `*.bak*` en el repo (salvo gitignoreados).
     QA scenarios: happy — ambos builds OK; failure — COPY falla → path viejo (evidencia del log). Evidence .omo/evidence/task-4-rename-ingestion-telegram.md
     Commit: Y | build(ingestion): rename docker contexts to ingestion-telegram

- [x] 5. Runtime: env INGESTION*SERVICE_URL → INGESTION_TELEGRAM_URL con fallback
     What to do: nueva var `INGESTION_TELEGRAM_URL`; orden: nueva > antigua (`INGESTION_SERVICE_URL`) > default `http://localhost:3031`; parchear lectores DIRECTOS (`apps/backend/src/shared/common/config/app.config.ts:26,78,383`, `apps/backend/src/telegram/crypto-news-publisher/api/http/queue.controller.ts:97`, `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:478,481`) e INDIRECTOS vía `app.ingestion.serviceUrl` (`apps/backend/src/threads/integration/infrastructure/http/threads-ingestion-client.service.ts:76,87`, `apps/backend/src/telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter.ts:73,85-87` que delega en `apps/backend/src/telegram/ingestion/shared/infrastructure/backend-registration-client.service.ts:48,63-64,161` — SÍ existe, verificado 2026-09-17); comentarios `{INGESTION_SERVICE_URL}` en `matching-config.controller.ts:47`, `shared-ingestion.module.ts:40,49`, `telegram-ingestion.module.ts:32`, `ingestion-coordinator.service.ts:35`, `crypto-news.controller.ts:32`, `crypto-news-message.repository.ts:15`, `crypto-news-source.repository.ts:33` → nuevo nombre; `console.warn` cuando se usa la antigua ("deprecated, migrar a INGESTION_TELEGRAM_URL"); actualizar `.env.example`, `.env.staging.template`, `.env.production.template` (backend) + `.env.example`/`.env.production.template` (ingestion) + root `.env.example:105`. `INGESTION_TELEGRAM_MTPROTO*_`NO se toca. Must NOT do: no eliminar la antigua (vive 1 release); no cambiar defaults de`USE*SSE*_`.
Parallelization: Wave 3 | Blocked by: 3 | Blocks: 11, 16
References: todos los ficheros de arriba + apps/ingestion-telegram/src/shared/common/config/app.config.ts:443-445 (prueba de no-cambio MTPROTO)
Acceptance criteria: matriz ejecutada (solo-nueva/solo-antigua/ambas/ninguna) con `serviceUrl`resuelto correcto + warning solo en casos con antigua; spec o script de matriz en evidencia.
QA scenarios: happy — matriz 4/4 verde; failure — doble grep:`rg "process\.env\.INGESTION*SERVICE_URL" apps/backend/src`(directos sin fallback) +`rg "ingestion\.serviceUrl|INGESTION_SERVICE[^*]" apps/backend/src` (indirectos/comentarios restantes). Evidence .omo/evidence/task-5-rename-ingestion-telegram.md
     Commit: Y | feat(ingestion): rename service URL env with fallback

- [x] 6. Frontend: proxy target + nginx upstream al nuevo DNS
     What to do: `apps/frontend/vite.config.ts:13-14` default `INGESTION_PROXY_TARGET` (`http://localhost:3031`, puerto intacto) + comentario `vite.config.ts:69` ("handled by ingestion-service" → nuevo nombre) + bloque `/ingestion-api` `:71-75`; `apps/frontend/nginx.conf:242,244,248,250` comentarios + `proxy_pass http://onchain-bot-ingestion-telegram:3031/api/`; NO crear `VITE_INGESTION_BASE_URL` (fantasma: cero hits en `src/`, verificado 2026-09-17); actualizar `apps/frontend/AGENTS.md` donde documente el default (línea ~98, reverificar número). Must NOT do: no añadir vars cliente nuevas; no tocar líneas 140-174 salvo comentario si nombran DNS viejo (verificar, son legacy `/crypto-news/*`).
     Parallelization: Wave 3 | Blocked by: 3 | Blocks: 11, 16
     References: vite.config.ts:13-14,69,71-75, nginx.conf:242,244,248,250, apps/frontend/src/shared/config/env.ts:1-3 (prueba fantasma), apps/frontend/AGENTS.md
     Acceptance criteria: `npm run build:frontend` verde; `rg "onchain-bot-ingestion[^:-]" apps/frontend` explica cada hit restante o cero hits.
     QA scenarios: happy — build verde + `docker compose config` del frontend si aplica; failure — upstream viejo → 502 en prod (evidencia del grep). Evidence .omo/evidence/task-6-rename-ingestion-telegram.md
     Commit: Y | refactor(frontend): point ingestion proxy to ingestion-telegram DNS

- [x] 7. Compose: service/container/DNS + with-ingestion in place
     What to do: `docker-compose.ingestion.yml`: `name: onchain-bot-ingestion-telegram`, service `ingestion-telegram`, `dockerfile: apps/ingestion-telegram/Dockerfile`, `image: ghcr.io/bryanstevensacosta/onchain-bot-ingestion-telegram:latest` (nueva; rollback tira de la antigua), `container_name: onchain-bot-ingestion-telegram`, `env_file: ../../apps/ingestion-telegram/.env.production`, comentarios; `docker-compose.prod.yml:117` y `staging.yml:94` `INGESTION_SERVICE_URL` → mantener antigua ESTE release (fallback la cubre) y añadir nueva comentada/effective según decisión env (coherente con todo 5: setear `INGESTION_TELEGRAM_URL`); `with-ingestion.yml`: paths + DNS actualizados in place (servicio `ingestion-telegram`, `dockerfile` nuevo, `env_file` nuevo — NOTA: su `../ingestion-service/.env.production` ya diverge del repo, documentar). Puertos `127.0.0.1:3032:3031` INTACTOS. Must NOT do: no crear servicio ingestion en staging/prod; no cambiar puertos ni redes externas.
     Parallelization: Wave 3 | Blocked by: 3 | Blocks: 9, 11, 16
     References: los 4 compose + .env templates con DNS
     Acceptance criteria: `docker compose -f <cada uno> config` valida (al menos ingestion + with-ingestion + prod + staging); `rg "onchain-bot-ingestion[^:-]|ingestion-service:3031" apps/backend/docker-compose.*` cero hits no documentados.
     QA scenarios: happy — 4 configs validan; failure — DNS viejo restante → backend no resuelve (evidencia del config). Evidence .omo/evidence/task-7-rename-ingestion-telegram.md
     Commit: Y | chore(deploy): rename ingestion compose service and DNS

- [x] 8. Scripts con paths hardcoded + strings de tooling
     What to do: `scripts/check-prerequisites.sh:79,94-96,100-101,104,112,118-119,151`, `scripts/test-local-ingestion.sh:97,122,124,126,141,144,198,271,274,289`, `scripts/validate-session-migration.sh:6,31,110,129-130,154`, `scripts/draft-changelog.sh:7,35,58-59` (whitelist `backend|frontend|ingestion-telegram`), `apps/ingestion-telegram/scripts/telegram-gen-session.ts:44`, `apps/ingestion-telegram/scripts/run-migrations.sh:6`, `apps/ingestion-telegram/src/shared/common/persistence/data-source.ts:9`, `scripts/README-validate-session-migration.md:31,40,65,72,74`. `bash -n` a cada script editado. Must NOT do: no cambiar lógica de los scripts; no tocar `backup-db.sh`/`smoke-prod.sh` (parametrizados, ya verificados).
     Parallelization: Wave 3 | Blocked by: 2 | Blocks: 11, 16
     References: todos los ficheros de arriba (rangos verificados 2026-09-17)
     Acceptance criteria: `rg -n "apps/ingestion-service" scripts/ apps/ingestion-telegram/scripts/` cero hits; `bash -n` verde en editados.
     QA scenarios: happy — grep cero + bash -n; failure — `cd` a dir viejo → preflight roto (evidencia). Evidence .omo/evidence/task-8-rename-ingestion-telegram.md
     Commit: Y | chore(scripts): update hardcoded ingestion paths

- [x] 9. CI/CD: deploy-ingestion.yml dual-push + paths droplet
     What to do: `paths: 'apps/ingestion-telegram/**'`; `file: apps/ingestion-telegram/Dockerfile`; tags DUAL (`-ingestion-telegram:sha/:latest` nuevos + `-ingestion:sha/:latest` antiguos) + `cache-from/to` DUAL (`:cache` nuevo y antiguo); `docker pull` ambos (nuevo requerido, antiguo best-effort para rollback); droplet paths → `/opt/onchain-bot/apps/ingestion-telegram/.env.production`; dataSource → `apps/ingestion-telegram/dist/src/shared/common/persistence/data-source.js`; compose path (misma ruta `apps/backend/docker-compose.ingestion.yml`); health `:3032` intacto. Must NOT do: no cancelar `cancel-in-progress: false`; no tocar `deploy.yml` salvo que cite paths viejos (verificar L153, L159-167 gate).
     Parallelization: Wave 4 | Blocked by: 4, 7 | Blocks: 11, 16
     References: .github/workflows/deploy-ingestion.yml completo, deploy.yml:149-167,243, deploy-staging.yml:251,323-324
     Acceptance criteria: `python -c yaml.safe_load` verde en el workflow; `rg "ingestion-service" .github/workflows/deploy-ingestion.yml` cero hits; checklist de que `deploy.yml`/`deploy-staging.yml` no referencian paths/dirs viejos (solo comentarios/SMOKE_URL si aplica, documentados).
     QA scenarios: happy — parse + grep cero; failure — `.env.production` path viejo → deploy aborta en droplet (evidencia del diff). Evidence .omo/evidence/task-9-rename-ingestion-telegram.md
     Commit: Y | ci(ingestion): dual-push ingestion-telegram image

- [x] 10. CI base + cierre de drift: ci.yml, lint-staged, root scripts
      What to do: `ci.yml:243` build `-w @alpha-meta-token-scanner/ingestion-telegram`, `:261-266` artifact `ingestion-telegram-dist` + path `apps/ingestion-telegram/dist`; `lint-staged.config.js`: añadir glob ingestion-telegram (cierra drift: hoy cero cobertura); root `package.json`: `test:ingestion` ya actualizado en todo 2 + añadir `lint:ingestion`/`build:ingestion` si el patrón de backend/frontend lo permite (verificar scripts existentes primero; si no encaja, documentar y no forzar). Must NOT do: no inventar convenciones de scripts; no tocar jobs de backend/frontend.
      Parallelization: Wave 4 | Blocked by: 4 | Blocks: 16
      References: ci.yml:92-107,242-266, lint-staged.config.js, package.json:12-24, .husky/pre-commit
      Acceptance criteria: `npm run build -w @alpha-meta-token-scanner/ingestion-telegram` verde; yaml parse verde; lint-staged cubre `apps/ingestion-telegram/**`.
      QA scenarios: happy — build + artifact path existen; failure — trigger path viejo → PRs de ingestion no disparan CI (evidencia del diff de paths). Evidence .omo/evidence/task-10-rename-ingestion-telegram.md
      Commit: Y | ci(ingestion): update CI paths and close lint gap

- [x] 11. Runbook de cutover en droplet (stop-the-world, anti AUTH_KEY_DUPLICATED)
      What to do: añadir sección "Cutover ingestion-telegram" en `docs/deployment/ingestion-service-runbook.md` (si el worker encuentra que otro fichero de `docs/deployment/` es el canónico —candidatos: `ingestion-service-checklist.md`, `ingestion-service-post-deploy.md`—, usar ese y documentar la elección en evidencia): secuencia — 1) backup DB ingestion, 2) `docker compose -f docker-compose.ingestion.yml stop ingestion-service` (contenedor VIEJO), 3) `mv /opt/onchain-bot/apps/ingestion-service/.env.production /opt/onchain-bot/apps/ingestion-telegram/.env.production` + symlink legacy→nuevo (o inverso según rollback) + `chown runner:runner`, `mkdir -p` parent, 4) pull imagen nueva (fallback antigua), 5) `up -d --force-recreate`, 6) health `:3032/api/health` + `clients>=1`, 7) actualizar backends (`INGESTION_TELEGRAM_URL`) y frontend; regla NUNCA-copiar session string; rollback SIN re-arrancar sesión vieja; cross-check de que todas las rutas del runbook existen en el workflow (todo 9). Must NOT do: no ejecutar nada en droplet (solo runbook + validación de ficheros); no arrancar dos contenedores a la vez ni en local para probar.
      Parallelization: Wave 4 | Blocked by: 5, 6, 7, 8, 9 | Blocks: 16
      References: docs/deployment/ingestion-service-runbook.md (o el canónico que elija el worker), .github/workflows/deploy-ingestion.yml:75-129, AGENTS.md:62-69 invariantes singleton
      Acceptance criteria: runbook existe con los 7 pasos + regla anti-duplicidad + rollback; script de cross-check (grep de cada path del workflow contra el runbook) en evidencia.
      QA scenarios: happy — cross-check 100%; failure — path del runbook ausente en workflow → flag como blocker. Evidence .omo/evidence/task-11-rename-ingestion-telegram.md
      Commit: Y | docs(deploy): ingestion-telegram droplet cutover runbook

- [x] 12. Docs vivos: bulk con tabla case-sensitive (67 md/txt)
      What to do: reemplazo case-sensitive por tabla: `ingestion-service` → `ingestion-telegram`, `INGESTION_SERVICE` → `INGESTION_TELEGRAM` (SOLO donde sea la var renombrada; `INGESTION_TELEGRAM_MTPROTO_*`, `INGESTION_DATABASE_*`, `INGESTION_REDIS_*`, `INGESTION_PORT` NO cambian), `ingestion_service` → `ingestion_telegram` (playbook:358,400,455), `onchain-bot-ingestion` → `onchain-bot-ingestion-telegram` (solo DNS/imagen, NO badges históricos de release ya publicados salvo que apunten a latest), `apps/ingestion-service` → `apps/ingestion-telegram`; ficheros: root README (badges/tabla/URLs), 3 AGENTS.md (incl. code maps con líneas — REVERIFICAR números de línea que cambien), `docs/deployment/*`, templates `.env.*`, comentarios de código que nombren paths/URLs/imágenes (prosa pura que diga "ingestion-service" sin path/URL se incluye igual por alcance total, pero en commit separado para revisión). CHANGELOGs pasados INMUTABLES. Must NOT do: no tocar bloques de código que muestren output histórico; no romper mermaid/badges (verificar render mental + grep de URLs).
      Parallelization: Wave 5 | Blocked by: 5, 6, 7 | Blocks: 14, 16
      References: `rg --glob '*.md' --glob '*.txt'` hit list, AGENTS.md x3, README.md, docs/deployment/
      Acceptance criteria: gate global (ver estrategia) con lista de excepciones documentada en evidencia; `npm run docs:check` sin nuevos warnings vs baseline.
      QA scenarios: happy — gate pasa; failure — badge/mermaid roto → revert del hunk (evidencia del diff). Evidence .omo/evidence/task-12-rename-ingestion-telegram.md
      Commit: Y (2 commits) | docs: rename ingestion-service to ingestion-telegram + docs: rename code comments to ingestion-telegram

- [x] 13. Histórico .omo/.kiro/specs + .txt sueltos
      What to do: misma tabla del todo 12 aplicada a estos paths exactos: `.omo/drafts/`, `.omo/plans/`, `.omo/completed/`, `.omo/analysis/`, `.omo/evidence/` (SOLO ficheros de otros planes; excluir `*rename-ingestion-telegram*` — los logs de este plan reflejan la historia real), `.kiro/specs/centralized-ingestion-service/`, `.kiro/specs/shared-ingestion-service-multi-backend/`, `.kiro/specs/crypto-news-*/` (verificar existencia por glob antes), `test_validation/`, `IMPLEMENTATION_COMPLETE_SUMMARY.md`, `NO_DUPLICATION_VERIFICATION.md` si existen en raíz, `*.txt` sueltos en raíz. Must NOT do: no reescribir `.git/`; no tocar `node_modules/dist/coverage`; no tocar los 9 `.bak/.backup` (son del todo 4, ya borrados).
      Parallelization: Wave 5 | Blocked by: — | Blocks: 16
      References: hit list en `.omo/drafts|plans|completed|analysis`, `.kiro/specs/centralized-ingestion-service` (p.ej. `tasks.md:55`, `design.md`), `.kiro/specs/shared-ingestion-service-multi-backend`, `test_validation/test_script.sh:5,19,34,44`
      Acceptance criteria: `rg` en esos dirs cero hits no documentados.
      QA scenarios: happy — cero hits; failure — spec cerrada referenciada por tooling → documentar excepción. Evidence .omo/evidence/task-13-rename-ingestion-telegram.md
      Commit: Y | docs(history): rename ingestion references in omo/kiro archives

- [x] 14. RELEASE-FLOW.md al nuevo esquema
      What to do: `RELEASE-FLOW.md`: short-name `<app>` `backend|frontend|ingestion` → `backend|frontend|ingestion-telegram` (`:4` Scope, `:50` lista `<app>`, `:127` ejemplo `fix(ingestion):` → `fix(ingestion-telegram):`); tags `ingestion-telegram-vX.Y.Z`, `gh release create ingestion-telegram-v*`, paths `apps/ingestion-telegram/package.json` + `CHANGELOG.md`, nota de que los tags viejos del inventario (todo 1) están deprecados (ver todo 15) y links antiguos rotos. OJO `:26-27,44,106` mencionan `ingestion`/`ingestion-service` en prosa histórica de releases pasados — NO reescribir esos ejemplos (inmutabilidad histórica), solo el esquema a futuro. Must NOT do: no cambiar el flujo manual (sin automation).
      Parallelization: Wave 5 | Blocked by: 12 | Blocks: 15, 16
      References: RELEASE-FLOW.md, apps/ingestion-telegram/CHANGELOG.md, apps/ingestion-telegram/package.json (versión 1.0.0)
      Acceptance criteria: `rg "ingestion-service|ingestion-v" RELEASE-FLOW.md` solo en la nota deprecada.
      QA scenarios: happy — esquema nuevo + nota; failure — ejemplo con path viejo → release futuro falla (evidencia). Evidence .omo/evidence/task-14-rename-ingestion-telegram.md
      Commit: Y | docs(release): ingestion-telegram tag scheme

- [x] 15. Reetiquetado histórico: backup, recreate, gh release, delete old (DESTRUCTIVO)
      What to do: con el inventario del todo 1 (nombres REALES, el inventario manda — conocido 2026-09-17: `ingestion-service-v1.0.0`): 1) backup (`git tag --list > evidencia + git ls-remote --tags`), 2) por cada tag viejo crear `ingestion-telegram-v<same>` en el MISMO commit (`git tag <nuevo> <sha-viejo>` + push; si el inventario trajera un `ingestion-v*`, espejarlo igual), 3) `gh release` espejo (mismo título/notas con nombre nuevo; si `gh release edit` no permite renombrar tag, delete+recreate documentado), 4) verificar `gh release list` + `git ls-remote --tags`, 5) borrar tags viejos local+remoto (`git push origin :refs/tags/<viejo>`) SOLO tras verificación, 6) nota pública de links rotos. REQUISITO: aprobación explícita del operador en el momento (mostrar backup + plan de tags antes de borrar). Must NOT do: no borrar sin verificación verde; no tocar tags de backend/frontend; no reescribir commits (solo tags).
      Parallelization: Wave 5 | Blocked by: 1, 14 | Blocks: 16
      References: inventario todo 1, RELEASE-FLOW.md (tras todo 14), `gh release --help`
      Acceptance criteria: `git ls-remote --tags origin` muestra `ingestion-telegram-v*` y NO `ingestion-service-v*`; `gh release list` con títulos nuevos; evidencia before/after.
      QA scenarios: happy — espejo verificado + viejos borrados; failure — release con assets no espejables → abortar borrado y documentar (evidencia). Evidence .omo/evidence/task-15-rename-ingestion-telegram.md
      Commit: N (tags/releases, no código; el worker NO commitea tags sin el gate del operador)

- [x] 16. Verificación global: gate grep + suites + builds + compose
      What to do: 1) gate `rg` global (cero hits salvo excepciones documentadas en todos 5,12,13), 2) assert diff sin cambios de puerto/DB (`git diff | rg "3031|3032|alpha_meta_token_scanner_ingestion"` solo context, no adiciones/eliminaciones), 3) `npx tsc --noEmit` backend+ingestion-telegram, 4) `npm run test:backend` + `npm run test:ingestion` (o `test -w` nuevo workspace), 5) `npm run test:frontend` + build frontend, 6) `docker build` ambos Dockerfiles, 7) `docker compose config` en los 4 compose, 8) matriz env del todo 5 re-ejecutada. Must NOT do: no declarar verde con fallos "conocidos" sin evidencia; no saltar F1-F4 después.
      Parallelization: Wave 6 | Blocked by: 5-15 | Blocks: F1-F4
      References: todos anteriores + evidencias 1-15
      Acceptance criteria: TODO verde; informe consolidado en evidencia con cada comando + salida.
      QA scenarios: happy — todo verde; failure — cualquier rojo → todo de fix scopeado al hunk (no replan). Evidence .omo/evidence/task-16-rename-ingestion-telegram.md
      Commit: N (verificación, no cambios; si hay fixes, commit propio por fix)

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [~] F1. Plan compliance audit — APPROVE by reviewer, awaiting user sign-off to close
- [~] F2. Code quality review — APPROVE by reviewer, awaiting user sign-off to close
- [~] F3. Real manual QA — APPROVE by reviewer, awaiting user sign-off to close
- [~] F4. Scope fidelity — APPROVE by reviewer, awaiting user sign-off to close

## Commit strategy

- Rama `feat/rename-ingestion-telegram` desde `dev`; un commit por todo marcado Y (convencional: `chore|refactor|build|feat|ci|docs`), nunca `--no-verify` salvo bloqueo de hook documentado en evidencia.
- Push + PR squash a `dev` (GOVERNANCE.md: 1 approval + CI verde). El reetiquetado (todo 15) NO va en el PR: se ejecuta tras merge con gate del operador.
- `git mv` para preservar historial de ficheros; lockfile solo vía `npm install`.

## Success criteria

- `apps/ingestion-telegram` existe, compila, testea y construye imagen; backend resuelve `@ingestion-telegram/*` en tsc/jest/Docker/dist.
- GHCR publica `onchain-bot-ingestion-telegram` (+ antigua en dual-push); workflows sin refs a paths viejos; CI verde.
- Runtime con `INGESTION_TELEGRAM_URL` (fallback verificado en matriz 4/4); DNS nuevo en compose/nginx; puertos y DB intactos.
- Gate grep global cero (salvo excepciones documentadas); docs vivos + histórico renombrados; releases históricos espejados a `ingestion-telegram-v*` con viejos eliminados solo tras verificación.
- F1-F4 (plan compliance, calidad, QA real, fidelidad de alcance) aprueban y el usuario da OK explícito.
