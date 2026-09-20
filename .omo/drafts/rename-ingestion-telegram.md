---
slug: rename-ingestion-telegram
status: approved-generating
intent: clear
pending-action: append todos into .omo/plans/rename-ingestion-telegram.md ## Todos, fill TL;DR last
approach: renombre total en olas ordenadas (código/build → CI/GHCR dual-push → compose/DNS/env con fallback → droplet → docs total incl. histórico → reetiquetado releases → verificación)
---

# Draft: rename-ingestion-telegram

## Components (topology ledger)

| C1 | Filesystem + build wiring renombrado y compilando (tsconfig, jest, Dockerfiles, lock) | status: active | apps/ingestion-service/Dockerfile, apps/backend/tsconfig.json:33-35, apps/backend/package.json:144-145 |
| C2 | CI/CD + GHCR dual-push operativo (nueva imagen + antigua 1-2 releases) | status: active | .github/workflows/deploy-ingestion.yml:7,42,45-49, .github/workflows/ci.yml:243,266 |
| C3 | Runtime contracts renombrados con fallback (env, DNS, proxy; puertos intactos) | status: active | apps/backend/src/shared/common/config/app.config.ts:383, docker-compose.ingestion.yml, nginx.conf:250 |
| C4 | Docs total + scripts + releases reetiquetados (67 md/txt + histórico, ingestion-telegram-v*) | status: active | RELEASE-FLOW.md, docs/deployment/, scripts/*.sh |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

- Unión verificada: 181 ficheros / 1351 hits (ingestion-service 175f/1298h; INGESTION_SERVICE 31f/58h; ingestion_service 1f/3h en docs/monitoring/ingestion-service-playbook.md:358,400,455). Repro: rg "ingestion-service|ingestion_service|INGESTION_SERVICE" excluyendo node_modules/dist/.git/coverage.
- Build wiring: backend tsconfig @ingestion-service/\* (apps/backend/tsconfig.json:33-35), jest mappers (apps/backend/package.json:144-145, test/jest-e2e.json:24-25), main.ts dist alias (apps/backend/src/main.ts:44-56), backend Dockerfile COPY (apps/backend/Dockerfile:20), ingestion Dockerfile COPYs+CMD (apps/ingestion-service/Dockerfile:14,21,44,54,80), lock (package-lock.json:417,501). Importadores vivos: ad-media-path-builder.ts:1, local-ad-media-storage.adapter.ts:7-8, transformation-import.spec.ts:12.
- GHCR: solo deploy-ingestion.yml publica -ingestion (tags :sha/:latest/:cache, L45-49); deploy.yml/staging solo -backend/-frontend + smoke SMOKE_INGESTION_URL :3032. Imagen deriva de github.repository, NO de la carpeta.
- Runtime: env INGESTION_SERVICE_URL default localhost:3031 (app.config.ts:383); DNS onchain-bot-ingestion:3031 (prod:117, staging:94, nginx.conf:249-250); with-ingestion.yml:113 ingestion-service:3031 (Docker DNS = service name). Puertos 3031/3032 fuera de alcance.
- Sesiones exploración: ses_f51e44d71ffestZzJjGwB8ZgSR, ses_f51e44d2bffe4nu42e37akvxkC, ses_f51e44d26ffebBMagslDzYoYU0.

## Decisions (with rationale)

1. Alcance TOTAL (directorio, workspace npm @alpha-meta-token-scanner/ingestion-telegram, alias TS @ingestion-telegram/\*, env, DNS, comentarios) — pedido explícito del usuario.
2. GHCR dual-push temporal (nueva onchain-bot-ingestion-telegram + antigua 1-2 releases) — evita romper pulls del droplet.
3. Releases: reetiquetar TAMBIÉN historial (scope change 2026-09-17, pedido explícito). NOTA ground-truth 2026-09-17: el tag real es `ingestion-service-v1.0.0` (cero `ingestion-v*`); el plan trabaja por inventario (`git tag --list '*ingestion*'` manda, espejo a `ingestion-telegram-v*`).
4. Env con fallback al nombre antiguo 1 release — evita romper droplets no actualizados.
5. DNS también renombrado (container/service/proxy) — coherencia con renombre total.
6. Docs TODO incl. histórico (.omo/.kiro/specs) — pedido explícito.
7. QA tests-after por ola (backend Jest + ingestion Jest + tsc + smoke :3032) — rename mecánico, confirmado por usuario.

## Scope IN

- git mv apps/ingestion-service → apps/ingestion-telegram + workspace name + alias TS + 3 importadores + main.ts dist + lock (npm install).
- Dockerfiles (COPYs + CMD), compose dockerfile:/env_file:, service/container/image/DNS, nginx + vite proxy.
- Workflows: path filter, file:, tags dual-push + cache dual, dataSource path, artifact path, ci build -w; root scripts test:ingestion.
- Env rename con fallback (INGESTION*SERVICE_URL→INGESTION_TELEGRAM_URL + compat; INGESTION_TELEGRAM_MTPROTO*_), templates .env._, droplet paths /opt/onchain-bot/apps/ingestion-telegram/.
- Scripts \*.sh con paths hardcoded; RELEASE-FLOW.md (+ short-name `<app>` ingestion → ingestion-telegram); reetiquetado releases históricos vía gh (por inventario).
- Docs: 67 md/txt + histórico .omo/.kiro (bulk sed + revisión); CHANGELOGs pasados inmutables.
- Cleanup: borrar los 9 `.bak/.backup` verificados; cerrar drift (glob ingestion-telegram en lint-staged, scripts root si encajan).

## Scope OUT (Must NOT have)

- NO renombrar INGESTION_DATABASE_NAME (alpha_meta_token_scanner_ingestion) ni DBs lógicas.
- NO cambiar puertos 3031 interno / 3032 host.
- NO conservar tags viejos `*ingestion*` del inventario (se espejan a `ingestion-telegram-v*` y se borran solo tras verificación; links antiguos a tags se rompen — documentarlo).
- NO tocar infra/terraform, pgadmin/servers.json, scripts/deploy.sh (legacy backend-only).
- NO duplicar sesión MTProto; credenciales solo en apps/ingestion-telegram/.env.
- NO definir ingestion en docker-compose.staging.yml/.prod.yml (invariante).

## Open questions

Ninguna — todas resueltas en entrevista (2 rondas) + scope change releases 2026-09-17.

## Approval gate

status: approved 2026-09-17 ("si" del usuario tras re-brief con reetiquetado histórico).
pending-action cumplida: generar plan ahora.
