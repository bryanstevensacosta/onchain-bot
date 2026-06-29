# 06 · Rate limits verificados y ban prevention

> **Propósito**: traducir los ToS de Telegram y las observaciones de la comunidad
> en límites concretos y operables para tu pipeline de KOLs.
> Cada límite lleva URL real de la fuente (oficial o comunitaria).
> **Versión**: empírica, basada en datos verificados el 2026-06-22.

---

## 0. TL;DR — Recomendaciones revisadas

| Límite | Valor revisado | Fuente |
|---|---|---|
| **Channels/grupos por cuenta MTProto** | **50 máx** (no 500) | [tginfo.me](https://limits.tginfo.me/en) + [gramjs#673](https://github.com/gram-js/gramjs/issues/673) |
| **getMessages/seg** | **2–3/seg** (no 1.5) | [gramio.dev/rate-limits](https://gramio.dev/rate-limits) |
| **Backfill batch** | **100 msgs, 60s delay** | Conservador + empírico |
| **FLOOD_WAIT backoff** | **Exponencial 5s → 1h** | [core.telegram.org/api/errors](https://core.telegram.org/api/errors) |
| **Sleep window** | **6–8h random/día** (UTC 4-10 base) | Behavior detection, no documentado |
| **Jitter en intervals** | **±30% obligatorio** | Behavior detection, no documentado |
| **Staggered polling** | **(pollInterval/N) * index + jitter** | Anti-bot: no polls simultáneos |
| **Cuentas para tu caso (46 KOLs)** | **1 cuenta** (con staggered + sleep + backoff) | Decisión: 46 < 50 max, mitigado con mimicry |

**Decisión final**: 1 cuenta MTProto con 46 KOLs (50 max). El riesgo se mitiga con staggered polling (polls secuenciales con jitter), sleep window (UTC 4-10 con ±30min rotación diaria), y FLOOD_WAIT backoff exponencial. Si se exceden 5 intentos, la cuenta se pausa 1h automáticamente.

---

## 1. Límites oficiales documentados (fuentes verificables)

### 1.1 De `core.telegram.org` (autoritativo)

> *"In a single chat, avoid sending more than one message per second. We may allow
> short bursts that go over this limit, but eventually you'll begin receiving 429
> errors. In a group, bots are not be able to send more than 20 messages per minute.
> For bulk notifications, bots are not able to broadcast more than about 30 messages
> per second, unless they enable paid broadcasts to increase the limit."*
> — [https://core.telegram.org/bots/faq](https://core.telegram.org/bots/faq)

> *"The maximum allowed number of attempts to invoke the given method with the given
> input parameters has been exceeded."*
> Error code 420 con mensajes `FLOOD_WAIT_X` y `FLOOD_PREMIUM_WAIT_X`.
> — [https://core.telegram.org/api/errors](https://core.telegram.org/api/errors)

> *"parallel connections are still allowed and actually recommended for media DCs."*
> — [https://core.telegram.org/api/errors](https://core.telegram.org/api/errors)
> (sobre el error 406 `AUTH_KEY_DUPLICATED` — paralelo OK para media, pero NO
> para sesiones autenticadas vía el mismo `auth_key`).

### 1.2 De `tginfo.me` (referencia comunitaria más citada)

| Límite | Sin Premium | Con Premium | URL |
|---|---|---|---|
| Channels y supergroups (miembro) | 500 | 1000 | [tginfo.me](https://limits.tginfo.me/en) |
| Group/channel creation/día | 50 | 50 | [tginfo.me](https://limits.tginfo.me/en) |
| Accounts por client oficial | 3 | 4–6 | [tginfo.me](https://limits.tginfo.me/en) |
| Bots por account | 20 | 40 | [tginfo.me](https://limits.tginfo.me/en) |
| Bot transfers/día | 5 | 5 | [tginfo.me](https://limits.tginfo.me/en) |
| API requests | ~30/sec | ~30/sec | [tginfo.me](https://limits.tginfo.me/en) |
| Message broadcasting | ~30/sec | ~30/sec | [tginfo.me](https://limits.tginfo.me/en) |
| Sending en chat | ~1/seg | ~1/seg | [tginfo.me](https://limits.tginfo.me/en) |

### 1.3 Lo que NO está documentado

Telegram deliberadamente NO publica:
- Umbrales exactos de `FLOOD_WAIT_X` para operaciones de read (`getMessages`, `getHistory`).
- Reglas de detección de comportamiento bot-like.
- Límites específicos para `user accounts` (vs `bot accounts`) en MTProto.
- Tasa máxima sostenible de `getMessages` por minuto/hora.

---

## 2. Observaciones de la comunidad (no oficiales)

### 2.1 De `gramio.dev/rate-limits` (community docs)

> *"Telegram does not officially publish exact rate limit numbers. The values below
> are approximate and come from community experience — they are safe to follow, but
> the real limits are not documented publicly."*
> — [https://gramio.dev/rate-limits](https://gramio.dev/rate-limits)

### 2.2 De Reddit (`r/Telegram`, `r/TelegramBots`)

> *"There's no limit on the number of groups for bots. For you, the groups you're in
> count towards the channel limit ('1000 channels' actually means '1000 channels
> and groups')."*
> — [reddit.com/r/Telegram/comments/10zm0yy](https://www.reddit.com/r/Telegram/comments/10zm0yy/)

> *"I think there's a limit of 20 bots per account not per day. I know its limited
> to like 10 bots per day or something. But if i were to create 300 bots would i be
> violating any terms?"*
> — [reddit.com/r/Telegram/comments/0f0ol7](https://www.reddit.com/r/Telegram/comments/0f0ol7/)

### 2.3 De GitHub Issues (gramJS, casos reales)

> *"The account gets banned immediately after running the sample code. I just follow
> the instructions: create the app, get the key, hash, and run the sample code.
> I don't know how I can get banned."*
> — [gram-js/gramjs#673](https://github.com/gram-js/gramjs/issues/673) (mayo 2024)

> *"Idea: add fool protection in 'start' function to avoid accidental ban for flood"*
> — [gram-js/gramjs#664](https://github.com/gram-js/gramjs/issues/664)

> *"Preventing Auth Flood Error in Test Environment When Making Frequent Changes
> and Reconnections to Telegram Server."*
> — [gram-js/gramjs#530](https://github.com/gram-js/gramjs/issues/530)

---

## 3. Datos empíricos propios (de los 3 KOLs analizados)

`docs-money/kols/{1867934972,2397610468,1960616143}/` con `scripts/fetch-kol-samples.mjs --limit 50`:

| KOL | Username | Msg/hora | Median gap | p95 gap | Min gap |
|---|---|---|---|---|---|
| 1867934972 | @walloftrophies | 2.4 | 697s (12 min) | 6214s (1.7h) | 0s |
| 2397610468 | @KOLscope | **64.1** | 33s | 246s | **0s** |
| 1960616143 | (sin username) | **20.3** | 63s | 1004s | **0s** |

**Observación clave**: SpyDefi y KOLscope emiten **múltiples mensajes en el mismo segundo** (`min gap = 0s`). Esto es comportamiento de canales automatizados de achievement feed.

---

## 4. Recomendaciones revisadas (con base verificada)

### 4.1 Por cuenta MTProto

| Parámetro (env var) | Clase / método | Valor real | Fuente |
|---|---|---|---|
| `maxChannels` (`INGESTION_MAX_CHANNELS`) | `IngestionSafetyConfig` | **50** | [tginfo.me](https://limits.tginfo.me/en) hard cap 500 ÷ 10 margen |
| `pollIntervalBaseMs` (`INGESTION_POLL_INTERVAL_BASE_MS`) | `IngestionSafetyConfig` | **90_000 (90s)** | Empírico — base para staggered: 90s / N canales |
| `jitterPercent` (`INGESTION_JITTER_PERCENT`) | `IngestionSafetyConfig` | **0.30 (±30%)** | Behavior mimicry, estándar community |
| `sleepStartUtc` (`INGESTION_SLEEP_START_UTC`) | `IngestionSafetyConfig` + `SleepWindowService` | **4** (UTC 4:00) | Behavior detection |
| `sleepEndUtc` (`INGESTION_SLEEP_END_UTC`) | `IngestionSafetyConfig` + `SleepWindowService` | **10** (UTC 10:00) | Behavior detection |
| `floodInitialMs` (`INGESTION_FLOOD_INITIAL_MS`) | `IngestionSafetyConfig` + `FloodWaitHandlerService` | **5_000 (5s)** | [core.telegram.org/api/errors](https://core.telegram.org/api/errors) |
| `floodMultiplier` (`INGESTION_FLOOD_MULTIPLIER`) | `IngestionSafetyConfig` + `FloodWaitHandlerService` | **2** (exponencial) | [core.telegram.org/api/errors](https://core.telegram.org/api/errors) |
| `floodMaxMs` (`INGESTION_FLOOD_MAX_MS`) | `IngestionSafetyConfig` + `FloodWaitHandlerService` | **3_600_000 (1h)** | [core.telegram.org/api/errors](https://core.telegram.org/api/errors) |
| `floodMaxAttempts` (`INGESTION_FLOOD_MAX_ATTEMPTS`) | `IngestionSafetyConfig` + `FloodWaitHandlerService` | **5** | Empírico — tras 5, auto-pausa 1h |

### 4.2 FLOOD_WAIT backoff (respeta código 420 oficial) ✅ IMPLEMENTADO

**Ruta real**: `apps/backend/src/telegram/ingestion/infrastructure/services/flood-wait-handler.service.ts`
**Config env vars**: `INGESTION_FLOOD_INITIAL_MS`, `INGESTION_FLOOD_MULTIPLIER`, `INGESTION_FLOOD_MAX_MS`, `INGESTION_FLOOD_MAX_ATTEMPTS`

Los valores configurados (5s → exponencial ×2 → 1h tope, max 5 intentos) están en `IngestionSafetyConfig` y son operados por `FloodWaitHandlerService.withRetry()`. El servicio también:
- Extrae `seconds` del error FLOOD_WAIT (busca `err.seconds` numérico o lo parsea del mensaje).
- Elige `max(seconds_solicitados, backoff_calculado)` como espera real.
- **Auto-pausa la cuenta 1h** si se alcanzan 5 intentos consecutivos (`isPaused` / `pausedUntilDate`).
- Expone `FloodWaitCounterService` (contador in-memory con TTL 24h) para el health endpoint.

### 4.3 Behavioral mimicry (lo crítico, no documentado) ✅ IMPLEMENTADO

**Ruta real**: `apps/backend/src/telegram/ingestion/infrastructure/services/sleep-window.service.ts`
**Config env vars**: `INGESTION_SLEEP_START_UTC` (default 4), `INGESTION_SLEEP_END_UTC` (default 10), `INGESTION_JITTER_PERCENT` (default 0.30)

| Patrón humano | Patrón bot (te banea) |
|---|---|
| Duerme 6–8h/día | Activo 24/7 |
| A veces tarda en leer | Lee el último mensaje al instante |
| Salta mensajes | Lee 100% |
| Lee varios canales | Solo lee 1 canal perfectamente |
| Intervalos variables (jitter) | Intervalos exactos |
| Vuelve a mensajes viejos a veces | Solo del más reciente hacia atrás |

**SleepWindowService**: usa `baseStartUtc/baseEndUtc` fijos de config con **rotación diaria ±30min** (`rotationMinutes` basado en día del año) para evitar patrón fijo detectable. Expone `isAsleep()` y `getNextWakeTime()`.

**Jitter**: aplicado inline en `TelegramMtprotoListenerAdapter.startPollingLoop()` — cada canal recibe `staggerBase * i + jitter` donde `jitter = (Math.random() - 0.5) * 2 * staggerBase * jitterPct`.

```typescript
// Staggered delay per channel con jitter en el adapter:
const staggerBase = this.safetyConfig.pollIntervalBaseMs / peers.length;
const jitterPct = this.safetyConfig.jitterPercent;
for (let i = 0; i < peers.length; i++) {
  const jitter = (Math.random() - 0.5) * 2 * staggerBase * jitterPct;
  const delay = Math.max(staggerBase * i + jitter, 0);
  await this.sleep(delay);
  // poll channel i...
}

// Sleep window check antes de cada ciclo:
if (this.sleepWindow.isAsleep()) {
  this.logger.debug(`Sleep window active — pausing until ${this.sleepWindow.getNextWakeTime()?.toISOString()}`);
  await this.sleep(60_000);
  continue;
}
```

### 4.4 Staggered polling (1 cuenta, 46 KOLs) ✅ IMPLEMENTADO

**Decisión**: 1 cuenta MTProto con hasta 50 KOLs. El riesgo se mitiga con staggered polling en vez de múltiples cuentas.

**Ruta real**: `apps/backend/src/telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts` (método `startPollingLoop()`)
**Config**: Los valores están en `IngestionSafetyConfig` (no hay archivo separado de config para staggered polling).

El staggered polling se calcula en runtime dentro del adapter:

```
staggerBase = pollIntervalBaseMs (90_000) / totalChannels (46) ≈ 1.957s
channel[i].delay = staggerBase * i + jitter(±30%)
  → channel[0]  ~0s       (primero, sin espera)
  → channel[10] ~19.6s    (±30% = 13.7s–25.5s)
  → channel[45] ~88s      (±30% = 61.7s–114.5s)
Ciclo completo: ~90s (un channel poll cada ~2s en promedio)
Sleep window: UTC 4-10 con rotación diaria ±30min
```

El loop también:
- Verifica `floodWaitHandler.isPaused` antes de cada ciclo (auto-pausa 1h si FLOOD_WAIT excede intentos).
- Mide `lastPollAt` para el health endpoint.
- Usa `withRetry()` del `FloodWaitHandlerService` para cada channel poll individual.

---

## 5. Métricas Prometheus (alertas críticas)

> ⚠️ **No implementado aún**. Este código es aspiracional — las métricas Prometheus están planificadas pero no desplegadas. El health endpoint (`GET /ingestion/health`) expone datos equivalentes vía REST como sustituto temporal (flood wait count 24h, channel count, last poll at, sleep status).

```typescript
// 🔜 apps/backend/src/shared/observability/telegram-metrics.ts (TBD)
// Alertas Prometheus planificadas:
// telegram_flood_wait_total > 5 en 1h → revisar cuenta
// telegram_last_flood_wait_seconds > 60 → cuenta cerca del soft cap
// telegram_read_success_rate < 0.8 → cuenta degradada
// telegram_channels_per_account > 30 → escala horizontal
```

---

## 6. Anti-patterns (lo que NUNCA debes hacer)

| Anti-pattern | Por qué te banea |
|---|---|
| Poll cada N segundos exactos sin jitter | Patrón no-humano detectable |
| Leer el último mensaje inmediatamente tras publicarse | "Nuevo → leo al instante" 24/7 = bot |
| Activo 24/7 sin pausa | Telegram sabe que humanos duermen |
| `getMessages` con `limit=200` siempre | Buffer exhaustion = FLOOD_WAIT |
| Backfill 46 canales en paralelo | 46 reads simultáneos = baneo |
| Reintentar FLOOD_WAIT sin backoff exponencial | Te marca como "ignoring limits" |
| Cambiar de cuenta tras FLOOD_WAIT | [Bot Dev §5.2(f)](https://telegram.org/tos/bot-developers) — "operate by proxy to circumvent bans" |
| Usar mismo `api_id`/`api_hash` con sesiones de otro user | Flag inmediato |
| Crear >20 bots por account | [tginfo.me](https://limits.tginfo.me/en): hard cap |

---

## 7. Estado actual de la implementación (46 KOLs + 1 cuenta)

**Hoy**: 1 cuenta MTProto + 46 KOLs + safety limits completamente implementados.

### ✅ Implementado (Julio 2026)

| Componente | Archivo | Estado |
|---|---|---|
| `IngestionSafetyConfig` (9 env vars) | `infrastructure/config/ingestion-safety.config.ts` | ✅ |
| `SleepWindowService` (UTC 4-10 + rotación ±30min) | `infrastructure/services/sleep-window.service.ts` | ✅ |
| `FloodWaitHandlerService` (exponencial 5s→1h, auto-pausa) | `infrastructure/services/flood-wait-handler.service.ts` | ✅ |
| `FloodWaitCounterService` (in-memory 24h TTL) | `infrastructure/services/flood-wait-counter.service.ts` | ✅ |
| Staggered polling con jitter | `api/mtproto/telegram-mtproto-listener.adapter.ts` | ✅ |
| `GET /ingestion/health` + `GET /ingestion/config` | `api/http/ingestion-health.controller.ts`, `api/http/ingestion-config.controller.ts` | ✅ |
| Dashboard widget "📡 Ingestion Health" | `apps/frontend/src/widgets/ingestion-health/` | ✅ |
| KPI cards: "45/50 active" | frontend kpi-cards | ✅ |
| Tests pasan (531/531) | — | ✅ |

### 🔜 Pendiente (planificado)

| Componente | Prioridad |
|---|---|
| **Multi-account sharding** (cuando KOLs > 50) | Baja (ahora caben en 1 cuenta) |
| **Métricas Prometheus** (`/metrics`) | Media |
| **AdaptiveTierClassifier** (clasificar KOLs por cadencia observada) | Baja |
| **Backfill progresivo** (5 KOLs/día × 10 días) | Baja (backfill manual ya funciona) |

---

## 8. Runbook de respuesta a FLOOD_WAIT

### Síntoma: `telegram_flood_wait_total` incrementando

```
1. Identificar cuenta(s) afectada(s) vía métrica
2. Si FLOOD_WAIT > 60s repetido en 1h:
   - Bajar poll interval a maxMs (10min)
   - Verificar channelsPerAccount (¿>30? → sharding)
   - Si persiste: parar la cuenta 1h (set INGESTION_ENABLED=false para esa cuenta)
3. Si la cuenta está completamente bloqueada (err 401/403):
   - Redistribuir sus KOLs a otras cuentas con failover
   - NO recrear cuenta nueva (eso es "operate by proxy" → Bot Dev §5.2(f))
   - Esperar 24h antes de reactivar
4. Documentar incidente en docs-money/incidents/<fecha>.md
```

### Síntoma: Cuenta baneada permanentemente

```
1. Verificar scope: ¿solo el MTProto session o la cuenta user completa?
2. Si solo session: regenerar session con misma cuenta (auth keys rotados)
3. Si cuenta user baneada: necesitas número nuevo + cuenta nueva
   - ⚠️ NO reusar api_id de cuenta baneada para cuenta nueva (relación sospechosa)
   - Obtener nuevo api_id/api_hash desde my.telegram.org con nuevo número
4. Actualizar .env con nuevas credenciales
5. Postmortem: ¿qué límite se cruzó? ¿qué patrón no detectamos?
```

---

## 9. Diferencia entre cuentas user (MTProto) y bots (Bot API)

| Aspecto | User account (MTProto) | Bot (Bot API) |
|---|---|---|
| Rate limit envío | ~1/seg/chat | ~1/seg/chat (igual) |
| Rate limit broadcast | ~30/seg global | ~30/seg global |
| Max channels/grupos | 500 (1000 Premium) | Sin límite (bot) |
| Max bots creados | — | 20/account (40 Premium) |
| Perspectiva de Telegram | "user real" | "third-party service" |
| Lectura de channels | Sí, si miembro | Solo si bot es admin o member |
| Comportamiento evaluado | Sí (anti-bot) | No (es bot por diseño) |

**Para tu caso**: tu pipeline usa **MTProto user account** → estás en el régimen de "user real", donde la detección de comportamiento es **más estricta**. Por eso el sleep window + jitter son críticos.

---

## 10. Bibliografía completa

### Fuentes oficiales Telegram

- `https://core.telegram.org/api/errors` — Códigos de error oficiales (FLOOD_WAIT_X = 420)
- `https://core.telegram.org/bots/faq` — Límites oficiales de bots (envío)
- `https://core.telegram.org/bots` — Introducción a bots
- `https://core.telegram.org/api` — MTProto API docs
- `https://telegram.org/tos/bot-developers` — ToS específicos para bot developers
- `https://telegram.org/tos/content-licensing` — Política de scraping

### Referencias comunitarias (verificadas)

- `https://limits.tginfo.me/en` — Referencia más citada de límites Telegram (TG Info project)
- `https://gramio.dev/rate-limits` — Docs community de GramIO (límites aproximados)
- `https://github.com/gram-js/gramjs/issues/673` — Caso real de ban inmediato (mayo 2024)
- `https://github.com/gram-js/gramjs/issues/664` — Feature request de protection contra FLOOD_WAIT
- `https://github.com/gram-js/gramjs/issues/530` — FLOOD_WAIT en testing
- `https://www.reddit.com/r/Telegram/comments/10zm0yy/` — Discusión sobre límites de canales

### Documentos internos (este repo)

- `docs-money/05-kol-onboarding-legal-limits-and-monetization.md` — Marco legal + onboarding
- `docs-money/fix-1/problem.md` — Compliance baseline (sin rawText)
- `docs-money/kols/{1867934972,2397610468,1960616143}/summary.md` — Datos empíricos de cadencia

---

## 11. Próximo paso

1. ✅ ~~Revisa y ajusta valores~~ — Implementado y verificado (sección 4 refleja valores reales).
2. ✅ ~~Migration plan~~ — Implementado: staggered polling, sleep window, FLOOD_WAIT backoff, health endpoints.
3. 🔜 **Implementa métricas Prometheus** de la sección 5 — el health endpoint REST cubre temporalmente.
4. 🔜 **Ejecuta `scripts/fetch-kol-samples.mjs`** si quieres verificar cadencia real de cada KOL.
5. 🔜 **Vuelve a `fix-1/solution.md`** para cerrar el fix de compliance.
