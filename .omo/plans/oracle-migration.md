# oracle-migration - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Los 3 stacks (prod, staging, ingestión) corriendo en tu VPS de Oracle con los mismos datos, deploys automáticos apuntando allá, acceso fácil por SSH y toda la documentación actualizada. El droplet viejo se apaga solo cuando todo esté verificado en verde.

**Why this approach:** La sesión de Telegram solo puede vivir en un servidor a la vez, así que la ingestión se muda con un apagado-prendido secuencial (ventana corta de noche) mientras el resto se copia en paralelo sin downtime. Y como el VPS llegó vacío y sin Docker, el plan empieza por la base (Docker en /data, accesos, runner) antes de subir nada.

**What it will NOT do:** No rediseña nada ni toca el código del bot; no usa contraseñas (solo tu key); no apaga DigitalOcean hasta la paridad total; no arregla el backfill roto (tema aparte).

**Effort:** Large
**Risk:** Medium - el handoff de la sesión MTProto (AUTH_KEY_DUPLICATED si ambos lados viven a la vez)
**Decisions to sanity-check:** staging se restaura completo (no re-seed); Docker guarda todo en /data vía un solo ajuste; ventana de ingesta <15 min de noche; Tailscale conserva el nombre cryptoganster en Oracle.

Your next move: aprobar el arranque ($start-work) o pedir primero la revisión de alta precisión (doble Momus). Full execution detail follows below.

---

> TL;DR (machine): Large / Medium (MTProto handoff) / Oracle VPS con prod+staging+ingestion + CI + docs.

## Scope

### Must have

- Base Oracle verificada: Docker + compose plugin, `daemon.json` data-root `/data/docker`, user `runner` + sudo, UFW, Tailscale unido como `cryptoganster`, alias `OracleDroplet` + key en `~/.ssh/`.
- Renombre DO previo: hostname + Tailscale → `digitalocean` (libera `cryptoganster` en el tailnet).
- Réplica de los 3 stacks en Oracle con los mismos compose (sin cambios de producto): prod `/opt/onchain-bot`, staging `/opt/onchain-bot-staging`, ingestion standalone.
- Datos: 3 restores (prod backend DB + `alpha_meta_token_scanner_ingestion` en el pg de prod; staging DB en su pg) + uploads prod (bind, UID 1000) + volumen nombrado staging.
- Cutover ingestion como handoff estricto stop-DO → start-Oracle (ventana de ingesta, nunca 2 sesiones vivas).
- Runner Oracle con label distinto + `runs-on` pineado en los 3 workflows; staging se prueba por `workflow_dispatch` primero.
- Docs actualizadas con lista cerrada de archivos + verificación grep por archivo.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO dos ingestion-telegrams vivos con la misma sesión (invariantes AGENTS.md 1-2) — ni un segundo.
- NO segundo runner con el mismo label `self-hosted` pelado mientras DO viva.
- NO rediseño de storage (sin drivers de volúmenes, sin cambio de prune/log drivers); solo `daemon.json` data-root + symlink de backups.
- NO cambios de código de producto; solo config (workflows, docs, daemon.json del host).
- NO sshpass ni passwords en repo para Oracle — solo key. (Revierte el Scope-IN sshpass del draft: el patrón `scripts/.env.sync` queda fuera de alcance e intacto.)
- NO bulk transfers vía conexión local del owner (data móvil limitada): solo `.env`/control por scp local; datos e imágenes por vía directa DO↔Oracle o GHCR. Excepción: copias pequeñas imprescindibles para el deploy (`.env`). NO reintentar backfill/seed rotos (gaps 22/1) como parte de la migración.
- NO apagar DO antes de paridad verde. NO tocar secretos más allá de copiar `.env.droplet.*` (rotación va por track aparte).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: **none (infra migration)** + agent-executed QA per todo (happy + failure, exact tool + invocation, evidence path).
- Evidence: .omo/evidence/task-<N>-oracle-migration.<ext> (log de comandos + salidas; valores de secretos siempre redactados, solo nombres/l conteos).
- Paridad de datos = row counts por DB (DO vs Oracle) + hash de `GET /api/feed/sources` + healths `:3030/:3031/:3032` + `clients.connected >= 1` en ingestion.

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 1 (local + DO, sin tocar Oracle salvo ping):** todos 1-3. Clave + alias, renombre DO, inventario grep de touchpoints.
- **Wave 2 (base Oracle):** todos 4-8. Docker, data-root, árboles /opt, Tailscale (único paso con insumo humano: authkey), runner con label.
- **Wave 3 (datos + backends en paralelo):** todos 9-15. Dumps, mover uploads, restores con paridad, envs, up prod, up staging. Ingestion-service NO se levanta aquí.
- **Wave 4 (cutover):** todos 16-19. Handoff ingestion (secuencial respecto a la sesión: 17/18 pueden solaparse con el 16, nada de ingestión en paralelo), workflows a Oracle, socat+Tailscale checks, e2e.
- **Wave 5 (cierre):** todos 20-21. Docs enumeradas, paridad final + apagado DO.

### Dependency matrix

