# husky-precommit-hooks - Work Plan

## TL;DR (For humans)

**What you'll get:** 3 git hooks automáticos que protegen la calidad del código: (1) pre-commit: lint-staged (ESLint) + type-check + **warning de documentación desactualizada**; (2) commit-msg: conventional commits; (3) pre-push: tests completos. Más un script `check-docs-staleness.mjs` que detecta si cambiaste código pero no actualizaste el AGENTS.md correspondiente.

**Why this approach:** Husky v9 + lint-staged es el estándar moderno: liviano, rápido (solo toca archivos staged) y configurable por workspace. commitlint con conventional commits prepara el proyecto para changelogs automáticos. Los tests van en pre-push para no ralentizar el commit.

**What it will NOT do:** No modifica tus configs de ESLint/Prettier/TypeScript. No agrega hooks exóticos. No ejecuta tests en cada commit (solo en push). **El docs check NO bloquea el commit** — solo advierte.

**Effort:** Short
**Risk:** Low - cambios solo en archivos nuevos (`.husky/`, `lint-staged.config.js`, `commitlint.config.js`, `package.json`)
**Decisions to sanity-check:** El type-check (`tsc --noEmit --incremental false`) se ejecuta completo en ambos workspaces; `--incremental false` evita artefactos `.tsbuildinfo` en `dist/`. Si el type-check es lento, se puede optimizar después.

Your next move: approve this plan. Full execution detail follows below.

---

> TL;DR (machine): Short | Low | 3 git hooks (pre-commit: lint-staged + type-check, commit-msg: commitlint, pre-push: npm test) + config files

## Scope

### Must have

