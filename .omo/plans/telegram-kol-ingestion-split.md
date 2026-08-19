# telegram-kol-ingestion-split - Work Plan (✅ COMPLETE)

## TL;DR (For humans)

**What you'll get:** Separación completa del motor de ingestión de Telegram (`telegram/ingestion/`) vs la gestión de identidad de KOLs (`kol/identity/`). 14 archivos reorganizados, 6 clases renombradas, 6 archivos externos con imports actualizados. Cero cambios de comportamiento.

**Why this approach:** El BC `kol/ingestion` mezclaba dos responsabilidades ortogonales: (1) transporte MTProto con Telegram (rate limits, sleep window, adapter) y (2) eventos de dominio de KOL (event publisher, domain events). Separarlos físicamente en directorios elimina deuda técnica futura y hace que cada BC dependa solo de lo que necesita.

**What it will NOT do:** No cambia lógica de negocio, no mueve archivos de `token/` ni `shared/`, no renombra KolRepository/KolEventPublisher/KolMessageIngestedEvent/MessageId/InProcessKolEventPublisher, no añade tests nuevos.

**Effort:** Medium (14 files moved/renamed, 6 consumer files updated, 2 modules rewritten)
**Risk:** Medium — refactor masivo de imports; el compilador TypeScript es el guardián
**Decisions to sanity-check:** TelegramIngestionModule se marca @Global() para evitar circular dependency con IdentityModule

Your next move: approve the plan, then `$start-work` to execute.

---

> TL;DR (machine): Medium effort, Medium risk. Extract 10 Telegram-specific files from kol/ingestion → telegram/ingestion with renames; absorb 4 residual files into kol/identity; delete kol/ingestion/. Update 6 consumer files. New TelegramIngestionModule (@Global). 5 sequential waves.

## Scope

### Must have

- 10 archivos movidos de `kol/ingestion/` a `telegram/ingestion/` con los renames especificados
- 4 archivos absorbidos de `kol/ingestion/` a `kol/identity/`
- Nuevo `TelegramIngestionModule` (@Global)
- `IdentityModule` actualizado: nuevos providers, sin importar KolIngestionModule
- 6 archivos externos con imports actualizados
- `kol/ingestion/` eliminado
- Compilación TypeScript exitosa (`npm run build:backend` o `tsc --noEmit`)
- Tests existentes pasan (`npm run test:backend`)
- Lint / format pasan

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO cambiar lógica de negocio en ningún archivo
- NO renombrar: KolRepository, KolEventPublisher, KolMessageIngestedEvent, MessageId, InProcessKolEventPublisher, IngestionSafetyConfig, SleepWindowService, FloodWaitCounterService, IngestionConfigController, IngestionHealthController
- NO mover archivos fuera de kol/ o telegram/
- NO tocar token/, shared/, chain/, dashboard/
- NO crear tests nuevos
- NO cambiar interfaces públicas de módulos (solo paths de importación)
- NO hacer _squash_ de commits — cada todo produce un commit

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (los tests existentes deben seguir pasando)
- Evidence: .omo/evidence/tsc-check.txt, .omo/evidence/test-results.txt

## Execution strategy

### Parallel execution waves

5 waves secuenciales. Cada wave produce un commit compilable.

### Dependency matrix

| Todo                            | Depends on | Blocks | Can parallelize with |
| ------------------------------- | ---------- | ------ | -------------------- |
| 1. telegram/ingestion structure | —          | 2, 3   | —                    |
| 2. Absorb into kol/identity     | —          | 3      | —                    |
| 3. Module wiring                | 1, 2       | 4      | —                    |
| 4. Update external consumers    | 3          | 5      | —                    |
| 5. Cleanup + verify             | 4          | —      | —                    |

## MIGRATION MAP — every class, old vs new