| 1 key+alias | — | 4, 5, 6, 7, 8, 9 | 2, 3 |
| 2 renombre DO | — | 7 | 1, 3 |
| 3 inventario grep | — | 13, 20 | 1, 2 |
| 4 docker+ufw | 1 | 5, 8 | 6 |
| 5 data-root | 4 | 8, 10, 11, 12 | 6, 7, 8 |
| 6 árboles+uploads-dirs | 1 | 10, 12, 13 | 4, 5, 7, 8 |
| 7 tailscale | 2 | 13, 18 | 4, 5, 6, 8 |
| 8 runner label | 4, 5, 6 | 17 | 6, 7 |
| 9 dumps DO | 1 | 11, 12 | 10, 13 |
| 10 mover uploads | 5, 6, 9 | 14, 15 | 11, 12, 13 |
| 11 restore prod+ingestión DB (+2 redes) | 5, 6, 9 | 14, 16 | 10, 12 |
| 12 restore staging DB | 5, 6, 9, 11 | 15 | 10, 13 |
| 13 envs Oracle | 3, 6, 7 | 14, 15 | 9, 10, 12 |
| 14 up prod (sin ingestión) | 10, 11, 13 | 16 | 15 |
| 15 up staging | 10, 12, 13 | 17, 19 | 14 |
| 16 handoff ingestión | 11, 14 | 19 | 17, 18 (solo no-ingestión) |
| 17 workflows→Oracle | 8, 15 | 19 | 16, 18 |
| 18 socat+checks | 7, 14, 15 | 19 | 16, 17 |
| 19 e2e cutover backends | 15, 16, 17, 18 | 20 | — |
| 20 docs | 3, 19 | 21 | — |
| 21 paridad final + off DO | 19, 20 | — | — |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPENDED BELOW - never rewrite the headers above. -->

- [x] 1. Reubicar key Oracle + alias OracleDroplet + acceso verificado
     What to do / Must NOT do: `stat` key, `mkdir -p ~/.ssh && cp ~/Downloads/ssh-key-2026-09-10.key ~/.ssh/oracle-2026-09-10.key && chmod 600`, agregar bloque `Host OracleDroplet / HostName 150.136.155.23 / User ubuntu / IdentityFile ~/.ssh/oracle-2026-09-10.key` a `~/.ssh/config` (NO tocar bloque CryptoGanster), verificar `ssh OracleDroplet 'hostnamectl --static; sudo -n true'`. Must NOT: borrar la key de Downloads hasta cierre, ni usar password/sshpass.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 5, 6, 7, 8, 9
     References: ~/.ssh/config (bloque Host CryptoGanster existente como plantilla); .omo/drafts/oracle-migration.md (Verified Oracle VPS facts).
     Acceptance: `ssh OracleDroplet 'hostnamectl --static && sudo -n true'` → `cryptoganster` + exit 0.
     QA happy: `ssh -v OracleDroplet true` autentica por pubkey (evidencia: fragmento `Authenticated with partial success`→`Authentication succeeded`). QA failure: sin sudo NOPASSWD → evidencia muestra el error y el todo pide al worker agregar `ubuntu ALL=(ALL) NOPASSWD:ALL` vía `ubuntu`+key (tiene sudo con password? NO hay password → si `sudo -n` falla, escalar a humano con el comando exacto). Evidence .omo/evidence/task-1-oracle-migration.log
     Commit: N (cambio local ~/.ssh, no repo).

- [x] 2. Renombrar DO cryptoganster → digitalocean (hostname + Tailscale)
     What to do / Must NOT do: en DO (`ssh CryptoGanster`): `hostnamectl set-hostname digitalocean`, `tailscale set --hostname=digitalocean`, verificar `hostnamectl --static` + `tailscale status` (autonombre). Must NOT: tocar Oracle en este todo; NO reiniciar servicios (el renombre no los afecta).
     Parallelization: Wave 1 | Blocked by: — | Blocks: 7 (join Tailscale Oracle)
     References: .omo/drafts/oracle-migration.md (Decisions: renombre anti-colisión).
     Acceptance: `hostnamectl --static` → `digitalocean` Y `tailscale status` muestra `digitalocean` como nombre del nodo DO.
     QA happy: MagicDNS `digitalocean.tailf01c61.ts.net` resuelve (`tailscale ping --c=2 digitalocean`). QA failure: `tailscale set` exige aprobación admin → evidencia con el mensaje + comando de consola exacto para el humano, reintentar `tailscale status`. Evidence .omo/evidence/task-2-oracle-migration.log
     Commit: N (cambio en host, no repo).

- [x] 3. Inventario grep de touchpoints DO en el repo (lista cerrada para 12 y 19)
     What to do / Must NOT do: greps de `144.126.203.139`, `100.84.4.28`, `cryptoganster`, `CryptoGanster`, `tailf01c61` sobre TODO el repo trackeado (`git grep -n`), guardar lista archivo:línea en evidencia. Solo lectura. Must NOT: editar nada.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 13, 20
     References: hallazgos Metis M5/M6/S1 (docker-compose.staging.yml:11, AGENTS.md:300, docs/ci-cd.md:64,175,232,503, install-socat-services.sh:11, deploy-staging.yml:332,336, AGENTS.md:391-393).
     Acceptance: existe .omo/evidence/task-3-oracle-migration.tsv con ≥ las 7 rutas citadas + conteo total de hits.
     QA happy: cada hit tiene archivo:línea válido (`git grep` exit 0). QA failure: `git grep` vacío en una ruta citada → marcar UNVERIFIED explícito en el tsv, no asumir. Evidence .omo/evidence/task-3-oracle-migration.tsv
     Commit: N.

