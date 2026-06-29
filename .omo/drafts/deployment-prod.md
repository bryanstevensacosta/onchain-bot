---
slug: deployment-prod
status: ready
intent: clear
pending-action: write .omo/plans/deployment-prod.md
approach: Dockerizar backend + frontend, docker-compose production en VPS con Tailscale, GitHub Actions CI/CD, TypeORM migrations con rollback, secret management con GitHub Secrets + .env separados.
---

# Draft: deployment-prod

## Components (topology ledger)
| id | outcome | status | evidence |
|---|---|---|---|
| C1 - Environment separation | Telegram cuentas separadas + .env por entorno | active | Decision del owner |
| C2 - Backend Dockerfile | Multi-stage Dockerfile para NestJS | active | No existe actualmente |
| C3 - Frontend Dockerfile | Build + serve estático vía nginx | active | No existe actualmente |
| C4 - Production docker-compose | Postgres + Redis + Backend + Frontend en red interna | active | Solo existe compose dev |
| C5 - DB migrations | TypeORM CLI + migrations generadas, synchronize=false en prod | active | 1 migration existe, synch=true |
| C6 - CI/CD GitHub Actions | Build → test → docker push → SSH deploy → migrate → restart | active | No existe |
| C7 - Secret management | GitHub Secrets + .env.production no commiteado | active | Secrets en .env actual |
| C8 - Rollback strategy | Git tag + docker tag previo + restore backup | active | No existe |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Frontend no requiere dominio público | Acceso solo via Tailscale: cryptoganster.tailf01c61.ts.net:5173 | Owner no quiere dominio | Sí, añadir dominio después |
| Backend expuesto solo en red Tailscale | UFW solo permite 3030 desde Tailscale | Seguridad por aislamiento de red | Sí, abrir a internet después |
| Un solo VPS para todo | docker-compose single-node | Escala vertical, no horizontal por ahora | Sí, migrar a swarm/k8s después |
| Migraciones forward-only (sin rollback automático) | Backup DB antes de cada deploy | Simplicidad inicial | Sí, añadir flyway/proelix después |
| Sin monitoring/Prometheus | Solo docker logs + healthcheck | Mínimo viable | Sí, añadir después |

## Findings (cited - path:lines)
- Droplet DigitalOcean: 2 vCPU, 3.8GB RAM, 77GB SSD, Ubuntu 24.04 (ssh audit)
- Docker v29.5.2 + Compose v5.1.4 instalados (ssh audit)
- Tailscale IP: 100.84.4.28 | MagicDNS: cryptoganster.tailf01c61.ts.net (ssh audit)
- Puertos disponibles: 3030, 5173, 6379, 5432 (solo Docker internal) (ssh audit)
- Servicios existentes: litellm (4845), prometheus (9090), hermes agents (ssh audit)
- UFW activo: puertos 22, 80, 443, 4845 abiertos (ssh audit)
- Node v22.22.2, npm 10.9.7, Git 2.43.0 instalados (ssh audit)
- .env actual en apps/backend/.env con secrets hardcodeados (apps/backend/.env:1-101)
- DATABASE_SYNCHRONIZE=true activo (apps/backend/.env:100)
- INGESTION_TELEGRAM_MTPROTO_API_ID/HASH/SESSION existentes (apps/backend/.env:66-68)
- VIP_CALLS_BOT_TOKEN y CHAIN_DEXTER_BOT_TOKEN existentes (apps/backend/.env:71,75)
- TelegramListenerPort abstracto sin mock implementation (apps/backend/src/telegram/ingestion/domain/ports/telegram-listener.port.ts)
- AppConfig carga env vars desde process.env directo (apps/backend/src/shared/common/config/app.config.ts:178-365)
- IngestionSafetyConfig lee process.env directo (apps/backend/src/telegram/ingestion/infrastructure/config/ingestion-safety.config.ts:15-35)

## Decisions (with rationale)
1. **Cuentas Telegram separadas dev/prod** — Rate limit de MTProto es por session/usuario. Dos instancias con mismo session → FLOOD_WAIT duplicado. Solución: cada entorno con su propio usuario Telegram + API ID/HASH/SESSION + bot tokens.
2. **docker-compose single-node** — El droplet es pequeño. Un solo compose file orquesta todo. Sin Kubernetes.
3. **Frontend opcional via Tailscale** — Sin dominio público. Acceso esporádico directo por puerto en MagicDNS.
4. **TypeORM migrations manuales + CI/CD** — Se generan desde entities. Se ejecutan en CI/CD antes del deploy. No synchronize.
5. **Pre-deploy backup de DB** — `pg_dump` antes de correr migrations. Rollback manual si falla.
6. **Puertos de DB/Redis no expuestos al host** — Solo red interna Docker. Nadie fuera del container puede conectar.

## Scope IN
- Dockerfile multi-stage para backend (NestJS)
- Dockerfile para frontend (Vite build + nginx)
- .dockerignore
- docker-compose.prod.yml con todos los servicios
- .env.dev y .env.production (separados, .env.production en .gitignore)
- Scripts npm: migration:generate, migration:run, db:backup
- Endpoint GET /health (ya existe /ingestion/health parcialmente)
- GitHub Actions workflow: .github/workflows/deploy.yml
- Uso de GitHub Secrets para tokens sensibles
- Healthcheck en Dockerfile y docker-compose
- Configuración UFW para puertos 3030 y 5173 (solo Tailscale)
- Rollback runbook documentado

## Scope OUT (Must NOT have)
- No se modificará el código de producción del backend (solo Dockerfile, configs, scripts)
- No se creará mock ingestion ni se modificará TelegramListenerPort
- No se implementará monitoreo/Prometheus (se puede añadir después)
- No se implementará zero-downtime real (blue/green deploy)
- No se modificará la lógica de negocio existente
- No se migrará a Kubernetes
- No se comprará dominio ni certificado SSL
- No se implementará sistema de logs centralizado

## Open questions
Resueltas durante exploración.

## Approval gate
status: ready
<!-- Approved by user on 2026-06-28: "si escribelo" -->
