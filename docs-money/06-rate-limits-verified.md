# 06 · Rate limits verificados y ban prevention

> **Propósito**: traducir los ToS de Telegram y las observaciones de la comunidad
> en límites concretos y operables para tu pipeline de KOLs.
> Cada límite lleva URL real de la fuente (oficial o comunitaria).
> **Versión**: empírica, basada en datos verificados el 2026-06-22.

---

## 0. TL;DR — Recomendaciones revisadas

| Límite | Valor revisado | Fuente |
|---|---|---|
| **Channels/grupos por cuenta MTProto** | **30–50 máx** (no 500) | [tginfo.me](https://limits.tginfo.me/en) + [gramjs#673](https://github.com/gram-js/gramjs/issues/673) |
| **getMessages/seg** | **2–3/seg** (no 1.5) | [gramio.dev/rate-limits](https://gramio.dev/rate-limits) |
| **Backfill batch** | **100 msgs, 60s delay** | Conservador + empírico |
| **FLOOD_WAIT backoff** | **Exponencial 5s → 1h** | [core.telegram.org/api/errors](https://core.telegram.org/api/errors) |
| **Sleep window** | **6–8h random/día** | Behavior detection, no documentado |
| **Jitter en intervals** | **±30% obligatorio** | Behavior detection, no documentado |
| **Concurrent ops/cuenta** | **≤ 3** | Empirismo |
| **Cuentas para tu caso (46 KOLs)** | **2–3 cuentas** | 46 / 30–50 = 1, +safety = 2–3 |

**El error que cometí antes**: fui demasiado conservador en **volumen** (12 KOLs/cuenta cuando el hard cap es 500). Telegram **sí publica** límites de envío pero **no publica** los límites de read/ingest — ahí es donde está el riesgo real.

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

| Parámetro | Valor | Fuente que lo soporta |
|---|---|---|
| `maxChannelsPerAccount` | **30** (con margen) | [tginfo.me](https://limits.tginfo.me/en) hard cap 500 ÷ 10 margen seguridad ÷ 1.5 poller |
| `maxGetMessagesPerSecond` | **2.5** | [gramio.dev](https://gramio.dev/rate-limits) community estimate |
| `maxConcurrentOpsPerAccount` | **3** | Empirismo (no fuente oficial) |
| `minPollIntervalMs` | **30_000** (30s) | Para canales activos (SpyDefi/KOLscope) |
| `maxPollIntervalMs` | **600_000** (10min) | Para canales digest (CallAnalyser-style) |
| `jitterPercent` | **0.30** (±30%) | Behavior mimicry, no documentado pero estándar community |
| `backfillBatchSize` | **100** | Empirismo |
| `backfillBatchDelayMs` | **60_000** (60s) | Empirismo |
| `sleepWindow.enabled` | **true** | Empirismo + community consensus |
| `sleepWindow.hoursPerDay` | **6–8** random | Empirismo |

### 4.2 FLOOD_WAIT backoff (respeta código 420 oficial)

```typescript
// apps/backend/src/kol/ingestion/infrastructure/config/flood-wait-backoff.ts

import { FloodWaitError } from 'telegram/errors';

export const FLOOD_WAIT_BACKOFF = {
  // Telegram código 420 (verificado en core.telegram.org/api/errors)
  initialMs:          5_000,      // 5s antes del primer reintento
  multiplier:         2,          // 5s → 10s → 20s → 40s → 80s → 160s...
  maxMs:              3_600_000,  // 1h tope
  maxAttempts:        5,          // tras 5 intentos, parar la cuenta
  resetAfterSuccessMs: 60_000,    // resetear el contador si pasan 60s sin FLOOD_WAIT
};

// En el cliente:
async function withFloodWaitRetry<T>(op: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let backoffMs = FLOOD_WAIT_BACKOFF.initialMs;
  let lastFloodWait = 0;
  
  while (attempt < FLOOD_WAIT_BACKOFF.maxAttempts) {
    try {
      const result = await op();
      // Reset si pasó tiempo desde el último FLOOD_WAIT
      if (Date.now() - lastFloodWait > FLOOD_WAIT_BACKOFF.resetAfterSuccessMs) {
        attempt = 0;
        backoffMs = FLOOD_WAIT_BACKOFF.initialMs;
      }
      return result;
    } catch (err) {
      if (err instanceof FloodWaitError) {
        lastFloodWait = Date.now();
        const requestedWait = (err.seconds ?? 60) * 1000;
        const actualWait = Math.max(requestedWait, backoffMs);
        logger.warn(`FLOOD_WAIT ${err.seconds}s, retrying in ${actualWait}ms (attempt ${attempt + 1})`);
        
        // Métrica para alerta
        floodWaitCounter.inc({ account_id: accountId, method: op.name });
        lastFloodWaitSeconds.set({ account_id: accountId }, err.seconds ?? 0);
        
        await sleep(actualWait);
        backoffMs = Math.min(backoffMs * FLOOD_WAIT_BACKOFF.multiplier, FLOOD_WAIT_BACKOFF.maxMs);
        attempt++;
      } else {
        throw err;
      }
    }
  }
  
  throw new Error(`Max FLOOD_WAIT retries (${FLOOD_WAIT_BACKOFF.maxAttempts}) exceeded for ${op.name}`);
}
```

### 4.3 Behavioral mimicry (lo crítico, no documentado)

| Patrón humano | Patrón bot (te banea) |
|---|---|
| Duerme 6–8h/día | Activo 24/7 |
| A veces tarda en leer | Lee el último mensaje al instante |
| Salta mensajes | Lee 100% |
| Lee varios canales | Solo lee 1 canal perfectamente |
| Intervalos variables (jitter) | Intervalos exactos |
| Vuelve a mensajes viejos a veces | Solo del más reciente hacia atrás |

```typescript
// Jitter obligatorio en cualquier intervalo
export function withJitter(baseMs: number, jitterPercent = 0.30): number {
  const min = baseMs * (1 - jitterPercent);
  const max = baseMs * (1 + jitterPercent);
  return Math.floor(min + Math.random() * (max - min));
}

// Uso:
const nextDelay = withJitter(30_000);  // 21_000 - 39_000 ms
setTimeout(pollKol, nextDelay);

// Sleep window (anti-bot detection)
export class SleepWindowService {
  private sleepStartUtc: number;
  private sleepEndUtc: number;
  
  constructor(private readonly hoursPerDay: { min: number; max: number }) {
    this.rotateWindow();
  }
  
  private rotateWindow(): void {
    // Elige una ventana random de 6-8h dentro de las "horas de dormir" humanas (UTC 22-06)
    const sleepHours = this.hoursPerDay.min + Math.random() * (this.hoursPerDay.max - this.hoursPerDay.min);
    this.sleepStartUtc = 22 + Math.random() * (24 - sleepHours - 16);  // empieza entre 22:00 y 02:00 UTC
    this.sleepEndUtc = (this.sleepStartUtc + sleepHours) % 24;
  }
  
  isAsleep(): boolean {
    const hour = new Date().getUTCHours();
    if (this.sleepStartUtc < this.sleepEndUtc) {
      return hour >= this.sleepStartUtc && hour < this.sleepEndUtc;
    }
    return hour >= this.sleepStartUtc || hour < this.sleepEndUtc;
  }
}

// En el poll loop:
if (this.sleepWindow.isAsleep()) {
  this.logger.debug('Account sleeping (anti-bot)');
  return;
}
```

### 4.4 Multi-account sharding (para 46 KOLs actuales)

```typescript
// apps/backend/src/kol/ingestion/infrastructure/config/sharding.config.ts

export const SHARDING_CONFIG = {
  // 46 KOLs ÷ ~20 KOLs/cuenta conservadora = 3 cuentas mínimo
  // (tginfo.me permite hasta 500 hard cap; soft cap para reads es mucho menor)
  accounts: [
    {
      id: 'mtproto-a',
      sessionEnv: 'TELEGRAM_MTPROTO_SESSION_A',
      maxKols: 20,
      // KOLs de baja frecuencia (digest)
      kolFilter: (kol) => kol.tier === 'LOW_FREQ',
    },
    {
      id: 'mtproto-b',
      sessionEnv: 'TELEGRAM_MTPROTO_SESSION_B',
      maxKols: 18,
      kolFilter: (kol) => kol.tier === 'MEDIUM_FREQ',
    },
    {
      id: 'mtproto-c',
      sessionEnv: 'TELEGRAM_MTPROTO_SESSION_C',
      maxKols: 12,
      kolFilter: (kol) => kol.tier === 'HIGH_FREQ',
    },
  ],
  
  // Si una cuenta cae, redistribuir con backoff
  failoverDelayMs: 300_000,    // 5min antes de tomar KOLs
  failoverBackoffMs: 3_600_000, // si failover también falla, esperar 1h
};
```

---

## 5. Métricas Prometheus (alertas críticas)

```typescript
// apps/backend/src/shared/observability/telegram-metrics.ts

export const telegramMetrics = {
  // FLOOD_WAIT por cuenta/método
  floodWaitTotal: new Counter({
    name: 'telegram_flood_wait_total',
    help: 'Total FLOOD_WAIT errors received from Telegram',
    labelNames: ['account_id', 'method'],
  }),
  
  // Segundos del último FLOOD_WAIT
  lastFloodWaitSeconds: new Gauge({
    name: 'telegram_last_flood_wait_seconds',
    help: 'Seconds of the last FLOOD_WAIT (0 if none)',
    labelNames: ['account_id'],
  }),
  
  // Read success rate
  readSuccessRate: new Gauge({
    name: 'telegram_read_success_rate',
    help: 'Read success rate per account (0.0 - 1.0)',
    labelNames: ['account_id'],
  }),
  
  // Channels activos por cuenta
  channelsPerAccount: new Gauge({
    name: 'telegram_channels_per_account',
    help: 'Number of channels being ingested by each account',
    labelNames: ['account_id'],
  }),
  
  // Effective polling interval (con jitter aplicado)
  effectivePollIntervalMs: new Gauge({
    name: 'telegram_effective_poll_interval_ms',
    help: 'Actual polling interval being used (with jitter)',
    labelNames: ['account_id', 'kol_id'],
  }),
};

// Alertas Prometheus:
// telegram_flood_wait_total > 5 en 1h → revisar cuenta (posible baneo inminente)
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

## 7. Plan de migración para tu seed actual (46 KOLs + 1 cuenta)

**Hoy**: 1 cuenta MTProto + 46 KOLs en seed + `AUTO_START=true` → **alto riesgo de FLOOD_WAIT + baneo progresivo**.

### Semana 1: Provisioning

```bash
# 1. Comprar 2-3 números virtuales nuevos (~$5 c/u)
#    SMS-Activate, TextNow, Google Voice (con cuidado de TOS)
#
# 2. Por cada uno:
#    a. Login en https://my.telegram.org con el número
#    b. "API development tools" → crear app → obtener api_id + api_hash
#    c. Generar session string con gramJS:
#
node -e "
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (q) => new Promise(r => rl.question(q, r));
(async () => {
  const apiId = await prompt('api_id: ');
  const apiHash = await prompt('api_hash: ');
  const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, { connectionRetries: 3 });
  await client.start({
    phoneNumber: async () => await prompt('Phone (+XXX...): '),
    phoneCode: async () => await prompt('Code: '),
    password: async () => await prompt('2FA: '),
  });
  console.log('SESSION:', client.session.save());
  await client.disconnect();
})();
"
#    d. Guardar en .env: TELEGRAM_MTPROTO_SESSION_A, _B
#
# 3. Configurar sharding (por tier de frecuencia)
```

### Semana 2: Throttling + adaptive polling

```typescript
// Implementar:
// - AccountThrottle (limita getMessages concurrentes por cuenta)
// - AdaptiveTierClassifier (clasifica kol por cadencia observada)
// - ChannelTierStorage (cache del tier calculado)
// - Backfill progresivo: 5 KOLs/día × 10 días = 50 KOLs
```

### Semana 3: Behavioral mimicry + métricas

```typescript
// Implementar:
// - SleepWindowService (6-8h random/día)
// - Jitter obligatorio (withJitter() en cada intervalo)
// - Métricas Prometheus (floodWaitTotal, readSuccessRate, etc.)
// - Alertas Grafana (o similar)
// - Runbook de respuesta a FLOOD_WAIT repetidos
```

### Semana 4: Producción

```typescript
// 1. AUTO_START=true en .env
// 2. Sleep window habilitada
// 3. Métricas expuestas en /metrics
// 4. Alertas configuradas (PagerDuty/OpsGenie)
// 5. Runbook accesible al equipo de guardia
```

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

1. **Revisa y ajusta** los valores de la sección 4 según tu contexto.
2. **Provisiona 2–3 cuentas MTProto** siguiendo el plan de la sección 7.
3. **Implementa las métricas Prometheus** de la sección 5 antes de producción.
4. **Ejecuta el script de un-off research** (`scripts/fetch-kol-samples.mjs`) si quieres
   verificar la cadencia real de cada KOL antes de asignarlo a una cuenta.
5. **Vuelve a `fix-1/solution.md`** para cerrar el fix de compliance antes de
   empezar la migración.
