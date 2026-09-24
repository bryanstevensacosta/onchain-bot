# BORRADOR v0 — Mega-refactor por tramos (plan central + planes delegados por BC)

> **Tree meta**: ver `.omo/reference/mega-refactor-target-tree.md` (tree completo con nombres de archivo, generado 2026-09-24 para incluir en el plan central).
> **Estado**: `borrador-para-iterar` — NO es el plan final. Lo iteramos juntos antes de generar `.omo/plans/*`.
> **Fecha**: 2026-09-24
> **Idea del usuario**: un plan central que delega a planes por BC mediante links (URL/path) incluidos en la documentación.
> **Gate**: `status: pre-aprobación` — acción pendiente: acordar topología + mecanismo de delegación → luego `scaffold-plan.mjs` + planes.

## 1. Fuentes (lo que ya existe, no reinventarlo)

| Spec              | Path                                                                                                                                                           | Estado      | Qué propone                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| content-publisher | `.kiro/specs/refactor-content-publisher/` (13 docs; `11-refactor.md` + `IMPLEMENTATION-GUIDE.md` 8 fases/7 sem + `PHASE-TRACKER.md` + `MIGRATION-PLAYBOOK.md`) | ✅ Completo | Extraer 3 BCs crypto-news → `apps/content-publisher/` (11 módulos, puertos 3040/3041/3042), dual-path SSE+polling, 3-flag control, rollback 30 min                                                                                                                 |
| kol-system        | `.kiro/specs/refactor-kol-system/` (`overview.md` + `IMPLEMENTATION-GUIDE.md`, template-based, 11 fases / 9-10 sem, 22 tablas v1, puertos 3050/3051/3052)      | ✅ Completo | Extraer TODO lo KOL → `apps/kol-system/` (14 BCs, template system multi-bot) + notas de deprecación cruzada hacia content-publisher                                                                                                                                |
| data              | `.kiro/specs/refactor-data/` (`overview.md` + `naming-and-architecture.md`)                                                                                    | 🟡 Planning | Nuevo servicio de datos onchain/off-chain (13 providers → aggregation + cache + rate-limiter + API REST/GraphQL + bot Dexter standalone); nombre sin decidir (`onchain-data` / `token-oracle` / `market-data`); variante A (BC único) vs B (multi-app) sin decidir |

**Hecho clave**: los tres specs YA se referencian entre sí (content-publisher `11-refactor.md:7-8` ↔ kol-system `overview.md:6`), pero con links relativos ad-hoc y notas de deprecación dispersas. El plan central debe convertir esos links sueltos en un **contrato de delegación explícito**.

## 2. Topology lock (componentes que pueden succeed/fail independientemente)

1. **Gobernanza central** — plan índice, orden de tramos, contratos entre apps, estrategia de cutover global, rollback.
2. **Tramo 1: kol-system** — `apps/kol-system/` (pipeline alpha-call + templates multi-bot). Spec completo (11 fases / 9-10 sem). **DECIDIDO 2026-09-24: va primero (money-path)** — ver §7.5.
3. **Tramo 2: content-publisher** — `apps/content-publisher/` (crypto-news + threads futuro). Spec maduro (8 fases / 7 sem). Precondition: Tramo 1 validado en staging.
4. **Tramo 3: market-data** — servicio de datos + Dexter (`apps/market-data/`). Nombre sellado; pendiente confirmar variante A. Precondition: Tramo 2 validado en staging.
5. **Transversales compartidos** — contrato con `ingestion-telegram` (HTTP+SSE por env :3031/:3032/:3033, Opción A filter-on-read), adelgazamiento del backend (`kol/`, `telegram/*`, `data-provider/`), frontend (endpoints + dashboard KOL), DBs por app, puertos por env, CI (`ci.yml` sin job de ingestion hoy).
6. **Migración y cutover** — feature flags (`USE_CONTENT_PUBLISHER`, `KOL_PIPELINE_ENABLED`/`KOL_SYSTEM_ENABLED`, `USE_DATA_SERVICE_API`), dual-run, staging 7 días, deprecación post-cutover, borrado de código legacy.