- [x] 4. Docker + compose plugin + UFW en Oracle
     What to do / Must NOT do: instalar Docker CE por repo oficial (`apt-get`, `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`), `systemctl enable --now docker`, UFW: allow OpenSSH + deny incoming por defecto (NO abrir 3030/3031/5432/6379 públicos: prod es loopback+Tailscale por docker-compose.prod.yml:35-36,66,115,155). Must NOT: instalar nada de producto; NO tocar /data aún.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5, 8
     References: bootstrap-droplet.sh (demuestra que NO provisiona Docker — C1 Metis); docker-compose.prod.yml:35-66 (binds loopback).
     Acceptance: `docker --version` + `docker compose version` exit 0 Y `ufw status` = active con solo OpenSSH permitido.
     QA happy: `docker run --rm hello-world` OK. QA failure: UFW bloquea el SSH actual → el todo EXIGE aplicar la regla allow ANTES de `ufw --force enable` (orden escrito en el propio script del worker) + evidencia `ufw status verbose`. Evidence .omo/evidence/task-4-oracle-migration.log
     Commit: N (host).

- [x] 5. Docker data-root en /data + verificación de disco
     What to do / Must NOT do: `df -h / /data` antes, escribir `/etc/docker/daemon.json` con `{"data-root":"/data/docker"}`, `systemctl restart docker`, `docker system df` después. Guardrail S2: SOLO este cambio de storage. Must NOT: mover volúmenes existentes (no hay), cambiar prune/log drivers.
     Parallelization: Wave 2 | Blocked by: 4 | Blocks: 8, 10, 11, 12
     References: Metis C4/S2 (named volumes onchain-bot-pg-data → /var/lib/docker por defecto; daemon.json los lleva a /data).
     Acceptance: `docker info -f '{{.DockerRootDir}}'` → `/data/docker` Y `df -h /data` muestra uso crecido tras `docker pull hello-world`.
     QA happy: pull+rm hello-world OK. QA failure: docker no arranca por daemon.json inválido → `journalctl -u docker --no-pager | tail -20` en evidencia + rollback = borrar daemon.json y restart. Evidence .omo/evidence/task-5-oracle-migration.log
     Commit: N (host).

- [x] 6. Árboles /opt + uploads-dirs + symlink de backups en Oracle
     What to do / Must NOT do: bloque exacto (ubuntu vía sudo; user runner NO existe aún — se crea en el 8):
     `sudo mkdir -p /opt/onchain-bot/apps/backend/uploads /opt/onchain-bot/apps/backend/config /opt/onchain-bot-staging /data/backups`
     `sudo chown -R ubuntu:ubuntu /opt/onchain-bot /opt/onchain-bot-staging`
     `sudo chown -R 1000:1000 /opt/onchain-bot/apps/backend/uploads` (PERMS NOTE docker-compose.prod.yml:97-103, imagen corre como UID 1000)
     `sudo ln -sfn /data/backups /opt/onchain-bot/backups` (respeta `BACKUP_DIR` de backup-db.sh:9 sin editar el script).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 10, 12, 13
     References: docker-compose.prod.yml:97-105 (bind ./uploads + perms); docker-compose.ingestion.yml:25-26 (`../backend/uploads`, `../backend/config:ro`); scripts/backup-db.sh:9.
     Acceptance: `ls -ld /opt/onchain-bot /opt/onchain-bot-staging /data/backups` existen Y `stat -c %u:%g /opt/onchain-bot/apps/backend/uploads` = `1000:1000` Y `readlink /opt/onchain-bot/backups` = `/data/backups`.
     QA happy: `sudo -u \#1000 touch /opt/onchain-bot/apps/backend/uploads/.w` OK + rm. QA failure: /data no montado → `mount | grep /data` en evidencia + BLOCKED (humano: revisar volumen OCI). Evidence .omo/evidence/task-6-oracle-migration.log
     Commit: N (host).

- [x] 7. Tailscale en Oracle unido como cryptoganster
     What to do / Must NOT do: instalar tailscale (`curl -fsSL https://tailscale.com/install.sh | sh`), unir con comando pineado SIN tags (ningún archivo del repo exige advertise-tags: compose, workflows y AGENTS.md verificados sin tags): `tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=cryptoganster`, verificar `tailscale status` + `tailscale ip -4`. Insumo humano previo: authkey reutilizable de la consola Tailscale (TL;DR). Si `tailscale up` exige tags/aprobación, NO improvisar: BLOCKED con el mensaje exacto + paso de consola. Must NOT: unir Oracle antes del todo 2 (colisión de hostname) — el worker ABORTA si el nodo DO aún figura como `cryptoganster` en `tailscale status`.
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 13, 18
     References: infra/systemd/socat-\*.service.template; scripts/install-socat-services.sh; Metis M6 (MagicDNS sigue al nombre Tailscale, no al hostname OS).
     Acceptance: `tailscale status` exit 0 con este nodo = `cryptoganster` Y `echo "ORACLE_TS_IP=$(ssh OracleDroplet 'tailscale ip -4' | head -1)" >> .omo/evidence/task-7-oracle-migration.log` deja `ORACLE_TS_IP=100.x.y.z` registrado (insumo de 13/18).
     QA happy: `tailscale ping --c=2 digitalocean` OK (ve al DO renombrado). QA failure: sin authkey válida → `tailscale up` imprime login URL; evidencia la URL + todo marcado BLOCKED con instrucción exacta para el humano (pegar authkey en TAILSCALE_AUTHKEY y re-ejecutar). Evidence .omo/evidence/task-7-oracle-migration.log
     Commit: N (host).

