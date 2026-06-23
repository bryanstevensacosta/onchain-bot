# Frontend — Alpha Meta Token Scanner dashboard

Doc de referencia para construir el panel de control del pipeline alpha-call. Define qué endpoints usar en cada sección, qué datos mostrar y cómo presentar la UX/UI.

Base URL: `http://localhost:3030` (dev) — ajustar en producción.

---

## 1. Principios de diseño

- **Densidad sobre decoración**: un operador del bot necesita ver números y mover datos rápido, no landing-page marketing.
- **Live-first**: la página principal debe transmitir "está ingestando ahora mismo" (counters, timestamps relativos, animaciones sutiles de actualización).
- **Drill-down por dirección**: la identidad atómica del sistema es `(chain, address)`. Toda lista debe permitir click → vista de detalle.
- **Identidad visual de cada BC**: cada bounded context tiene un color para reconocer de un vistazo en qué fase está un token.
- **Mobile-friendly pero desktop-first**: la mayoría de uso va a ser desde un monitor mientras se opera.

### Paleta de colores por BC

| BC | Color | Hex |
|---|---|---|
| Ingestion / Telegram | `#3b82f6` (azul) | ingestión cruda |
| Extraction | `#8b5cf6` (violeta) | extracción de candidatos |
| Parsing | `#a855f7` (púrpura) | estructuración |
| Normalization | `#ec4899` (rosa) | dedup cross-channel |
| Chain detection | `#f59e0b` (ámbar) | resuelve chain |
| Enrichment | `#10b981` (verde) | datos de mercado |
| Classification | `#06b6d4` (cian) | tipo + riesgo |
| Scoring | `#eab308` (amarillo) | score 0-100 |
| Filtering | `#f97316` (naranja) | gates |
| Honeypot | `#ef4444` (rojo) | seguridad |
| Publishing | `#22c55e` (verde brillante) | enviado a TG |
| Analytics | `#64748b` (gris) | retrospectiva |

### Indicadores de estado

- 🟢 `APPROVED` / `PUBLISHED` / `SAFE`
- 🟡 `NEUTRAL` / `enriched with N provider errors`
- 🟠 `REJECTED` / `NO_HOLDERS` / `LOW_LIQUIDITY`
- 🔴 `HONEYPOT` / `FAILED` / `SCAM`
- ⚪ `UNKNOWN` / datos faltantes

---

## 2. Layout global

```
┌─────────────────────────────────────────────────────────────────┐
│  alpha-meta-token-scanner          Dashboard · Live · Tokens · Channels · Ops │  ← top nav
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Sidebar ─┐  ┌─ Main content ─────────────────────────────┐ │
│  │ KPIs       │  │                                            │ │
│  │ - Ch act.  │  │   (cambia por sección)                     │ │
│  │ - Calls 24h│  │                                            │ │
│  │ - Approv.% │  │                                            │ │
│  │ - Pub. hoy │  │                                            │ │
│  └────────────┘  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- Top nav: 4 secciones (`Dashboard`, `Live`, `Tokens`, `Channels`) + `Ops` colapsable.
- Sidebar izquierda con KPIs siempre visibles (refresca cada 5s).
- Main content scrollable.

---

## 3. Sección: Dashboard (home)

**Propósito**: en un golpe de vista, saber si el pipeline está vivo y cuántos tokens reales están saliendo.

### Endpoints

Carga inicial (1 sola vez al abrir la página):

| Endpoint | Para qué |
|---|---|
| `GET /telegram/publishing/calls/published?limit=10` | últimas publicadas |
| `GET /token/token-gating/decisions/approved?limit=20` | KPIs de aprobación |
| `GET /token/token-gating/decisions/rejected?limit=100` | razones de rechazo (top 5) |
| `GET /telegram/channels/channels` | canales activos |

Live updates vía WS (ver §9.1):

| Evento WS | KPI que actualiza |
|---|---|
| `publishing.telegram.published` | card "Pub hoy" ▲ |
| `token-gating.decision.applied` (verdict=APPROVED) | card "Approv %" ▲ |
| `token-gating.decision.applied` (verdict=REJECTED) | card "Approv %" ▼ + rejected reasons |
| `scoring.token.scored` (score≥70) | "Top tokens" prepend |

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  KPIs (cards, 4 columnas)                                       │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │ 📡 Channels  │ 🔥 Calls 24h │ ✅ Approv %  │ 📤 Pub hoy   │  │
│  │     45/46    │      21      │     5%       │      1       │  │
│  │   active     │  canonical   │  approved/   │  to TG       │  │
│  │              │              │   total      │              │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
│                                                                 │
│  ┌─ Top tokens (last 24h) ──────────────────────────────────┐  │
│  │ Rank · Chain · Token · Score · Conf · Mentions · Status   │  │
│  │  1    solana  $PEPE..   85    0.92    3     🟢 PUBLISHED │  │
│  │  2    solana  $FROG..   72    0.78    2     🟡 NEUTRAL   │  │
│  │  ...                                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Rejected reasons (pie/bar) ──┐  ┌─ Pipeline flow ──────┐  │
│  │  LOW_LIQUIDITY    ████████ 12 │  │  ingestion: 163/h    │  │
│  │  NO_HOLDERS       █████   7   │  │  extracted:    69/h  │  │
│  │  POSSIBLE_RUG     ███     4   │  │  canonical:    21/h  │  │
│  │  BLACKLIST        █       1   │  │  published:     1/h  │  │
│  └────────────────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### UX/UI details

- **KPI cards**: número grande, label pequeño debajo, delta vs hace 1h en la esquina (▲ +3 calls, ▼ -2 rejected). Color del delta según signo.
- **Top tokens**: tabla compacta, sortable, click → vista de detalle del token.
- **Pipeline flow**: embudo horizontal con ratios `ingestion → extraction → canonical → published` para ver de un vistazo dónde se cae la mayoría.
- **Rejected reasons**: bar chart horizontal, top 5 razones con count.
- Refresh silencioso (sin spinner), flash verde de 500ms cuando un counter sube.

---

## 4. Sección: Live feed

**Propósito**: ver el flujo de tokens en tiempo real conforme entran. Es la vista que justifica WebSocket.

### Endpoints

Carga inicial (snapshot):

| Endpoint | Para qué |
|---|---|
| `GET /token/scoring/tokens/recent?limit=30` | primeras 30 calls scored |
| `GET /token/intake/extraction/results/recent?limit=30` | primeros 30 raw |
| `GET /token/token-gating/decisions/recent?limit=30` | primeras 30 decisions |

Live updates vía WS:

| Tab | Eventos WS suscritos |
|---|---|
| **Raw messages** | `telegram.message.ingested` + `extraction.candidates.extracted` |
| **Scored** | `parsing.call.parsed` + `enrichment.token.enriched` + `scoring.token.scored` |
| **Filtered** | `token-gating.decision.applied` |

Rooms aplicadas: el cliente entra a `chain:*` (default). Puede cambiar a `chain:solana` o `chain:evm` desde un chip-filtro.

### Layout: split-view con tabs

```
┌─────────────────────────────────────────────────────────────────┐
│  [📥 Raw messages] [🔥 Scored] [🚦 Filtered]    ← tabs        │
├─────────────────────────────────────────────────────────────────┤
│  Live · last 5s                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  10:48:12  $PEPE 0xC02a..    score 85  STRONG  🟢 APPROVED    │
│  10:48:08  $DOGE 7xKXt..    score 41  NEUTRAL 🟠 LOW_LIQ     │
│  10:48:01  $CAT  9fH2q..    score 12  POOR    🔴 NO_HOLDERS   │
│  10:47:55  $FROG BrbTt..    score 67  STRONG  🟢 APPROVED    │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### UX/UI details

