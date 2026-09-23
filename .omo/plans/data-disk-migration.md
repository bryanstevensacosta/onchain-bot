# data-disk-migration - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** el disco del sistema liberado (de 29% a menos de 25%) moviendo el almacén de imágenes de Docker (9.3 GB) al disco de datos, más los respaldos de base de datos saliendo de la carpeta temporal a una con limpieza automática. Todo verificado con los servicios en verde.

**Why this approach:** en vez de mover a ciegas, primero se copia todo con el sistema corriendo y el corte real dura solo minutos; y en vez de borrar lo viejo de inmediato, se conserva una semana como red de seguridad. Los respaldos van al mismo lugar donde ya van los de producción.

**What it will NOT do:** no mueve el código del proyecto, no toca los programas instalados, no borra nada el mismo día, y no incluye el runner ni los logs (son pequeños y ya tienen su propia limpieza).

**Effort:** Short (1-4h con ventana de corte breve)
**Risk:** Medium - parar Docker 2-5 min con rollback probado
**Decisions to sanity-check:** ventana "cuanto antes" asumida; el redirect del backup de ingestion se incluyó junto al de staging por ser el mismo bug; el origen viejo se conserva 7 días antes de borrar.

Your next move: aprueba para empezar la ejecución, o pide primero la revisión de alta precisión. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- C1: `/var/lib/containerd` (9.3G) migrado a `/data/containerd` via `root =` en `/etc/containerd/config.toml`, con pre/post conteo de imagenes identico y daemons sanos.
- C2: dumps staging (`deploy-staging.yml:189-194`) e ingestion (`deploy-ingestion.yml:82-91`) redirigidos de `/tmp` a `/data/backups/{staging,ingestion}/` con retencion 7d via `find -mtime +7 -delete`; limpieza de los 7 `/tmp/staging-backup-*.sql` acumulados (224M).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO mover `/opt/onchain-bot` ni `/opt/onchain-bot-staging` (hardcodeados en ~33 archivos: workflows, runbooks, scripts).
- NO mover binarios (`/usr/bin/docker`, `/usr/sbin/tailscaled`), units systemd, ni estado Tailscale.
- NO symlink para containerd (solo opcion `root` soportada); NO `mv`, solo `rsync -aHAX` en dos pasadas.
- NO borrar/renombrar `/var/lib/containerd` origen hasta 7 dias en verde (queda como rollback frio).
- NO tocar runner `_work` (90M) ni journal (vacuum cron existente) — diferidos.
- NO ejecutar migracion C1 con deploys en curso (freeze: avisar, no pushear a `dev`/`master` durante la ventana).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (infra migration, no unit tests apply) + agent-executed QA via SSH on OracleDroplet (host `cryptoganster`): `ctr -n moby images ls` counts, `docker images`, `:3030/api/health`, `df`, `journalctl -u containerd -u docker`.
- Evidence: .omo/evidence/task-<N>-data-disk-migration.<ext>

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (sin downtime, todo paralelizable salvo 1 que va primero): pre-flight + freeze-check (1), redirect staging (2) + redirect ingestion (3) en paralelo, primera pasada rsync online (4).
- Wave 2 (ventana con corte 2-5 min, estrictamente secuencial): stop+copy-final+config+start (5), luego verificacion verde + limpieza /tmp (6), luego cierre + rollback-si-rojo (7).

### Dependency matrix