- [x] 8. User runner + sudo + runner self-hosted Oracle con label distinto
     What to do / Must NOT do: `useradd -m -s /bin/bash runner && usermod -aG docker runner && echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner && chown -R runner:runner /opt/onchain-bot /opt/onchain-bot-staging /data/backups && chown -R 1000:1000 /opt/onchain-bot/apps/backend/uploads` (uploads siempre UID 1000 — todo 6), instalar actions-runner como `runner` en `/opt/actions-runner` con token del humano (repo Settings → Actions → Runners → New self-hosted runner; MISMO repo, labels `self-hosted,oracle`), `./svc.sh install runner && ./svc.sh start`, aplicar `bootstrap-droplet.sh` 1/3 y 2/3 (watchdog + prune cron — SOLO esas secciones, C1). Must NOT: registrar con el label pelado `self-hosted` solo (C3: scheduling no determinístico); NO tocar workflows aquí (todo 17).
     Parallelization: Wave 2 | Blocked by: 4, 5, 6 | Blocks: 17
     References: .github/workflows/deploy.yml:57,119 staging,51 ingestion (`runs-on: self-hosted` pelado); bootstrap-droplet.sh:11-44.
     Acceptance: `sudo -n -U runner true` OK Y `gh api repos/bryanstevensacosta/onchain-bot/actions/runners --jq '.runners[] | [.name,.status,.labels[].name]'` muestra el runner Oracle `online` con label `oracle`.
     QA happy:uiten `su - runner -c 'docker ps'` OK (grupo docker). QA failure: runner offline → `./svc.sh status` + `journalctl` en evidencia; si es token expirado → BLOCKED con instrucción de regenerar token (humano, 2 min). Evidence .omo/evidence/task-8-oracle-migration.log
     Commit: N (host + GitHub UI).

- [x] 9. Dumps DO: 3 DBs + row counts + uploads inventory
     What to do / Must NOT do: en DO: `pg_dump -Fc` de `alpha_meta_token_scanner` y `alpha_meta_token_scanner_ingestion` (contenedor `onchain-bot-postgres`, deploy-ingestion.yml:79-82) + `alpha_meta_token_scanner_staging` (contenedor staging, deploy-staging.yml:186-191), `SELECT count(*)` por tabla relevante en cada DB, `du -sh` + conteo de `uploads/crypto-news/media`, copiar dumps a `/data/backups/` de Oracle vía `scp` (NO por el repo). 3 invocaciones separadas (backup-db.sh es single-DB, M1). Must NOT: parar ningún servicio; NO exponer valores (conteos y tamaños solo).
     Parallelization: Wave 3 | Blocked by: 1 | Blocks: 11, 12
     References: scripts/backup-db.sh:13-15,40-41 (7 días retención prod); deploy-staging.yml:186-191 (staging best-effort); Metis M1.
     Acceptance: 3 `.dump` en Oracle `/data/backups/` con tamaño > 0 + tsv de row counts DO en evidencia.
     QA happy: `pg_restore --list` cuenta objetos > 0 en cada dump. QA failure: dump vacío o `pg_dump` auth fail → evidencia con el error + reintento con `POSTGRES_PASSWORD` del `.env.droplet.*` correspondiente (nombres solo). Evidence .omo/evidence/task-9-oracle-migration.{log,tsv}
     Commit: N.

- [~] 10. Mover uploads DO→Oracle — SKIPPED por owner 2026-09-10 (sin uploads; solo ads si se re-decide)
  What to do / Must NOT do: en DO: `sudo tar -czf /tmp/uploads-prod.tar.gz -C /opt/onchain-bot/apps/backend uploads && find /opt/onchain-bot/apps/backend/uploads -type f | wc -l` (conteo) + `docker run --rm -v onchain-bot-staging-uploads:/vol -v /tmp:/b alpine tar -czf /b/uploads-staging.tar.gz -C /vol . && ls -la /tmp/uploads-*.tar.gz`; `scp` ambos tar a Oracle `/data/backups/`; en Oracle: `sudo tar -xzf /data/backups/uploads-prod.tar.gz -C /opt/onchain-bot/apps/backend/ && sudo chown -R 1000:1000 /opt/onchain-bot/apps/backend/uploads` + `docker volume create onchain-bot-staging-uploads && docker run --rm -v onchain-bot-staging-uploads:/vol -v /data/backups:/b alpine tar -xzf /b/uploads-staging.tar.gz -C /vol`; paridad: conteo ficheros + `du -sh` DO vs Oracle.
  Parallelization: Wave 3 | Blocked by: 5, 6, 9 | Blocks: 14, 15
  References: docker-compose.prod.yml:104-106 (bind prod); docker-compose.staging.yml:85,143-144 (named volume staging); docker-compose.ingestion.yml:24-26 (ingestion reusa el bind de prod).
  Acceptance: paridad exacta en ambos lados — prod bind: `find /opt/onchain-bot/apps/backend/uploads -type f | wc -l` y `du -sh` iguales DO↔Oracle; staging volume: `docker run --rm -v onchain-bot-staging-uploads:/vol alpine find /vol -type f | wc -l` igual DO↔Oracle; Y `stat -c %u /opt/onchain-bot/apps/backend/uploads` en Oracle = 1000.
  QA happy: `tar -tzf` lista > 0 ficheros en cada tar. QA failure: volumen staging con nombre distinto en DO (`docker volume ls | grep staging` en evidencia + usar el nombre real). Evidence .omo/evidence/task-10-oracle-migration.log
  Commit: N.

