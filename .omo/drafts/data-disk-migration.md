---
slug: data-disk-migration
status: drafting
intent: clear
pending-action: write .omo/plans/data-disk-migration.md
approach: migrar /var/lib/containerd (9.3G) a /data/containerd via rsync + root override en /etc/containerd/config.toml, redirigir backups staging de /tmp a /data/backups con retencion 7d, verificar con healthchecks; runner _work y journal solo higiene diferida
---

# Draft: data-disk-migration

## Components (topology ledger)

| C1 containerd-root | /var/lib/containerd (9.3G) migrado a /data/containerd sin perder imagenes | status: active | evidence: ssh OracleDroplet du + /etc/containerd/config.toml + docker info |
| C2 staging-backups | dumps staging salen de /tmp (224M acumulados) a /data/backups con retencion | status: active | evidence: docs/ci-cd.md:161 + /tmp/staging-backup-\*.sql + scripts/backup-db.sh:9 |
| C3 runner-work | \_work del runner (90M) redirigido a /data si crece | status: deferred | evidence: /opt/actions-runner/\_work 90M |
| C4 journal-higiene | cap de journal ya cubierto por cron existente, solo verificar | status: deferred | evidence: bootstrap-droplet.sh + journal 92M |

## Open assumptions (announced defaults)

| containerd se mueve con config `root=`, no con symlink | override en /etc/containerd/config.toml | symlink es fragil ante upgrades/reinicios; la opcion `root` es la soportada | si, revertible |
| se conserva copia original hasta verificar | rsync (no mv) + borrado diferido | permite rollback inmediato | si |
| backups staging a /data/backups/staging/ + find -mtime +7 | consistente con prod (symlink /opt/onchain-bot/backups -> /data/backups, scripts/backup-db.sh:9) | /tmp se limpia en reboot y hoy acumula 224M sin rotacion | si |
| runner \_work y journal quedan fuera del plan | 90M y 92M con vacuum cron existente | no justifican downtime | si |

## Findings (cited - path:lines)

- Docker usa containerd image store (driver io.containerd.snapshotter.v1, Docker Root Dir /data/docker) -> las imagenes viven en /var/lib/containerd 9.3G, no en data-root.Namespaces moby/moby_history confirman que es Docker, no k3s (ssh OracleDroplet: ctr namespaces, /etc/containerd/config.toml con root comentado).
- /etc/docker/daemon.json ya tiene data-root /data/docker (4.9G); /var/lib/docker residual 236K. La migracion de containerd es la mitad faltante.
- Staging dumps van a /tmp/staging-backup-\*.sql (docs/ci-cd.md:161), 7 archivos x 32M = 224M sin rotacion; prod ya usa /opt/onchain-bot/backups -> /data/backups con retencion (scripts/backup-db.sh:9, docs/ci-cd.md:318).
- Rutas /opt/onchain-bot y /opt/onchain-bot-staging hardcodeadas en ~33 archivos (deploy workflows, runbooks); mover el checkout romperia deploys. No se toca.

## Decisions (with rationale)

- Mover solo estado pesado e irremplazable (containerd, backups); codigo/binarios se quedan (ver conversacion: proyecto 276M en /).
- containerd via `root = "/data/containerd"` + rsync + restart, jamas symlink.
- Backups staging a disco persistente con retencion 7d; limpieza inicial de /tmp.

## Scope IN

- C1 containerd-root migrado y verificado (docker images presentes, compose up, healthchecks).
- C2 backups staging redirigidos + cron/find de retencion + limpieza /tmp.
- Rollback documentado para C1 (conservar origen hasta verde).

## Scope OUT (Must NOT have)

- NO mover /opt/onchain-bot ni -staging, ni /usr/bin/docker, ni tailscale, ni units systemd.
- NO tocar codigo de producto ni workflows mas alla del path de backup staging.
- NO borrar /var/lib/containerd origen hasta verificacion en verde.

## Open questions

- Q1 ventana de ejecucion (downtime 2-5 min docker parado): programada vs ya.
- Q2 alcance: minimo (C1+C2) vs full higiene (incluir runner \_work).

## Approval gate

status: approved

- Q1 ventana: cuanto antes (ejecutar tras aprobar, con corte breve 2-5 min asumido)
- Q2 alcance: minimo C1+C2 (runner \_work y journal diferidos)
- pending-action: DONE handoff; status: approved-momus-only (codex pass waived by operator, 401 login expired)
- codex pass: WAIVED por el operador (solo-Momus). Re-lanzar a futuro con `codex login` + mismo WS/prompt si se quiere el segundo pase.
- momus pass 1: CHANGES-REQUIRED (3 blockers) -> fixed in plan (config-dump proof, rescue-before-rm order, docker.socket explicit) -> pass 2: OKAY (ses_f6c97fb72ffejRT6EzfR3vMO3Q)
- codex pass: codex-cli 0.154.0 via node, isolated WS /tmp/codex-review-ws-1789179526 + CODEX_HOME /tmp/codex-review-home-1789179526, model gpt-5.5 xhigh read-only -> 401 invalid_refresh_token (stored login expired, needs interactive `codex login`)