## 3. Propuesta de mecanismo de delegación (tu idea, concretada)

**Estructura**:

```
.omo/plans/mega-refactor-central.md        ← ÍNDICE (qué, por qué, orden, contratos, cutover global)
.omo/plans/mega-refactor-content-publisher.md  ← Tramo 1 (derivado de 11-refactor.md + guides)
.omo/plans/mega-refactor-kol-system.md         ← Tramo 2 (derivado de overview.md + guide)
.omo/plans/mega-refactor-data-service.md       ← Tramo 3 (derivado de overview.md + naming doc)
```

**Reglas de delegación** (defaults adoptados, a veto):

- D1. El plan central NO duplica los todos de cada tramo: cada tramo tiene sus propios todos decision-complete; el central solo guarda **links + contratos + orden + gates**.
- D2. Delegación = sección `## Tramos delegados` en el plan central con tabla: tramo → path del plan → spec origen → precondition → done-gate. Cada plan de tramo empieza con `> Delegado desde: .omo/plans/mega-refactor-central.md` (backlink).
- D3. Contratos inter-tramo viven SOLO en el central (bot tokens por app, puertos por env, endpoints de ingestion-telegram consumidos, feature flags, orden de cutover). Los tramos los referencian, no los redefinen.
- D4. Orden DECIDIDO 2026-09-24: **kol-system → content-publisher → market-data** (money-path primero; consecuencias en §7.5).
- D5. Cada tramo es ejecutable standalone con `$start-work` sobre su propio plan; el central define el orden pero no bloquea arrancar el Tramo 1.

## 4. Open-assumptions ledger (defaults que adopté — los puedes vetar uno por uno)

| #   | Supuesto               | Default adoptado                                                                                                                  | Rationale                                                                                         | Reversible    |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- |
| A1  | Orden de tramos        | **DECIDIDO 2026-09-24: kol-system → content-publisher → market-data**                                                             | money-path primero (decisión usuario; override de F-4 con mitigaciones en §7.5)                   | n/a (sellado) |
| A2  | Dónde viven los planes | `.omo/plans/mega-refactor-*.md` (4 ficheros)                                                                                      | convención existente del repo; `start-work` los lista                                             | sí            |
| A3  | Granularidad           | 1 plan por tramo + 1 central (4, no 10+)                                                                                          | cada spec ya trae sus fases; más ficheros = más deriva                                            | sí            |
| A4  | Nombre data-service    | **DECIDIDO 2026-09-24: `market-data`** → `apps/market-data/`                                                                      | sin colisión de directorio (`apps/` solo tiene backend/frontend/ingestion-telegram); ver R-4 §7.3 | n/a (sellado) |
| A5  | Variante data A vs B   | A (BC único) para MVP, B si escala                                                                                                | recomendación literal del propio spec                                                             | sí            |
| A6  | Puertos nuevas apps    | content-publisher 3040/3041/3042 (del spec), kol-system 3050/3051/3052 (del spec), data-service 4000 (del spec, ⚠️ validar clash) | respetar specs; 4000 necesita check vs Oracle                                                     | sí            |
| A7  | Backend adelgazado     | cada tramo deprecation-post-cutover + borrado legacy en su propio plan                                                            | patrón que ya traen ambos guides                                                                  | sí            |

## 5. Puntos para iterar juntos (no son entrevista bloqueante, son el orden del día)

1. ¿4 ficheros (central+3) o prefieres también un 5º de transversales/cutover separado?
2. ~~¿Orden A1 te vale o quieres kol-system primero?~~ RESUELTO 2026-09-24: kol-system primero (ver §7.5).
3. ¿Voto de nombre data-service ahora o lo dejamos como gate del Tramo 3?
4. ¿El central debe incluir timeline global (semanas sumarían ~23-26 en serie) o solo orden + gates sin fechas?
5. Formato del link de delegación: ¿path relativo `.omo/plans/*.md` basta o quieres URL completa + sección ancla?