| #   | Old path                                                                   | New path                                                                      | Old class/interface          | New class/interface                 |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- | ----------------------------------- |
| M1  | `kol/ingestion/api/http/ingestion-config.controller.ts`                    | → `telegram/ingestion/api/http/ingestion-config.controller.ts`                | `IngestionConfigController`  | _(sin rename)_                      |
| M2  | `kol/ingestion/api/http/ingestion-health.controller.ts`                    | → `telegram/ingestion/api/http/ingestion-health.controller.ts`                | `IngestionHealthController`  | _(sin rename)_                      |
| M3  | `kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts`                | → `telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts`       | `KolTelegramMtprotoAdapter`  | → `TelegramMtprotoListenerAdapter`  |
| M4  | `kol/ingestion/api/input/start-kol-ingestion.input.ts`                     | → `telegram/ingestion/api/input/start-ingestion.input.ts`                     | `StartKolIngestionInput`     | → `StartIngestionInput`             |
| M5  | `kol/ingestion/application/handlers/start-kol-ingestion.use-case.ts`       | → `kol/ingestion/application/handlers/kol-ingestion-orchestrator.use-case.ts` | `StartKolIngestionUseCase`   | → `KolIngestionOrchestratorUseCase` |
| M6  | `kol/ingestion/domain/ports/kol-listener.port.ts`                          | → `telegram/ingestion/domain/ports/telegram-listener.port.ts`                 | `KolListenerPort`            | → `TelegramListenerPort`            |
| M7  | `kol/ingestion/infrastructure/config/ingestion-safety.config.ts`           | → `telegram/ingestion/infrastructure/config/ingestion-safety.config.ts`       | `IngestionSafetyConfig`      | _(sin rename)_                      |
| M8  | `kol/ingestion/infrastructure/services/flood-wait-counter.service.ts`      | → `telegram/ingestion/infrastructure/services/flood-wait-counter.service.ts`  | `FloodWaitCounterService`    | _(sin rename)_                      |
| M9  | `kol/ingestion/infrastructure/services/sleep-window.service.ts`            | → `telegram/ingestion/infrastructure/services/sleep-window.service.ts`        | `SleepWindowService`         | _(sin rename)_                      |
| M10 | `kol/ingestion/kol-ingestion.module.ts`                                    | → `telegram/ingestion/telegram-ingestion.module.ts`                           | `KolIngestionModule`         | → `TelegramIngestionModule`         |
| A1  | `kol/ingestion/application/ports/kol-event.publisher.ts`                   | → `kol/identity/application/ports/kol-event.publisher.ts`                     | `KolEventPublisher`          | _(sin rename)_                      |
| A2  | `kol/ingestion/domain/events/kol-message-ingested.event.ts`                | → `kol/identity/domain/events/kol-message-ingested.event.ts`                  | `KolMessageIngestedEvent`    | _(sin rename)_                      |
| A3  | `kol/ingestion/domain/value-objects/message-id.vo.ts`                      | → `kol/identity/domain/value-objects/message-id.vo.ts`                        | `MessageId`                  | _(sin rename)_                      |
| A4  | `kol/ingestion/infrastructure/messaging/in-process-kol-event.publisher.ts` | → `kol/identity/infrastructure/messaging/in-process-kol-event.publisher.ts`   | `InProcessKolEventPublisher` | _(sin rename)_                      |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Crear `telegram/ingestion/` con los 10 archivos migrados (M1–M10)
     **What to do / Must NOT do:**
  - Crear el árbol de directorios `telegram/ingestion/{api,application,domain,infrastructure}/` bajo `apps/backend/src/`
  - Copiar cada archivo de `kol/ingestion/` a `telegram/ingestion/` aplicando los renames de clase/archivo según la tabla M1–M10
  - Actualizar TODOS los imports INTERNOS de cada archivo para que apunten a `telegram/ingestion/...` en vez de `kol/ingestion/...` (usando el path alias `telegram/ingestion/` que ya existe en tsconfig)
  - Actualizar imports a `kol/identity/` y `token/` — estos no cambian de path
  - **NO** mover aún los archivos A1–A4 (se harán en Todo 2)
  - **NO** modificar aún los consumidores externos (se harán en Todo 4)
  - **NO** eliminar aún los originales en `kol/ingestion/` (se hará en Todo 5)
    **Precaución:** Validar que el path alias `telegram/ingestion/...` funciona correctamente. Si un import interno usa ruta relativa, debería cambiarse a alias-path (`telegram/ingestion/...`). Preferir alias-path sobre relativos para consistencia con el resto del codebase.

  **Detalle de renames y actualización de imports en cada archivo:**

  | Archivo nuevo                                 | Rename clase                                                        | Cambios de import                                                                                                                                                                  |
  | --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `telegram-ingestion-orchestrator.use-case.ts` | `StartKolIngestionUseCase` → `TelegramIngestionOrchestratorUseCase` | `KolEventPublisher` from `kol/identity/...`; `TelegramListenerPort` from local `telegram/ingestion/...`; `StartIngestionInput` from local; `KolRepository` from `kol/identity/...` |
  | `telegram-mtproto-listener.adapter.ts`        | `KolTelegramMtprotoAdapter` → `TelegramMtprotoListenerAdapter`      | `TelegramListenerPort`, `RawKolMessage`, `ResolvedKolMetadata` from local `telegram-listener.port`                                                                                 |
  | `telegram-listener.port.ts`                   | `KolListenerPort` → `TelegramListenerPort`                          | No external imports (solo define abstract class + interfaces)                                                                                                                      |
  | `start-ingestion.input.ts`                    | `StartKolIngestionInput` → `StartIngestionInput`                    | No imports                                                                                                                                                                         |
  | `ingestion-config.controller.ts`              | _(sin rename)_                                                      | `IngestionSafetyConfig` from local                                                                                                                                                 |
  | `ingestion-health.controller.ts`              | _(sin rename)_                                                      | `IngestionSafetyConfig`, `SleepWindowService`, `FloodWaitCounterService` from local                                                                                                |
  | `ingestion-safety.config.ts`                  | _(sin rename)_                                                      | No imports                                                                                                                                                                         |
  | `sleep-window.service.ts`                     | _(sin rename)_                                                      | `IngestionSafetyConfig` from local                                                                                                                                                 |
  | `flood-wait-counter.service.ts`               | _(sin rename)_                                                      | No imports                                                                                                                                                                         |
  | `telegram-ingestion.module.ts`                | `KolIngestionModule` → `TelegramIngestionModule`                    | Todos los providers de telegram/ingestion + import `IdentityModule`                                                                                                                |

  **Estructura final de telegram/ingestion (sin orquestador — es puro motor):**

  ```
  apps/backend/src/telegram/ingestion/
  ├── api/
  │   ├── http/
  │   │   ├── ingestion-config.controller.ts
  │   │   └── ingestion-health.controller.ts
  │   ├── mtproto/
  │   │   └── telegram-mtproto-listener.adapter.ts
  │   └── input/
  │       └── start-ingestion.input.ts
  ├── domain/
  │   └── ports/
  │       └── telegram-listener.port.ts
  └── infrastructure/
      ├── config/
      │   └── ingestion-safety.config.ts
      └── services/
          ├── flood-wait-counter.service.ts
          └── sleep-window.service.ts
  ```

  **IMPORTANTE:** `telegram/ingestion/` NO tiene carpeta `application/` — el orquestador NO vive aquí. Vive en `kol/ingestion/application/handlers/` como `KolIngestionOrchestratorUseCase` (el bridge entre Telegram y KOLs).

  **Parallelization:** Wave 1 | Blocked by: — | Blocks: 3, 4, 5
  **References (executor has NO interview context):**
  - Source files: `apps/backend/src/kol/ingestion/api/http/ingestion-config.controller.ts`, `.../ingestion-health.controller.ts`, `.../api/mtproto/kol-telegram-mtproto.adapter.ts`, `.../api/input/start-kol-ingestion.input.ts`, `.../application/handlers/start-kol-ingestion.use-case.ts`, `.../domain/ports/kol-listener.port.ts`, `.../infrastructure/config/ingestion-safety.config.ts`, `.../infrastructure/services/flood-wait-counter.service.ts`, `.../infrastructure/services/sleep-window.service.ts`, `.../kol-ingestion.module.ts`
  - Tsconfig: `apps/backend/tsconfig.json:21` (alias `telegram/*` ya existe)
  - Migration map: tabla M1–M10 en este plan
    **Acceptance criteria (agent-executable):**
  - Cada archivo destino existe con el contenido correcto y las clases/imports actualizados
  - `grep -r "kol/ingestion" apps/backend/src/telegram/` → 0 resultados (no quedan imports viejos en los archivos nuevos)
  - `grep -r "StartKolIngestionUseCase\|KolTelegramMtprotoAdapter\|KolListenerPort\|StartKolIngestionInput" apps/backend/src/telegram/` → 0 resultados (clases viejas renombradas)
    **QA:**
  - Happy: `ls apps/backend/src/telegram/ingestion/**/*.ts` verifica los 10 archivos
  - Failure: `grep -r "from 'kol/ingestion" apps/backend/src/telegram/` → debe dar 0 matches (ningún import residual apuntando al path viejo)
    **Commit:** Y | `refactor(kol-ingestion): create telegram/ingestion/ with 10 migrated files (M1-M10)`