- **3 tabs** en la parte superior:
  1. **Raw messages** → muestra `extraction/results/recent` (texto original + CAs extraídos + tickers).
  2. **Scored** → muestra `scoring/tokens/recent` con score, tier, razones de breakdown.
  3. **Filtered** → muestra `token-gating/decisions/recent` con verdict + razones.
- Cada item aparece con animación slide-in desde arriba + fade.
- Hover muestra tooltip con desglose de score (classification weight, channel reputation, market data completeness).
- Click en cualquier item → vista de detalle del token.
- Timestamp relativo (`hace 3s`, `hace 1m`) actualizado cada segundo.
- Auto-scroll solo si el usuario está abajo; si hace scroll up, pausa el auto-scroll.

---

## 5. Sección: Tokens (explorer)

**Propósito**: lista filtrable de todos los tokens que han pasado por el pipeline + drill-down.

### Lista

| Endpoint | Uso |
|---|---|
| `GET /token/scoring/tokens/recent?limit=100` | Lista principal |
| `GET /token/scoring/tokens/top?limit=50` | Top por score |

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Tokens (123)                          [filter: chain ▼] [🔍]  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Chain  Address       Ticker  Score  Conf  Status  Time   │  │
│  │ sol    4SnKwn..pump  $X      85     0.92  🟢 PUB   2m    │  │
│  │ evm    0xC02a..cc2   $WETH   72     0.85  🟢 APR   5m    │  │
│  │ sol    GRFJ7J..      $Y      50     0.64  🟡 NEU   8m    │  │
│  │ evm    0x7a25..71F   $Z      32     0.41  🟠 REJ   12m   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Filtros

- **Chain**: all / solana / evm
- **Status**: all / approved / rejected / published / honeypot
- **Score range**: slider 0-100
- **Time range**: 1h / 24h / 7d / 30d / all
- **Channel**: dropdown con canales activos

### Detalle del token (drill-down)

Cuando se hace click en una fila, abrir vista con tabs por BC.

#### Endpoints por tab

| Tab | Endpoint |
|---|---|
| **Overview** | aggregation of all below |
| Canonical | `GET /token/normalization/tokens/:chain/:address` |
| Market | `GET /token/market-data/snapshots/:chain/:address` |
| Classification | `GET /token/classification/tokens/:chain/:address` |
| Score | `GET /token/scoring/tokens/:chain/:address` |
| Honeypot | `GET /token/honeypot/analyses/:chain/:address` |
| Decision | `GET /token/token-gating/decisions/:chain/:address` |
| Publish | `GET /telegram/publishing/calls/:chain/:address` |

#### Layout del detalle

```
┌─────────────────────────────────────────────────────────────────┐
│  ← back   $PEPE  4SnKwnz6Dyagftn..pump  [solana] [🟢 PUBLISHED]│
│  Sources: 3 channels · 5 mentions · conf 0.92 · score 85       │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Market] [Classif.] [Score] [Honeypot] [Decision]   │
├─────────────────────────────────────────────────────────────────┤
│  Overview:                                                      │
│  ┌─────────────────┐  ┌────────────────────────────────────┐  │
│  │  Stage journey  │  │  Pipeline timeline (flow)          │  │
│  │  ✅ extracted   │  │   10:48:12  ingestion → parsing    │  │
│  │  ✅ parsed      │  │   10:48:13  normalization          │  │
│  │  ✅ normalized  │  │   10:48:14  enrichment             │  │
│  │  ✅ enriched    │  │   10:48:15  classification         │  │
│  │  ✅ classified  │  │   10:48:16  scoring (85)           │  │
│  │  ✅ scored      │  │   10:48:17  filter (APPROVED)      │  │
│  │  ✅ gated       │  │   10:48:18  publishing             │  │
│  │  ✅ published   │  │                                    │  │
│  └─────────────────┘  └────────────────────────────────────┘  │
│                                                                 │
│  Sources (3):                                                   │
│  - @LevisCalls (msg #1234, 10:48:12): "$PEPE to the moon..."   │
│  - @BiggieBags (msg #5678, 10:48:30): "add PEPE..."           │
│  - @ArcaneGems (msg #9012, 10:49:01): "still in PEPE..."      │
└─────────────────────────────────────────────────────────────────┘
```

Cada tab muestra los datos del endpoint correspondiente con un formato específico:

- **Market**: precio, liq, FDV, MC, holders, pares (DexScreener-like).
- **Classification**: chip grande con tipo (`TOKEN`/`POOL`/`SCAM`) + risk signals como chips de color.
- **Score**: gauge radial 0-100 + breakdown de factores.
- **Honeypot**: verdict grande + tabla de flags (`canSell`, `canBuy`, `ownerCanDrain`, etc.).
- **Decision**: verdict + razones como chips.
- **Publish**: mensaje formateado que se envió a Telegram + canal destino + timestamp.

---

## 6. Sección: Channels (operator)

**Propósito**: gestionar canales Telegram + ver reputación.

### Endpoints

| Endpoint | Uso |
|---|---|
| `GET /telegram/channels/channels` | Lista |
| `GET /token/channel-reputation/channels/top` | Leaderboard |
| `GET /token/channel-reputation/channels/:id` | Detalle |
| `GET /telegram/channels/channels/:id` | Estado |
| `POST /telegram/channels/channels` | Añadir |
| `POST /telegram/channels/channels/:id/backfill?limit=N` | Forzar ingesta |
| `POST /token/channel-reputation/channels/recompute/:id` | Recomputar reputación |

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Channels (46 active)        [+ Add channel]                   │
├─────────────────────────────────────────────────────────────────┤
│  Reputation Leaderboard                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Rank · Channel · Rep · Strong · Good · Neut · Poor · Fail │  │
│  │  1    spydefi_test 0.92   30    15     3     2     0     │  │
│  │  2    Levis Calls  0.78    8     5     2     1     0     │  │
│  │  ...                                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  All channels                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Status · ID · Title · Last ingested · Reputation · ⋯     │  │
│  │ 🟢 active  1413058... Gambler's Lounge  10:48  N/A       │  │
│  │ 🟢 active  1500214... Gems Mine        10:45  N/A       │  │
│  │ 🟢 active  1697697... MadApes Calls    10:47  N/A       │  │
│  │ ...                                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### UX/UI details

- **Cada fila tiene acciones inline**:
  - 🔄 **Backfill** → modal pequeño `¿Cuántos mensajes? (1-100)` → POST.
  - 📊 **Recompute reputation** → POST, muestra toast con resultado.
  - ⏸ **Pausar/Reanudar listener** (si se implementa `stopListening`/`startListening` por canal — hoy no existe).
- **Filtros**: activos/inactivos, con reputación, sin actividad reciente.
- **Sortable** por reputación, last ingested, total calls.
- **Click en fila** → drawer lateral con detalle del canal + historial de calls que originó.

---

## 7. Sección: Ops (collapsed por default)

**Propósito**: controles manuales para inyectar/evaluar/forzar. El operador es uno solo; oculto por default para no estorbar.

### Endpoints