- Instalar `husky` v9, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` en devDependencies del root
- Inicializar Husky (`npx husky init`) → directorio `.husky/`
- Crear `lint-staged.config.js` en raíz con ESLint por workspace sobre staged files
- Crear `.husky/pre-commit`: lint-staged + type-check + docs staleness warning
- Crear `.husky/commit-msg`: commitlint valida mensaje contra conventional commits
- Crear `.husky/pre-push`: `npm test` ejecuta tests de backend + frontend
- Crear `commitlint.config.js` en raíz con `extends: ['@commitlint/config-conventional']`
- Crear `.docs-map.jsonc` — mapeo de directorios a AGENTS.md con niveles (L0-L4+)
- Crear `scripts/check-docs-staleness.mjs` — script que:
  - Lee archivos staged (`git diff --cached --name-only`)
  - Para cada archivo, busca en `.docs-map.jsonc` los AGENTS.md desde el más cercano hasta BC level (L2)
  - Reporta qué AGENTS.md podrían necesitar actualización
- Verificar que los 3 hooks + docs check funcionan

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No modificar archivos existentes de ESLint, Prettier, TypeScript
- No agregar hooks adicionales (prepare-commit-msg, post-commit, post-merge, etc.)
- No migrar a husky v8 o versiones anteriores
- No cambiar estructura del monorepo
- No ejecutar tests en pre-commit (solo pre-push)
- No usar husky.sh o .husky/\_/ (Husky v9 no lo requiere)
- **El docs check NO bloquea el commit** — solo warning informativo
- **No crear AGENTS.md automáticamente** — el script solo advierte, no genera archivos
- **No subir más allá de BC level (L2)** — el script ignora AGENTS.md en `apps/backend/`, `apps/frontend/` y root a menos que el cambio sea directamente en esos directorios

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after — verificación manual de cada hook simulando commits/pushes
- Evidence: .omo/evidence/task-husky-precommit-hooks.log

## Execution strategy

### Parallel execution waves

Wave 1: Install dependencies, init husky (sequential — install blocks init)
Wave 2: Create config files + hooks + docs check script (parallel — no dependencies between them)
Wave 3: Verify all hooks + docs check (sequential — depends on all configs + hooks)

### Dependency matrix

| Todo                                   | Depends on | Blocks     | Can parallelize with |
| -------------------------------------- | ---------- | ---------- | -------------------- |
| 1. Install deps                        | —          | 2, 4, 5, 6 | —                    |
| 2. Init husky                          | 1          | 4, 5, 6    | 3, 7                 |
| 3. lint-staged config                  | —          | 4          | 2, 7                 |
| 4. pre-commit hook                     | 1, 2, 3, 9 | 10         | 5, 6                 |
| 5. commit-msg hook                     | 1, 2       | 10         | 4, 6, 7, 8, 9        |
| 6. pre-push hook                       | 1, 2       | 10         | 4, 5, 7, 8, 9        |
| 7. .docs-map.jsonc                     | —          | 8          | 2, 3                 |
| 8. check-docs-staleness.mjs            | 7          | 9          | 5, 6                 |
| 9. Integrar docs warning en pre-commit | 8          | 4          | 5, 6                 |
| 10. Verify all hooks                   | 4, 5, 6    | —          | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Instalar dependencias (husky, lint-staged, commitlint)
     ⚠️ Side-effect notice: `npx husky init` (Task 2) añadirá automáticamente `"prepare": "husky"` a `scripts` en `package.json`. Esto es intencional y necesario para que Husky se reinstale en `npm install`. El package.json final se commitea con este cambio incluido en Task 7.
     What to do / Must NOT do:
  1. Abrir `package.json` raíz
  1. Agregar a `devDependencies`:
     - `"husky": "^9.1.7"`
     - `"lint-staged": "^15.4.3"`
     - `"@commitlint/cli": "^19.6.1"`
     - `"@commitlint/config-conventional": "^19.6.0"`
  1. Ejecutar `npm install` desde la raíz
     Must NOT: no instalar en workspaces individuales, solo en root `devDependencies`
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 4, 5, 6
     References:
  - `package.json:31-35` (devDependencies existentes)
  - `package.json:7-29` (scripts existentes)
    Acceptance criteria (agent-executable):
  - `npm ls husky lint-staged @commitlint/cli @commitlint/config-conventional` → muestra versiones sin error
  - `node -e "require('husky'); require('lint-staged'); console.log('ok')"` → no lanza error
    QA scenarios:
  - Happy: `npm ls husky` → version output
  - Failure: revisar que no haya errores de instalación
  - Evidence: `.omo/evidence/task-1-install-deps.log`
    Commit: N | (los commits se agrupan al final)

- [ ] 2. Inicializar Husky v9
     What to do / Must NOT do:
  1. Ejecutar `npx husky init` desde la raíz del proyecto
  1. Verificar que creó `.husky/pre-commit` con contenido por defecto
  1. Verificar que git config core.hooksPath apunta a `.husky` (correr `git config core.hooksPath`)
     Must NOT: no crear `.husky/_/` manualmente (Husky v9 no usa husky.sh)
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 5, 6
     References:
  - Documentación Husky v9 init
    Acceptance criteria (agent-executable):
  - `test -f .husky/pre-commit` → exit code 0
  - `git config core.hooksPath` → `.husky`
    QA scenarios:
  - Happy: `ls .husky/` → contiene `pre-commit`
  - Evidence: `.omo/evidence/task-2-husky-init.log`
    Commit: N

- [ ] 3. Crear lint-staged.config.js con ESLint por workspace
     What to do / Must NOT do:
  1. Crear archivo `lint-staged.config.js` en la raíz del proyecto con contenido CJS:

  ```js
  // lint-staged.config.js
  // IMPORTANT: backend ESLint usa parserOptions.project = ['./tsconfig.eslint.json']
  // que es relativo a apps/backend/eslint.config.mjs — eslint --config desde root
  // resuelve correctamente porque flat config usa import.meta.dirname del config file.
  module.exports = {
    'apps/backend/src/**/*.ts': (files) =>
      `eslint --fix --config apps/backend/eslint.config.mjs ${files.join(' ')}`,
    'apps/backend/test/**/*.ts': (files) =>
      `eslint --fix --config apps/backend/eslint.config.mjs ${files.join(' ')}`,
    'apps/frontend/src/**/*.{ts,tsx}': (files) =>
      `eslint --fix --config apps/frontend/eslint.config.js ${files.join(' ')}`,
    '*.{json,md,yaml,yml}': ['prettier --write'],
  };
  ```

  Must NOT: no incluir prettier para TS/TSX (eslint-plugin-prettier ya lo maneja via --fix)
  Parallelization: Wave 2 | Blocked by: — | Blocks: 4
  References:
  - `apps/backend/eslint.config.mjs:7-67` (flat config con prettier plugin + type-checked rules)
  - `apps/frontend/eslint.config.js:7-46` (flat config con prettier plugin + react hooks)
  - Root .prettierrc (singleQuote, trailingComma all)
    Acceptance criteria (agent-executable):
  - `test -f lint-staged.config.js` → exit code 0
  - `node -e "require('./lint-staged.config.js')"` → no lanza error
    QA scenarios:
  - Happy: node requiere el config sin error
  - Failure: config syntax error → error de parseo
  - Evidence: `.omo/evidence/task-3-lint-staged-config.log`
    Commit: N

- [ ] 4. Crear hook pre-commit con lint-staged + type-check
     What to do / Must NOT do:
  1. Reemplazar `.husky/pre-commit` con:

  ```bash
  #!/bin/sh
  # .husky/pre-commit — lint-staged en staged files + type-check completo
  npx --no -- lint-staged
  npx --no -- tsc --noEmit --incremental false -p apps/backend/tsconfig.json && \
    npx --no -- tsc --noEmit --incremental false -p apps/frontend/tsconfig.json
  ```

  Razón de `--incremental false`: el `tsconfig.json` del backend tiene `incremental: true`,
  que escribe artefactos `.tsbuildinfo` en `dist/` incluso con `--noEmit`. `--incremental false`
  lo evita. 2. Hacerlo ejecutable: `chmod +x .husky/pre-commit`
  Must NOT: no ejecutar tests aquí (van en pre-push), no usar `--allow-empty` ni flags no estándar
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 7
  References:
  - `apps/backend/tsconfig.json` (tsconfig con paths, experimentalDecorators, strict flags)
  - `apps/frontend/tsconfig.json` (tsconfig con jsx react-jsx, module ESNext)
  - `lint-staged.config.js` (creado en todo 3)
    Acceptance criteria (agent-executable):
  - `head -5 .husky/pre-commit | grep -c "lint-staged"` → 1 (contiene lint-staged)
  - `head -5 .husky/pre-commit | grep -c "tsc --noEmit"` → 1 (contiene type-check)
  - `test -x .husky/pre-commit` → exit code 0 (es ejecutable)
    QA scenarios:
  - Happy: `sh .husky/pre-commit` desde raíz → corre lint-staged + tsc (puede fallar por lint errors reales, eso es normal)
  - Failure: si lint-staged no existe → error claro
  - Evidence: `.omo/evidence/task-4-precommit-hook.log`
    Commit: N

- [ ] 5. Crear hook commit-msg con commitlint
     What to do / Must NOT do:
  1. Crear archivo `.husky/commit-msg`:

  ```bash
  #!/bin/sh
  # .husky/commit-msg — valida mensaje de commit con conventional commits
  npx --no -- commitlint --edit $1
  ```
  2. Hacerlo ejecutable: `chmod +x .husky/commit-msg`
  3. Crear archivo `commitlint.config.js` en la raíz:

  ```js
  // commitlint.config.js
  module.exports = {
    extends: ['@commitlint/config-conventional'],
  };
  ```

  Must NOT: no agregar reglas personalizadas, no modificar el config después
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 7
  References:
  - `@commitlint/config-conventional` (reglas: feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert)
    Acceptance criteria (agent-executable):
  - `test -f .husky/commit-msg` → exit code 0
  - `test -x .husky/commit-msg` → exit code 0
  - `test -f commitlint.config.js` → exit code 0
  - `echo "feat: add login button" | npx commitlint` → exit code 0 (no error)
  - `echo "WIP: broken" | npx commitlint; [ $? -ne 0 ]` → debe fallar (exit code != 0)
    QA scenarios:
  - Happy: `echo "feat: add login button" | npx commitlint && echo "OK"` → prints "OK"
  - Failure: `echo "WIP: broken" | npx commitlint; [ $? -ne 0 ] && echo "REJECTED OK"` → prints "REJECTED OK"
  - Evidence: `.omo/evidence/task-5-commitmsg-hook.log`
    Commit: N

- [ ] 6. Crear hook pre-push con npm test
     What to do / Must NOT do:
  1. Crear archivo `.husky/pre-push`:

  ```bash
  #!/bin/sh
  # .husky/pre-push — ejecuta tests antes de hacer push
  npm test
  ```
  2. Hacerlo ejecutable: `chmod +x .husky/pre-push`
     Must NOT: no incluir build, lint, ni type-check aquí (ya cubiertos en pre-commit y CI)
     Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 7
     References:
  - `package.json:20` (script test: `npm run test -w @alpha-meta-token-scanner/backend --if-present && npm run test -w @alpha-meta-token-scanner/frontend --if-present`)
  - Backend tests: Jest con `--forceExit --testTimeout=30s` (~306 tests)
  - Frontend tests: Vitest run
    Acceptance criteria (agent-executable):
  - `test -f .husky/pre-push` → exit code 0
  - `test -x .husky/pre-push` → exit code 0
  - `grep -c "npm test" .husky/pre-push` → 1
    QA scenarios:
  - Happy: `sh .husky/pre-push` → ejecuta npm test (puede fallar si hay tests rotos)
  - Evidence: `.omo/evidence/task-6-prepush-hook.log`
    Commit: N

- [ ] 7. Crear .docs-map.jsonc con niveles de documentación
     What to do / Must NOT do:
  1. Crear archivo `.docs-map.jsonc` en la raíz del proyecto:

  ```jsonc
  {
    // .docs-map.jsonc — Mapeo de directorios a AGENTS.md
    // Cada entrada asocia un path a su AGENTS.md y nivel.
    // El script check-docs-staleness.mjs usa este mapa para determinar
    // qué AGENTS.md deben actualizarse al cambiar archivos.
    //
    // Niveles:
    //   L0 = Proyecto root
    //   L1 = App (backend, frontend)
    //   L2 = Bounded Context (telegram, token, kol, ...) ← STOP level
    //   L3 = Sub-BC (vip-calls, chain-dexter-bot, crypto-news, ...)
    //   L4+ = Módulo interno (shared, ingestion, ...)
    //
    // Regla: al cambiar un archivo, se reportan todos los AGENTS.md
    // desde el más cercano hasta L2 (inclusive). No se sube a L1 o L0.
    "version": 1,
    "maps": [
      // L0 - Proyecto
      { "path": "", "doc": "AGENTS.md", "level": 0 },

      // L1 - Apps
      { "path": "apps/backend", "doc": "apps/backend/AGENTS.md", "level": 1 },
      { "path": "apps/frontend", "doc": "apps/frontend/AGENTS.md", "level": 1 },

      // L2 - Bounded Contexts (backend)
      {
        "path": "apps/backend/src/telegram",
        "doc": "apps/backend/src/telegram/AGENTS.md",
        "level": 2,
      },
      {
        "path": "apps/backend/src/token",
        "doc": "apps/backend/src/token/AGENTS.md",
        "level": 2,
      },
      {
        "path": "apps/backend/src/kol",
        "doc": "apps/backend/src/kol/AGENTS.md",
        "level": 2,
      },
      {
        "path": "apps/backend/src/data-provider",
        "doc": "apps/backend/src/data-provider/AGENTS.md",
        "level": 2,
      },
      {
        "path": "apps/backend/src/shared",
        "doc": "apps/backend/src/shared/AGENTS.md",
        "level": 2,
      },

      // L3 - Sub-BC (backend)
      {
        "path": "apps/backend/src/telegram/vip-calls",
        "doc": "apps/backend/src/telegram/vip-calls/AGENTS.md",
        "level": 3,
      },
      // NOTA: cuando se creen nuevos AGENTS.md en L3 o L4+, agregar entradas aquí
    ],
  }
  ```
  2. El mapa DEBE mantenerse manualmente al crear nuevos AGENTS.md
     Must NOT: no incluir paths que no tengan AGENTS.md real, no subir nivel 3 a level 2
     Parallelization: Wave 2 | Blocked by: — | Blocks: 8
     References:
  - AGENTS.md existentes en `apps/backend/src/telegram/`, `apps/backend/src/telegram/vip-calls/`, `apps/backend/src/token/`, etc.
  - Regla de niveles acordada: hasta BC level (L2), sin subir a app level
    Acceptance criteria (agent-executable):
  - `test -f .docs-map.jsonc` → exit code 0
  - `node -e "JSON.parse(require('fs').readFileSync('.docs-map.jsonc','utf8'))"` → no error
    QA scenarios:
  - Happy: archivo existe, JSON válido
  - Failure: JSON mal formado → error de parseo
  - Evidence: `.omo/evidence/task-7-docs-map.log`
    Commit: N

- [ ] 8. Crear script check-docs-staleness.mjs
     What to do / Must NOT do:
  1. Crear `scripts/check-docs-staleness.mjs` con la siguiente lógica:

  ```javascript
  #!/usr/bin/env node
  // scripts/check-docs-staleness.mjs
  //
  // Chequea si los archivos staged tienen AGENTS.md desactualizados.
  // Regla: para cada archivo cambiado, busca en .docs-map.jsonc todos los
  // AGENTS.md desde el más cercano hasta BC level (L2).
  // Si el AGENTS.md no está también staged, muestra warning.
  //
  // Uso: node scripts/check-docs-staleness.mjs
  // Exit code: 0 siempre (no bloqueante)

  import { readFileSync, existsSync } from 'fs';
  import { execSync } from 'child_process';
  import { dirname, resolve, relative } from 'path';

  const ROOT = process.cwd();

  // 1. Leer .docs-map.jsonc
  const raw = readFileSync(resolve(ROOT, '.docs-map.jsonc'), 'utf8');
  // Strip comments (JSONC support)
  const json = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const config = JSON.parse(json);
  const maps = config.maps.sort((a, b) => b.path.length - a.path.length); // más específico primero

  // 2. Obtener archivos staged
  const stagedRaw = execSync('git diff --cached --name-only', { cwd: ROOT })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  if (stagedRaw.length === 0) process.exit(0);

  // 3. Para cada archivo, buscar AGENTS.md que le correspondan
  const docsToUpdate = new Set();

  for (const file of stagedRaw) {
    for (const entry of maps) {
      // Match: el entry matchea si el archivo está DENTRO del path del entry
      // o si el path del entry está vacío (root)
      if (entry.path === '' || file.startsWith(entry.path + '/')) {
        if (entry.level <= 2) {
          // Solo hasta BC level (L2)
          docsToUpdate.add(entry.doc);
        }
        break; // Solo el entry más específico por archivo
      }
    }
  }

  // 4. Verificar cuáles NO están staged
  const stagedDocs = new Set(stagedRaw.filter((f) => f.endsWith('AGENTS.md')));

  const missing = [...docsToUpdate].filter((doc) => !stagedDocs.has(doc));

  if (missing.length > 0) {
    console.log('\n⚠️  Documentación posiblemente desactualizada:');
    for (const doc of missing) {
      console.log(`   • ${doc}`);
    }
    console.log(
      '   Actualiza el AGENTS.md correspondiente o ignora este warning.\n',
    );
  }

  process.exit(0);
  ```
  2. Hacerlo ejecutable: `chmod +x scripts/check-docs-staleness.mjs`
  3. Agregar script npm en `package.json`: `"docs:check": "node scripts/check-docs-staleness.mjs"`
     Must NOT: el script nunca debe salir con exit code != 0 (es no-bloqueante)
     Parallelization: Wave 2 | Blocked by: 7 | Blocks: 9, 4
     References:
  - `.docs-map.jsonc` (creado en todo 7a)
  - `git diff --cached --name-only` (archivos staged)
  - Regla de niveles: hasta L2 inclusive
    Acceptance criteria (agent-executable):
  - `test -f scripts/check-docs-staleness.mjs` → exit code 0
  - `test -x scripts/check-docs-staleness.mjs` → exit code 0
  - `node scripts/check-docs-staleness.mjs` → exit code 0 (incluso sin staged files)
    QA scenarios:
  - Happy: sin staged files → exit 0 sin output
  - Happy: staged files sin AGENTS.md impactado → exit 0 sin warning
  - Failure path as happy: el script nunca falla
  - Evidence: `.omo/evidence/task-8-docs-staleness.log`
    Commit: N

- [ ] 9. Integrar docs warning en pre-commit hook
     What to do / Must NOT do:
  1. Editar `.husky/pre-commit` para agregar el docs check DESPUÉS de type-check:

  ```bash
  #!/bin/sh
  # .husky/pre-commit — lint-staged en staged files + type-check + docs check
  npx --no -- lint-staged || exit 1

  npx --no -- tsc --noEmit --incremental false -p apps/backend/tsconfig.json && \
    npx --no -- tsc --noEmit --incremental false -p apps/frontend/tsconfig.json || exit 1

  # Docs staleness check (no-bloqueante, solo warning)
  node scripts/check-docs-staleness.mjs
  ```

  Nota: `lint-staged` y `tsc` usan `|| exit 1` para BLOQUEAR el commit si fallan.
  `check-docs-staleness.mjs` NO tiene `|| exit 1` — es solo warning.
  Must NOT: no hacer que el docs check bloquee el commit
  Parallelization: Wave 2 | Blocked by: 7b | Blocks: 8
  References:
  - `.husky/pre-commit` (creado en todo 4, modificado aquí)
  - `scripts/check-docs-staleness.mjs` (creado en todo 7b)
    Acceptance criteria (agent-executable):
  - `grep -c "check-docs-staleness" .husky/pre-commit` → 1
  - `grep -c "|| exit 1" .husky/pre-commit` → 2 (lint-staged + tsc)
  - `grep -c "check-docs-staleness" .husky/pre-commit | grep -v "exit 1"` → el docs check NO tiene exit 1
    QA scenarios:
  - Happy: commit con cambios en `telegram/` sin staged AGENTS.md → warning se muestra pero commit pasa
  - Happy: commit con cambios + AGENTS.md también staged → sin warning
  - Evidence: `.omo/evidence/task-9-docs-integration.log`
    Commit: N

- [ ] 10. Verificar todos los hooks funcionando
      What to do / Must NOT do:
  1. Verificar artefactos de husky:
     - `test -f .husky/pre-commit && test -x .husky/pre-commit`
     - `test -f .husky/commit-msg && test -x .husky/commit-msg`
     - `test -f .husky/pre-push && test -x .husky/pre-push`
     - `git config core.hooksPath` → debe devolver `.husky`
  1. Verificar docs check script:
     - `test -f scripts/check-docs-staleness.mjs && test -x scripts/check-docs-staleness.mjs`
     - `test -f .docs-map.jsonc`
     - `node scripts/check-docs-staleness.mjs` → exit code 0
  1. Simular commit exitoso con docs-check:
     - `git add .husky/pre-commit .husky/commit-msg .husky/pre-push lint-staged.config.js commitlint.config.js .docs-map.jsonc scripts/check-docs-staleness.mjs package.json`
     - `git commit -m "chore: configure git hooks with husky"` → debe pasar pre-commit (lint + tsc + docs warning) + commit-msg
  1. Simular mensaje inválido:
     - Tocar un archivo existente (ej. `echo "" >> apps/backend/src/telegram/AGENTS.md` y luego `git checkout -- apps/backend/src/telegram/AGENTS.md`)
     - `git commit -m "invalid message no conventional"` → debe fallar en commit-msg hook
  1. Simular docs warning:
     - `git add apps/backend/src/telegram/AGENTS.md` (si no está staged)
     - `git commit -m "chore: test docs warning" --allow-empty` → debe mostrar warning de docs desactualizados si no se incluyó el AGENTS.md correspondiente
     - `git reset HEAD~1` (limpiar)
  1. Revertir commits de prueba si se hicieron
     Must NOT: hacer push real, modificar código productivo permanentemente
     Parallelization: Wave 3 | Blocked by: 4, 5, 6, 9 | Blocks: —
     References:
  - Todos los archivos creados en todos anteriores
  - `scripts/check-docs-staleness.mjs` (todo 8)
  - `.docs-map.jsonc` (todo 7)
    Acceptance criteria (agent-executable):
  - `test -f .husky/pre-commit && test -x .husky/pre-commit` → exit code 0
  - `test -f .husky/commit-msg && test -x .husky/commit-msg` → exit code 0
  - `test -f .husky/pre-push && test -x .husky/pre-push` → exit code 0
  - `test -f .docs-map.jsonc` → exit code 0
  - `test -f scripts/check-docs-staleness.mjs && test -x scripts/check-docs-staleness.mjs` → exit code 0
  - `git config core.hooksPath` → stdout contiene `.husky`
  - `node scripts/check-docs-staleness.mjs` → exit code 0
  - Commit con mensaje convencional → pasa pre-commit y commit-msg
  - Commit con mensaje inválido → falla en commit-msg
  - Commit sin AGENTS.md correspondiente → muestra warning pero pasa
    QA scenarios:
  - Happy: commitlint acepta mensaje convencional
  - Failure: commitlint rechaza mensaje no-convencional
  - Docs warning: commit sin AGENTS.md → warning visible
  - Evidence: `.omo/evidence/task-10-verify-hooks.log`
    Commit: Y | `chore: configure git hooks with husky`
    Detalle: se commitean `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`,
    `lint-staged.config.js`, `commitlint.config.js`, `.docs-map.jsonc`,
    `scripts/check-docs-staleness.mjs`, `package.json` actualizado

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — Revisar que los 3 hooks + docs check scripts existan y estén ejecutables
- [ ] F2. Code quality review — Revisar lint-staged.config.js, commitlint.config.js, .docs-map.jsonc, y scripts/check-docs-staleness.mjs por errores de sintaxis
- [ ] F3. Real manual QA — Hacer commit con mensaje válido, otro con inválido, y uno con docs warning para verificar los 3 caminos
- [ ] F4. Scope fidelity — Confirmar que no se modificó ESLint, Prettier, ni tsconfig

## Commit strategy

- Commit único al final (todo 10): `chore: configure git hooks with husky`
- Archivos a commitear: `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`, `lint-staged.config.js`, `commitlint.config.js`, `.docs-map.jsonc`, `scripts/check-docs-staleness.mjs`, `package.json`, `package-lock.json`

## Success criteria

- [ ] `test -f .husky/pre-commit && test -x .husky/pre-commit` → exit code 0
- [ ] `test -f .husky/commit-msg && test -x .husky/commit-msg` → exit code 0
- [ ] `test -f .husky/pre-push && test -x .husky/pre-push` → exit code 0
- [ ] `test -f .docs-map.jsonc` → exit code 0
- [ ] `test -f scripts/check-docs-staleness.mjs && test -x scripts/check-docs-staleness.mjs` → exit code 0
- [ ] `git config core.hooksPath` → `.husky`
- [ ] `node scripts/check-docs-staleness.mjs` → exit code 0 (sin staged files)
- [ ] `git commit -m "feat: test message"` con staged docs files → pasa (lint-staged + tsc + commitlint)
- [ ] `git commit -m "feat: test message"` con cambios en telegram/ pero SIN staggear telegram/AGENTS.md → pasa con WARNING de docs desactualizados
- [ ] `git commit -m "invalid message"` → falla en commit-msg
- [ ] `git push` simulado ejecuta `npm test`
- [ ] `npm run docs:check` → exit code 0
- [ ] No hay regresiones en ESLint, Prettier, o TypeScript configs existentes