| Todo                 | Depends on | Blocks | Can parallelize with     |
| -------------------- | ---------- | ------ | ------------------------ |
| 1 pre-flight         | —          | 4, 5   | — (va primero)           |
| 2 redirect staging   | —          | 6      | 3, 4                     |
| 3 redirect ingestion | —          | 6      | 2, 4                     |
| 4 rsync online pass  | 1          | 5      | 2, 3                     |
| 5 cutover            | 1, 4       | 6      | nada (ventana exclusiva) |
| 6 green verify       | 2, 3, 5    | 7      | nada                     |
| 7 closeout/rollback  | 6          | —      | nada                     |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [ ] 1. Pre-flight: congelar deploys y capturar linea base en el droplet
     What to do: verificar que no haya workflow deploy en curso (gh run list o aviso al operador); capturar y guardar evidencia: `df -T / /data`, `du -sh /var/lib/containerd /data`, `ctr -n moby images ls | wc -l` + lista completa, `docker images`, `docker ps --format '{{.Names}} {{.Status}}'`, `cat /etc/fstab | grep /data` (persistencia UUID c61a2491 nofail ya verificada), `containerd --version` (v2.3.5). Guardar todo en evidencia.
     Must NOT do: no parar ni tocar ningun servicio; no editar ningun archivo.
     Parallelization: Wave 1 (primero) | Blocked by: nada | Blocks: 4, 5
     References (executor has NO interview context - be exhaustive): droplet OracleDroplet host `cryptoganster` (ubuntu@150.136.155.23, llave ~/.ssh/oracle-2026-09-10.key); /etc/containerd/config.toml (defaults comentados, `disabled_plugins=["cri"]`); /etc/docker/daemon.json (`data-root /data/docker`); namespaces `moby,moby_history` (Docker image-store, no k3s).
     Acceptance criteria (agent-executable): existe .omo/evidence/task-1-data-disk-migration.md con df, du, conteo imagenes ctr+docker, lista `docker ps`, linea fstab /data; ningun deploy en curso confirmado.
     QA scenarios (name the exact tool + invocation): happy `ssh OracleDroplet 'df -T /data; sudo ctr -n moby images ls | wc -l; docker images | wc -l'` OK y guardado, Evidence .omo/evidence/task-1-data-disk-migration.md; failure si hay deploy en curso -> ABORTAR ventana y reprogramar, evidencia el run id en el mismo archivo.
     Commit: N (solo evidencia, sin cambios)
- [ ] 2. Redirigir backup staging de /tmp a /data/backups/staging + retencion
     What to do: en `.github/workflows/deploy-staging.yml` bloque `Backup staging DB` (lineas 189-194) cambiar destino a `/data/backups/staging/staging-backup-$(date +%Y%m%d-%H%M%S).sql` (mkdir -p previo en el step); agregar al mismo step `find /data/backups/staging -maxdepth 1 -name 'staging-backup-*.sql' -mtime +7 -delete`; en el droplet `sudo mkdir -p /data/backups/staging && sudo chown runner:runner /data/backups/staging`.
     Must NOT do: no cambiar logica de pg_dump ni el `|| true`; no tocar otros steps del workflow; no mover backups existentes de /tmp todavia (lo hace el todo 6).
     Parallelization: Wave 1 | Blocked by: nada | Blocks: 6
     References: .github/workflows/deploy-staging.yml:189-194 (origen exacto del path /tmp); scripts/backup-db.sh:9 (patron BACKUP_DIR existente en prod); /data/backups ya existe (52M) con symlink /opt/onchain-bot/backups.
     Acceptance criteria: `grep -n 'data/backups/staging' .github/workflows/deploy-staging.yml` muestra destino nuevo + linea find retention; `ssh OracleDroplet 'ls -ld /data/backups/staging'` owner runner:runner.
     QA scenarios: happy `git diff --stat` muestra solo deploy-staging.yml + grep confirma, Evidence .omo/evidence/task-2-data-disk-migration.md; failure YAML invalido -> validar con `python3 -c 'import yaml,sys;yaml.safe_load(open(...))'` o actionlint si disponible, corregir antes de commit.
     Commit: Y | ci(staging): redirect staging DB dumps from /tmp to /data/backups
- [ ] 3. Redirigir backup ingestion de /tmp a /data/backups/ingestion + retencion
     What to do: en `.github/workflows/deploy-ingestion.yml` bloque fallback (lineas 86-91) cambiar `> /tmp/ingestion-backup-$(date...).dump` a `/data/backups/ingestion/ingestion-backup-$(date...).dump` (mkdir -p previo); agregar `find /data/backups/ingestion -maxdepth 1 -name 'ingestion-backup-*.dump' -mtime +7 -delete`; en el droplet `sudo mkdir -p /data/backups/ingestion && sudo chown runner:runner /data/backups/ingestion`. Nota: el path primario `bash /opt/onchain-bot/scripts/backup-db.sh` ya va a /data via symlink — solo se cambia el fallback.
     Must NOT do: no cambiar `backup-db.sh` ni el formato custom pg_dump; no tocar migraciones del mismo workflow.
     Parallelization: Wave 1 | Blocked by: nada | Blocks: 6
     References: .github/workflows/deploy-ingestion.yml:80-91; scripts/backup-db.sh:4-9; mismo /data/backups del todo 2.
     Acceptance criteria: grep confirma destino nuevo + retention en deploy-ingestion.yml; `ls -ld /data/backups/ingestion` owner runner:runner.
     QA scenarios: happy diff + grep + ls, Evidence .omo/evidence/task-3-data-disk-migration.md; failure YAML invalido -> validar y corregir igual que todo 2.
     Commit: Y | ci(ingestion): redirect ingestion DB dump fallback from /tmp to /data/backups