| Endpoint | Acción UI |
|---|---|
| `POST /token/intake/extraction/extract` | Form con `channelId/messageId/text` → submit |
| `POST /token/intake/parsing/parse` | Form con `channelId/messageId/text` → submit |
| `POST /token/market-data/enrich` | Form con `chain/address/force` → submit |
| `POST /token/classification/classify` | Form con `chain/address` → submit |
| `POST /token/scoring/score` | Form con `chain/address` → submit |
| `POST /token/token-gating/apply` | Form con `chain/address` → submit |
| `POST /telegram/publishing/publish` | Form completo para forzar publish |
| `POST /token/call-tracking/jobs/enqueue` | Form `chain/address/horizons` |
| `POST /token/call-tracking/jobs/evaluate-due` | Botón único "Run due jobs now" |
| `POST /token/call-tracking/scheduler/tick` | Botón único "Tick scheduler" |

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Operator panel — use with care                              │
├─────────────────────────────────────────────────────────────────┤
│  [Replay message] [Re-run pipeline on token] [Force publish]    │
│   ... [Enqueue eval job] [Force analytics tick]                 │
│                                                                 │
│  Active form (e.g. "Replay message"):                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Channel ID  [________________]                          │  │
│  │  Message ID  [________________]                          │  │
│  │  Text        [____________________________________]      │  │
│  │              [____________________________]              │  │
│  │              [____________________________]              │  │
│  │  [▶ Run pipeline]                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Response:                                                      │
│  { "extractedCAs": [...], "tickers": [...], "decision": "..." } │
└─────────────────────────────────────────────────────────────────┘
```

### UX/UI details

- **Tabs de acción** arriba: cada tab abre el form correspondiente.
- **Response panel** debajo muestra el JSON devuelto formateado.
- **Confirmación obligatoria** para acciones destructivas (`Force publish`, `Force scheduler tick`).
- **Historial de últimas 20 acciones** ejecutadas con timestamp y resultado.

---

## 8. Single-user, no auth

Esta es una **app personal de uso interno**. No hay usuarios, no hay login, no hay tokens, no hay roles. El operador es uno solo y la app asume contexto de confianza.

### 8.1 Topología de despliegue

```
┌─────────────────────────────────────────────────────────────────┐
│  Tu Mac / workstation                                           │
│                                                                 │
│  ┌─ Frontend (Vite dev) ──────────┐                              │
│  │  http://localhost:5173          │  ← solo escucha en loopback│
│  │  bound to 127.0.0.1             │                              │
│  └────────────────────────────────┘                              │
│           │ CORS allow http://localhost:5173                    │
│           ▼                                                      │
│  ┌─ Backend (NestJS) ──────────────┐                              │
│  │  http://localhost:3030          │  ← solo escucha en loopback│
│  │  bound to 127.0.0.1             │                              │
│  │  WS: ws://localhost:3030/ws     │                              │
│  └────────────────────────────────┘                              │
│           │                                                      │
│           ▼                                                      │
│  ┌─ Postgres (Docker) ─────────────┐                              │
│  │  localhost:5432                 │  ← solo escucha en loopback│
│  └────────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

**Ningún puerto se expone a la red** (no `0.0.0.0`, no port-forwarding). Si necesitas acceder desde otro dispositivo en la LAN, usa **Tailscale** o un **SSH tunnel** (`ssh -L 3030:localhost:3030 user@mac`). No abras los puertos al mundo.

### 8.2 Configuración de red

**Backend `main.ts`** — bind explícito a loopback:

```ts
await app.listen(port, '127.0.0.1'); // no '0.0.0.0'
```

**Frontend `vite.config.ts`** — server solo en loopback:

```ts
server: {
  host: '127.0.0.1',
  port: 5173,
  strictPort: true,
}
```

**Backend CORS** — whitelist exacta de los orígenes esperados:

```ts
app.enableCors({
  origin: ['http://localhost:5173'], // dev
  credentials: false,
});
```

Si en algún momento despliegas el build de producción detrás de un reverse proxy en otra máquina, mantén el allowlist explícito y nunca `origin: '*'`.

### 8.3 Lo que quitamos del stack

Estos elementos ya no son necesarios:

| Antes (§8 original) | Ahora |
|---|---|
| Auth provider en `app/providers/` | **eliminado** |
| `AuthWsGuard` en handshake WS | **eliminado**, no hay handshake auth |
| Header `X-Role` en cada request | **eliminado** |
| `shared/config/roles.ts` | **eliminado** |
| Tabla de 3 roles | **eliminada** |
| JWT, sessions, cookies | **ninguno** |
| Login page | **ninguna** |

### 8.4 Lo que sí mantenemos

- **WS rooms** (`chain:solana`, `verdict:approved`, etc.) — siguen siendo útiles para filtrar eventos, no son auth, son suscripción temática.
- **CORS allowlist** — sigue siendo necesario porque frontend y backend están en orígenes distintos (5173 ≠ 3030).
- **Validación de input** (Zod en features, class-validator en backend) — el operador puede equivocarse, los datos externos (Telegram, APIs) siempre son hostiles.
- **Rate limiting en endpoints sensibles** (publish manual, scheduler tick) — no es auth, es protección contra doble-click accidental.

### 8.5 Acceso remoto seguro (cuando quieras salir de casa)

Tres opciones, de menos a más infraestructura:

1. **SSH tunnel** — `ssh -L 3030:localhost:3030 -L 5173:localhost:5173 user@mac`. Abrir `http://localhost:5173` desde el cliente. Cero config extra.
2. **Tailscale** — instala Tailscale en la Mac y en el dispositivo remoto. Los `localhost` se vuelven mágicamente accesibles en la red mesh. El backend sigue bound a 127.0.0.1 pero Tailscale lo enruta.
3. **Cloudflare Tunnel** — expone `https://dashboard.tu-dominio.com` públicamente pero con auth de Cloudflare Access (email link). Útil si quieres abrir desde el móvil sin tocar config de red.

Para una app personal, **SSH tunnel es lo más simple y lo más seguro**. No se necesita config en el router, no hay puerto abierto al mundo, y depende solo de que tengas SSH.

### 8.6 Implicaciones en el árbol FSD (§12)

Cambios concretos en el árbol:

```
src/app/providers/                         ← ANTES tenía auth-provider.tsx
  ├── query-provider.tsx                  ← queda
  ├── socket-provider.tsx                 ← queda
  ├── theme-provider.tsx                  ← queda
  └── index.ts                            ← ya no exporta AuthProvider

src/shared/config/                         ← ANTES tenía roles.ts
  ├── theme.ts                            ← queda
  └── env.ts                              ← queda
```

Sin otros cambios. La estructura FSD no se ve afectada.

---

## 9. Stack técnico sugerido

- **React + Vite + TypeScript** (matches el stack del backend).
- **TanStack Query** para fetching con cache + refetch (HTTP endpoints).
- **socket.io-client** para la conexión WebSocket (eventos en vivo).
- **Zustand** o **React Context** para KPIs globales en sidebar.
- **Tailwind + shadcn/ui** para componentes base (cards, tables, badges).
- **Recharts** para gráficos (rejected reasons bar, pipeline funnel).
- **Lucide icons** para iconos.

---

## 9.1 Transporte en tiempo real: WebSocket

El HTTP polling (cada 2s) solo se usa como fallback o para datos históricos. **El canal primario del Live feed y del Dashboard es WebSocket**. Justificación:

| | Polling 2s | WebSocket |
|---|---|---|
| Latencia perceived | 0-2s | <50ms |
| Carga backend (10 tabs abiertas) | 300 req/min | 1 conexión persistente |
| Backpressure | cliente decide cuándo caer | server puede pausar si overwhelmed |
| Reconexión | manual retry logic | built-in (socket.io) |

### Arquitectura

```
┌─ Frontend ─────────────────────────────────────────┐
│  socket.on('scoring',  s => updateKpi(s))          │
│  socket.on('decision', d => flashKpi(d.verdict))   │
│  socket.on('published', p => prependToFeed(p))     │
└────────────────────────────────────────────────────┘
                       ▲
              WSS  /ws   namespace: /ws
                       │
┌─ Backend (NestJS) ─────────────────────────────────┐
│  WsGateway (@WebSocketGateway)                     │
│    └─ Inyecta EventEmitter2 (in-process)           │
│    └─ @OnEvent('*') re-emite por WS al cliente    │
└────────────────────────────────────────────────────┘
```

### Namespace y handshake

- **URL**: `ws://localhost:3030/ws`
- **Namespace**: `/ws`
- **Sin auth**: el gateway acepta cualquier conexión desde `127.0.0.1`. Si en algún momento se expone a la red, añadir guard; mientras no, ruido innecesario.
- **Reconexión**: socket.io nativo (backoff exponencial 1s → 30s, max 5 intentos).

### Eventos broadcast (alineados con `EventEmitter2`)

El server expone **11 eventos** que son espejo 1:1 de los DomainEvents del pipeline:

| Evento WS | Cuándo se emite | Payload clave |
|---|---|---|
| `telegram.message.ingested` | mensaje crudo ingestado | `{channelId, messageId, text, occurredAt}` |
| `extraction.candidates.extracted` | extraction BC | `{channelId, messageId, contractAddresses[], tickers[]}` |
| `parsing.call.parsed` | parsing BC | `{chain, address, ticker, confidence, ...}` |
| `normalization.call.normalized` | normalization BC | `{chain, address, mentionCount}` |
| `enrichment.token.enriched` | enrichment BC | `{chain, address, priceUsd, liquidityUsd, ...}` |
| `classification.token.classified` | classification BC | `{chain, address, classification, riskSignals[]}` |
| `scoring.token.scored` | scoring BC | `{chain, address, score, tier, breakdown}` |
| `token-gating.decision.applied` | filters BC | `{chain, address, verdict, reasons[]}` |
| `publishing.telegram.published` | publishing BC OK | `{chain, address, tier, message, publishedChannelIds[]}` |
| `publishing.telegram.failed` | publishing BC fail | `{chain, address, error, failedChannelIds[]}` |
| `analytics.evaluation.completed` | analytics BC | `{callId, horizons, tier, athMultiple}` |

### Rooms (filtrado por suscripción)

El cliente puede hacer `socket.emit('join', {room: 'chain:solana'})` y dejar de recibir eventos de EVM. Rooms disponibles:

| Room | Filtro |
|---|---|
| `chain:solana` | solo Solana |
| `chain:evm` | solo EVM |
| `verdict:approved` | solo APPROVED |
| `verdict:rejected` | solo REJECTED |
| `published:all` | solo calls que salieron a TG |
| `score:>=70` | solo calls con score alto (top tokens) |

Por defecto el cliente entra a `chain:*` + `verdict:*` (todo). Puede hacer `leave` y `join` libremente.

### Backpressure y buffer

- El server mantiene **un buffer circular de últimos 100 eventos por room**.
- Si un cliente se desconecta más de 30s, al reconectar recibe el buffer (catch-up).
- Si el cliente está vivo pero atrasado, recibe los últimos 100 + drop de los más viejos.

### Reconexión y resync

Al reconectar, el cliente:

1. socket.io reabre el socket (transparente).
2. Recibe un evento `hello` con `{serverTime, missedSince, bufferedCount}`.
3. Si `missedSince > 0`, el cliente dispara un **HTTP catch-up**: `GET /token/scoring/tokens/recent?since=<missedSince>` para llenar el gap.
4. A partir de ahí, todo en vivo por WS.

### Hook React sugerido

```ts
// src/realtime/useEventStream.ts
export function useEventStream<T>(
  event: string,
  handler: (payload: T) => void,
) {
  const socket = useSocket(); // singleton
  useEffect(() => {
    const sub = (payload: T) => handler(payload);
    socket.on(event, sub);
    return () => { socket.off(event, sub); };
  }, [socket, event, handler]);
}
```

```tsx
// uso en LiveFeed.tsx
useEventStream<ScoringEvent>('scoring.token.scored', (s) => {
  setFeed((prev) => [s, ...prev].slice(0, 50));
  if (s.score >= 70) {
    toast.success(`🔥 ${s.ticker} score ${s.score}`);
  }
});
```

### Cuándo SÍ usar HTTP (no WS)

- **Datos históricos**: lista paginada de calls, leaderboard, detalles de token → `GET /token/...`
- **Acciones**: backfill, recompute, publish manual → `POST /token/...` o `POST /telegram/...`
- **Carga inicial de una vista**: al abrir la página de Tokens, un solo `GET /token/scoring/tokens/recent?limit=100`. Luego WS mantiene la lista viva.
- **Reconnect catch-up**: ver § anterior.

---

## 10. Endpoints NO usados por el frontend v1

Estos existen en el backend pero no los necesitamos en UI:

| Endpoint | Razón |
|---|---|
| `GET /` (Hello World) | solo health check de CI |
| `POST /chain/detection/detect` | internal; se activa automático desde normalization |
| `GET /token/intake/extraction/results/:channelId/:messageId` | debug level |
| `GET /token/intake/parsing/calls/:channelId/:messageId` | debug level |
| `GET /token/call-tracking/jobs/:id` | observability, no UI |

---

## 11. Métricas de éxito del propio frontend

- Dashboard carga en <1s con cache caliente.
- Live feed actualiza vía WS con latencia p95 <100ms desde que el server emite.
- Reconexión automática tras corte de red (backoff 1s → 30s, máx 5 intentos).
- Drill-down de token se abre en <300ms.
- 0 requests HTTP duplicadas por componente (TanStack Query dedupe).
- Mobile usable (kanban en lugar de tablas si <768px).
- Backpressure: si el cliente se atrasa >100 eventos, no se congela la UI (drop oldest).

---

## 12. Estructura del proyecto (Feature-Sliced Design)