## 6. Branch de trabajo (decisión registrada 2026-09-24)

- Rama actual al abrir el borrador: `dev` (worktree con untracked: 3 specs `.kiro/`, este draft, `scripts/add-deprecation-headers.js`; `M .omo/boulder.json` — fuera de scope, no tocar).
- Decisión: todo el mega-refactor (central + 3 tramos) se trabaja en rama nueva **`feat/mega-refactor-tramos`** creada desde `dev` (convención `feat/*` + pre-push prohíbe push directo a `master`).
- Los planes `.omo/plans/mega-refactor-*.md` se generan y commitean en esa rama, no en `dev`.
- Quién la crea: el worker al arrancar el Tramo 1 (`git checkout -b feat/mega-refactor-tramos dev`) — queda como precondition del plan central.
- **P0 antes de bifurcar** (ver §7.2 F-5): `git stash push .omo/boulder.json` (cambio fuera de scope, no entra en la rama); los `.kiro/specs/*` untracked se commitean EN la nueva rama.

## 7. Revisión high-accuracy (documentada 2026-09-24 — TODO lo hallado queda aquí)

### 7.0 Nota procedimental (honestidad sobre la "doble pasada")

- Se lanzaron 2 pasadas Momus (`bg_9da5f81d` fidelidad, `bg_23d51609` adversarial). Ambas devolvieron **REJECT procedimental**: el skill Momus solo admite rutas canónicas `.omo/plans/*.md`, y este borrador vive en `.omo/drafts/` por diseño (aún no hay plan que revisar).
- Sustitución documentada: ejecuté yo las dos pasadas con verificación contra disco (grep con file:line abajo). La revisión dual Momus real correrá tras generar `.omo/plans/*` (path UNCLEAR la exige automática).

### 7.1 Pasada FIDELIDAD — veredicto: REWORK menor (3 correcciones aplicadas arriba)

- **R-1 (README content-publisher desactualizado en líneas)**: `README.md:30,80` dice "`11-refactor.md` (2172 líneas)" pero el fichero real tiene **3437 líneas**. Impacto: estimaciones heredadas del README subestiman el volumen. Fix: los planes por tramo deben citar el conteo real, no el del README.
- **R-2 (README inconsistente en tareas)**: `README.md:24` dice "130 tareas" pero `README.md:215` suma "0/133". Suma manual de fases (10+57+12+6+18+9+15+6) = **133**. Fix: usar 133 como referencia; el tracker manda sobre el índice.
- **R-3 (fases kol-system)**: `IMPLEMENTATION-GUIDE.md:22` dice "**11 Fases, 9-10 Semanas**" (el "11-13" del borrador v0 venía del overview y mezclaba variantes). Corregido a 11 fases / 9-10 sem.
- **Verificados y CONFIRMADOS sin cambios**: puertos content-publisher 3040/3041/3042 (`11-refactor.md:1367-1369`, `MIGRATION-PLAYBOOK.md:60`); puertos kol-system 3050/3051/3052 (`IMPLEMENTATION-GUIDE.md:15`, `overview.md:190-191` — A6 queda validado); 22 tablas kol v1 (`overview.md:1238`); ~15k LOC + rollback 30 min + `USE_CONTENT_PUBLISHER` (`IMPLEMENTATION-GUIDE.md:14-17,563`); data-service puerto "4000 (dev), vacíos staging/prod" (A6-gate confirmado necesario); variante A-para-MVP (`naming-and-architecture.md:951`); cross-refs mutuos (`11-refactor.md:7-8` ↔ kol `overview.md:6`).

### 7.2 Pasada ADVERSARIAL — veredicto: REWORK (5 modos de fallo → fixes)

