# Plan: Reorganización Módulos Telegram (✅ COMPLETE)

**Session**: Reorganización estructura `src/telegram-kol` → `src/kol` + `src/telegram`
**Owner**: Sisyphus
**Created**: 2025-06-23

---

## Objetivo

Reorganizar la estructura de módulos Telegram en el backend:
1. `telegram-kol` → `kol` (agnóstico al source)
2. `telegram-publishing/shared` → `telegram/shared`
3. `telegram-publishing/vip-calls` → `telegram/vip-calls-channel`
4. Crear skeleton `telegram/coin-info-bot` (nuevo bot público)
5. Actualizar todos los imports (145 + 12 references)
6. Eliminar `telegram-publishing` cuando todo funcione sin errores

---

## Contexto

### Estructura Actual
```
apps/backend/src/
├── telegram-kol/           (56 archivos)
│   ├── ingestion/          ← MTProto/Telegram específico
│   ├── identity/
│   ├── reputation/
│   ├── source/             ← Ya tiene SourceType VO (agnóstico)
│   └── stats/
└── telegram-publishing/    (21 archivos)
    ├── shared/             ← Entidades y puertos genéricos
    └── vip-calls/         ← Lógica de publicación
```

### Imports a Actualizar
- `telegram-kol/*`: **145 references** en 49 archivos
- `telegram-publishing/*`: **12 references** en 11 archivos

---

## Work Breakdown

### Phase 1: Rename Directories (Pre-flight)

```
[ ] 1.1 Renombrar telegram-kol/ → kol/
[ ] 1.2 Renombrar telegram-publishing/shared → telegram/shared
[ ] 1.3 Renombrar telegram-publishing/vip-calls → telegram/vip-calls-channel
[ ] 1.4 Crear directorio vacío telegram/coin-info-bot/
```

### Phase 2: Update Imports (Core)

```
[ ] 2.1 Actualizar 145 imports de 'telegram-kol/*' → 'kol/*'
[ ] 2.2 Actualizar 12 imports de 'telegram-publishing/*' → 'telegram/*'
[ ] 2.3 Verificar imports en app.module.ts
[ ] 2.4 Verificar imports en database.module.ts
```

### Phase 3: Verification

```
[ ] 3.1 Ejecutar tsc --noEmit (verificar compilación)
[ ] 3.2 Ejecutar npm run test:backend (306 tests)
[ ] 3.3 Corregir errores si los hay
```

### Phase 4: Cleanup

```
[ ] 4.1 Verificar que directorio telegram-publishing está vacío
[ ] 4.2 Eliminar telegram-publishing/ (directorio vacío)
[ ] 4.3 Commit final
```

---

## Constraints & Guardrails

1. **Scope Lock**: Solo renombrar y actualizar imports. Sin cambios funcionales.
2. **Tests**: Deben pasar 306 tests después de la reorganización.
3. **Compilación**: `tsc --noEmit` sin errores.
4. **Rollback**: Si hay errores irresolubles, hacer git checkout de los directorios renameados.

---

## Notas Importantes

### Sobre `kol/ingestion`
El módulo `ingestion` dentro de `kol/` actualmente usa `KolTelegramMtprotoAdapter` (hardcoded Telegram). El rename a `kol` es un primer paso hacia agnosticismo - no implica que ya sea agnóstico.

### Sobre `telegram/coin-info-bot`
Se crea como skeleton vacío para desarrollo futuro del bot público que:
- Responde en DM con análisis de tokens
- Responde en grupos cuando lo mencionan
- Tiene comandos tipo `/token <addr>`, `/holders`, etc.

---

## Dependencies

- Ninguna dependencia externa
- Requiere acceso a bash para rename de directorios
- Requiere npm/node para tests

---

## Success Criteria

- [ ] Compila sin errores (`tsc --noEmit`)
- [ ] 306 tests pasan
- [ ] Estructura final:
  ```
  apps/backend/src/
  ├── kol/
  │   ├── ingestion/
  │   ├── identity/
  │   ├── reputation/
  │   ├── source/
  │   └── stats/
  └── telegram/
      ├── shared/
      ├── vip-calls-channel/
      └── coin-info-bot/   (vacío)
  ```
- [ ] Directorio `telegram-publishing` eliminado