- [x] 2. Absorber archivos residuales de `kol/ingestion` en `kol/identity` (A1–A4)
     **What to do / Must NOT do:**
  - Mover (cut+paste) los 4 archivos A1–A4 de `kol/ingestion/` a sus nuevas ubicaciones en `kol/identity/`:
    - `kol/ingestion/application/ports/kol-event.publisher.ts` → `kol/identity/application/ports/kol-event.publisher.ts`
    - `kol/ingestion/infrastructure/messaging/in-process-kol-event.publisher.ts` → `kol/identity/infrastructure/messaging/in-process-kol-event.publisher.ts`
    - `kol/ingestion/domain/events/kol-message-ingested.event.ts` → `kol/identity/domain/events/kol-message-ingested.event.ts`
    - `kol/ingestion/domain/value-objects/message-id.vo.ts` → `kol/identity/domain/value-objects/message-id.vo.ts`
  - Actualizar imports en `in-process-kol-event.publisher.ts`: `import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher'`
  - Los otros 3 archivos solo importan de `shared/kernel/` — sus imports no cambian
  - **NO** eliminar los originales de `kol/ingestion/` aún (se hará en Todo 5)
  - **NO** cambiar nombres de clase (A1–A4 no se renombran)
    **Parallelization:** Wave 1 | Blocked by: — | Blocks: 3, 4, 5
    **References:**
  - Source: `kol/ingestion/application/ports/kol-event.publisher.ts`, `.../infrastructure/messaging/in-process-kol-event.publisher.ts`, `.../domain/events/kol-message-ingested.event.ts`, `.../domain/value-objects/message-id.vo.ts`
  - Migration map: tabla A1–A4
    **Acceptance criteria:** Los 4 archivos existen en sus nuevas ubicaciones en `kol/identity/`. `in-process-kol-event.publisher.ts` importa `KolEventPublisher` desde `kol/identity/application/ports/...`
    **QA:**
  - Happy: `ls apps/backend/src/kol/identity/application/ports/kol-event.publisher.ts` y los otros 3 existen
  - Failure: `grep "from 'kol/ingestion" apps/backend/src/kol/identity/infrastructure/messaging/in-process-kol-event.publisher.ts` → 0 (import actualizado)
    **Commit:** Y | `refactor(kol-ingestion): absorb 4 residual files into kol/identity (A1-A4)`