Adoptamos [FSD](https://feature-sliced.design/) como arquitectura frontend. Las capas y los nombres de los slices reflejan el **lenguaje del dominio** del backend (`ingestion`, `extraction`, `canonical-call`, `scoring`, `publishing`…) en lugar de nombres genéricos (`auth`, `profile`, `dashboard`).

### 12.1 Reglas de capas

Las capas superiores solo pueden importar de capas inferiores:

```
app        ─┐
            ├──→ pages
            │        ├──→ widgets
            │        │        ├──→ features
            │        │        │        ├──→ entities
            │        │        │        │        └──→ shared
            ▼        ▼        ▼        ▼        ▼
```

| Capa | Propósito | Ejemplo |
|---|---|---|
| `app/` | bootstrap, providers, router, layout raíz | `app/providers/`, `app/router/` |
| `pages/` | pantallas completas, composición de widgets | `pages/dashboard/`, `pages/token-detail/` |
| `widgets/` | bloques UI independientes que combinan features+entities | `widgets/live-feed/`, `widgets/token-journey/` |
| `features/` | acciones que el usuario ejecuta (use cases de UI) | `features/trigger-backfill/`, `features/replay-message/` |
| `entities/` | entidades del dominio con sus datos y lógica de presentación | `entities/canonical-call/`, `entities/channel/` |
| `shared/` | infraestructura reutilizable sin lógica de dominio | `shared/api/`, `shared/ui/`, `shared/lib/` |

Cada slice internamente sigue la misma estructura canónica:

```
slice/
  ui/        ← componentes React
  model/     ← stores, tipos, selectores, lógica de negocio
  lib/       ← utilidades específicas del slice
  api/       ← llamadas HTTP y WS al backend
  config/    ← constantes, mapas de configuración
  index.ts   ← public API (barrel export)
```

**Reglas clave**:
- Un slice solo expone lo declarado en `index.ts` (todo lo demás es private).
- `shared/` nunca importa de capas superiores (regla del 100% invertida).
- `entities/` no conoce `features/` ni `widgets/`.
- `features/` no conoce otras `features/` (cada una es independiente).
- `widgets/` orquesta varios `features` + `entities`.
- `pages/` es la única capa que sabe de routing.

### 12.2 Árbol de directorios

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── public/
└── src/
    │
    ├── app/                              ── capa 1: bootstrap
    │   ├── providers/
    │   │   ├── query-provider.tsx        ← TanStack Query client
    │   │   ├── socket-provider.tsx       ← socket.io singleton + context
    │   │   ├── theme-provider.tsx        ← dark/light
    │   │   └── index.ts
    │   ├── router/
    │   │   └── routes.tsx                ← React Router config
    │   ├── layouts/
    │   │   └── root-layout.tsx           ← TopNav + Sidebar + Outlet
    │   ├── config/
    │   │   ├── env.ts                    ← import.meta.env tipado
    │   │   └── navigation.ts             ← items del top nav
    │   ├── styles/
    │   │   └── globals.css
    │   └── index.tsx                     ← entrypoint React
    │
    ├── pages/                            ── capa 2: pantallas
    │   ├── dashboard/
    │   │   └── index.tsx                 ← pages/dashboard/page.tsx
    │   ├── live-feed/
    │   │   └── index.tsx
    │   ├── tokens-explorer/
    │   │   └── index.tsx
    │   ├── token-detail/
    │   │   └── index.tsx                 ← /tokens/:chain/:address
    │   ├── channels/
    │   │   └── index.tsx
    │   ├── channel-detail/
    │   │   └── index.tsx                 ← /channels/:channelId
    │   └── ops/
    │       └── index.tsx
    │
    ├── widgets/                          ── capa 3: bloques UI compuestos
    │   ├── kpi-cards/
    │   │   ├── ui/
    │   │   │   ├── channels-active.tsx
    │   │   │   ├── calls-24h.tsx
    │   │   │   ├── approval-rate.tsx
    │   │   │   └── published-today.tsx
    │   │   ├── model/
    │   │   │   └── use-kpi-stats.ts      ← agregación de counts desde WS
    │   │   └── index.ts
    │   │
    │   ├── live-feed/
    │   │   ├── ui/
    │   │   │   ├── live-feed.tsx         ← contenedor con tabs
    │   │   │   ├── raw-messages-tab.tsx
    │   │   │   ├── scored-tab.tsx
    │   │   │   ├── filtered-tab.tsx
    │   │   │   └── feed-row.tsx
    │   │   ├── model/
    │   │   │   ├── feed-store.ts         ← Zustand store del buffer
    │   │   │   └── feed-events.ts        ← suscripción a eventos WS
    │   │   └── index.ts
    │   │
    │   ├── pipeline-flow/
    │   │   ├── ui/
    │   │   │   └── pipeline-funnel.tsx   ← ingestion→published ratios
    │   │   └── index.ts
    │   │
    │   ├── rejected-reasons-chart/
    │   │   ├── ui/
    │   │   │   └── chart.tsx             ← Recharts bar chart
    │   │   └── index.ts
    │   │
    │   ├── top-tokens-table/
    │   │   ├── ui/
    │   │   │   └── table.tsx
    │   │   └── index.ts
    │   │
    │   ├── channel-leaderboard/
    │   │   ├── ui/
    │   │   │   └── leaderboard.tsx
    │   │   └── index.ts
    │   │
    │   ├── token-journey/
    │   │   ├── ui/
    │   │   │   ├── journey.tsx           ← timeline extraction→published
    │   │   │   └── stage-pill.tsx
    │   │   └── index.ts
    │   │
    │   └── token-tabs/
    │       ├── ui/
    │       │   ├── tabs.tsx
    │       │   ├── overview-tab.tsx
    │       │   ├── market-tab.tsx
    │       │   ├── classification-tab.tsx
    │       │   ├── score-tab.tsx
    │       │   ├── honeypot-tab.tsx
    │       │   ├── decision-tab.tsx
    │       │   └── publish-tab.tsx
    │       └── index.ts
    │
    ├── features/                         ── capa 4: acciones de usuario
    │   ├── replay-message/               ← inyectar mensaje sintético
    │   │   ├── ui/
    │   │   │   └── replay-form.tsx
    │   │   ├── model/
    │   │   │   └── replay-schema.ts      ← Zod schema del input
    │   │   ├── api/
    │   │   │   └── replay-client.ts      ← POST /token/intake/extraction/extract
    │   │   └── index.ts
    │   │
    │   ├── trigger-backfill/             ← forzar ingesta histórica de un canal
    │   │   ├── ui/
    │   │   │   └── backfill-button.tsx
    │   │   ├── api/
    │   │   │   └── backfill-client.ts    ← POST /telegram/channels/.../backfill
    │   │   └── index.ts
    │   │
    │   ├── recompute-channel-reputation/ ← recalcular reputación de un canal
    │   │   ├── ui/
    │   │   │   └── recompute-button.tsx
    │   │   ├── api/
    │   │   │   └── recompute-client.ts   ← POST /token/channel-reputation/.../recompute
    │   │   └── index.ts
    │   │
    │   ├── force-publish/                ← publicar manualmente
    │   │   ├── ui/
    │   │   │   └── publish-form.tsx
    │   │   ├── api/
    │   │   │   └── publish-client.ts     ← POST /telegram/publishing/publish
    │   │   └── index.ts
    │   │
    │   ├── run-evaluation-tick/          ← forzar cron de analytics
    │   │   ├── ui/
    │   │   │   └── tick-button.tsx
    │   │   ├── api/
    │   │   │   └── tick-client.ts        ← POST /token/call-tracking/scheduler/tick
    │   │   └── index.ts
    │   │
    │   ├── subscribe-to-room/            ← cambiar room WS desde UI
    │   │   ├── ui/
    │   │   │   └── room-selector.tsx     ← chips chain:solana, chain:evm, ...
    │   │   ├── model/
    │   │   │   └── rooms.ts
    │   │   └── index.ts
    │   │
    │   └── filter-tokens/                ← filtros del explorer (chain, status, score, time)
    │       ├── ui/
    │       │   └── filter-bar.tsx
    │       ├── model/
    │       │   └── filter-store.ts       ← URL-synced state
    │       └── index.ts
    │
    ├── entities/                         ── capa 5: entidades del dominio
    │   ├── channel/                      ← canal Telegram monitorizado
    │   │   ├── ui/
    │   │   │   ├── channel-card.tsx
    │   │   │   ├── channel-status-pill.tsx
    │   │   │   └── channel-avatar.tsx
    │   │   ├── model/
    │   │   │   ├── types.ts              ← ChannelView
    │   │   │   └── channel-store.ts
    │   │   ├── api/
    │   │   │   ├── channel-queries.ts    ← useChannel, useChannels
    │   │   │   └── channel-keys.ts       ← query keys TanStack
    │   │   └── index.ts
    │   │
    │   ├── canonical-call/               ← token deduplicado con menciones cross-channel
    │   │   ├── ui/
    │   │   │   ├── canonical-call-row.tsx
    │   │   │   └── confidence-bar.tsx
    │   │   ├── model/
    │   │   │   └── types.ts              ← CanonicalTokenCallView
    │   │   ├── api/
    │   │   │   └── canonical-queries.ts  ← useCanonical, useRecentCanonical
    │   │   └── index.ts
    │   │
    │   ├── token-snapshot/               ← datos de mercado (precio, liq, holders)
    │   │   ├── ui/
    │   │   │   ├── market-panel.tsx
    │   │   │   └── pair-row.tsx
    │   │   ├── model/
    │   │   │   └── types.ts              ← TokenSnapshotView
    │   │   ├── api/
    │   │   │   └── snapshot-queries.ts
    │   │   └── index.ts
    │   │
    │   ├── token-classification/         ← tipo (TOKEN/POOL/SCAM) + risk signals
    │   │   ├── ui/
    │   │   │   ├── classification-chip.tsx
    │   │   │   └── risk-signals-list.tsx
    │   │   ├── model/
    │   │   │   └── types.ts
    │   │   ├── api/
    │   │   │   └── classification-queries.ts
    │   │   └── index.ts
    │   │
    │   ├── token-score/                  ← score 0-100 + breakdown
    │   │   ├── ui/
    │   │   │   ├── score-gauge.tsx
    │   │   │   └── score-breakdown.tsx
    │   │   ├── model/
    │   │   │   ├── types.ts
    │   │   │   └── tier.ts               ← STRONG|GOOD|NEUTRAL|POOR|FAILED
    │   │   ├── api/
    │   │   │   └── score-queries.ts
    │   │   └── index.ts
    │   │
    │   ├── filter-decision/              ← APPROVED|REJECTED + reasons
    │   │   ├── ui/
    │   │   │   ├── decision-verdict.tsx
    │   │   │   └── reasons-list.tsx
    │   │   ├── model/
    │   │   │   └── types.ts
    │   │   ├── api/
    │   │   │   └── decision-queries.ts
    │   │   └── index.ts
    │   │
    │   ├── published-call/               ← mensaje enviado a Telegram
    │   │   ├── ui/
    │   │   │   ├── published-message.tsx ← render markdown/Telegram
    │   │   │   └── channel-tag.tsx
    │   │   ├── model/
    │   │   │   └── types.ts
    │   │   ├── api/
    │   │   │   └── published-queries.ts
    │   │   └── index.ts
    │   │
    │   ├── honeypot-analysis/            ← verdict de seguridad
    │   │   ├── ui/
    │   │   │   ├── honeypot-verdict.tsx
    │   │   │   └── tax-table.tsx
    │   │   ├── model/
    │   │   │   └── types.ts
    │   │   ├── api/
    │   │   │   └── honeypot-queries.ts
    │   │   └── index.ts
    │   │
    │   ├── channel-reputation/           ← reputación histórica de un canal
    │   │   ├── ui/
    │   │   │   ├── reputation-score.tsx
    │   │   │   └── outcome-bars.tsx
    │   │   ├── model/
    │   │   │   └── types.ts
    │   │   ├── api/
    │   │   │   └── reputation-queries.ts
    │   │   └── index.ts
    │   │
    │   └── evaluation-job/               ← job de analytics retrospectivo
    │       ├── ui/
    │       │   └── job-status.tsx
    │       ├── model/
    │       │   └── types.ts
    │       ├── api/
    │       │   └── job-queries.ts
    │       └── index.ts
    │
    └── shared/                           ── capa 6: infraestructura
        ├── api/
        │   ├── http-client.ts            ← fetch wrapper con base URL + CORS
        │   └── endpoints.ts              ← constantes de paths
        │
        ├── realtime/
        │   ├── socket.ts                 ← singleton io('...')
        │   ├── events.ts                 ← tipos de los 11 eventos WS
        │   ├── use-event-stream.ts       ← hook React (ver §9.1)
        │   └── rooms.ts                  ← join/leave helpers
        │
        ├── ui/                           ── primitives sin lógica de dominio
        │   ├── button.tsx
        │   ├── card.tsx
        │   ├── badge.tsx
        │   ├── table.tsx
        │   ├── drawer.tsx
        │   ├── modal.tsx
        │   ├── tabs.tsx
        │   ├── toast.tsx
        │   ├── tooltip.tsx
        │   └── ...
        │
        ├── lib/
        │   ├── format.ts                 ← números USD, fechas relativas
        │   ├── chain.ts                  ← helpers de chain (solana/evm)
        │   ├── address.ts                ← truncate, copy-to-clipboard
        │   └── env.ts
        │
        └── config/
            └── theme.ts                  ← paleta BC, dark/light tokens
```

### 12.3 Naming — lenguaje del dominio

Cada nombre refleja un concepto del backend (los BCs del README):

| Slice frontend | BC backend equivalente | Justificación |
|---|---|---|
| `entities/channel` | `ingestion/telegram` | el "channel" es el aggregate raíz |
| `entities/canonical-call` | `normalization` | el "canonical call" es lo que produce normalization |
| `entities/token-snapshot` | `enrichment` | "snapshot" = TokenSnapshot entity |
| `entities/token-classification` | `classification` | 1:1 |
| `entities/token-score` | `scoring` | 1:1 |
| `entities/filter-decision` | `token-gating/filters` | el "decision" es lo que emite el BC |
| `entities/published-call` | `publishing/telegram` | el "published call" es lo que sale |
| `entities/honeypot-analysis` | `honeypot` | "analysis" es el aggregate |
| `entities/channel-reputation` | `channel-reputation` | 1:1 |
| `entities/evaluation-job` | `call-tracking` (analytics side) | el "job" es lo que se encola |
| `widgets/live-feed` | el pipeline entero | vista live cross-BC |
| `widgets/pipeline-flow` | el pipeline entero | vista macro |
| `widgets/token-journey` | traversal cross-BC de un token | timeline de un token |
| `widgets/token-tabs` | drill-down del detalle | agrupa por BC |
| `features/trigger-backfill` | `ingestion` use case | acción del operador |
| `features/replay-message` | `extraction` use case | acción del operador |
| `features/recompute-channel-reputation` | `channel-reputation` use case | acción |
| `features/force-publish` | `publishing` use case | acción |
| `features/run-evaluation-tick` | `call-tracking` use case | acción |

**No usamos nombres genéricos** como `auth`, `profile`, `dashboard`, `admin`. "Dashboard" no es un concepto del dominio — es solo la vista home, y se llama `pages/dashboard/`. Los `entities` se llaman por el aggregate que modelan, no por una categoría visual.

### 12.4 Imports cruzados — ejemplos válidos

```ts
// ✅ pages/token-detail/index.tsx — puede importar widgets y entities
import { TokenTabs } from 'widgets/token-tabs';
import { useCanonical } from 'entities/canonical-call';

// ✅ widgets/live-feed/ui/live-feed.tsx — puede importar entities y features
import { useCanonical } from 'entities/canonical-call';
import { ReplayMessageButton } from 'features/replay-message';
import { useEventStream } from 'shared/realtime';

// ✅ entities/canonical-call/api/canonical-queries.ts — solo shared
import { httpGet } from 'shared/api/http-client';

// ❌ entities/canonical-call/.../index.ts — nunca importa features ni widgets
import { ReplayMessageButton } from 'features/replay-message';  // PROHIBIDO

// ❌ shared/api/http-client.ts — nunca importa de capas superiores
import { useChannel } from 'entities/channel';                  // PROHIBIDO
```

### 12.5 Convenciones dentro de cada slice

Cada slice expone solo su `index.ts`:

```ts
// entities/canonical-call/index.ts
export { CanonicalCallRow } from './ui/canonical-call-row';
export { ConfidenceBar } from './ui/confidence-bar';
export { useCanonical, useRecentCanonical } from './api/canonical-queries';
export type { CanonicalTokenCallView } from './model/types';
```

Los consumidores importan solo desde el barrel:

```ts
// ✅
import { useCanonical } from 'entities/canonical-call';
// ❌ (rompe el contrato del slice)
import { useCanonical } from 'entities/canonical-call/api/canonical-queries';
```

### 12.6 State management por capa

| Capa | Solución | Por qué |
|---|---|---|
| `shared/` | ninguno | solo primitives |
| `entities/` | TanStack Query (server state) + Zustand opcional (UI state local) | server state aislado, cacheable, refetch |
| `features/` | React state local + Zod para validación de forms | efímero |
| `widgets/` | Zustand si necesita cross-component local state (ej. feed buffer) | buffer compartido entre tabs |
| `pages/` | URL params + search params (filtros, orden, paginación) | deep-linkable |
| `app/` | React Context para providers globales (socket, theme) | bootstrap only |

### 12.7 Routing

`pages/` mapea 1:1 a rutas. Usamos React Router v6 con lazy loading:

```ts
// app/router/routes.tsx
const routes = [
  { path: '/', element: <DashboardPage /> },
  { path: '/live', element: <LiveFeedPage /> },
  { path: '/tokens', element: <TokensExplorerPage /> },
  { path: '/tokens/:chain/:address', element: <TokenDetailPage /> },
  { path: '/channels', element: <ChannelsPage /> },
  { path: '/channels/:channelId', element: <ChannelDetailPage /> },
  { path: '/ops', element: <OpsPage /> },
];
```

Cada `pages/*/index.tsx` es el default export.

### 12.8 Testing — co-location

Cada slice tiene su test adyacente:

```
entities/canonical-call/
  ui/
    canonical-call-row.tsx
    canonical-call-row.spec.tsx
  api/
    canonical-queries.ts
    canonical-queries.spec.ts
```

Stack de testing:
- **Vitest** (unit + integration)
- **Testing Library** (componentes)
- **MSW** (mock HTTP)
- **socket.io mock** (mock WS en tests de widgets/features)

### 12.9 Anti-patrones a evitar

- ❌ `features/` importando de otro `features/` — si lo necesitas, crea un `widget/` o muévelo a `shared/lib/`.
- ❌ `entities/` conociendo HTTP details fuera de su `api/` sub-slice.
- ❌ Componentes con lógica de negocio hardcoded — debe venir de `model/`.
- ❌ Slice sin `index.ts` público — todo se consume por barrel.
- ❌ Imports con path absoluto al interno de un slice (`.../api/queries`) en lugar del barrel.

---

## 13. Migración a monorepo `apps/backend` + `apps/frontend`

**Estado actual**: el repo es un proyecto NestJS plano. Todo vive en la raíz.

**Estado objetivo**: monorepo con dos apps independientes más una raíz workspace-only. Aplicar cuando arranquemos la implementación del frontend; hasta entonces la doc sirve como plan, no como cambio inmediato.

### 13.1 Por qué

- **Deploys independientes**: backend y frontend pueden versionarse, testearse y desplegarse por separado sin pisarse.
- **Dependencias aisladas**: NestJS no arrastra React ni React no arrastra `@nestjs/typeorm`. `node_modules` por app.
- **CI paralelo**: un PR que toca solo el frontend no necesita compilar el backend.
- **Físicamente posible**: cada app tiene su propio `package.json`, su propio `tsconfig.json`, su propio lockfile parcial (gestionado por workspaces).

### 13.2 Estructura objetivo

```
alpha-meta-token-scanner/                          ← raíz workspace-only
│
├── package.json                      ← workspace root (workspaces, scripts globales)
├── pnpm-workspace.yaml               ← o package.json con "workspaces": ["apps/*"]
├── tsconfig.base.json                ← base tsconfig compartido (paths, strict)
├── .editorconfig
├── .prettierrc
├── .gitignore
├── .env.example                      ← todas las env vars documentadas
├── README.md                         ← overview del monorepo + links a cada app
│
├── docs/                             ← docs que aplican a todo el repo
│   ├── architecture.md               ← diagramas cross-app (data flow, deploy)
│   └── contributing.md
│
├── apps/
│   │
│   ├── backend/                      ← el NestJS actual, movido tal cual
│   │   ├── package.json              ← name: "@alpha-meta-token-scanner/backend"
│   │   ├── tsconfig.json             ← extiende tsconfig.base.json
│   │   ├── tsconfig.build.json
│   │   ├── nest-cli.json
│   │   ├── docker-compose.yml        ← servicios del backend (postgres, pgadmin)
│   │   ├── .env                      ← secrets reales del backend (gitignored)
│   │   ├── pgadmin/
│   │   ├── scripts/
│   │   ├── test/                     ← e2e tests
│   │   ├── src/                      ← todo el código NestJS
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── app.controller.ts
│   │   │   ├── app.service.ts
│   │   │   ├── shared/
│   │   │   ├── chain/
│   │   │   ├── telegram/
│   │   │   └── token/
│   │   ├── docs/                     ← BC docs (eran docs/ en raíz, son backend-specific)
│   │   │   ├── proyect/
│   │   │   │   ├── BC.md
│   │   │   │   ├── PLAN.md
│   │   │   │   ├── README-BC-GUIDE.md
│   │   │   │   ├── ENV.md
│   │   │   │   └── DEPLOY.md         ← movido aquí cuando reorganicemos
│   │   │   └── ...
│   │   └── dist/                     ← build output (gitignored)
│   │
│   └── frontend/                     ← el React+Vite definido en §12
│       ├── package.json              ← name: "@alpha-meta-token-scanner/frontend"
│       ├── tsconfig.json             ← extends tsconfig.base.json + jsx
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.cjs
│       ├── index.html
│       ├── .env                      ← VITE_API_BASE_URL=http://localhost:3030
│       ├── public/
│       └── src/                      ← el árbol FSD de §12.2
│           ├── app/
│           ├── pages/
│           ├── widgets/
│           ├── features/
│           ├── entities/
│           └── shared/
│
└── tools/                            ← scripts cross-cutting (opcional)
    ├── check-deps.ts                 ← verifica que no haya cross-imports prohibidos
    └── lint-fsd.ts                   ← ESLint custom rules para FSD
```

### 13.3 Qué se mueve y qué no

#### Se mueve a `apps/backend/`

| Hoy (raíz) | Destino |
|---|---|
| `src/` | `apps/backend/src/` |
| `test/` | `apps/backend/test/` |
| `dist/` | `apps/backend/dist/` |
| `scripts/` | `apps/backend/scripts/` |
| `nest-cli.json` | `apps/backend/nest-cli.json` |
| `tsconfig.build.json` | `apps/backend/tsconfig.build.json` |
| `docker-compose.yml` | `apps/backend/docker-compose.yml` |
| `pgadmin/` | `apps/backend/pgadmin/` |
| `.env` (backend secrets) | `apps/backend/.env` |
| `docs/proyect/` | `apps/backend/docs/proyect/` |
| `docs/api/` (HELIUS refs, etc.) | `apps/backend/docs/api/` |
| `docs/nest-js/` | `apps/backend/docs/nest-js/` |
| `docs/bot/commands.md` | `apps/backend/docs/bot/` |
| `frontend.md` ⬅ este doc | **se queda en raíz** (es docs cross-app) |
| `README.md` | **se queda en raíz**, reescrito como overview |
| `chain-refactor.md`, `name-refactor.md` | `apps/backend/docs/refactor/` |

#### Se queda en raíz

| Archivo | Razón |
|---|---|
| `frontend.md` | describe el frontend Y cómo se relaciona con el backend; cross-app |
| `package.json` | workspace root |
| `tsconfig.base.json` | compartido por backend y frontend |
| `.env.example` | documento único de env vars de ambas apps |
| `.gitignore`, `.editorconfig`, `.prettierrc`, `eslint.config.mjs` | tooling global |
| `README.md` | overview del monorepo, reemplaza al README actual (que es backend-only) |

### 13.4 Scripts del workspace root

```json
// package.json (raíz)
{
  "name": "alpha-meta-token-scanner",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:backend":  "npm run start:dev -w @alpha-meta-token-scanner/backend",
    "dev:frontend": "npm run dev -w @alpha-meta-token-scanner/frontend",
    "build:backend":  "npm run build -w @alpha-meta-token-scanner/backend",
    "build:frontend": "npm run build -w @alpha-meta-token-scanner/frontend",
    "test:backend":   "npm test -w @alpha-meta-token-scanner/backend",
    "test:frontend":  "npm test -w @alpha-meta-token-scanner/frontend",
    "lint":         "npm run lint --workspaces --if-present",
    "format":       "prettier --write \"apps/**/src/**/*.{ts,tsx}\""
  }
}
```

Con npm workspaces (o pnpm). Las deps se deduplican automáticamente.

### 13.5 Config compartida

`tsconfig.base.json` en raíz:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Cada app extiende:

```json
// apps/backend/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*", "test/**/*"]
}

