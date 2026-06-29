# Draft: Telegram Dashboard & Rate Limits — Single Account Plan

## Analysis of actual ToS docs (fetched live June 27, 2026)

### ToS aplicables

| Documento | Cláusula clave | Impacto en el pipeline |
|---|---|---|
| **API ToS §1.4** | "It is forbidden to interfere with the basic functionality of Telegram" | Leer canales a escala NO es "interferir" si respetas FLOOD_WAIT |
| **API ToS §3.3** | "If your app allows accessing content from Telegram channels, you must include support for official sponsored messages" | Aplica solo si publicas contenido de canales — tu pipeline no republica UGC |
| **Bot Dev §4.3** | "scraping public group or channel contents" prohibido | ⚠️ El pipeline LEE canales públicos. La defensa: extrae SOLO metadatos, no persiste raw text, no republica UGC |
| **Bot Dev §4.2** | "Delete user data upon their request... when retention becomes unnecessary" | Debes poder borrar data de un KOL en ≤30 días si lo pide |
| **Bot Dev §5.2(f)** | "must not attempt to circumvent or otherwise undermine Telegram rate limits" | ⛔ No ignorar FLOOD_WAIT. No cambiar de cuenta para evadir ban |
| **Content Licensing** | "Access to user-generated content for any purpose other than ordinary, legitimate, and intended use is prohibited" | ❓ El debate: ¿leer 45 canales cada 60s es "ordinary use"? La respuesta corta: NO, pero Telegram lo permite mientras respetes FLOOD_WAIT |

### El riesgo real (no es teoría)

El pipeline NO viola ToS en lo que hace (extraer metadatos, no republicar UGC, no entrenar AI). El riesgo es que Telegram detecte el **comportamiento** como no-humano y **bane la cuenta** — no por scraping, sino por "interferir con la funcionalidad básica" (API ToS §1.4) al hacer reads a escala.