- [x] 3. Wire modules: TelegramIngestionModule, IdentityModule, AppModule
     **What to do / Must NOT do:**
     **3a. `telegram/ingestion/telegram-ingestion.module.ts`:**
  - Crear `TelegramIngestionModule` DECORADO CON `@Global()`
  - Importar `IdentityModule` (para obtener `KolRepository` + `KolEventPublisher`)
  - Importar `ExtractionModule` y `ParsingModule` (los necesita el use case)
  - Importar `TypeOrmModule.forFeature([KolEntity])` condicional (si `DATABASE_ENABLED`)
  - Proveer: `TelegramIngestionOrchestratorUseCase`, `{ provide: TelegramListenerPort, useClass: TelegramMtprotoListenerAdapter }`, `IngestionSafetyConfig`, `SleepWindowService`, `FloodWaitCounterService`
  - Controladores: `IngestionConfigController`, `IngestionHealthController`
  - Exportar: `TelegramIngestionOrchestratorUseCase`, `TelegramListenerPort`, `IngestionSafetyConfig`
  - **NO** proveer `KolRepository` ni `KolEventPublisher` aquí — vienen de `IdentityModule`

  **3b. `kol/identity/identity.module.ts`:**
  - REMOVER: `import { KolIngestionModule } from 'kol/ingestion/kol-ingestion.module'`
  - REMOVER: `KolIngestionModule` de `imports: [...]`
  - AÑADIR providers: `KolEventPublisher` (con `useClass: InProcessKolEventPublisher`), `InProcessKolEventPublisher`
  - AÑADIR exports: `KolEventPublisher`
  - Mantener proveeduría de `KolRepository` (ya existe y se queda)
  - Mantener export de `KolRepository` (ya existe y se queda)
  - **NO** importar `TelegramIngestionModule` aquí — es @Global, AppModule lo importa

  **3c. `apps/backend/src/app.module.ts`:**
  - AÑADIR: `import { TelegramIngestionModule } from 'telegram/ingestion/telegram-ingestion.module'`
  - AÑADIR: `TelegramIngestionModule` en `imports: [...]`

  **Parallelization:** Wave 2 | Blocked by: 1, 2 | Blocks: 4, 5
  **References:**
  - `apps/backend/src/kol/ingestion/kol-ingestion.module.ts` (modelo para el nuevo módulo)
  - `apps/backend/src/kol/identity/identity.module.ts`
  - `apps/backend/src/app.module.ts`
    **Acceptance criteria:**
  - `TelegramIngestionModule` existe con `@Global()` y los providers correctos
  - `IdentityModule` no importa `KolIngestionModule` y provee `KolEventPublisher`
  - `AppModule` importa `TelegramIngestionModule`
    **QA:**
  - Happy: `grep "@Global" apps/backend/src/telegram/ingestion/telegram-ingestion.module.ts` → match
  - Happy: `grep "KolIngestionModule" apps/backend/src/kol/identity/identity.module.ts` → 0 (eliminado)
  - Happy: `grep "TelegramIngestionModule" apps/backend/src/app.module.ts` → match
    **Commit:** Y | `refactor(kol-ingestion): wire TelegramIngestionModule (@Global), update IdentityModule and AppModule`

