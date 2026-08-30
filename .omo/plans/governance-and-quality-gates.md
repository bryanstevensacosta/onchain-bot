# governance-and-quality-gates - Work Plan

## TL;DR (For humans)

**Qué resuelve este plan:** Establece gobernanza obligatoria (`dev → PR → master`), hace que `lint/build/tests` sean **bloqueantes obligatorios** para deploy a staging, y corrige los fallos actuales en PR #69 (lint errors en MarkdownConverter).

**Por qué este enfoque:**

- `master` siempre deployable → cero riesgo en prod
- Staging refleja "candidato a prod" → no se deploya basura
- Flujo `dev → PR → master` obligatorio → historia limpia, rollback trivial, auditoría total

**Qué NO hace:** No introduce S3/Spaces, no cambia arquitectura de media, no toca HEVC/retención (ya hechos).

**Esfuerzo:** Medium (3-4 días de trabajo real, mayormente config + lint fixes)
**Riesgo:** Low - cambios son config + lint fixes, no lógica de negocio
**Decisiones a validar:** Branch naming convention, TTL publisher por defecto, umbral de warnings permitidos

---

## Components (topology ledger)

| id  | outcome                                                  | status  | evidence path                                            |
| --- | -------------------------------------------------------- | ------- | -------------------------------------------------------- |
| C1  | Branch protection rules en GitHub (master/dev)           | pending | Settings → Branches                                      |
| C2  | Workflow `branch-naming.yml` en `dev`                    | pending | `.github/workflows/branch-naming.yml`                    |
| C3  | `deploy-staging.yml` con `needs: [ci]` + `if: success()` | pending | `.github/workflows/deploy-staging.yml`                   |
| C4  | Branch protection `allow_deletions: true`                | pending | GitHub Settings → Branches                               |
| C5  | Fix lint errors en `markdown-converter.service.ts`       | pending | `apps/backend/src/.../markdown-converter.service.ts:527` |
| C6  | Regla `no-unsafe-call` passing en CI                     | pending | `.github/workflows/ci.yml`                               |
| C7  | Verificación manual de cada gate antes de merge          | pending | Checklist manual                                         |

## Open assumptions (announced defaults)

| assumption                                   | adopted default                     | rationale                                                        | reversible? |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ----------- | --- | ---- | -------- | ---- | ---- | ------ | ----- | ------ | ------------------------------------------------------------ | --- |
| Branch naming convention                     | `feat                               | fix                                                              | chore       | ci  | docs | refactor | perf | test | revert | build | style` | Convención convencional, compatible con conventional commits | sí  |
| Required status checks                       | `["CI", "Branch Governance Check"]` | Son los únicos que corren en CI hoy                              | sí          |
| Required approving reviews                   | 0 (solo status checks)              | Equipo pequeño, confianza alta                                   | sí          |
| `allow_deletions: true` en branch protection | `true`                              | Necesario para que Release Please / sync borren ramas temporales | sí          |
| `required_pull_request_reviews: 0`           | 0                                   | Equipo pequeño, confianza en status checks                       | sí          |
| Lint errors = bloqueante, warnings OK        | errors=block, warn=warn             | No bloquear por warnings estéticos                               | sí          |
| `allow_deletions: true` en master y dev      | `true`                              | Necesario para Release Please / sync branches                    | sí          |

## Findings (cited - path:lines)

### Hallazgo 1: Lint errors bloqueantes en CI

