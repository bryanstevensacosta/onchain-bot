---
slug: husky-precommit-hooks
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/husky-precommit-hooks.md
approach: Husky v9 + lint-staged + commitlint + type-check + tests
---

# Draft: husky-precommit-hooks

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id                 | outcome                                                                         | status | evidence                                              |
| ------------------ | ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| husky-init         | Husky v9 instalado y git hooks activados                                        | active | `.husky/` directory, `husky` dep in root package.json |
| pre-commit-hook    | Hook pre-commit: lint-staged (ESLint + Prettier) + type-check                   | active | `.husky/pre-commit` script                            |
| commit-msg-hook    | Hook commit-msg: commitlint conventional commits                                | active | `.husky/commit-msg` script, `commitlint.config.js`    |
| pre-push-hook      | Hook pre-push: npm test                                                         | active | `.husky/pre-push` script                              |
| lint-staged-config | lint-staged que corre ESLint por workspace sobre staged files                   | active | `lint-staged.config.js` root                          |
| docs-check         | Script `scripts/check-docs-staleness.mjs` que detecta AGENTS.md desactualizados | active | `scripts/check-docs-staleness.mjs`                    |
| docs-warning       | Warning no-bloqueante en pre-commit si AGENTS.md necesita actualización         | active | Dentro de `.husky/pre-commit`                         |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption                               | adopted default                                                                       | rationale                                                  | reversible? |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------- |
| ESLint ya incluye Prettier vía plugin    | No se corre Prettier separado para TS/TSX — `eslint-plugin-prettier` ya lo maneja     | Evita duplicación, ESLint ya emite error prettier          | Sí          |
| Config files en root con CommonJS        | lint-staged.config.js + commitlint.config.js en CJS (root no tiene `"type":"module"`) | Compatibilidad con el ecosistema Node del root             | Sí          |
| Docs check usa .docs-map.jsonc explícito | Mapa manual de directorios a AGENTS.md en vez de auto-detección walk-up               | Más mantenible, evita falsos positivos, niveles explícitos | Sí          |
| Docs check no-bloqueante                 | Script siempre sale con exit code 0. Solo warning visual.                             | No interrumpe el flujo de trabajo del desarrollador        | Sí          |

## Findings (cited - path:lines)

- Root `package.json`: workspaces `apps/*`, scripts `lint`, `format`, `test` ya definidos (`package.json:7-29`)
- Backend ESLint: flat config en `apps/backend/eslint.config.mjs`, usa `tseslint.configs.recommendedTypeChecked`, parser project `tsconfig.eslint.json` (`eslint.config.mjs:7-67`)
- Frontend ESLint: flat config en `apps/frontend/eslint.config.js`, usa `tseslint.configs.recommended`, plugins react + react-hooks (`eslint.config.js:7-46`)
- Prettier: config root en `.prettierrc` (singleQuote, trailingComma all)
- Husky no instalado actualmente — no existe `.husky/` directory
- Backend: ESLint + tsconfig (`tsconfig.json`, `tsconfig.eslint.json`, `tsconfig.build.json`)
- Frontend: ESLint + tsconfig (`tsconfig.json`)
- Root tsconfig.base.json compartido

## Decisions (with rationale)

| #   | Decision                                   | Rationale                                                                                                                                                                     |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Husky v9** (latest)                      | v9 es la versión actual; init simplificado con `husky init`                                                                                                                   |
| 2   | **lint-staged** para pre-commit            | Solo corre en staged files → rápido, no toca código no-commiteado                                                                                                             |
| 3   | **ESLint separado por workspace**          | Cada app tiene su propia config ESLint flat con reglas distintas                                                                                                              |
| 4   | **commitlint con conventional commits**    | Estandariza mensajes, permite changelog automático futuro                                                                                                                     |
| 5   | **type-check post lint-staged**            | tsc --noEmit en backend + frontend secuencial; type-check completo, no por file                                                                                               |
| 6   | **tests en pre-push**                      | Tests son más lentos (~30s back + front) → mejor en pre-push que en pre-commit                                                                                                |
| 7   | **Docs check no-bloqueante en pre-commit** | Script `scripts/check-docs-staleness.mjs` se ejecuta en pre-commit. Solo warning, no bloquea.                                                                                 |
| 8   | **Regla de niveles: hasta BC level (L2)**  | Al cambiar código, se reportan todos los AGENTS.md desde el más cercano hasta el nivel de BC (telegram/, token/, kol/...), sin subir a app level (backend/AGENTS.md) ni root. |
| 9   | **`.docs-map.jsonc` explícito**            | Archivo de configuración que mapea directorios a niveles y AGENTS.md. Más mantenible que auto-detección.                                                                      |

## Scope IN

- Instalar husky, lint-staged, @commitlint/cli, @commitlint/config-conventional
- Crear `.husky/pre-commit` con lint-staged + type-check + docs-warning
- Crear `.husky/commit-msg` con commitlint
- Crear `.husky/pre-push` con npm test
- Crear `lint-staged.config.js` con ESLint por workspace
- Crear `commitlint.config.js` con extends conventional
- Crear `scripts/check-docs-staleness.mjs` — script que detecta AGENTS.md desactualizados
- Crear `.docs-map.jsonc` — mapeo de directorios a niveles y AGENTS.md
- Hooks ejecutables y funcionales
- Docs check como warning no-bloqueante en pre-commit

## Scope OUT (Must NOT have)

- No migrar a otra herramienta de hooks (solo Husky v9)
- No modificar configs de ESLint, Prettier, TypeScript existentes
- No agregar validación de mensaje de commit custom (solo commitlint estándar)
- No cambiar la estructura del monorepo ni los workspaces
- No ejecutar tests en pre-commit (solo en pre-push)
- No agregar hooks adicionales (prepare-commit-msg, post-commit, etc.)

## Open questions

Ninguna — todas resueltas vía entrevista con el usuario.

## Momus review (APPROVED + recommendations applied)

Momus: **APPROVED** con recomendaciones menores. Cambios aplicados:

1. `--incremental false` en comandos `tsc --noEmit` (Task 4)
2. QA scenarios de commitlint simplificados (Task 5)
3. Verificación de hooks con `test -f + test -x` en vez de `npx husky` (Task 7)
4. Nota sobre side-effect `"prepare": "husky"` de husky init (Task 1)
5. Task 3 re-clasificado a Wave 2 (consistencia)
6. Success criteria actualizados

## Approval gate

status: awaiting-approval
