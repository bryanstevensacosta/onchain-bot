# Fix Dashboard API Endpoints (Publishing Path Mismatch)

## TL;DR

> **Quick Summary**: Corregir los paths de los endpoints de publishing en el frontend. El frontend usa `/telegram/publishing/...` pero el backend sirve en `/telegram-publishing/...` (hyphen vs slash). Esto causa que todas las llamadas de publishing devuelvan 404 y el dashboard muestre datos vacíos en la tarjeta "Published".
>
> **Deliverables**:
> - 4 paths corregidos en `apps/frontend/src/shared/api/endpoints.ts`
> - Verificación de que cada endpoint responde 200
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential (1 tarea)
> **Critical Path**: Task 1 (única tarea)

---

## Context

### Original Request
El usuario reportó que el dashboard muestra todo vacío (0/0 KOLs, 0 calls, 0% approval rate, 0 published). Pidió investigar si los endpoints de API son correctos.

### Interview Summary
**Investigación realizada**:
- Se compararon los paths del frontend (`endpoints.ts`) vs los controladores del backend
- Se verificó cada endpoint con `curl` directo contra `localhost:3030`
- Se confirmó que el backend tiene datos reales (45 KOLs en Postgres, 1 canonical call, 1 rejected decision)

**Hallazgos clave**:
- **Único error confirmado**: Los 4 endpoints de publishing tienen el path incorrecto
- Frontend: `/telegram/publishing/...` → Backend: `@Controller('telegram-publishing')` → 404
- KOLs, filters, normalization endpoints funcionan correctamente (200)
- El endpoint `/dashboard/kpis` existe y devuelve KPIs agregados pero el frontend no lo usa

### Metis Review
No disponible (error de autenticación). Gap analysis manual aplicado.

---

## Work Objectives

### Core Objective
Corregir los paths de los endpoints de publishing en el frontend para que coincidan con las rutas del backend.

### Concrete Deliverables
- `apps/frontend/src/shared/api/endpoints.ts` — 4 paths corregidos

### Definition of Done
- [ ] `curl http://localhost:3030/telegram-publishing/calls/published` → 200
- [ ] `curl http://localhost:3030/telegram-publishing/calls/failed` → 200
- [ ] `curl http://localhost:3030/telegram-publishing/calls/recent` → 200

### Must Have
- Corrección del path en `ENDPOINTS.publishing.published`
- Corrección del path en `ENDPOINTS.publishing.failed`
- Corrección del path en `ENDPOINTS.publishing.recent`
- Corrección del path en `ENDPOINTS.publishing.byToken`

### Must NOT Have (Guardrails)
- NO cambiar ningún controlador del backend
- NO modificar otras entidades o widgets del frontend
- NO renombrar keys del objeto ENDPOINTS (solo los valores de string)
- NO tocar el endpoint `/dashboard/kpis` (optimización separada, no un bug)
- NO agregar ni quitar líneas del archivo — solo cambiar los strings de path

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (frontend uses TanStack Query, but no dedicated tests for endpoints)
- **Automated tests**: None — verification via curl commands
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status 200

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — única tarea):
├── Task 1: Fix publishing endpoint paths in endpoints.ts

Wave FINAL:
├── Task F1: Plan compliance audit
```

---

## TODOs

- [ ] 1. Fix publishing endpoint paths in `endpoints.ts`

  **What to do**:
  - En `apps/frontend/src/shared/api/endpoints.ts`, cambiar los 4 paths de publishing:
    - `'/telegram/publishing/calls/published'` → `'/telegram-publishing/calls/published'`
    - `'/telegram/publishing/calls/failed'` → `'/telegram-publishing/calls/failed'`
    - `'/telegram/publishing/calls/recent'` → `'/telegram-publishing/calls/recent'`
    - `'/telegram/publishing/calls/${chain}/${address}'` → `'/telegram-publishing/calls/${chain}/${address}'`
  - No cambiar nada más en el archivo
  - Verificar que el archivo sigue siendo sintácticamente válido (TypeScript)

  **Must NOT do**:
  - No cambiar las keys del objeto ENDPOINTS
  - No modificar otros endpoints (kols, filters, normalization, etc.)
  - No modificar las funciones fetch ni los hooks

  **Recommended Agent Profile**:
  - **Category**: `quick` — cambio trivial, 1 archivo, patrón claro de find-and-replace
  - **Skills**: [] — no se necesitan skills especializados

  **Parallelization**:
  - **Can Run In Parallel**: NO (única tarea)
  - **Blocks**: Task F1
  - **Blocked By**: None

  **References**:
  - `apps/frontend/src/shared/api/endpoints.ts:9-16` — Objeto `ENDPOINTS.publishing` con los 4 paths incorrectos
  - `apps/backend/src/telegram-publishing/api/http/publishing.controller.ts:8` — `@Controller('telegram-publishing')` confirmando el path correcto

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Published endpoint returns 200 after fix
    Tool: Bash (curl)
    Preconditions: Backend running on localhost:3030
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/telegram-publishing/calls/published
    Expected Result: HTTP status 200
    Failure Indicators: Any status other than 200 (especially 404)
    Evidence: .sisyphus/evidence/task-1-published-200.txt

  Scenario: Failed endpoint returns 200 after fix
    Tool: Bash (curl)
    Preconditions: Backend running on localhost:3030
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/telegram-publishing/calls/failed
    Expected Result: HTTP status 200
    Failure Indicators: Any status other than 200 (especially 404)
    Evidence: .sisyphus/evidence/task-1-failed-200.txt

  Scenario: Recent endpoint returns 200 after fix
    Tool: Bash (curl)
    Preconditions: Backend running on localhost:3030
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/telegram-publishing/calls/recent
    Expected Result: HTTP status 200
    Failure Indicators: Any status other than 200 (especially 404)
    Evidence: .sisyphus/evidence/task-1-recent-200.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-published-200.txt` — HTTP status code
  - [ ] `.sisyphus/evidence/task-1-failed-200.txt` — HTTP status code
  - [ ] `.sisyphus/evidence/task-1-recent-200.txt` — HTTP status code

  **Commit**: YES
  - Message: `fix(frontend): correct publishing endpoint paths (slash → hyphen)`
  - Files: `apps/frontend/src/shared/api/endpoints.ts`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify Task 1 deliverables are complete. Check `endpoints.ts` for all 4 corrected paths. Run curl commands to confirm 200 status. Verify no other files were modified.
  Output: `Tasks [1/1] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **1**: `fix(frontend): correct publishing endpoint paths (slash → hyphen)` - `apps/frontend/src/shared/api/endpoints.ts`

---

## Success Criteria

### Verification Commands
```bash
# Verify each endpoint returns 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/telegram-publishing/calls/published
curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/telegram-publishing/calls/failed
curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/telegram-publishing/calls/recent
```

### Final Checklist
- [ ] All 4 publishing paths use hyphen (`/telegram-publishing/...`) not slash (`/telegram/publishing/...`)
- [ ] All 3 curl verification commands return 200
- [ ] No other files modified
