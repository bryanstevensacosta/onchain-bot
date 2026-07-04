# reduce-log-noise - Work Plan

## TL;DR (For humans)

**What you'll get:** Los logs del backend pasan de 800 chars por línea (con headers HTTP completos) a ~50 chars limpios con solo method, url, statusCode y responseTime. El health check `/api/health` deja de aparecer en los logs. Los logs de aplicación y errores existentes no se tocan.

**Why this approach:** Usar los `serializers` nativos de `pino-http` es la forma más limpia y con menos fricción — no requiere middlewares custom, no rompe la correlación de request IDs, y la reducción de ruido es inmediata.

**What it will NOT do:** No toca el frontend, no cambia el `FilteredBootstrapLogger`, no elimina logs de aplicación ni de errores, no cambia el nivel de log (solo el formato de los "request completed" entries), no afecta producción ni el file logging rotado.

**Effort:** Quick
**Risk:** Low — cambio puramente cosmético en serializers, sin efecto en lógica de negocio
**Decisions to sanity-check:** Ninguna — todas las decisiones fueron tomadas en la fase de planning.

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Quick | Low | 1 file edit to reduce pino-http log verbosity via custom serializers + autoLogging.ignore for /api/health

## Scope

### Must have

- Modificar `apps/backend/src/app.module.ts` para agregar `serializers.req` (devuelve solo `{ id, method, url }`) y `serializers.res` (devuelve solo `{ statusCode }`)
- Reemplazar `autoLogging: true` con `autoLogging: { ignore: (req) => req.url === '/api/health' }`
- Agregar `serializers.err: pino.stdSerializers.err` al config
- Verificar que el backend arranca sin errores
- Verificar que los logs de request son significativamente más cortos

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO cambiar ningún otro archivo que no sea `apps/backend/src/app.module.ts`
- NO modificar `FilteredBootstrapLogger` ni ningún otro logger
- NO modificar el frontend
- NO cambiar el nivel de log (`logCfg.level`)
- NO cambiar `transport` ni `pino-pretty`/`pino-roll` config
- NO eliminar el request `id` de los serializers (necesario para correlación)
- NO añadir nuevas dependencias

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + manual log inspection
- Evidence: `.omo/evidence/task-1-reduce-log-noise.log`

## Execution strategy

### Parallel execution waves

El plan es de 1 solo todo (1 file change + verification). Sin waves paralelas.

### Dependency matrix

| Todo                                   | Depends on | Blocks | Can parallelize with |
| -------------------------------------- | ---------- | ------ | -------------------- |
| 1. Modify LoggerModule config + verify | —          | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Modify LoggerModule pinoHttp config to reduce log verbosity
     What to do / Must NOT do:
  - In `apps/backend/src/app.module.ts`:
    1. Add `import pino from 'pino';` at the top
    2. Change `autoLogging: true` to `autoLogging: { ignore: (req: { url: string }) => req.url === '/api/health' }`
    3. Add `serializers` property inside `pinoHttp`:
       ```typescript
       serializers: {
         req(req: { method: string; url: string; id: unknown }) {
           return { method: req.method, url: req.url, id: req.id };
         },
         res(res: { statusCode: number }) {
           return { statusCode: res.statusCode };
         },
         err: pino.stdSerializers.err,
       },
       ```
  - MUST NOT: Remove or change `level`, `transport`, or any other existing config keys
  - MUST NOT: Use `as any` or `@ts-expect-error` to bypass types
  - MUST NOT: Change the `FilteredBootstrapLogger` or any other file
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References:
  - `apps/backend/src/app.module.ts:56-90` — current LoggerModule factory
  - `apps/backend/src/health/health.controller.ts:11-15` — health route path (`/api/health`)
  - pino-http docs: autoLogging.ignore signature `(req: IncomingMessage) => boolean`
  - pino-http docs: custom serializers retain request id when included
    Acceptance criteria (agent-executable):
  1. `npx tsc --noEmit -p apps/backend/tsconfig.json` passes (no type errors)
  2. Backend starts without errors: `npm run dev:backend-only` (Ctrl+C after 5s)
  3. A request to `GET /api/health` does NOT produce a "request completed" log line
  4. A request to any other endpoint (e.g. `GET /`) produces a log line with ONLY `{ id, method, url }` in req and `{ statusCode }` in res — no headers
     QA scenarios (name the exact tool + invocation):
  - Happy: Start backend, `curl http://localhost:3030/api/health`, check stdout does NOT contain "request completed" for that path. Then `curl http://localhost:3030/`, check the log line has `"method":"GET","url":"/"` and `"statusCode":200` but NO `"headers"` field.
  - Failure: Verify `npx tsc --noEmit -p apps/backend/tsconfig.json` exit code 0 before even starting.
  - Evidence: `.omo/evidence/task-1-reduce-log-noise.log` — capture the curl output and the trimmed log lines.
    Commit: Y | `chore(backend): reduce pino-http log verbosity with custom serializers`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify only `apps/backend/src/app.module.ts` was changed, no other files
- [ ] F2. Code quality review — no `any`, no `@ts-expect-error`, existing config keys preserved
- [ ] F3. Real manual QA — start backend, `curl` health + regular endpoint, confirm log format is clean
- [ ] F4. Scope fidelity — no frontend changes, no FilteredBootstrapLogger changes

## Commit strategy

1 commit:

```
chore(backend): reduce pino-http log verbosity with custom serializers

- Replace autoLogging: true with autoLogging.ignore for /api/health
- Add serializers.req returning only { id, method, url }
- Add serializers.res returning only { statusCode }
- Add serializers.err via pino.stdSerializers.err
```

## Success criteria

- [ ] Backend compila sin errores de tipo
- [ ] Backend arranca correctamente
- [ ] `GET /api/health` no genera "request completed" log
- [ ] Las demás requests muestran solo method, url, statusCode, responseTime — sin headers
- [ ] No se modificó ningún archivo fuera de `apps/backend/src/app.module.ts`
- [ ] El commit sigue conventional commits