- **F-1 Doble-deprecación del mismo código backend**: `telegram/shared` (Bot API adapters, SlotArbitrator) lo tocan AMBOS specs — content-publisher crea `telegram/` con dual adapters, kol-system mueve el KOL bot a `kol-system/`. Si dos tramos deprecationan el mismo directorio, el segundo pisa al primero. **Fix**: contrato C-SHARED-01 en el plan central (dueño por subpath + orden: content-publisher primero extrae crypto-adapters, kol-system después mueve KOL bot); ningún tramo toca `telegram/shared` sin citar C-SHARED-01.
- **F-2 Disputa `data-provider/` + Dexter**: kol-spec gap-7 deja `chain-dexter-bot` acoplado al backend; data-spec lo absorbe en el data-service. Ambos tramos reclamarán `chain/` y `token/` providers. **Fix**: contrato C-DATA-01 (kol-system consume vía ports, NO mueve providers; la extracción física es del Tramo 3) + pin de versión de contrato en cada plan de tramo (si el central cambia, el tramo re-sync antes de `$start-work`).
- **F-3 Contratos rancios entre tramos standalone**: D2 (backlink) no basta — un tramo ejecutado 6 semanas después leería contratos viejos. **Fix**: endurecer D2 → cada plan de tramo declara `Contrato-central versionado (fecha + hash de sección)`; el central mantiene `## Contratos` como única fuente (D3 ya lo dice; añadir versionado explícito).
- **F-4 Contra-grill a A1 (supuesto de mayor peso)**: reté "content-publisher primero por madurez de spec". Reframe: la razón FUERTE no es la madurez, es la **dependencia** — kol-system depende de `content-publisher/threads/` para thread support (v2 threads viven en content-publisher, no en kol), y el dinero-path (VIP calls) no se toca hasta que el tramo 1 valide el patrón extracción-de-BC (feature flag + dual-run + rollback 30 min) en el pipeline de menor riesgo. **Recomendación**: mantener A1 con rationale reescrito (dependencia + riesgo, no madurez).
- **F-5 Rama + worktree sucio**: crear `feat/mega-refactor-tramos` desde `dev` con `M .omo/boulder.json` arrastraría un cambio fuera de scope a la rama. **Fix** (precondition P0 del central): antes de bifurcar, `git stash push .omo/boulder.json` o revertirlo si el cambio es accidental; los `.kiro/specs/*` untracked se commitean EN la nueva rama (son el input de los planes), no en `dev`.

### 7.3 Contratos que el plan central DEBE incluir (salida de F-1–F-3, lista cerrada)

C-SHARED-01 (telegram/shared split) · C-DATA-01 (data-provider ownership) · C-PORTS-01 (tabla puertos×env de las 3 apps nuevas + check :4000 staging/prod + Oracle) · C-BOTS-01 (qué bot token usa cada app) · C-DB-01 (nombres `<base>_<app>` por env + owner de migraciones) · C-SSE-01 (cada app nueva con SU propio SSE client contra SU ingestion por env; invariante 1:1 intacta) · C-CI-01 (jobs `ci.yml`/`deploy*.yml` para las 3 apps; hoy solo backend+frontend) · C-FLAGS-01 (`USE_CONTENT_PUBLISHER`, `KOL_*_ENABLED`, `USE_DATA_SERVICE_API` + orden de cutover) · C-UX-01 (mapa de endpoints frontend migrados por tramo).

### 7.4 Decisión de nombre sellada 2026-09-24: `apps/market-data`

- **R-4 (ambigüedad real, evidencia)**: `market-data` ya existe como concepto backend — prefijo de ruta `/token/market-data/*` (`enrichment.controller.ts:8`, consumido por frontend `endpoints.ts:37-40`), `MarketDataProviderPort` (usado por 10+ adapters), docs `token/market-data/enrichment`. Convivirán dos "market-data" distintos (app nueva vs BC legacy) durante los Tramos 1-2.
- **Consecuencia registrada para el Tramo 3**: incluir renombre del prefijo legacy (`/token/market-data` → p.ej. `/token/enrichment`) + desambiguación de `MarketDataProviderPort` (alias o rename) como tareas del plan `mega-refactor-market-data`. Sin esto, logs, rutas y docs se vuelven ambiguos.
- Estructura final confirmada: `apps/{backend,frontend,ingestion-telegram,content-publisher,kol-system,market-data}`.

