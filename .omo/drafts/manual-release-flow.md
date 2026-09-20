---
slug: manual-release-flow
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/manual-release-flow.md
approach: Inventario+respaldo → demoler release-please → RELEASE-FLOW.md con criterios → reescribir 3 changelogs + versiones → borrar tags/releases publicados → recrear por app → verificar. Todo con evidencia y reversible hasta el borrado (cubierto por respaldo).
---

# Draft: manual-release-flow

## Components (topology ledger)

- inventory | tags/releases/changelogs/versiones/configs inventariados + respaldados | active | .omo/evidence/task-{1,2}-manual-release-flow.\*
- automation-removal | workflow+config+manifest+troubleshooting eliminados, RELEASE-FLOW.md creado | active | release-please.yml, .github/release-please-\*.json
- changelog-rewrite | 3 changelogs corregidos + package.json sincronizados, root CHANGELOG eliminado | active | apps/_/CHANGELOG.md, apps/_/package.json
- tags-releases | tags v1–v4 + release v4.0.0 + draft borrados; tags backend-v*/frontend-v*/ingestion-v\* + releases recreados | active | gh release list, git tag
- verify | sin restos release-please, changelogs parsean, docs:check limpio | active | .omo/evidence/task-14-manual-release-flow.log

## Open assumptions (announced defaults)

- Root CHANGELOG | DELETE (muerto desde agosto, nadie lo gestiona; reversible vía git) | sí
- Draft release v1.3.2 | DELETE con el resto (huérfano de un intento viejo) | no (irreversible sin backup; cubierto por respaldo todo 2)
- docs/release-process.md | reemplazar por puntero a RELEASE-FLOW.md (evita doc muerta + links rotos) | sí
- RELEASE_TROUBLESHOOTING.md | DELETE (troubleshooting de la automatización que se elimina) | sí
- Criterio de versiones correctas | lo juzga el worker auditando merges (evidencia), no el plan | sí (re-juzgable antes de taggear)

## Findings (cited)

- Tags publicados ambiguos: `git tag` v1.0.0–v3.0.1 + releases v1.0.0–v4.0.0 (un solo namespace para 3 apps).
- Duplicados: `apps/frontend/CHANGELOG.md:7-10`, `apps/ingestion-telegram/CHANGELOG.md:7-9`, backend (líneas MTProto ×4); entradas de una app en changelogs de otra.
- Lockstep: `.github/release-please-manifest.json` 4.0.0×3 + `include-component-in-tag: false` (tags colisionan).
- Root CHANGELOG muerto: `CHANGELOG.md:1-17` (v1.2.0, agosto; la config actual no lo gestiona).
- Config: `.github/release-please-config.json` (solo apps/\*), workflow `.github/workflows/release-please.yml`.
- Historial backend: `apps/backend/CHANGELOG.md` 1.3.0→4.0.0 con majors en 2.0.0/3.0.0/4.0.0.

## Decisions (with rationale)

- Manual total (owner 2026-09-10): releases 100% a mano con RELEASE-FLOW.md; automatización eliminada.
- Reescribir historia publicada (owner): tags/releases v1–v4 se borran y recrean corregidos (sucio pero pedido explícito aunque tome tiempo).
- Independiente por app (owner): tags `backend-vX/frontend-vX/ingestion-vX`, versiones separadas.
- Enterprise v1 (owner 2026-09-10, "si" a la propuesta) + recorte solo-dev (owner: sin teatro — fuera reviewers, CODEOWNERS, trenes/freeze, notificaciones): environments con cooling-off, title-lint + squash, dry-run migraciones, smoke post-deploy, secciones (rollback/RTO, hotfix, flags, firma-opcional), script borrador. v2: notificaciones, builders nativos.
- Probar en staging? N/A (docs/config/refs — sin runtime).

## Scope IN

- Inventario + respaldo reversible del estado actual.
- Eliminación release-please (workflow, config, manifest, troubleshooting) + puntero en docs.
- RELEASE-FLOW.md con proceso y criterios major/minor/patch + ejemplos del repo.
- Reescritura 3 changelogs + sync package.json + delete root CHANGELOG.
- Borrado tags/releases publicados + recreación por app con notas.
- Verificación final (grep, parse, tags/releases lists, docs:check).

## Scope OUT (Must NOT have)

- NO tocar código de producto (solo docs/config/versiones/refs).
- NO tocar `.env*`, secretos, compose, runners, hosts.
- NO force-push de ramas (solo `git push --delete` de TAGS + `gh release delete`, autorizado explícito).
- NO merges a master (los taggeos/releases se hacen sobre lo existente; PRs solo si el worker los necesita y los deja abiertos, no mergea).
- NO reescribir historia git (commits intactos; solo se reescriben tags/releases/changelogs-editados como archivos normales).

## Open questions

- Ninguna (los 2 forks se preguntaron y respondieron: reescribir + independiente).

## Approval gate

status: awaiting-approval
pending-action: .omo/plans/manual-release-flow.md EXPANDED with enterprise v1 (todos 15-20) — awaiting fresh user OK to execute
approach: Inventario+respaldo → demoler release-please → RELEASE-FLOW.md con criterios → reescribir 3 changelogs + versiones → borrar tags/releases publicados → recrear por app → verificar → ENTERPRISE V1: environments con aprobación, higiene PR+squash, dry-run migraciones, smoke post-deploy, secciones enterprise del flow (rollback/RTO, trenes, freeze, hotfix, flags, firma), script borrador de changelog.