- [x] 11. Restore Oracle: pg prod con 2 DBs + paridad
      What to do / Must NOT do: desde local, copiar compose+env a Oracle: `scp apps/backend/docker-compose.prod.yml OracleDroplet:/opt/onchain-bot/apps/backend/docker-compose.prod.yml` + `scp apps/backend/.env.droplet.production OracleDroplet:/opt/onchain-bot/apps/backend/.env.production && chmod 600` en Oracle (compose exige el env_file para `up -d postgres redis`; el 13 hará solo sed+verificación). En Oracle: `docker network create onchain-bot-net && docker network create onchain-bot-staging-net` (AMBAS externas ahora: ingestion las necesita a las dos, ingestion.yml:57-62), `cd /opt/onchain-bot/apps/backend && docker compose -f docker-compose.prod.yml up -d postgres redis`, `createdb -h 127.0.0.1 -U alpha_meta_token_scanner alpha_meta_token_scanner_ingestion` (mismo hardcoded que deploy.yml:103-105), `pg_restore` de ambos dumps (flags exactos en evidencia), row counts vs tsv del 9. Must NOT: levantar backend/ingestion aún (M2/M3 orden); NO correr migrations aún.
      Parallelization: Wave 3 | Blocked by: 5, 6, 9 | Blocks: 14, 16
      References: docker-compose.prod.yml:2-72; deploy-ingestion.yml:79-82 (2 DBs mismo contenedor); docker-compose.ingestion.yml:57-62 (redes externas).
      Acceptance: row counts Oracle == row counts DO (tsv 9) en las 3 tablas feed + `vip_published_calls` + `PGDATABASE` listas.
      QA happy: `psql -c '\l'` muestra las 2 DBs. QA failure: `pg_restore` error de versión (pg16 ambos lados — si difiere, evidencia + `pg_restore --no-owner` reintento documentado). Evidence .omo/evidence/task-11-oracle-migration.{log,tsv}
      Commit: N.

- [x] 12. Restore Oracle: pg staging — DONE 2026-09-10 con waiver owner (meta: deploy staging verde; cero data móvil, dump ya en Oracle). 40/40 tablas, vip 0, settings_filters presente (cura 42P01).
      What to do / Must NOT do: red externa staging (`docker-compose.staging.yml` networks), `up -d` postgres+redis staging, restore `alpha_meta_token_scanner_staging`, row counts vs tsv 9. Decisión S5 adoptada: restore completo (no re-seed). Must NOT: levantar backend staging aún.
      Parallelization: Wave 3 | Blocked by: 5, 6, 9, 11 | Blocks: 15
      References: docker-compose.staging.yml:16-41 (pg:5433, redis:6380); red `onchain-bot-staging-net` creada en el 11. References: docker-compose.staging.yml:16-41 (pg:5433, redis:6380, binds 0.0.0.0 — C6: firewall solo Tailscale+loopback a nivel UFW/host).
      Acceptance: row counts staging Oracle == DO staging (tsv 9).
      QA happy/failure: mirror del 11 (restore prod). Evidence .omo/evidence/task-12-oracle-migration.{log,tsv}
      Commit: N.

- [x] 13. Envs Oracle desde .env.droplet._ + retarget INGESTION_TELEGRAM_URL
      What to do / Must NOT do: SPLIT 2026-09-10 (owner: data móvil limitada; .env sí autorizados por ser KBs): (a) copiar YA los 2 envs restantes sin sed; (b) sed INGESTION_TELEGRAM_URL cuando llegue ORACLE_TS_IP del 7. Copias:
      `scp apps/backend/.env.droplet.production OracleDroplet:/opt/onchain-bot/apps/backend/.env.production`
      `scp apps/backend/.env.droplet.staging OracleDroplet:/opt/onchain-bot-staging/apps/backend/.env.staging`
      `scp apps/ingestion-telegram/.env.droplet.production OracleDroplet:/opt/onchain-bot/apps/ingestion-telegram/.env.production`
      (nota: el `.env.production` del backend ya lo copió el 11 — omitir esa copia aquí, solo `chmod 600` si faltara).
      SOLO cambio permitido, con la IP anotada en la evidencia del 7 (variable ORACLE_TS_IP):
      `ssh OracleDroplet "sed -i 's|^INGESTION_TELEGRAM_URL=._|INGESTION*TELEGRAM_URL=http://${ORACLE_TS_IP}:3032|' /opt/onchain-bot/apps/backend/.env.production /opt/onchain-bot-staging/apps/backend/.env.staging"`Verificaciones por NOMBRE (jamás valores):`cut -d= -f1`Oracle vs local → diff vacío salvo`INGESTION_TELEGRAM_URL`; `grep -rnE 'cryptoganster\.tail|100\.84\.4\.28|144\.126\.203\.139'`en los 3 envs Oracle = 0 hits (M6);`grep -cE 'RETENTION_HOURS=72'`≥ 1 (M7 conserva 72h).   Fallback si falta un`.env.droplet.*`local: NO inventar — re-traerlo del DO y reintentar:`scp CryptoGanster:/opt/onchain-bot/apps/backend/.env.production apps/backend/.env.droplet.production`