- **Archivo:** `apps/backend/src/telegram/ingestion/crypto-news/application/services/markdown-converter.service.ts:527`
- **Error:** `Unsafe call of an \`any\` typed value @typescript-eslint/no-unsafe-call`
- **Línea:** 527, callback `inner` sin tipar en `replace`
- **Workflows afectados:** CI → Lint job (PR #69 falla)

### Hallazgo 2: Deploy staging NO tiene `needs: [ci]`

- **Archivo:** `.github/workflows/deploy-staging.yml`
- **Línea:** `on: push: branches: [dev]` sin `needs: [ci]`
- **Resultado:** Deploy a staging se ejecuta aunque CI/Lint/Tests fallen

### Hallazgo 3: Branch protection incompleta

- **`allow_deletions: false`** en `master` y `dev` → Release Please / sync branches no pueden auto-borrar ramas temporales
- **`required_status_checks`** no incluye todos los jobs obligatorios (falta Lint/Build si se añaden)

### Hallazgo 4: Lint warnings vs errors

- `no-unsafe-call` → **error** (bloquea CI)
- `no-unsafe-assignment`, `no-unsafe-member-access` → warning (OK)
- `no-unused-vars` con `_` prefix → OK

### Hallazgo 5: Lint errors previos en markdown-converter

- Línea 527: `inner` es `any` en callback `replace` → `Unsafe call of an \`any\` typed value`
- Fix: `(inner: string)` en callback

---

## Decisions (with rationale)

| decision                                            | rationale                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------- | --- | ----- | --- | ---- | -------- | ---- | ---- | ------ | ----- | -------------------- |
| **Bloquear deploy staging si CI falla**             | Staging = candidato a prod; deployar basura rompe validación manual |
| **Lint errors = bloqueante, warnings = OK**         | No bloquear por estilo, sí por bugs potenciales (`any` unsafe)      |
| **Branch protection `allow_deletions: true`**       | Release Please / sync workflow necesitan borrar ramas temporales    |
| **Required status checks = CI + Branch Governance** | Son los únicos gates reales hoy; Build/Lint/Tests corren en CI      |
| **Branch naming convention**                        | `feat                                                               | fix | chore | ci  | docs | refactor | perf | test | revert | build | style` + descripción |
| **`allow_deletions: true` en master y dev**         | Release Please / sync workflow necesitan borrar ramas temporales    |

---

## Scope IN

- [ ] Branch protection rules (master + dev) via GitHub API
- [ ] Workflow `branch-naming.yml` en `.github/workflows/`
- [ ] `deploy-staging.yml` → `needs: [ci]` + `if: success()`
- [ ] Fix lint error `no-unsafe-call` en `markdown-converter.service.ts:527`
- [ ] Actualizar `ci.yml` para que `lint` y `tests` sean required status checks
- [ ] Habilitar `allow_deletions: true` en branch protection (master + dev)
- [ ] Verificar `required_status_checks` incluye `["CI", "Branch Governance Check"]`
- [ ] Test manual: PR con lint error → bloqueado; PR limpio → mergeable

## Scope OUT (Must NOT have)

- [ ] Cambiar `no-unsafe-assignment` / `no-unsafe-member-access` a error (siguen warning)
- [ ] Introducir S3/Spaces para media (fuera de scope)
- [ ] Cambiar retención media / HEVC / publisher TTL (ya hechos)
- [ ] Cambiar `no-unused-vars` a error (rompe mucho código legacy)
- [ ] Branch naming estricta en `master` (solo `dev` la necesita)

## Components (topology ledger)

| id  | outcome                                                  | status  | evidence path                                            |
| --- | -------------------------------------------------------- | ------- | -------------------------------------------------------- |
| C1  | Branch protection rules en GitHub (master/dev)           | pending | Settings → Branches                                      |
| C2  | Workflow `branch-naming.yml` en `dev`                    | pending | `.github/workflows/branch-naming.yml`                    |
| C3  | `deploy-staging.yml` con `needs: [ci]` + `if: success()` | pending | `.github/workflows/deploy-staging.yml`                   |
| C4  | Branch protection `allow_deletions: true`                | pending | GitHub Settings → Branches                               |
| C5  | Fix lint errors en `markdown-converter.service.ts`       | pending | `apps/backend/src/.../markdown-converter.service.ts:527` |
| C6  | Regla `no-unsafe-call` passing en CI                     | pending | `.github/workflows/ci.yml`                               |
| C7  | Verificación manual de cada gate antes de merge          | pending | Checklist manual                                         |

## Decisiones Confirmadas (Cloud/DevOps perspective)

| #   | Decisión                | Valor                                                                           | Rationale                                                                                             |
| --- | ----------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----- | --- | ---- | -------- | ---- | ---- | ------ | ----- | ----- | ------ | -------- | ---------------- | ------------------------- |
| 1   | Warnings a error        | `no-unsafe-call`, `no-unsafe-assignment`, `no-unsafe-member-access` → **error** | Solo reglas que causan bugs en runtime; `no-unused-vars` queda warning                                |
| 2   | `allow_deletions: true` | **master + dev = true**                                                         | Requerido para Release Please, sync-dev, Dependabot; riesgo mitigado con `enforce_admins: true` + 2FA |
| 3   | Branch naming           | `feat                                                                           | fix                                                                                                   | chore | ci  | docs | refactor | perf | test | revert | build | style | hotfix | release` | Añadidos `hotfix | release` para emergencias |
| 4   | Lint threshold          | 0 errors, warnings unlimited (por ahora)                                        | Deuda técnica legacy; budget de warnings en 6 meses                                                   |
| 4   | Publisher TTL default   | 7 días (ya configurado)                                                         | Ventana debug razonable, limpieza semanal                                                             |
| 5   | Build job separado      | No ahora (próximo trimestre)                                                    | Actual dentro de tests OK                                                                             |
| 6   | `allow_deletions: true` | **master + dev = true**                                                         | Requerido para Release Please, sync-dev, Dependabot; mitigado con `enforce_admins: true` + 2FA        |

## Open questions (pendientes de confirmación)

1. **Branch naming convention** - confirmar lista final de prefijos
2. **Umbral warnings** - mantener 0 errors / unlimited warnings por ahora
3. **TTL publisher default** - 7 días confirmado
4. **Build job separado** - postergado a próximo trimestre

---

## Approval gate

status: awaiting-approval
pending-action: present plan for review, then write .omo/plans/governance-and-quality-gates.md
approach: Document all proposed solutions, then verify each manually with user before implementation
gate-presented-at: 2026-08-28T12:00:00Z
awaiting: user explicit okay (approve / veto a default / scope-change)

---

## Approval gate

status: awaiting-approval
pending-action: present plan for review, then write .omo/plans/governance-and-quality-gates.md
approach: Document all proposed solutions, then verify each manually with user before implementation
gate-presented-at: 2026-08-28T12:00:00Z
awaiting: user explicit okay (approve / veto a default / scope-change)