- [x] 4. Actualizar imports en los 6 archivos consumidores externos
     **What to do / Must NOT do:**
     Actualizar imports en estos archivos (NO cambiar lógica, SOLO paths + nombres de clase):
  1. **`kol/identity/api/http/kol.controller.ts`** (line 6):
     - `import { StartKolIngestionUseCase } from 'kol/ingestion/application/handlers/start-kol-ingestion.use-case'`
     - → `import { TelegramIngestionOrchestratorUseCase } from 'telegram/ingestion/application/handlers/telegram-ingestion-orchestrator.use-case'`
     - Actualizar tipo del parámetro `startListening: StartKolIngestionUseCase` → `startListening: TelegramIngestionOrchestratorUseCase`
  1. **`kol/identity/infrastructure/seeders/kol.seeder.ts`** (lines 6, 10):
     - `import { StartKolIngestionUseCase } from 'kol/ingestion/application/handlers/start-kol-ingestion.use-case'`
     - → `import { TelegramIngestionOrchestratorUseCase } from 'telegram/ingestion/application/handlers/telegram-ingestion-orchestrator.use-case'`
     - `import { KolListenerPort } from 'kol/ingestion/domain/ports/kol-listener.port'`
     - → `import { TelegramListenerPort } from 'telegram/ingestion/domain/ports/telegram-listener.port'`
     - Actualizar tipos: `startListening: StartKolIngestionUseCase` → `startListening: TelegramIngestionOrchestratorUseCase`, `listener: KolListenerPort` → `listener: TelegramListenerPort`
  1. **`shared/common/dev-backfill.hook.ts`** (line 5):
     - `import { StartKolIngestionUseCase } from 'kol/ingestion/application/handlers/start-kol-ingestion.use-case'`
     - → `import { TelegramIngestionOrchestratorUseCase } from 'telegram/ingestion/application/handlers/telegram-ingestion-orchestrator.use-case'`
     - Actualizar tipo: `ingestion: StartKolIngestionUseCase` → `ingestion: TelegramIngestionOrchestratorUseCase`
  1. **`kol/identity/domain/entities/kol.entity.ts`** (line 6):
     - `import { KolMessageIngestedEvent } from 'kol/ingestion/domain/events/kol-message-ingested.event'`
     - → `import { KolMessageIngestedEvent } from 'kol/identity/domain/events/kol-message-ingested.event'`
       (Nota: class name NO cambia, solo el path)
  1. **`kol/identity/application/handlers/register-kol.use-case.ts`** (line 12):
     - `import { KolEventPublisher } from 'kol/ingestion/application/ports/kol-event.publisher'`
     - → `import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher'`
       (Nota: class name NO cambia, solo el path)
  1. **`kol/identity/identity.module.ts`** (ya actualizado en Todo 3b — pero verificar):
     - No debe importar `KolIngestionModule`

  **Parallelization:** Wave 3 | Blocked by: 3 | Blocks: 5
  **References:**
  - Cada archivo listado arriba con su línea exacta
  - Migration map: todos los renames clase+path
    **Acceptance criteria:**
  - `grep -r "from 'kol/ingestion" apps/backend/src/kol/ apps/backend/src/shared/` → 0 matches (ningún import residual)
  - `grep -r "StartKolIngestionUseCase\|KolListenerPort\|StartKolIngestionInput" apps/backend/src/` → 0 matches (clases viejas no referenciadas desde ningún sitio, excepto quizás las definiciones originales que se borrarán en Todo 5)
  - El único lugar donde puede quedar `kol/ingestion` es en los archivos ORIGINALES (que se borran en Todo 5)
    **QA:**
  - Failure: `grep -r "from 'kol/ingestion" apps/backend/src/kol/ apps/backend/src/shared/` → 0
  - Happy: los 6 archivos existen y los imports apuntan a las nuevas ubicaciones
    **Commit:** Y | `refactor(kol-ingestion): update imports in 6 external consumer files`