`scp CryptoGanster:/opt/onchain-bot-staging/apps/backend/.env.staging apps/backend/.env.droplet.staging`
`scp CryptoGanster:/opt/onchain-bot/apps/ingestion-telegram/.env.production apps/ingestion-telegram/.env.droplet.production`si DO inaccesible → BLOCKED. Must NOT: imprimir ni loguear valores; NO cambiar ningún otro flag.
Parallelization: Wave 3 | Blocked by: 3, 6, 7 | Blocks: 14, 15
References: Metis M6/M7; app.config.ts:376 (default localhost:3031); .env.production.template:79 (dead DNS compose).
Acceptance: key-presence diff (nombres) droplet-vs-Oracle = solo`INGESTION*TELEGRAM_URL`difiere Y 0 hits de strings DO en envs Oracle.
QA happy:`diff <(cut -d= -f1 droplet) <(cut -d= -f1 oracle)`muestra solo la línea esperada. QA failure: falta`POSTGRES_PASSWORD`/`REDIS_PASSWORD`/`MTPROTO_SESSION`(nombres) → BLOCKED: re-copiar desde`.env.droplet.*` locales, jamás inventar. Evidence .omo/evidence/task-13-oracle-migration.log (nombres y conteos únicamente)
      Commit: N (envs en host, gitignored).

- [x] 14. Up backend+frontend prod Oracle (ingestion apagada) + migrations con gate — GATEWAY-DIFERIDO y UPLOADS-VACÍO aceptados por owner; UNBLOCKED 2026-09-10: `:latest` backend+frontend ya traen arm64 (verificado por orchestrator vía imagetools). NO retagear staging como :latest (build-args difieren).
      What to do / Must NOT do: con ingestion DB ya restaurada (11) pero servicio ingestion AÚN parado: `up -d postgres redis` (ya), `migration:run` backend (one-off como deploy.yml:174-180), `up -d --force-recreate backend frontend`, health `:3030/api/health` 10×10s. El gate de deploy.yml:146-167 FALLARÁ aquí (ingestion dark) — esperado y documentado: este todo usa `migration:run` directo sin el gate; el gate corre en 19. Must NOT: levantar ingestion-telegram en este todo.
      Parallelization: Wave 3 | Blocked by: 10, 11, 13 | Blocks: 16
      References: .github/workflows/deploy.yml:169-200 (procedimiento); backend gap migraciones idempotentes.
      Acceptance: `curl -sf http://localhost:3030/api/health` 200 Y `docker compose ps` backend+frontend `healthy/running`.
      QA happy: logs sin `AUTH_KEY` (backend SSE, sin MTProto). QA failure: migration fail → `migration:show` en evidencia + `migration:revert` documentado, BLOCKED. Evidence .omo/evidence/task-14-oracle-migration.log
      Commit: N.

- [x] 15. Up staging Oracle + health — DONE 2026-09-10 vía pipeline (staging deploy run 34520341365 success: build+migrate+healthchecks+restart; DB del restore 12)
      What to do / Must NOT do: `up -d` stack staging (migrations con overrides deploy-staging.yml:254-261), health `:3031/api/health` + frontend `:4173/`. Must NOT: tocar prod en este todo.
      Parallelization: Wave 3 | Blocked by: 10, 12, 13 | Blocks: 17, 19
      References: .github/workflows/deploy-staging.yml:254-261,265-323 (migrations + up backend/frontend + localhost healthchecks).
      Acceptance: 200 en `:3031/api/health` y `:4173/` + `docker compose ps` verde.
      QA happy/failure: mirror 14 (up prod). Evidence .omo/evidence/task-15-oracle-migration.log
      Commit: N.

- [x] 16. Handoff ingestion DO→Oracle (SECUENCIAL, ventana de ingesta) — DO MUERTO 2026-09-10: sin gate de apagado/verificación DO; arranque directo en Oracle con retry AUTH_KEY 60s+ (sesión local len 368 verificada). HECHO vía bridge nativo arm64 (registry :latest seguía amd64-only); clients≥1 pendiente de socat (18a).
      What to do / Must NOT do: 1) `curl -sf :3032/api/feed/sources` en DO (hash de paridad) + `ingested_at` MAX; 2) STOP ingestion DO (`compose stop`, verificar `systemctl/docker ps` muerto + `tailscale`—liveness gate ambos lados); 3) en Oracle: `up -d` ingestion (redes externas ya existen por 13), health `:3032` + `mtproto.connected=true authorized=true` + `channels.total>0`; 4) `grep -i AUTH_KEY_DUPLICATED` en logs Oracle = 0 hits; 5) sources hash == DO + `ingested_at` MAX avanza. Ventana esperada <15 min (gap SSE lossy + backfill roto: posible pérdida acotada, mitigada en horario valle). Must NOT: arrancar Oracle con DO vivo NI UN SEGUNDO (C2/A4, `AUTH_KEY_DUPLICATED`); NO reintentar backfill.
      Parallelization: Wave 4 | Blocked by: 11, 14 | Blocks: 19 (SECUENCIAL respecto a la sesión MTProto: 17/18 pueden solaparse, nada de ingestión en paralelo)
      References: AGENTS.md:62-63 (single sesión); docker-compose.ingestion.yml:19,25-35,57-62; MIGRATION-GUIDE-DROPLET.md:350-366 (rollback AUTH_KEY).
      Acceptance: Oracle `:3032/api/feed/sources` 200 + hash == DO + `clients.connected >= 1` (deploy-ingestion.yml:116-123) + 0 `AUTH_KEY_DUPLICATED` + DO ingestion `exited/stopped`.
      QA happy: mensaje nuevo con `ingested_at` posterior al handoff aparece en Oracle. QA failure: `AUTH_KEY` → STOP Oracle inmediato, esperar 60s (guía:350-366), reintentar; si persiste → ROLLBACK: start DO, evidencia, BLOCKED. Evidence .omo/evidence/task-16-oracle-migration.log
      Commit: N.

