# Governance de Ramas Git — Alpha Meta Token Scanner

**Versión:** 1.0  
**Fecha:** 2026-08-22  
**Estado:** ACTIVO

---

## 1. Flujo Oficial de Ramas

```
dev ──────────────────────────────────────► (integración continua)
  │
  ├── feature/* (rama corta, < 2 semanas)
  │    └── PR → dev (requiere: 1 approval, CI pass, conversation resolved)
  │
  └── PR: dev → master (squash merge)
       └── master (producción)
            └── deploy automático en push
```

**Reglas:**

- Solo `master` y `dev` son ramas _long-lived_ (permanentes)
- `feature/*`, `hotfix/*`, `backport/*`, `sync/*` son _short-lived_ (se borran tras merge)
- `release/*` **NO se usa** — deploy es continuo en push a master

---

## 2. Reglas de Ramas (Branch Protection)

| Rama       | PR requerido | Approvals | Status checks   | Force push | Delete | Conversation resolved |
| ---------- | ------------ | --------- | --------------- | ---------- | ------ | --------------------- |
| **master** | ✅           | 1         | test, lint, tsc | ❌         | ❌     | ✅                    |
| **dev**    | ✅           | 1         | test, lint, tsc | ❌\*       | ❌     | ✅                    |

_\*Excepción dev: maintainers pueden habilitar force-push temporalmente para **backport sync** (requiere 2 aprobaciones en issue/PR). Ver §5._

---

## 3. Flujo de Trabajo Diario

### 3.1 Desarrollo en feature branch

```bash
# Desde dev actualizado
git checkout dev && git pull origin dev
git checkout -b feature/mi-cambio

# Desarrollo + tests locales
npm run test && npm run lint && npm run tsc

# Push + PR a dev
git push origin feature/mi-cambio
gh pr create --base dev --head feature/mi-cambio --title "feat: mi cambio"
```

### 3.2 Merge a dev (integración)

- PR a `dev` con base `dev`
- Requisitos: 1 approval + CI pass (test, lint, tsc) + conversation resolved
- **Merge squash** → mantiene historial limpio en dev
- Rama feature se auto-borra (auto-delete habilitado)

### 3.3 Promoción a master (release)

```bash
# Cuando dev está listo para producción
gh pr create --base master --head dev --title "release: vX.Y.Z" --body "Changelog..."
# Revisión + merge squash en GitHub UI
# Deploy automático en push a master
```

---

## 4. Hotfix Policy (Producción)

**Cuando:** Bug crítico en producción que no puede esperar al siguiente release.

```bash
# 1. Rama desde master (producción actual)
git checkout master && git pull origin master
git checkout -b hotfix/descripcion-corta

# 2. Fix + test local + staging deploy manual
npm run test && npm run lint
# deploy manual a staging si aplica

# 3. PR a master
gh pr create --base master --head hotfix/... --title "hotfix: ..." --body "Fix para #ISSUE"

# 4. Merge squash a master → deploy automático a producción

# 5. Backport a dev (para que el fix persista en próxima release)
git checkout dev && git pull origin dev
git checkout -b backport/hotfix-<issue> dev
git cherry-pick <squash-commit-hash-del-hotfix>
gh pr create --base dev --head backport/hotfix-... --title "backport: hotfix #ISSUE"
# Merge squash a dev
```

---

## 5. Excepciones Controladas

### 5.1 Force-push a dev (Backport Sync)

**Cuándo:** Sincronizar commits de master → dev (ej. backport CI fixes, hotfix backport)
**Proceso:**

1. Abrir issue/PR: "backport sync: traer X commits de master a dev"
2. 2 aprobaciones de maintainers
3. Maintainer habilita temporalmente "Allow force pushes" en dev (Settings → Branches)
4. Ejecutar sync (cherry-pick + force-push a dev)
5. Deshabilitar force-push inmediatamente

### 5.2 Rollback Master (Emergencia)

**Cuándo:** Merge a master rompe producción

```bash
git checkout master && git pull origin master
git revert HEAD -m 1  # revert del squash commit
git push origin master --force-with-lease
```

**SOLO para revert.** Documentado en issue con 2 aprobaciones.

### 5.3 Rollback Dev (Emergencia)

Igual que master pero en dev. Requiere 2 aprobaciones.

---

## 6. Limpieza Automática

- **Auto-delete head branches:** ✅ Habilitado (Settings → General)
- **Efecto:** Ramas de PR se borran automáticamente al merge en **master**
- **Dev:** NO se auto-borra (protection "no deletions") — mantener limpio manualmente

---

## 7. Comandos Permitidos / Prohibidos

| Comando                       | master       | dev          | feature/\*       |
| ----------------------------- | ------------ | ------------ | ---------------- |
| `git push` (sin force)        | ❌ (solo PR) | ❌ (solo PR) | ✅               |
| `git push --force`            | ❌\*         | ❌\*         | ✅ (propia rama) |
| `git push --force-with-lease` | ❌\*         | ❌\*         | ✅               |
| `git rebase -i` (público)     | ❌           | ❌           | ✅               |
| `git cherry-pick` + push      | ✅ (vía PR)  | ✅ (vía PR)  | ✅               |
| `git tag`                     | ✅ (release) | ❌           | ❌               |

_\* Ver excepciones §5_

---

## 8. CI Governance Job (`.github/workflows/branch-governance.yml`)

Este job **falla el CI** si detecta violaciones:

1. **Ramas extra:** `git ls-remote --heads origin | grep -vE "refs/heads/(master|dev)$" | wc -l` > 0
2. **Ancestor policy:** `master` debe ser ancestor de `dev` (`git merge-base --is-ancestor master dev`)
3. **Commits huérfanos en master:** `git log --oneline dev..master --grep -v "sync|chore|backport" | wc -l` > 0
4. **Force-push detectado (24h):** `git reflog --since="24 hours ago" | grep -E "force-push|push --force" | wc -l` > 0 (en master/dev)

---

## 9. Referencias Rápidas

| Acción                | Comando                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Ver protección actual | `gh api repos/OWNER/REPO/branches/BRANCH/protection`                       |
| Ver ramas remotas     | `git ls-remote --heads origin`                                             |
| Ver ancestry          | `git merge-base --is-ancestor master dev && echo "master ancestor of dev"` |
| Ver commits únicos    | `git log --oneline master..dev` / `git log --oneline dev..master`          |
| Crear PR              | `gh pr create --base BASE --head HEAD --title "..." --body "..."`          |
| Merge squash          | `gh pr merge --squash --delete-branch`                                     |

---

## 10. Changelog de Este Documento

| Versión | Fecha      | Cambios                                       | Autor         |
| ------- | ---------- | --------------------------------------------- | ------------- |
| 1.0     | 2026-08-22 | Creación inicial (Plan sync-repos-governance) | Bryan Stevens |

---

> **Recordatorio:** Este documento es la única fuente de verdad para gobernanza de ramas. Cualquier cambio requiere PR a `dev` → `master` con 2 approvals.