- [ ] 4. Primera pasada rsync online de containerd a /data (sin downtime)
     What to do: en el droplet `sudo mkdir -p /data/containerd && sudo rsync -aHAX --delete /var/lib/containerd/ /data/containerd/` con daemon CORRIENDO (primera pasada para adelantar los 9.3G y que la ventana de corte copie solo el delta). Registrar tiempo y tamano final `du -sh /data/containerd`.
     Must NOT do: no parar docker ni containerd; no editar config.toml; no usar `-a` a secas (obligatorio `-aHAX --delete` por hardlinks/xattrs de snapshots moby); cuidar trailing slash origen `/var/lib/containerd/` + destino `/data/containerd/`.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5
     References: pre-flight del todo 1 (9.3G, ext4 ambos lados, containerd v2.3.5); /etc/containerd/config.toml (state queda en /run, solo se overridea `root` en todo 5).
     Acceptance criteria: `du -sh /data/containerd` ~= tamano origen ± delta online; `diff <(sudo ls /var/lib/containerd) <(sudo ls /data/containerd)` sin diferencias top-level; daemons siguen activos (`systemctl is-active docker containerd`).
     QA scenarios: happy rsync exit 0 + du comparable, Evidence .omo/evidence/task-4-data-disk-migration.md (tiempos para estimar la ventana); failure rsync error I/O -> NO avanzar al todo 5, dejar origen intacto y reportar.
     Commit: N (cambio infra en droplet, sin codigo)
- [ ] 5. Cutover: stop ordenado, pasada final, config root, arranque inverso (VENTANA CON CORTE)
     What to do (secuencial, nada en paralelo): 1) confirmar freeze deploys otra vez; 2) `sudo systemctl stop docker.socket docker containerd` (EN ESE ORDEN; parar containerd antes cuelga docker); 3) pasada final `sudo rsync -aHAX --delete /var/lib/containerd/ /data/containerd/`; 4) `sudo cp -a /etc/containerd/config.toml /etc/containerd/config.toml.bak` y agregar top-level `root = "/data/containerd"` (SOLO esa linea; `state` sigue en /run); 5) validar `sudo containerd config dump` parsea (sin error) ; 6) arranque inverso `sudo systemctl start containerd docker.socket docker` (explicito, en ese orden; esperar socket) ; 7) `systemctl is-active containerd docker.socket docker`.
     Must NOT do: no descomentar ni tocar otra linea de config.toml; no borrar ni renombrar /var/lib/containerd (queda como rollback frio); no hacer pull ni deploy durante la ventana.
     Parallelization: Wave 2 exclusiva | Blocked by: 1, 4 | Blocks: 6
     References: /etc/containerd/config.toml (todo comentado salvo disabled_plugins); unit files /usr/lib/systemd/system/{containerd,docker}.service; driver io.containerd.snapshotter.v1 (imagenes en namespace moby).
     Acceptance criteria: ambos `active` (incluido `docker.socket`); OBLIGATORIO `sudo containerd config dump | grep -q 'root = "/data/containerd"'` (prueba positiva del nuevo root — `docker info DockerRootDir` NO vale porque ya era /data/docker pre-migracion); `df /` muestra bajada vs pre-flight; `journalctl -u containerd -u docker --since '10 min ago'` sin `FATA` ni `failed to start`.
     QA scenarios: happy arranque limpio + sin FATA, Evidence .omo/evidence/task-5-data-disk-migration.md (journal extract); failure daemon no arranca -> NO improvisar: ir directo al todo 7 (rollback con .bak).
     Commit: N (infra; el .bak queda en el droplet)