Los bans documentados en la comunidad (gramjs#673) son por **comportamiento**, no por violar cláusulas específicas.

---

## Recomendaciones finales — Una sola cuenta MTProto

### 1. Canales máximos recomendados: 40-50

| Factor | Valor |
|---|---|
| **Recomendado** | **40-45 canales** (tu seed actual de 45 está en el límite) |
| Hard cap técnico | 500 canales+grupos (tginfo.me) |
| Soft cap reads | ~30-50 (consenso comunidad) |
| Tu seed actual | 45 KOLs |
| **Riesgo con 45** | **MEDIO** — factible con Premium + sleep + jitter |
| Si excedes 50 | Riesgo ALTO de FLOOD_WAIT progresivo → ban |

**Condiciones para 45 canales:**
- ✅ Cuenta **Premium** recomendada (mejores límites: 1000 canales, menos FLOOD_WAIT)
- ✅ Staggering: NO poll all 45 at once, distribuir en ventana de 60-120s
- ✅ Jitter ±30% obligatorio en CADA intervalo
- ✅ Sleep window 6-8h/día OBLIGATORIO
- ✅ Monitoreo de FLOOD_WAIT: si ves waits >60s, reducir canales

### 2. Mensajes por minuto recomendados: 1 por canal, el último

| Factor | Valor |
|---|---|
| **Recomendado** | **1 msg/channel/poll** (el más reciente) |
| Requests/seg promedio | 45 canales × 1 poll / 60s = **0.75 req/s** |
| Límite MTProto reads | ~2-3 req/s (community estimate) |
| **Margen de seguridad** | **4x** (0.75 vs 3 req/s) ✅ |

**Cómo implementarlo:**
```typescript
// NO: poll every channel at the same second
await Promise.all(channels.map(c => getMessages(c, {limit: 1}))); // ❌ BURST

// SÍ: stagger across the window
const windowMs = 60_000;
const channels = [...activeChannels];
for (let i = 0; i < channels.length; i++) {
  const delay = (windowMs / channels.length) * i + randomJitter(0.3);
  setTimeout(() => pollChannel(channels[i]), delay);
}
```

**Si quieres escalar a 100 canales:**
- 100 canales × 1 poll / 120s = 0.83 req/s (sigue dentro del límite)
- Pero: 100 canales en una cuenta es ALTO RIESGO
- Alternativa: 50/cuenta × 2 cuentas = 100 canales

### 3. Poll interval recomendado: 60-120s por canal

| Parámetro | Valor | Razón |
|---|---|---|
| Intervalo base | **90s** promedio | Entre 60s (rápido) y 120s (seguro) |
| Jitter | **±30%** | 63-117s cada poll, nunca exacto |
| Stagger entre canales | `(60_000 / N) × i + jitter` ms | Distribuir N polls en 60s |
| Poll simultáneo máximo | **Nunca** | 1 request a la vez (secuencial con delay) |

**Comportamiento resultante:**
- 45 canales, cada uno poll cada 63-117s (impredecible)
- ~0.75 req/s sostenido
- Sin bursts, sin patrones exactos

### 4. Sleep window: 12am-6am AST (UTC 4:00-10:00)

| Aspecto | Valor |
|---|---|
| Zona horaria | AST (Atlantic Standard Time, UTC-4) |
| Ventana dormir | **00:00 - 06:00 AST** |
| En UTC | **04:00 - 10:00 UTC** |
| Implementación | Configurable via env `SLEEP_WINDOW_START` / `SLEEP_WINDOW_END` en UTC |
| Rotación diaria | La ventana puede rotar ±1h para evitar patrón fijo |

### 5. FLOOD_WAIT backoff (NO opcional)

```typescript
export const FLOOD_WAIT_BACKOFF = {
  initialMs:          5_000,      // 5s
  multiplier:         2,          // exponencial
  maxMs:              3_600_000,  // 1h tope
  maxAttempts:        5,          // tras 5, parar la cuenta
  resetAfterSuccessMs: 60_000,    // reset si pasan 60s sin error
};
```

**Si recibes FLOOD_WAIT > 60s repetido:**
1. Bajar intervalo de poll a 300s (5min)
2. Si persiste → pausar la cuenta por 1h
3. Si continúa por 24h → reducir canales activos de 45 a 30

### 6. Anti-patrones que garantizan ban

| Patrón | Por qué te banea |
|---|---|
| 45 polls simultáneos cada 60s exactos | Burst + patrón exacto = bot |
| Sin sleep window | 24/7 sin pausa = bot |
| Sin jitter | Cada canal poll cada 60.000ms exactos = bot |
| Ignorar FLOOD_WAIT | "undermine Telegram rate limits" (Bot Dev §5.2(f)) |
| Usar misma api_id en cuenta nueva tras ban | "operate by proxy" (Bot Dev §5.2(f)) |
| Persistir raw text del mensaje | Bot Dev §4.3 scraping |
| Republicar texto literal del KOL | Content Licensing violación |

### 7. Dashboard: qué mostrar

**En vez de** "45/45 active" (mentira):

```
┌────────────────────────────────────┐
│  📡 Telegram Ingestion Health      │
├────────────────────────────────────┤
│  Canales activos:  45 / 45 seed    │
│  Actualmente polling: 43 ✅         │ ← health check real
│  Último poll: hace 12s             │
│                                    │
│  FLOOD_WAIT (24h):   3             │ ← alerta si >5
│  Max wait (24h):     45s           │ ← alerta si >60s
│  Sleep window:       🌙 activo     │
│  (00:00-06:00 AST)                 │
│                                    │
│  ⚠️ Channels at 90% of 50 max     │ ← barra progreso
│  ████████████░░░░░░ 45/50          │
└────────────────────────────────────┘
```

### 8. Resumen de límites seguros

| Threshold | Valor | Qué pasa si lo excedes |
|---|---|---|
| Max channels | **50** (recomendado 40-45) | FLOOD_WAIT progresivo → cuenta lenta → ban |
| Max req/s | **~2 req/s** sostenido | FLOOD_WAIT 420 errors |
| Poll interval | **60-120s** con jitter | Sin jitter: patrón detectable |
| Sleep window | **6-8h/día** requerido | Sin sleep: 24/7 = ban |
| FLOOD_WAIT max | **60s** antes de reducir | >60s repetido = soft ban inminente |
| FLOOD_WAIT count/día | **< 5** | >10/día = acción manual requerida |

---

## Decisiones para el plan

| # | Decisión |
|---|----------|
| 1 | **Usar 1 cuenta para los 45 KOLs actuales** con las condiciones de seguridad arriba |
| 2 | Dashboard muestra **IngestionHealth** en vez de "45/45 activos" |
| 3 | Los safety limits NO son configurables desde frontend; son env/backend |
| 4 | El frontend muestra los safety limits como **referencia** (read-only) + alertas |
| 5 | Sleep window default: UTC 4:00-10:00 (AST), configurable via env |
| 6 | Polling: staggered + jitter, NUNCA simultáneo |
| 7 | FLOOD_WAIT monitoring obligatorio antes de hacer polling escalado |