### 7.5 Reordenación sellada 2026-09-24: kol-system primero (override de F-4)

Consecuencias adaptadas (todo va a los planes por tramo):

- **C1 threads diferidos**: kol-templates con thread support NO pueden apoyarse en `content-publisher/threads/` (aún no existe). Tramo 1 implementa templates sin threads o contra path legacy con flag; el soporte threads llega con el Tramo 2. Anotar en C-SHARED-01.
- **C2 C-SHARED-01 invertido**: Tramo 1 mueve el KOL bot fuera de `telegram/shared` primero; Tramo 2 extrae los crypto-news adapters después. El split de `telegram/shared` se hace en dos movimientos (orden inverso al v0).
- **C3 riesgo piloto sobre money-path**: el patrón extracción+dual-run+rollback se valida directamente en VIP calls. Mitigaciones obligatorias del Tramo 1: shadow/dry-run del pipeline (canal espejo) antes de cutover, staging extendido (proponer 14 días vs 7 estándar), rollback rehearsal en staging, kill-switch `KOL_*_ENABLED`.
- **C4 cadena de preconditions**: T2 arranca con T1 validado en staging; T3 con T2 validado. Sin solapes en `telegram/shared` ni `data-provider/`.

### 7.6 Pivot de diseño kol-system 2026-09-24 (decisiones usuario — override parcial del spec)