- [x] 5. Eliminar `kol/ingestion/` + README + verificación final
     **What to do / Must NOT do:**
  - Verificar que NO queda ningún import apuntando a `kol/ingestion/` desde fuera del propio directorio:
    ```bash
    grep -r "from 'kol/ingestion" apps/backend/src/ --include="*.ts" | grep -v "kol/ingestion/" || echo "OK - no external imports"
    ```
  - Si queda algún import externo, detenerse y reportarlo (no borrar hasta resolver)
  - **README.md**: Actualizar o reemplazar `apps/backend/src/kol/ingestion/README.md` (que quedó huérfano) con contenido actualizado. Crear dos README:
    1. `telegram/ingestion/README.md` — describe el nuevo BC de ingestión Telegram (listener MTProto, safety config, orquestador)
    2. Opcional: actualizar `kol/identity/README.md` para reflejar que ahora también aloja `KolEventPublisher`, `KolMessageIngestedEvent`, `MessageId`
  - Eliminar TODO el directorio `kol/ingestion/`:
    ```bash
    rm -rf apps/backend/src/kol/ingestion
    ```
  - Verificar compilación:
    ```bash
    cd apps/backend && npx tsc --noEmit 2>&1
    ```
    Guardar resultado en `.omo/evidence/tsc-check.txt`
  - Ejecutar tests:
    ```bash
    cd apps/backend && npm test 2>&1
    ```
    Guardar resultado en `.omo/evidence/test-results.txt`
  - Ejecutar lint:
    ```bash
    cd apps/backend && npx eslint src/kol/ src/telegram/ 2>&1
    ```
  - **NO** reintroducir accidentalmente archivos viejos
  - **NO** dejar directorios vacíos residuals en `kol/identity/` (ej. `application/ports/` tiene otros archivos, seguirá existiendo)
    **Parallelization:** Wave 4 | Blocked by: 4 | Blocks: —
    **References:**
  - Todos los todos anteriores
  - `apps/backend/tsconfig.json`
  - `apps/backend/package.json` (scripts de build/test)
    **Acceptance criteria:**
  - `ls apps/backend/src/kol/ingestion 2>&1` → `No such file or directory` (directorio eliminado)
  - `npx tsc --noEmit` → exit code 0 (compilación limpia)
  - `npm test` → exit code 0 (tests pasan)
  - `grep -r "kol/ingestion" apps/backend/src/ --include="*.ts"` → 0 matches en todo el codebase
    **QA:**
  - Happy: compilación + tests pasan
  - Failure: `ls apps/backend/src/kol/ingestion 2>&1` devuelve error de "no such file"
    **Commit:** Y | `refactor(kol-ingestion): delete kol/ingestion/ directory and verify compilation`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. **Plan compliance audit** — (✓ kol/ingestion deleted, telegram/ingestion exists with 10 files, kol/identity absorbed 4 files)
- [x] F2. **Code quality review** — (✓ tsc passes, tests pass)
- [x] F3. **Real manual QA** — (✓ /ingestion/health returns 200, /ingestion/config returns 200)
- [x] F4. **Scope fidelity** — (✓ solo imports y renames, zero logic changes)

## Commit strategy

1. `refactor(kol-ingestion): create telegram/ingestion/ with 10 migrated files (M1-M10)`
2. `refactor(kol-ingestion): absorb 4 residual files into kol/identity (A1-A4)`
3. `refactor(kol-ingestion): wire TelegramIngestionModule (@Global), update IdentityModule and AppModule`
4. `refactor(kol-ingestion): update imports in 6 external consumer files`
5. `refactor(kol-ingestion): delete kol/ingestion/ directory and verify compilation`

No squash. Cada commit debe compilar de forma independiente (verificar con `tsc --noEmit` antes de cada commit).

## Success criteria

1. `rm -rf apps/backend/src/kol/ingestion` ejecutado exitosamente
2. `npx tsc --noEmit` en backend → exit 0
3. `npm run test:backend` → exit 0, todos los tests pasan
4. `grep -r "kol/ingestion" apps/backend/src/ --include="*.ts"` → 0 matches
5. `ls apps/backend/src/kol/ingestion 2>&1` → error "No such file"
6. La app arranca y responde en los endpoints de KOL y health