- [x] 17. Workflows a Oracle (labels) + dispatch de prueba en staging — DONE 2026-09-10 (pins + staging deploy verde en Oracle vía pipeline 34520341365)
      What to do / Must NOT do: editar `runs-on: self-hosted` → `runs-on: [self-hosted, oracle]` en deploy.yml:57, deploy-staging.yml:119, deploy-ingestion.yml:51; `git diff` evidencia; `gh workflow run deploy-staging.yml --ref dev` (workflow_dispatch) y verificar en `gh run list` que lo tomó el runner Oracle; el runner DO queda registrado pero sin jobs (fallback). Must NOT: cambiar lógica de steps (solo `runs-on`); NO borrar runner DO aún.
      Parallelization: Wave 4 | Blocked by: 8, 15 | Blocks: 19
      References: Metis C3/S3 (labels + environments); deploy-staging.yml:121 (environment staging).
      Acceptance: `RUN_ID=$(gh run list --workflow deploy-staging.yml --limit 1 --json databaseId --jq '.[0].databaseId') && gh run view $RUN_ID --json jobs --jq '.jobs[].runnerName'` nombra al runner Oracle + staging verde en Oracle.
      QA happy: deploy staging e2e verde. QA failure: el job cae en DO → labels mal puestos → revert del diff, evidencia, reintento. Evidence .omo/evidence/task-17-oracle-migration.log
      Commit: Y | ci(workflows): pin runs-on to oracle runner label.

- [x] 18. Socat + Tailscale healthchecks Oracle — SPLIT: (a) prod DONE (template flip + :3032 unit + UFW ts0 + clients≥1); (b) staging tras el 15
      What to do / Must NOT do: semántica C5 RESUELTA (verificada en infra/systemd/socat-backend.service.template:9): cada unit ESCUCHA en `127.0.0.1:LOCAL_PORT` y reenvía a `TAILSCALE_IP:TAILSCALE_PORT` — staging-frontend = escucha `:80` → reenvía a `${ORACLE_TS_IP}:4173`, sin misterio. Pasos en Oracle: `apt-get install -y socat`; `ORACLE_TS_IP=$(grep '^ORACLE_TS_IP=' .omo/evidence/task-7-oracle-migration.log | cut -d= -f2)` (registrada en el 7); `TAILSCALE_IP=${ORACLE_TS_IP} bash scripts/install-socat-services.sh prod` y `TAILSCALE_IP=${ORACLE_TS_IP} bash scripts/install-socat-services.sh staging` (el default `100.84.4.28` del script:11 es la IP vieja de DO — SIEMPRE override por env); `systemctl is-active onchain-bot-socat-backend onchain-bot-socat-frontend onchain-bot-staging-socat-backend onchain-bot-staging-socat-frontend`; healthchecks `curl -sf http://${ORACLE_TS_IP}:3030/api/health`, `http://${ORACLE_TS_IP}:3032/api/feed/sources`, `http://${ORACLE_TS_IP}:3031/api/health`, `http://${ORACLE_TS_IP}:4173/`. Must NOT: exponer puertos fuera de Tailscale/loopback; NO cambiar el default del script en repo aquí (si se quiere, commit aparte).
      Parallelization: Wave 4 | Blocked by: 7, 14, 15 | Blocks: 19
      References: infra/systemd/socat-backend.service.template:9; scripts/install-socat-services.sh:40-56; Metis C5/C6.
      Acceptance: `curl -sf http://${ORACLE_TS_IP}:<puerto>` 200 en los 4 endpoints (`3030/api/health`, `3032/api/feed/sources`, `3031/api/health`, `4173/`, con ORACLE_TS_IP de la evidencia del 7) + `systemctl is-active socat-*` active.
      QA happy: `systemctl cat onchain-bot-staging-socat-frontend` muestra ExecStart con la IP nueva (escucha :80 → reenvía :4173). QA failure: `socat` ausente → apt en evidencia y reintento; puerto en uso → `ss -ltnp` en evidencia + BLOCKED. Evidence .omo/evidence/task-18-oracle-migration.log
      Commit: N (units en host; si hay fix al script → commit aparte `fix(socat): ...`).