- [ ] 6. Verificacion verde: imagenes, stacks y limpieza de /tmp
     What to do: 1) conteos post = pre (todo 1): `ctr -n moby images ls` lista vs pre, `docker images` (7 esperadas: backend/frontend latest+staging-latest, ingestion latest, redis:7-alpine, postgres:16-alpine); 2) levantar/confirmar stacks: `docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml ps`, `curl -sf http://localhost:3030/api/health`, staging segun corresponda; 3) `df -h /` (objetivo <25%) y `du -sh /data/containerd`; 4) rescate-antes-de-borrar (EN ESTE ORDEN): 4a) `ls -lt /tmp/staging-backup-*.sql` y anotar el mas reciente; 4b) copiarlo a `/data/backups/staging/` SOLO si ese dir no contiene ya un backup con timestamp igual o mas nuevo (condicion decidible: comparar `date +%Y%m%d-%H%M%S` del nombre); 4c) SOLO tras 4b (o si 4b no aplico por existir mas nuevo) `rm -f /tmp/staging-backup-*.sql` (los 224M); 5) `docker system df`.
     Must NOT do: no tocar /var/lib/containerd origen; no `docker system prune` con volumenes; no dar por verde con un solo check (exigir conteo + health + compose ps).
     Parallelization: Wave 2 | Blocked by: 2, 3, 5 | Blocks: 7
     References: pre-counts del todo 1 (ej: frontend latest 21.0 MiB, ingestion 141.2 MiB); AGENTS.md healthcheck `:3030/api/health`; compose paths /opt/onchain-bot/... (NO mover).
     Acceptance criteria: diff conteos pre/post vacio; health 200; compose ps UP; evidencia muestra el `cp` de rescate ANTES del `rm -f` (orden exigible); /tmp sin staging-backup-\*.sql; todo registrado en evidencia.
     QA scenarios: happy todo verde, Evidence .omo/evidence/task-6-data-disk-migration.md; failure conteo difiere o health != 200 -> ir al todo 7 rollback, NO borrar /tmp aun.
     Commit: N
- [ ] 7. Cierre: rollback-si-rojo o consolidacion-si-verde
     What to do: SI ROJO (cualquiera del todo 6 fallo y todo 5 con journal FATA): `sudo cp -a /etc/containerd/config.toml.bak /etc/containerd/config.toml && sudo systemctl restart docker.socket containerd docker` + `systemctl is-active docker.socket containerd docker`, verificar health, reportar causa con journal extract; /data/containerd queda huerfano (no borrar en caliente). SI VERDE: dejar `/var/lib/containerd` intacto como rollback frio 7 dias + anotar follow-up (cron recordatorio o issue) para borrarlo; registrar `df -h / /data` final y resumen.
     Must NOT do: no borrar origen en verde el mismo dia; no cerrar sin evidencia final.
     Parallelization: Wave 2 final | Blocked by: 6 | Blocks: nada
     References: /etc/containerd/config.toml.bak (creado en todo 5); fstab /data UUID c61a2491 nofail (el nuevo root sobrevive reboots).
     Acceptance criteria: estado final declarado VERDE (origen conservado + follow-up anotado) o ROJO-revertido (daemons sanos con config original); .omo/evidence/task-7-data-disk-migration.md con df final y decision.
     QA scenarios: happy verde con follow-up, Evidence .omo/evidence/task-7-data-disk-migration.md; failure rollback tambien falla -> escalar al operador con journal + config diff, NO mas reinicios a ciegas.
     Commit: N

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

- Repo (2 commits, convencionales, push via PR a `dev` segun GOVERNANCE.md — hooks: commitlint + pre-push tests; los workflows no tienen tests asociados, push directo al branch del worker si el operador lo autoriza, si no PR): `ci(staging): redirect staging DB dumps from /tmp to /data/backups` (todo 2), `ci(ingestion): redirect ingestion DB dump fallback from /tmp to /data/backups` (todo 3).
- Droplet (sin commit: config.toml override + rsync + mkdirs + .bak). Trazabilidad = .omo/evidence/task-N-data-disk-migration.\* + `config.toml.bak` en el droplet.
- Prohibido commitear credenciales o `.env`; los todos no tocan secrets."}

## Success criteria

- `/` baja de 29% a ~<25% (9.3G fuera + 224M /tmp fuera); `/data` sigue <10%.
- `docker images` y `ctr -n moby images ls` identicos pre/post; prod `:3030/api/health` 200 y stacks UP.
- Nuevos dumps staging/ingestion caen en `/data/backups/{staging,ingestion}/` con retencion 7d; `/tmp` sin `*-backup-*.sql`.
- Origen `/var/lib/containerd` intacto 7 dias como rollback frio + follow-up anotado para su borrado.
- Cero cambios fuera de scope (checkouts, binarios, units, secrets intactos).
