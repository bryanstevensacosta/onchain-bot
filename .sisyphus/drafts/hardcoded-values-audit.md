# Draft: Auditoría de valores hardcodeados en backend

## Objetivo del usuario
Identificar todos los valores hardcodeados en el backend que deberían ser APIs/configuraciones dinámicas. Ejemplos dados: score, filter, gating.

## Contexto del proyecto
- **Tipo**: Backend NestJS (`apps/backend/src/`)
- **Módulos detectados**:
  - `chain` - Lógica de cadena
  - `dashboard` - Endpoints de dashboard
  - `telegram-kol` - KOL tracking
  - `telegram-publishing` - Publicación
  - `token` - Lógica de tokens
  - `shared` - Código compartido
- **Estructura**: TypeScript con NestJS, docker-compose, scripts de auditoría ya existen (`audit-enrichment-apis.js`)
- **Ya existe**: `scripts/audit-enrichment-apis.js` - sugiere que ya hay algo de auditoría de APIs

## Decisiones del usuario (confirmadas)

### Scope
- **Solo backend NestJS** (`apps/backend/src/`)
- **Excluir**: frontend, tests, scripts/, valores cosméticos, frontend scripts

### Foco de búsqueda
Valores que controlan el flujo **publish/reject de tokens** + filtros + scoring relacionado:
- Reglas que determinan si un token es `published` o `rejected`
- Umbrales/scoring que alimentan esa decisión
- Filtros aplicados al pipeline de tokens
- Constantes operativas que afectan el gate (TTL de caché, retry counts, timeouts relevantes al gate)
- **Sistema de KOL scoring** (mismo patrón que tokens)

### Ejemplo concreto dado por el usuario (signal-based scoring)
El usuario mostró un ejemplo del patrón que quiere configurable:

```
SIGNAL_LOW_LIQUIDITY   → -4 puntos  (MEDIUM risk)
SIGNAL_NO_NAME         → -1 punto   (LOW risk)
```

**Esto implica** un sistema de scoring basado en:
- **Signal** (string identifier) — el "qué" se evalúa
- **Penalty/weight** (número) — cuánto suma/resta al score
- **Risk level** (LOW/MEDIUM/HIGH) — categorización del signal
- Probablemente: **score threshold** que decide publish vs reject
- Probablemente: lista de **signals activos** (enable/disable por signal)

**Patrón a buscar en el código (tokens + KOLs)**:
- Enums o const objects tipo `SIGNAL_LOW_LIQUIDITY`, `SIGNAL_NO_NAME`
- Switch/case o map donde se asignan pesos a signals
- Categorías hardcodeadas "LOW", "MEDIUM", "HIGH"
- Threshold numérico para decidir el veredicto
- Cualquier lista de signals activos/inactivos

Esto es la **prioridad #1** del refactor — debe poder configurarse vía admin API sin redeploy.

### Refinamiento arquitectónico (importante)
El usuario quiere **editar/crear signals nuevos desde el admin**, no solo ajustar valores. Esto cambia el modelo:

❌ Modelo key-value simple: `config: { "SIGNAL_LOW_LIQUIDITY": -4 }`
✅ Modelo de entidades: `signals` como tabla propia con CRUD completo

Implicaciones:
- Tabla `signals` (id, code, name, penalty, risk_level, enabled, applies_to: 'token' | 'kol', updated_at, updated_by)
- Tabla `scoring_thresholds` (scope, min_score, max_score, decision) — ej: token score >= 70 → 'published'
- Tabla `filters` (id, type: 'blacklist_mint' | 'blacklist_program' | 'whitelist_*', value, scope)
- Tabla `audit_log` para cambios
- **Prefijo elegido**: `/settings/*` (no `/admin/*`, no `/config/*`, no `/rules/*`)

### Refinamiento: sin auth (Tailscale = perímetro de seguridad)
El usuario confirmó:
- Los endpoints de configuración son **privados**
- Acceso por **Tailscale** (red mesh VPN)
- **No se necesita** guard, login, ni roles
- La seguridad depende del **perímetro de red**, no de la app