- **P1 SIN deduplicación de ninguna índole en kol-system**: las repeticiones son dato de primera clase (cada mención = una fila). Ojo: ingestion-telegram SÍ tiene dedup source-side (`isDuplicate` realtime+polling → 1 row); kol-system no añade ninguna capa propia.
- **P2 Verificación por sub-agentes**: el plan del Tramo 1 incluirá verificación separada (explore/librarian) por cada punto P3–P9 antes de implementar.
- **P3 ingestion por tipo**: `kol-system/ingestion` consume mensajes tipo `kol` de ingestion-telegram, diferenciados de `crypto-news` (el route(raw, kol|crypto-news) ya existe en el coordinator).
- **P4 identidad/sources → ingestion-telegram**: los "sources" viven en ingestion-telegram con 2 tipos (`kol` + `crypto-news`). El BC `kol-identity` del spec se SUSTITUYE: kol-system no guarda perfiles, consume sources vía HTTP. Avatar del KOL vía MTProto/Bot API, almacenado una sola vez y servido siempre desde entonces.
- **P5 extraction = contrato × mención**: extrae el smart contract de cada mención KOL + timestamp + handle + url + info del canal + db-id propio. Repetido = válido (alimenta "called from @handle 8min ago"). Frontend: tabla `caller | call | mc at | time ago | more details +` (caller = handle, url channel, db-id, avatar).
- **P6 classification DENTRO de templates**: cada template configura qué kol-channels (de los sources P4) muestra su dashboard, cómo se visualiza el score, y filtros sobre la data de contratos para descubrir gemas. No hay BC classification separado.
- **P7 puente market-data → enrichment**: `enrichment` consume `apps/market-data` y alimenta `mc at` (MC al momento de captura) + `more details +` (toda la info disponible del address, sea token/billetera/exchange/agregador).
- **P8 tracking por primera aparición**: columna `tracking` = `First time` (primera mención del kol) vs `Nx from last call` (guarda el `mc at` de la primera vez como referencia). Enrichment → classification → templates con scores basados en enrichment (p.ej. rating de kol por calls +5x). Tabla final: `caller | call | mc at | tracking | time ago | more details +`.
- **P9 bot por template (opcional)**: cada template puede llevar su propio bot token configurado desde el frontend (BYO-token) para publicar además en un canal Telegram. Confirmado viable solo-publishing (ver C-B). Tokens cifrados en DB (AES-256-GCM existe en el shared pattern).
- **C-A timing polling CONFIRMADO (corrige "90s")**: ingestion-telegram = realtime `NewMessage` + sweep polling **30s** (`message-persistence.coordinator.integration.spec.ts:797`; `INGESTION_SAFETY_POLL_INTERVAL_MS` mín 30s anti-ban). Retraso "mc at" ≈ segundos (SSE, target <10s) a ~30s+procesado (polling). El plan usará ≤30s, no 90s.
- **C-B bot-por-template CONFIRMADO viable (solo publishing)**: adapters usan Bot API HTTPS cruda (`https://api.telegram.org/bot<token>/sendMessage`, token por constructor/config: `bot-api-telegram-publisher.adapter.ts:24-52`, `bot-api-crypto-news-publisher.adapter.ts:53-83`, `chain-dexter-bot.adapter.ts:24-48`). Sin sesión MTProto ni singleton → instanciar un adapter por template con su token funciona. Bot interactivo (comandos/inbox) requeriría routing de updates por bot (webhook con token) = diseño extra, fuera v1.
- **C1 threads diferidos**: kol-templates con thread support NO pueden apoyarse en `content-publisher/threads/` (aún no existe). Tramo 1 implementa templates sin threads o contra path legacy con flag; el soporte threads llega con el Tramo 2. Anotar en C-SHARED-01.
- **C2 C-SHARED-01 invertido**: Tramo 1 mueve el KOL bot fuera de `telegram/shared` primero; Tramo 2 extrae los crypto-news adapters después. El split de `telegram/shared` se hace en dos movimientos (orden inverso al v0).
- **C3 riesgo piloto sobre money-path**: el patrón extracción+dual-run+rollback se valida directamente en VIP calls. Mitigaciones obligatorias del Tramo 1: shadow/dry-run del pipeline (canal espejo) antes de cutover, staging extendido (proponer 14 días vs 7 estándar), rollback rehearsal en staging, kill-switch `KOL_*_ENABLED`.
- **C4 cadena de preconditions**: T2 arranca con T1 validado en staging; T3 con T2 validado. Sin solapes en `telegram/shared` ni `data-provider/`.
- **P10 separación estricta por tipo (2026-09-24)**: `content-publisher` consume SOLO `messageType==='crypto-news'`; `kol-system` consume SOLO `messageType==='kol'` (crudos, sin mezcla). El fan-out SSE lleva ambos tipos; el filtrado es client-side obligatorio por app + query param donde exista. Ningún todo puede suscribirse al tipo ajeno.
- **P11 ranking de kol callers (2026-09-24)**: endpoint `GET /api/kol-rankings?window=30d|7d|1d` + tabla frontend `caller | 30D: +22X | 7D: +4X | 1D: +46%`. Múltiple por call = `last_mc / first_mc_at` (enriquecido vía market-data, C-A ≤30s); agregado por caller y ventana = SUMA de múltiplos; display +NX en 30D/7D, +% en 1D. Job cron mantiene `kol_window_stats(caller, window, total_x)` (no cálculo on-request). El worker define fórmula con ejemplo numérico (patrón G-14).
- **P13 apps/dexter-onchain-bot (2026-09-24, SUPERSEDE P12a)**: el lookup NO vive en kol-system sino en app propia `apps/dexter-onchain-bot/` — solo lógica bot Telegram alimentada por `apps/market-data` (fuente de verdad, como un intel-telegram-analyzer-onchain). Comandos `/start` (info+uso) + `/ca <contrato>` + detección pelada en chat + extracción de reenvíos/cualquier texto (parse→normalize→info sin importar si es wallet/token/exchange/agregador). Reutiliza router+pipeline-resolve+formatter+trade-buttons+settings de Dexter (P12-bis) con inbound webhook|polling. kol-system conserva SOLO bots por template solo-publishing (P12b intacto). Defaults (a veto): Tramo 3 fase final (tras puente default-true; alternativa Tramo 4 separado) · puertos 4060/4061/4062 (worker verifica lsof) · DB propia `<base>_dexter[_staging]` · token `DEXTER_BOT_TOKEN` (migra de `CHAIN_DEXTER_BOT_TOKEN`).
- **P12b bots por template (intacto)**: solo publishing, configurables y dinámicos, workflows de publicación opcionales por template (P9). Viven en kol-system, sin cambios.
- **P14 vip-calls absorbido por templates (2026-09-24)**: `vip-calls` NO es módulo ni código en kol-system — es el NOMBRE genérico de un template (seed por defecto). Cada template decide vía frontend si publica (bot API configurable) o es solo-dashboard. El directorio backend `vip-calls/` se elimina en cleanup sin recrearse bajo ningún nombre.
- **P16 dashboard único con selector de sources (2026-09-24, SUPERSEDE P15)**: cada template tiene UN dashboard que permite elegir qué KOL sources mostrar. Template guarda `kolSourceIds: string[]` (channelIds de ingestion-telegram; vacío = todas). Filtro aplicado en origen (`GET /api/feed/sources?type=kol` para el picker; mentions locales filtradas por kol) y reflejado en calls/ranking/gems/tracking del dashboard. Frontend: multi-select de sources alimentado de ingestion-telegram. Sin tabla `template_dashboards`, sin pestañas, sin CRUD de dashboards.
- **P17 layout dashboard (2026-09-24)**: ranking performance HORIZONTAL 10 total (5 izq + 5 der) con flechas para alternar orden mayor↔menor performance; tira horizontal top-10 callers por Nº de calls con selector 30D/7D/1D (conteo de llamadas por caller en la ventana); sección extendida de configuración del template. Backend: `kol_window_stats` guarda `total_x` + `calls_count` por (caller, window); ranking endpoint expone ambos + `sort=perf_asc|perf_desc`.
- **P18 deprecación gradual por BC (2026-09-24)**: cada BC que se completa en kol-system depreca SU contraparte backend acto seguido (headers `@deprecated` + puntero a la nueva ubicación, patrón `scripts/add-deprecation-headers.js`; el código sigue funcionando). Borrado solo en todo 16. Cada move-todo (4,5,6,7,11,12) lleva su companion de deprecación (numerado correlativo: 18, 19…) ligado a commits/pushes de la rama.
- **P19 avatar fuente de verdad permanente (2026-09-24)**: ingestion-telegram resuelve foto de perfil del channel (MTProto), la almacena PERMANENTE y la sirve a kol-system (rankings + dashboard). Cláusulas: EXCLUIDA del janitor 72h (retención solo messages+media de mensajes); `avatarUrl` en la proyección `GET /api/feed/sources` (además del endpoint dedicado); fetch-ONCE al registrar el source (cambia poquísimo: SIN refresh periódico, solo refresh explícito manual); fallback placeholder.
- **P20 ingestión kol-system SSE-only sin polling (2026-09-24)**: único delay = polling interno de ingestion-telegram (30s) + realtime SSE. kol-system NO tiene cron de polling: listener SSE filtra `data.messageType==='kol'`; al reconectar, catch-up por cursor (`GET /api/feed/messages?type=kol` desde último messageId, NO loop periódico). Si el worker del todo 4 ya implementó el fallback 1min, ajuste follow-up para retirarlo.
- **P21 health por componente + shared sin duplicar (2026-09-24)**: cada move-todo registra su health indicator en `GET /api/health` (`ingestion.sse`, `database`, `redis`, +1 por módulo: extraction/parsing/normalization/enrichment/scoring/templates/approval/publishing/tracking). Regla standing: reutilizar `src/shared/` (kernel/config/guards/filters); si falta algo, SE EXTIENDE shared, no se copia. Verificación en staging (todo 15): health con todos los componentes en `up`.
- **P22 telegram config vía DB sin env vars (2026-09-24)**: tokens bot + canales de cada template viven en DB (`template_bot_tokens`: template_id, bot_token cifrado, channel_id, label), CRUD vía frontend. Env vars SOLO como seed/bootstrap del template por defecto; prohibido crear `*_BOT_TOKEN` nuevo por template/bot. Rotación = update en UI, sin redeploy.
- **P12-bis hallazgos Dexter 2026-09-24 (verificado en código)**: `chain-dexter-bot/` = bot Bot-API (`CHAIN_DEXTER_BOT_TOKEN`, webhook|polling con `UpdatePollerService` + `deleteWebhook`), router slash-only (`CommandRouterService.dispatch`: ignora texto sin `/`), comandos `/start /help /x<C A> full-scan /z compacto /c|/cc chart /tb trade-buttons /settings` (`start-help.handlers.ts:6-50`, `x-token-scan.handler.ts:35-83`, `command-router.service.ts:54-89`); `TokenScanPipeline.resolve(arg)` → ficha (precio/MC/LIQ/holders) + botones trade (DexScreener/Photon/Trojan/Jupiter/Maestro/BananaGun/BubbleMaps, afiliado placeholder `chaindexter`, `trade-button-registry.ts:91-187`); settings por chat (`ChatSettingsEntity`: botones, posición, límite, emoji, groupMode, autoResponder, priceMode).
- **Gaps Dexter vs visión P12**: NO acepta contrato pelado (exige `/x`), NO extrae de reenvíos (solo `message.text` con `/`), SIN atribución KOL ("called from @handle"), SIN tracking/rating, afiliados placeholder.
- **Convergencia propuesta (a veto)**: lookup bot vive en kol-system (P12a) REUTILIZANDO `CommandRouter` + `TokenScanPipeline.resolve` + formatter + trade-buttons + settings movidos desde Dexter; AÑADE: detección de address sin slash, extracción de reenvíos (`forward_origin`/`replyTo`), atribución KOL vía mentions (first-seen + caller list), link a tracking. Motor scan → market-data en Tramo 3 (C-DATA-01); bot legacy Dexter se depreca a favor del lookup (UN solo bot lookup). Alternativas: (b) Dexter intacto en market-data + lookup kol-system separado (dos bots, más mantenimiento); (c) lookup absorbido por Dexter en market-data (lookup fuera de kol-system, rompe P12a).

