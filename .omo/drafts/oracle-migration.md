---
slug: oracle-migration
status: executing-awaiting-inputs
intent: clear
pending-action: owner inputs (arch multi-arch/x86, Tailscale authkey, runner token); then unhold 7/8/10/12/13/14/15 chain
progress: todos 1-6,9,11 done+verified (8/25); uploads+staging-DB frozen per owner; mobile-data guardrail in plan Scope
approach: Replica total en Oracle (prod+staging+ingestion) con dump/restore y paralelo antes del corte; nuevo runner self-hosted en Oracle; alias OracleDroplet + sshpass; docs actualizadas; droplet DO se apaga solo tras verificación.
---

# Draft: oracle-migration

## Components (topology ledger)

<!-- id | outcome (one line) | status | evidence path -->

- base | Oracle VPS con Docker + /data montado + firewall + alias SSH OracleDroplet | active | infra/ + bootstrap-droplet.sh
- prod | Stack prod (backend+frontend+pg+redis) corriendo en Oracle :3030 | active | apps/backend/docker-compose.prod.yml
- ingestion | Ingestion-service standalone en Oracle con la ÚNICA sesión MTProto | active | apps/backend/docker-compose.ingestion.yml + AGENTS.md invariantes 1-8
- staging | Stack staging en Oracle :3031/:4173 | active | apps/backend/docker-compose.staging.yml
- data | DBs + uploads migrados vía pg_dump/restore | active | scripts/backup-db.sh
- cicd | Runner self-hosted en Oracle + workflows retargeteados | active | .github/workflows/deploy.yml:57, deploy-staging.yml, deploy-ingestion.yml
- docs | AGENTS.md/README/docs-deployment/runbooks apuntando a Oracle | active | docs/deployment/, AGENTS.md, README.md

## Open assumptions (announced defaults)

<!-- assumption | adopted default | rationale | reversible? -->

- Runner strategy | nuevo self-hosted runner en Oracle (mid-migración conviven 2 runners con labels) | espeja la arquitectura actual, sin rediseño | sí
- Acceso público | Tailscale en Oracle (mismo modelo que hoy: cryptoganster.\*) + socat templates | hoy no hay dominio público; frontend prod en loopback | sí
- Layout en disco | repo en /opt/onchain-bot + datos docker en /data | respeta tu partición 50GB sistema / /data apps | sí
- Staging en Oracle | mismo host, puertos actuales (:3031/:4173) | paridad total pedida | sí

## Findings (cited - path:lines)

- Deploy prod = self-hosted runner + GHCR + compose: .github/workflows/deploy.yml:55-201
- Ingestion standalone :3032, una sola sesión MTProto: apps/backend/docker-compose.ingestion.yml + AGENTS.md invariantes
- SSH actual: Host CryptoGanster root@144.126.203.139, IdentityFile ~/.ssh/id_droplet (~/.ssh/config); sin alias Oracle existente
- Secrets .env.production/.env.staging/ingestion ya respaldados localmente como .env.droplet.\* (gitignored)
- scripts/.env.sync + sshpass es el patrón actual de acceso con password (recién untrackeado del índice)

## Decisions (with rationale)

- Acceso Oracle por IP+key (usuario lo provee) — permite verificar VPS antes de planificar comandos exactos
- Alcance total prod+staging+ingestion — paridad pedida por el usuario
- Dump/restore + paralelo con rollback a DO — única opción segura con invariante single-MTProto
- Renombre anti-colisión (2026-09-10): DO pasa a `digitalocean` (hostname sistema + Tailscale), Oracle conserva `cryptoganster`/CryptoGanster — elimina la colisión de nombres en el tailnet
- Arquitectura ARM (2026-09-10, owner delegó decisión): Oracle es Ampere ARM64 2 OCPU/12GB (free tier) — SE QUEDA; builds GHCR pasan a multi-arch `linux/amd64,linux/arm64` (3 workflows). Rationale: x86 sacaría del free tier + obligaría a rehacer base y re-transferir dumps (data móvil); QEMU solo en build (GitHub), runtime nativo en ambos lados.

## Scope IN

- Provisioning Oracle, 3 stacks, datos, runner+CICD, alias SSH key-only (sshpass explícitamente fuera — ver plan Must-NOT; `.env.sync` intacto), actualización de docs

## Scope OUT (Must NOT have)

- Rediseño de arquitectura; cambios de código de producto; rotación de secretos (track aparte); apagar DO antes de verificación

## Open questions

- [RESOLVED 2026-09-10] Acceso Oracle: `ssh -i ~/Downloads/ssh-key-2026-09-10.key ubuntu@150.136.155.23` — verificado con comandos solo-lectura.
- [NEW 2026-09-10] LiteLLM gateway (litellm-gateway + litellm-db en DO) NO está en el plan; `LLM_GATEWAY_BASE_URL` en ambos backend-envs aún apunta a DO. Oracle backend llamaría a un endpoint muerto tras el corte. Opciones: (a) migrar los 2 contenedores+config a Oracle, (b) re-apuntar a endpoint externo, (c) degradado documentado. Requiere decisión owner antes del todo 14.
- [DECIDIDO 2026-09-10] Gateway diferido: vive en otro repo, se trabaja aparte. Backend Oracle sube sabiendo que LLM fallará hasta ese track (owner acepta).
- [NUEVO 2026-09-10] Bug migraciones en DB fresca (track producto separado, NO migración): ninguna migración crea las tablas base (`settings_filters`, `signals`, `scoring_thresholds`… — era synchronize); `1782270612825` revienta en staging vacío (`ALTER TABLE settings_filters` 42P01). DO funcionaba por acumulación histórica. Staging Oracle queda HELD (15/17) hasta fix producto. PROD Oracle NO afectado (dump restaurado trae las 43 tablas + `typeorm_migrations`).
- [CONFIRMADO 2026-09-10] DO SUSPENDIDO por falta de pago (owner). Sesión MTProto a salvo en local (`apps/ingestion-telegram/.env.droplet.production`: SESSION len 368, API_ID len 8, API_HASH len 32 — verificado sin exponer valores). Sin gate de apagado: nada corre en DO. Riesgo residual: AUTH_KEY_DUPLICATED transitorio al arrancar en Oracle (retry 60s+). Staging/prod DO-deploy jobs encolados quedan obsoletos.

## Verified Oracle VPS facts (2026-09-10, read-only SSH)

- Hostname: `cryptoganster` (⚠️ COLISIÓN con el nombre Tailscale del droplet DO — el plan debe renombrarlo o coordinar)
- OS: Ubuntu 24.04.5 LTS noble; RAM 11Gi
- Sistema: /dev/sda1 45G (4% usado); Datos: /dev/sdb1 150G montado en /data (vacío, 28K usado)
- Docker: NO instalado (el plan incluye instalación oficial + compose plugin)
- Key local: ~/Downloads/ssh-key-2026-09-10.key (permiso 400; el plan la reubica a ~/.ssh/ con alias OracleDroplet)

## Approval gate

status: superseded-by-execution (plan written, 20/24 verified, F1-F4 APPROVE awaiting owner OK)
pending-action: owner merges PR #187, then registry convergence (bridge steady meanwhile)

## Execution decisions log (2026-09-10)

- Runaway ingestion build (105+ min, QEMU frío sin caché) CANCELADO a petición del owner; bridge nativo arm64 queda como estado estable de ingesta (sirve desde 13:36Z).
- PR #187 (dev→master: caché d6453b8 + mem + socat + healthchecks + restart + docs) listo para approve+merge; futuros builds con caché (~5-15 min).
