# compound-group-ui - Work Plan

## TL;DR (For humans)

**What you'll get:** Agregar un dropdown para seleccionar/crear "Compound Groups" al crear o editar frases de blacklist/keywords. Permite crear un grupo una vez y agregar múltiples frases a ese grupo.

**Why this approach:** El problema actual es que cada frase compound gets un UUID aleatorio nuevo. La solución es dar al usuario un dropdown para elegir a qué grupo pertenece, o crear uno nuevo con nombre.

**What it will NOT do:** No cambia la lógica del backend - solo la UI.

**Effort:** Medium (2-3 tareas)
**Risk:** Low

---

## Scope

### Must have

- Agregar dropdown "Compound Group" en el modal de crear/editar frase
- El dropdown muestra: "None" + lista de grupos existentes + opción "Create New Group"
- "Create New Group" abre un campo para nombre del grupo
- Guardar el nombre del grupo junto con el andGroupId (o usar el andGroupId como identificador)

### Must NOT have

- No modificar backend (el campo andGroupId ya existe)
- No romper funcionalidad existente

## Verification strategy

- Test decision: tests-after
- Evidence: .omo/evidence/task-1-compound-group-ui.md

## Execution strategy

- 2 waves

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | -          | 2      | -                    |
| 2    | 1          | -      | -                    |

## Todos

- [ ] 1. Agregar estado y UI para Compound Group selector en el modal
     What to do: En blacklist-manager.tsx (y keywords-section.tsx si aplica):
  1. Agregar estado selectedGroupId (string | null)
  1. Agregar estado newGroupName (string)
  1. Agregar dropdown entre "Compound (AND group)" y "Require Media"
  1. Dropdown opciones: "None" | "Existing Group 1" | "Existing Group 2" | "---" | "Create New..."
  1. Si selecciona "Create New..." → mostrar input para nombre
  1. Modificar handleSubmit para usar selectedGroupId en lugar de generar UUID
     Must NOT do: No cambiar la estructura de datos del backend
     Parallelization: Wave 1 | Blocked by: - | Blocks: 2
     References:
  - apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx:55-97 (form state y handleSubmit)
  - apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx:169-188 (donde esta el checkbox compound)
    Acceptance criteria:
  - npm run lint:frontend pasa
  - Dropdown muestra todos los grupos compound existentes
  - Puede crear nuevo grupo con nombre
    QA: crear grupo "test", agregar 2 frases al grupo, verificar que ambas tienen mismo andGroupId
    Commit: Y | feat(frontend): agregar selector de compound group en UI

- [ ] 2. Verificar que keywords-section.tsx tiene el mismo fix (o tiene su propia lógica)
     What to do: Revisar si keywords-section.tsx (para keywords, no blacklist) tiene el mismo problema y aplicar el mismo fix si aplica
     Must NOT do: No duplicar código - si es muy similar, extraer a componente compartido
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: -
     References:
  - apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx
    Acceptance criteria:
  - keywords compound groups también funcionan
    QA: verificar keywords compound en UI
    Commit: Y | fix(frontend): aplicar mismo fix a keywords-section

## Final verification wave

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review - lint pasa
- [ ] F3. Real manual QA - crear grupo compound con 2+ frases

## Commit strategy

2 commits:

1. feat(frontend): agregar selector de compound group en blacklist-manager
2. fix(frontend): aplicar mismo fix a keywords-section

## Success criteria

- npm run lint:frontend pasa
- Puede crear grupo compound con nombre
- Puede agregar frases a grupo existente
- Both blacklist y keywords funcionan