// apps/frontend/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "ES2022"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

### 13.6 Path aliases en el frontend

Cuando el frontend importe del backend (para tipos compartidos), se hace via `@alpha-meta-token-scanner/shared-types` (un paquete generado). Para v1 no se necesita: el frontend solo consume HTTP+WS, los tipos se duplican o se generan desde OpenAPI.

Si en el futuro hace falta compartir tipos:

```
packages/
  └── shared-types/
      ├── package.json     ← name: "@alpha-meta-token-scanner/shared-types"
      └── src/
          ├── token.ts     ← tipos compartidos (CanonicalTokenCallView, etc.)
          └── ws-events.ts
```

Y los workspaces: `["apps/*", "packages/*"]`.

### 13.7 Pasos para ejecutar la migración (cuando llegue el momento)

Orden recomendado, una sola PR grande:

1. **Crear la estructura de directorios** vacía:
   ```bash
   mkdir -p apps/backend
   git mv src test dist scripts nest-cli.json tsconfig.build.json \
          docker-compose.yml pgadmin apps/backend/
   git mv docs/proyect docs/api docs/nest-js docs/bot \
          chain-refactor.md name-refactor.md apps/backend/docs/
   ```

2. **Mover `.env` y `.env.example`**:
   ```bash
   git mv .env apps/backend/.env
   # .env.example se queda en raíz (es doc cross-app)
   ```

