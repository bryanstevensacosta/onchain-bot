# mtproto-adapter-modularize - Work Plan

## TL;DR (For humans)

**What you'll get:** Extraer 6 responsabilidades del `TelegramMtprotoListenerAdapter` en clases separadas: `TelegramClientFactory`, `PollingOrchestrator`, `MediaDownloaderService`, `ChannelResolverService`, `MessageMapper`, `ChannelOperationsService`. El adapter queda como thin orchestrator (~400 líneas desde 794).

**Why this approach:** Cada responsabilidad es independiente y testeable. Mantenemos la interfaz `TelegramListenerPort` intacta. Clases TS puras (no @Injectable) para máximo reuse y testabilidad.

**What it will NOT do:** No cambia `TelegramMediaAttachment`, `TelegramRawMessage`, ni las firmas del `TelegramListenerPort`. No rompe tests existentes.

**Effort:** Large
**Risk:** Medium - múltiples archivos tocados, pero sin cambio de interfaz pública

**Decisions to sanity-check:** ¿Cada clase como archivo separado o agrupados en subdirectorio `services/`?

Your next move: approve. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk, 6 services extracted from 794-line adapter

## Scope

### Must have

- Extraer `TelegramClientFactory`: client creation + config
- Extraer `PollingOrchestrator`: polling loop + queue management
- Extraer `MediaDownloaderService`: download + refresh logic
- Extraer `ChannelResolverService`: peer ID resolution
- Extraer `MessageMapper`: raw → TelegramRawMessage mapping
- Extraer `ChannelOperationsService`: metadata + join
- Adapter final ≤400 líneas
- ESLint 0 errors, tests 5/5 pass

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No cambiar `TelegramMediaAttachment` type
- No cambiar `TelegramRawMessage` type
- No cambiar `TelegramListenerPort` interface
- No modificar otros BCs
- No crear nuevos módulos NestJS

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + framework Jest (existing tests)
- Evidence: `.omo/evidence/` for each task

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix

| Todo                       | Depends on | Blocks | Can parallelize with |
| -------------------------- | ---------- | ------ | -------------------- |
| T1: TelegramClientFactory  | -          | T5, T6 | T2, T3, T4           |
| T2: ChannelResolver        | T1         | -      | T1, T3, T4           |
| T3: MessageMapper          | T1         | -      | T1, T2, T4           |
| T4: ChannelOperations      | T1, T2     | -      | T1, T2, T3           |
| T5: PollingOrchestrator    | T1, T2, T3 | T7     | -                    |
| T6: MediaDownloaderService | T1         | T7     | -                    |
| T7: Wire adapter           | T5, T6     | -      | -                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. **T1: TelegramClientFactory**
     What to do: Crear `telegram-mtproto-client.factory.ts` con `ensureClient()`, configuración TelegramClient, sesión StringSession. Extraer ~30 líneas.
     Must NOT: No cambiar configuración de app
     References: `telegram-mtproto-listener.adapter.ts:188-206`
     Acceptance criteria: `npx tsc --noEmit` clean
     Commit: Y | refactor(telegram): extract TelegramClientFactory

- [ ] 2. **T2: ChannelResolverService**
     What to do: Crear `telegram-channel-resolver.service.ts` con `resolvePeerAsChannel()`. ~20 líneas.
     References: `telegram-mtproto-listener.adapter.ts:449-468`
     Acceptance criteria: `npx tsc --noEmit` clean
     Commit: Y | refactor(telegram): extract ChannelResolverService

- [ ] 3. **T3: MessageMapper**
     What to do: Crear `telegram-message-mapper.ts` con mapeo raw → TelegramRawMessage, normalización de entities. ~50 líneas.
     References: `telegram-mtproto-listener.adapter.ts:320-340, 378-392, 430-444`
     Acceptance criteria: `npx tsc --noEmit` clean
     Commit: Y | refactor(telegram): extract MessageMapper

- [ ] 4. **T4: ChannelOperationsService**
     What to do: Crear `telegram-channel-operations.service.ts` con `resolveChannelMetadata()` y `joinChannel()`. ~60 líneas.
     References: `telegram-mtproto-listener.adapter.ts:639-697`
     Acceptance criteria: `npx tsc --noEmit` clean
     Commit: Y | refactor(telegram): extract ChannelOperationsService

- [ ] 5. **T5: PollingOrchestrator**
     What to do: Crear `telegram-polling-orchestrator.ts` con `startPollingLoop()`, queue management, sleep/flood handling. ~85 líneas.
     Must NOT: Depender de adapter instance
     References: `telegram-mtproto-listener.adapter.ts:273-358`
     Acceptance criteria: `npx tsc --noEmit` clean
     Commit: Y | refactor(telegram): extract PollingOrchestrator

- [ ] 6. **T6: MediaDownloaderService**
     What to do: Crear `telegram-media-downloader.service.ts` con download + refresh logic. ~150 líneas.
     Must NOT: Cambiar TelegramMediaAttachment output
     References: `telegram-mtproto-listener.adapter.ts:475-623`
     Acceptance criteria: `npx tsc --noEmit` clean
     Commit: Y | refactor(telegram): extract MediaDownloaderService

- [ ] 7. **T7: Wire adapter**
     What to do: Reescribir `TelegramMtprotoListenerAdapter` para usar los 6 servicios. Inyectar como dependencias. ~180 líneas.
     Must NOT: Cambiar interface TelegramListenerPort
     Acceptance criteria: `npx jest --testPathPatterns="telegram-mtproto-listener|ingestion-coordinator"` pass
     Commit: Y | refactor(telegram): wire 6 services in adapter

- [ ] 8. **T8: Verify**
     What to do: ESLint 0 errors, TypeScript 0 errors, tests 5/5, línea count ≤400
     Commit: N
     Acceptance criteria: todas las verificaciones pasan

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit - verificar cada tarea completada
- [ ] F2. Code quality review - ESLint + tsc
- [ ] F3. Real manual QA - tests pasan
- [ ] F4. Scope fidelity - adapter ≤400 líneas

## Commit strategy

Commits atómicos por cada servicio extraído. Un commit final de "wire all services".

## Success criteria

- Adapter: 794 → ≤400 líneas (-50%)
- 6 nuevos archivos en `telegram/ingestion/shared/api/mtproto/`
- ESLint: 0 errors
- Tests: 5/5 pass
- Interfaz TelegramListenerPort: sin cambios
