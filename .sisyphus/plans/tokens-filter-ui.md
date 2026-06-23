# Work Plan: Agregar Filtro Published/Rejected a /tokens

## TL;DR

> **Quick Summary**: Agregar selector de filtro en la página Tokens Explorer para mostrar tokens Approved (Published) vs Rejected.

> **Deliverables**:
> - Selector de tabs/filtro en la página `/tokens`
> - Mostrar decisiones de filtro (no tokens canónicos)
> - Indicador visual de estado (APPROVED/REJECTED)

> **Estimated Effort**: Short
> **Parallel Execution**: NO (tarea secuencial simple)
> **Critical Path**: UI → Pruebas → Verificación

---

## Context

### Original Request
Usuario quiere ver filtro "Published/Rejected" en `http://localhost:5173/tokens` para entender qué tokens se publican y cuáles se rechazan.

### Interview Summary
**Key Discussions**:
- "Calls" = Smart contract calls
- Estados se determinan automáticamente (no manualmente)

**Research Findings**:
- Backend YA tiene endpoints: `/token/token-gating/decisions/approved` y `/token/token-gating/decisions/rejected`
- Frontend YA tiene los queries y hooks: `useApproved()`, `useRejected()`, `useRecentDecisions()`
- La página actual usa `useRecentCanonical()` que muestra tokens sin filtrar

### Metis Review
**Identified Gaps** (addressed):
- Ninguno - todo el backend y lógica existen

---

## Work Objectives

### Core Objective
Agregar filtro UI en `/tokens` para ver tokens Published (APPROVED) vs Rejected.

### Concrete Deliverables
1. Selector de filtro UI con opciones: "All", "Approved", "Rejected"
2. Cambiar data source de `useRecentCanonical` a `useRecentDecisions`
3. Mostrar el campo `verdict` y `reasons` en cada row
4. Badge visual según estado (verde=APPROVED, rojo=REJECTED)

### Definition of Done
- [x] Selector visible en página `/tokens`
- [x] Click en "Approved" muestra tokens approveados
- [x] Click en "Rejected" muestra tokens rechazados
- [x] Cada token muestra su verdict (badge)
- [x] Si Rejected, mostrar razón del rechazo

### Must Have
- Filtro funcional que llame a los endpoints correctos
- Feedback visual claro del estado

### Must NOT Have (Guardrails)
- No cambiar la lógica de negocio (ya existe)
- No modificar el backend (ya funciona)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: NO (UI manual verification)
- **Framework**: N/A
- **Agent-Executed QA**: Usaré Playwright para verificar UI

### QA Policy
Verificación manual del filtro usando navegador.

---

## Execution Strategy

### Wave 1 (Única - tareas pequeñas)

```
Tarea 1: Agregar estado de filtro al componente
Tarea 2: Importar hooks de filter-decision
Tarea 3: Crear UI del selector (Tabs)
Tarea 4: Renderizar decisions con badge de estado
Tarea 5: Mostrar razones si Rejected
```

---

## TODOs

- [x] 1. Agregar estado de filtro y selector UI en TokensExplorerPage

  **What to do**:
  - Agregar estado local: `filter: 'all' | 'approved' | 'rejected'`
  - Crear componente de Tabs para seleccionar filtro
  - Estilizar con Tailwind existente

  **Must NOT do**:
  - No modificar backend

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI simple, componentes React
  - **Skills**: []
    - skill-1: [Why needed]
  - **Skills Evaluated but Omitted**:
    - skill: [Why omitted]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `apps/frontend/src/pages/tokens-explorer/index.tsx` - Componente actual a modificar
  - `apps/frontend/src/entities/filter-decision/model/use-decisions.ts` - Hooks existentes
  - `apps/frontend/src/entities/filter-decision/model/types.ts` - Tipos (verdict, reasons)
  - `apps/frontend/src/shared/ui` - Componentes UI existentes (Badge)

  **Acceptance Criteria**:

  - [ ] Selector de 3 opciones visible en header de página
  - [ ] Al hacer click en opción, cambia el query ejecutado

  **QA Scenarios**:

  ```
  Scenario: Mostrar filtro Approved
    Tool: Playwright
    Preconditions: Ninguna
    Steps:
      1. Navegar a http://localhost:5173/tokens
      2. Click en tab "Approved"
    Expected Result: Se muestran tokens con badge verde APPROVED

  Scenario: Mostrar filtro Rejected
    Tool: Playwright
    Preconditions: Ninguna
    Steps:
      1. Navegar a http://localhost:5173/tokens
      2. Click en tab "Rejected"
    Expected Result: Se muestran tokens con badge rojo REJECTED + razón
  ```

  **Evidence to Capture**:
  - [ ]Screenshot de la página con filtro activo

  **Commit**: YES
  - Message: `feat(tokens): add published/rejected filter UI`
  - Files: `apps/frontend/src/pages/tokens-explorer/index.tsx`

---

## Final Verification Wave

- [ ] F1. **UI Rendering** — Verificar que el filtro aparece y funciona
  - Navegar a /tokens
  - Verificar 3 tabs visibles
  - Click en cada uno y verificar cambio de data

- [ ] F2. **Verdict Display** — Badge de APPROVED/Rejected visible
  - Tokens approveados muestran badge verde
  - Tokens rechazados muestran badge rojo + razón

---

## Success Criteria

### Verification Commands
```bash
# Iniciar frontend
npm run dev:frontend

# Verificar en navegador
# http://localhost:5173/tokens
# - Ver selector de filtro
# - Click Approved → muestra decisiones approveadas
# - Click Rejected → muestra decisiones rechazadas con razón
```

### Final Checklist
- [x] Filtro UI visible en /tokens
- [x] 3 opciones: All, Approved, Rejected
- [x] Data viene de endpoints correctos
- [x] Badge visual según verdict
- [x] Razón de rechazo visible