3. **Crear `apps/backend/package.json`** con `name: "@alpha-meta-token-scanner/backend"` (mantener deps y scripts existentes).

4. **Crear `package.json` raíz** con `workspaces: ["apps/*"]` y scripts globales (§13.4).

5. **Crear `tsconfig.base.json` raíz** y ajustar los dos `tsconfig.json` de cada app (§13.5).

6. **Mover config files que aplican solo al backend**:
   - `apps/backend/tsconfig.json` (nuevo, extiende base)
   - `apps/backend/nest-cli.json` (igual que el actual, solo cambia path)

7. **Actualizar paths en scripts**:
   - `nest-cli.json`: `entryFile: "main"` ahora es relativo a `apps/backend/src/`, así que queda igual si el cwd es `apps/backend`.
   - `docker-compose.yml`: paths de volúmenes `./pgadmin/servers.json` etc. ahora son `./apps/backend/pgadmin/...` o ajustar con `${PWD}`.

8. **Verificar build**: `npm run build:backend` desde raíz. Si falla, ajustar paths.

9. **Verificar dev**: `npm run dev:backend`. Boot OK en `:3030`.

10. **Commit grande único**: `chore: migrate to monorepo apps/backend` (un solo commit para que `git log` no quede sucio).

### 13.8 Lo que NO se hace en esta migración