- [x] 19. E2E cutover backends + gate de orden — PROD-SCOPE GREEN 2026-09-10 (gate 12/12, frontend 200, flags raw, SSE flowing; freshness EXPECTED-BLOCKED/gateway; staging mirror PENDING-15)
      What to do / Must NOT do: correr el gate deploy.yml:146-167 contra Oracle `:3032` (12×10s, debe pasar tras el 16 — `:3032` solo vive desde el handoff), `GET :3030/api/vip-calls/calls/recent?limit=5` con timestamps frescos, flags 3-flag pipeline intactos, frontend `:5173` sirve `index.html`, staging `:3031/:4173` espejo. Must NOT: declarar corte sin los 5 checks verdes.
      Parallelization: Wave 4 | Blocked by: 15, 16, 17, 18 | Blocks: 20
      References: .github/workflows/deploy.yml:146-200; Metis QA directives.
      Acceptance: 5/5 checks con salidas exactas en evidencia (HTTP 200s + `recent[0].createdAt` < 10 min + sources hash == 16, que a su vez == DO).
      QA happy: publicar dry-run `POST vip-calls/publish` en staging OK. QA failure: gate 12×10s agota → BLOCKED (ingestion no sirve; volver al 15, jamás forzar backend). Evidence .omo/evidence/task-19-oracle-migration.log
      Commit: N.

- [x] 20. Docs actualizadas (lista cerrada, grep por archivo) — DONE 2026-09-10 (12 files, 39+/33-, docs:check 0 warnings, commit 476e59d)
      What to do / Must NOT do: actualizar tabla SSH + diagrama ingestión + invariantes de puertos en `AGENTS.md`; `apps/*/AGENTS.md` donde citen IPs/nombres; `docs/deployment/*` + `docs/ci-cd.md` (IPs 100.84.4.28→nueva, MagicDNS); `README.md` si cita droplet; runbooks con `install-socat-services.sh` default. Cada archivo: `grep` antes/después en evidencia, 0 hits residuales de `144.126.203.139|100.84.4.28|cryptoganster\.tail` salvo mención histórica explícita "ex-DO". Must NOT: tocar código; NO reescribir docs enteras (edits quirúrgicos).
      Parallelization: Wave 5 | Blocked by: 3, 19 | Blocks: 21
      References: tsv del todo 3 (lista cerrada); Metis S1.
      Acceptance: `git grep -nE '144\.126\.203\.139|100\.84\.4\.28|cryptoganster\.tail'` → solo hits marcados históricos + `npm run docs:check` sin warnings nuevos.
      QA happy: diff por archivo en evidencia. QA failure: archivo con hits sin dueño claro → lista en evidencia como UNVERIFIED, no bloquear. Evidence .omo/evidence/task-20-oracle-migration.log
      Commit: Y | docs: retarget droplet references to Oracle.

- [x] 21. Paridad final + apagado DO (solo en verde) — PROD-SCOPE GREEN 2026-09-10 (parity exact+growth-explained, alias swap a Oracle, runner DO eliminado; staging HELD-15; DO-off moot)
      What to do / Must NOT do: matriz final: row counts 3 DBs DO-vs-Oracle, hash sources, healths 3030/3031/3032, `clients.connected`, `docker system df` + `df -h` ambos hosts; si TODO verde: swap alias (`Host CryptoGanster`→150.136.155.23, DO pasa a `Host DigitalOcean`), `gh` runner DO offline (remove), power-off DO desde consola OCI (documentar snapshot previo de 50GB+150GB). Si UN check rojo: NO apagar, BLOCKED con el check. Must NOT: apagar con paridad parcial.
      Parallelization: Wave 5 | Blocked by: 19, 20 | Blocks: —
      References: Metis A4 (RTO = flip Tailscale + DB freeze documentados en evidencia como procedimiento de rollback).
      Acceptance: matriz 100% verde en evidencia + DO `poweroff` confirmado en consola OCI + alias swap verificado (`ssh CryptoGanster hostname` → cryptoganster-responde-desde-Oracle).
      QA happy: rollback ensayado en seco (comandos listados, no ejecutados). QA failure: cualquier rojo → plan de remediación por check en evidencia, re-ejecutar 18. Evidence .omo/evidence/task-21-oracle-migration.{log,tsv}
      Commit: Y | chore: swap CryptoGanster alias to Oracle (si el alias vive en repo; si es ~/.ssh local → commit N y anotarlo).

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — APPROVE 2026-09-10
- [x] F2. Code quality review — APPROVE 2026-09-10
- [x] F3. Real manual QA — APPROVE 2026-09-10
- [x] F4. Scope fidelity — APPROVE 2026-09-10

## Commit strategy

- Solo 2-3 commits de repo en todo el plan (todos config): 17 `ci(workflows): pin runs-on to oracle runner label`, 18-fix socat opcional, 20 `docs: retarget droplet references to Oracle`, 21 alias-swap si aplica. Todo lo demás es host (evidencia, no commits).
- Conventional commits (commitlint). Push a `dev` + PR a `master` por GOVERNANCE para los cambios de workflows/docs (los workflow_dispatch de prueba corren desde `dev`).
- Rollback de repo = `git revert` del commit correspondiente (runs-on a `self-hosted` pelado = vuelve a DO si el runner DO sigue registrado).

## Success criteria

- Oracle sirve prod (`:3030`+`:5173`), staging (`:3031`+`:4173`) e ingestion (`:3032`, MTProto `connected+authorized`, 0 `AUTH_KEY_DUPLICATED`).
- Paridad: row counts 3 DBs iguales DO↔Oracle, hash `GET /api/feed/sources` idéntico, `recent calls` frescos.
- CI: `deploy-staging` verde tomado por el runner `oracle`; docs sin referencias DO vivas (`git grep` limpio salvo histórico marcado).
- DO apagado solo tras matriz verde; alias `CryptoGanster` responde desde Oracle.