### Naming final (decidido)
- **Prefijo**: `/settings/*`
  - `/settings/signals` (CRUD)
  - `/settings/thresholds` (CRUD)
  - `/settings/filters` (CRUD)
  - `/settings/audit` (read-only)
- **Módulo NestJS**: `SettingsModule`
- **Service**: `SettingsService`
- **Controller**: `SettingsController`
- **Entities**: `SignalEntity`, `ThresholdEntity`, `FilterEntity`, `AuditLogEntity`
- **DTOs**: `CreateSignalDto`, `UpdateSignalDto`, etc.
- Documentar en README: "Estos endpoints asumen entorno Tailscale — NO exponer públicamente. No hay guard por diseño."

Implicaciones de usar `/settings`:
- El módulo debe diseñarse **extensible** desde el inicio (no cerrado a signals/thresholds/filters)
- Cada categoría configurable = sub-controlador o sub-ruta bajo `/settings/`
- Patrón: `SettingsModule` orquesta, sub-módulos (SignalsModule, ThresholdsModule, FiltersModule) encapsulan
- Si en el futuro se quiere exponer públicamente, ahí sí se discute auth — pero NO ahora (YAGNI)

### Output esperado
- **Reporte** (markdown) con todos los hallazgos críticos
- **Propuesta de arquitectura** para moverlos a config dinámica
  - **Elegido**: Tabla DB + endpoint admin (PostgreSQL + ConfigService + REST CRUD + hot-reload)

### Gray area
- Solo lo **CRÍTICO**: reportar valores que rompen reglas de negocio si cambias entorno. No inflar.

### Estado actual del acceso a config
- Desconocido — descubrir en exploración

## Scope final

**IN**:
- `apps/backend/src/chain/` - pipeline de tokens (probable ubicación del gate)
- `apps/backend/src/token/` - lógica de tokens (scoring, validación)
- `apps/backend/src/telegram-kol/` - si KOL afecta publish
- `apps/backend/src/dashboard/` - si expone valores de configuración
- `apps/backend/src/shared/` - utilidades compartidas, constantes

**OUT**:
- `apps/backend/test/`, `apps/backend/dist/`
- `apps/frontend/`
- `scripts/` (excepto si referencia APIs backend)

## Próximo paso
Cuando el balance se recargue, delegar exploración en paralelo (3 agentes):
1. Explore: localizar pipeline publish/reject de **tokens** y todos los magic numbers en su camino + el archivo/enum de signals
2. Explore: localizar pipeline de scoring de **KOLs** + mismo análisis + mapear módulos existentes (ConfigService? AuthGuard? Constants file?)
3. Librarian: patrones NestJS para gestión de entidades configurables (no key-value) + audit log + hot-reload con cache invalidation

## Estado de exploración — BLOQUEADO por billing

Los 3 agentes delegados fallaron con `Insufficient balance`:

| Task ID | Tipo | Descripción | Estado |
|---|---|---|---|
| `bg_2effde1a` | explore | Map token publish/reject pipeline | FAILED (billing) |
| `bg_267138c1` | explore | Audit hardcoded values in pipeline files | FAILED (billing) |
| `bg_fff8743e` | librarian | Research NestJS dynamic config patterns | FAILED (billing) |

### Decisión del usuario
**Esperar a que se recargue el balance y re-lanzar los 3 agentes.**

### Prompts completos guardados para retry
Los prompts íntegros están en el historial de esta sesión. Al re-lanzar:
- **bg_2effde1a** (explore) — pipeline mapping, 8 secciones de output
- **bg_267138c1** (explore) — auditoría de valores con tabla por categoría, 8 secciones
- **bg_fff8743e** (librarian) — patrones NestJS para dynamic config, 9 secciones

### Acción al retomar
1. Re-lanzar los 3 agentes en paralelo con los mismos prompts
2. Esperar a que los 3 terminen antes de auto-transicionar a Plan Generation
3. Si alguno vuelve a fallar, considerar la opción "planear con assumptions marcados"