- ❌ No se mueve `frontend.md` (queda en raíz como doc cross-app).
- ❌ No se crea `apps/frontend/` vacío en esta fase — se hace cuando arranquemos React.
- ❌ No se introduce `packages/shared-types/` hasta que se necesite.
- ❌ No se cambia el gestor de paquetes (sigue npm o se migra a pnpm; decisión aparte).
- ❌ No se tocan los tests ni el código fuente: solo paths y configs.

### 13.9 Después de la migración: smoke tests

```bash
# backend sigue funcionando igual
npm run dev:backend
curl http://localhost:3030/
# → "Hello World!"

# una vez creado apps/frontend/
npm run dev:frontend
# → Vite levanta en http://localhost:5173

# los dos a la vez, en terminales separadas (o con `npm-run-all`)
npm run dev:backend & npm run dev:frontend
# → ambos arriba, frontend hace fetch a backend via CORS allowlist
```

### 13.10 Convención de naming de paquetes

Cada app/package tiene `name` con scope `@alpha-meta-token-scanner/*`:

| Path | `name` en package.json |
|---|---|
| raíz | `alpha-meta-token-scanner` (private, sin scope — es el workspace) |
| `apps/backend/` | `@alpha-meta-token-scanner/backend` |
| `apps/frontend/` | `@alpha-meta-token-scanner/frontend` |
| `packages/shared-types/` (futuro) | `@alpha-meta-token-scanner/shared-types` |

Esto permite imports cross-package si alguna vez se necesita:
```ts
import type { CanonicalTokenCallView } from '@alpha-meta-token-scanner/shared-types';
```

### 13.11 Línea temporal sugerida

```
hoy         →  solo backend (estado actual)
+1 sprint   →  ejecutar §13.7 (mover backend a apps/backend/)
+2 sprints  →  arrancar apps/frontend/ siguiendo §12
+3 sprints  →  integrar frontend ↔ backend (WS + HTTP, rooms, etc.)
+4 sprints  →  si hace falta, extraer packages/shared-types/
```

Cada paso es opcional e independiente. Si después del paso 1 el frontend nunca se arranca, no pasa nada — el repo queda simplemente más ordenado.
