---
slug: infra-envs-separation
status: drafting
intent: clear
pending-action: write .omo/plans/infra-envs-separation.md (iterativo — se escribe it por it)
approach: Plan iterativo para entornos dev/staging/production con IaC. Cada iteración se discute y confirma antes de escribirla en el plan.
---

# Draft: infra-envs-separation

## Components (topology ledger)

| id                        | outcome                                                          | status | evidence                                        |
| ------------------------- | ---------------------------------------------------------------- | ------ | ----------------------------------------------- |
| branch-protection         | Proteger master con PR + checks + linear history. Dev permisiva. | active | Discutido con usuario                           |
| pre-push-hook             | Hook local que bloquea push directo a master                     | active | Iteración 2 confirmada                          |
| gh-actions-parallel       | Jobs test, lint, tsc en paralelo                                 | active | Iteración 3 confirmada                          |
| staging-compose           | docker-compose.staging.yml con puertos aislados                  | active | Iteración 3 confirmada                          |
| staging-deploy            | Auto-deploy a staging desde push a dev (base)                    | active | Iteración 3                                     |
| staging-deploy-enhanced   | Deploy frontend + socat + healthcheck Tailscale + rollback       | active | Iteración 5 confirmada                          |
| terraform-cloud-state     | State remoto en Terraform Cloud                                  | active | Usuario tiene cuenta                            |
| staging-env               | Entorno de staging (mismo droplet, compose aislado)              | active | Iteración 3 — docker-compose.staging.yml creado |
| tailscale-socat-staging   | Exponer staging en Tailscale                                     | active | Iteración 4 — templates + script                |
| socat-as-code             | Systemd .service templates + script de instalación               | active | Iteración 4 — unifica prod + staging            |
| production-env            | Entorno de producción actual                                     | active | Droplet existente 144.126.203.139               |
| sops-secrets              | SOPS + age para secrets como código                              | active | Iteración 6                                     |
| rollback-prod             | Rollback automático en producción                                | active | Iteración 7                                     |
| release-please            | Releases automáticas con SemVer + CHANGELOG                      | active | Iteración 8                                     |
| migration-rollback        | Rollback de migraciones DB en deploy prod                        | active | Iteración 9                                     |
| docker-space-optimization | Build cache + prune + limpieza de imágenes no usadas             | active | Iteración 9 (incluida)                          |

## Open assumptions (announced defaults)

| assumption     | adopted default             | rationale                | reversible? |
| -------------- | --------------------------- | ------------------------ | ----------- |
| IaC tool       | Terraform + GitHub Provider | Usuario eligió Terraform | Sí          |
| State backend  | Terraform Cloud Free Tier   | Usuario tiene cuenta     | Sí          |
| Linear history | Requerido en master         | Usuario confirmó         | Sí          |
| Pre-push hook  | No incluido en Iteración 1  | Usuario lo pospuso       | Sí          |

## Findings (cited - path:lines)

- `.github/workflows/deploy.yml` — flujo actual: push a master → test → rsync + docker-compose prod. Sin staging, sin protección de ramas.
- `docker-compose.yml` — dev local (postgres + redis + pgadmin)
- `docker-compose.prod.yml` — prod droplet (postgres + redis + backend + frontend)
- Solo existe un droplet de producción. No hay staging.

## Decisions (with rationale)

1. **Terraform + GitHub Provider** para IaC de branch protection. Es el estándar de la industria y permite escalar a más recursos de GitHub/infra después.
2. **Terraform Cloud** para state remoto. Ya tiene cuenta, zero-friction.
3. **Master**: PR required + status checks (Tests, Lint) + linear history + push restringido.
4. **Dev**: permisiva, push permitido, solo GH Actions checks.
5. **Iteraciones futuras**: staging env, pre-push hook, deploys automatizados.

## Scope IN (Iteración 1)

- `infra/terraform/` con provider GitHub
- Branch protection para `master`: require_pull_request, required_status_checks, restrict_push, require_linear_history
- Branch protection para `dev`: permisiva con status checks
- Terraform Cloud backend configurado
- Script `scripts/setup-iac.sh` helper

## Scope OUT (Must NOT have — Iteración 1)

- No staging environment
- No pre-push hook
- No cambios al deploy actual de producción
- No modificar docker-compose actual
- No cambios a GitHub Actions actual

## Open questions

- Ninguna hasta ahora

## Approval gate

status: approved — I1 ✅ I2 ✅ I3 ✅ I4 ✅ confirmadas