## 8. Lo que haré al aprobar este borrador

1. `scaffold-plan.mjs mega-refactor-central --unclear` (+ slugs por tramo).
2. Metis gap analysis obligatorio.
3. APPEND de todos por tramo (derivados de los specs, con referencias exactas a fichero:línea) + `## Tramos delegados` en el central.
4. Revisión dual Momus automática (path UNCLEAR) antes de entregar.

---

_Compaction-resume: este fichero ES el punto de retorno. Al volver, leer secciones 2-5 y el gate._

## 9. Generación de planes 2026-09-24 (aprobado "procede")

- Scaffolds: `mega-refactor-central` + `mega-refactor-{kol-system,content-publisher,market-data}` (`--unclear`).
- Metis gaps G-01–G-21 integrados; defaults adoptados (DBs mismo-servidor, tripletas puertos, `?type=kol`, avatar ingestion, tokens cifrados, threads-501) a veto del usuario.
- Todos: central 8 · T1 16 · T2 12 (0-11) · T3 9 (0-8). TL;DR + commit/success rellenos.
- Revisión Momus ×4: central APPROVE (3 minor → fixed: matriz, path coordinator, sección Tramos delegados D2) · T3 APPROVE (minor → fixed: matriz, placeholders) · T1 REWORK → FIXED (rutas token/intake + coordinator core, placeholders, waves 3-5, acceptance ejecutables, DDL 17 desglosado) · T2 REWORK → FIXED (contrato pinneado d3671cf0, matriz reescrita, placeholders, M1/M3). Aceptado como minor pendiente: T2-M2 (rangos spec abiertos).
- Segunda revisión (P10–P13): T2 APPROVE · T3 APPROVE · central REWORK → FIXED (12 DBs con dexter en dev, acceptance grep -o, tripleta dexter en defaults) · T1 REWORK → FIXED (matriz fila 17 inerte, acceptance ranking+vista+assert negativo). Pin contratos v2026-09-24 (hash al sellar; no perseguir hash tras cada edit).
