# apps/frontend — Onchain Bot Dashboard

React 18 + Vite 5 dashboard para monitorizar en tiempo real el pipeline de alpha-calls. Dark theme, polling + WebSocket, 8 rutas.

**Stack**: React 18 · Vite 5 · TanStack Query v5 · Socket.IO · Tailwind CSS 3 · React Router v6

> Fuente de verdad para rutas y endpoints: [`AGENTS.md`](AGENTS.md) (§STRUCTURE, §BACKEND CONTRACT) y `src/shared/api/endpoints.ts`.

---

## 1. Páginas y rutas

| Ruta                      | Página          | Descripción                                                                                                           |
| ------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/`                       | Dashboard       | KPIs (KOLs, calls, approval rate, published) + Live Feed + Top Tokens                                                 |
| `/tokens`                 | Tokens Explorer | Tokens canónicos recientes (deduplicados)                                                                             |
| `/tokens/:chain/:address` | Token Detail    | Detalle de un token: score, snapshot, decisiones                                                                      |
| `/kols`                   | KOLs            | Lista de KOLs, controles de lifecycle, leaderboard de reputación                                                      |
| `/crypto-news`            | Crypto-News     | Newsroom: mensajes + queue + keywords + scheduling + filtros + llm-config (lee ingestion vía `/ingestion-api/feed/*`) |
| `/playground`             | Playground      | Prompt playground (feed)                                                                                              |
| `/threads`                | Threads         | Publisher de threads (keywords/phrases/blacklist/queue/llm)                                                           |
| `/ops`                    | Ops Panel       | Replay de mensajes a través del pipeline                                                                              |

Navegación sticky en header con 7 links (Dashboard · Tokens · KOLs · News · Playground · Threads · Ops — ver `src/app/layouts/root-layout.tsx`).

---

## 2. Widgets

| Widget           | Ubicación | Descripción                                                                          |
| ---------------- | --------- | ------------------------------------------------------------------------------------ |
| `KpiCards`       | Dashboard | 4 cards: 📡 KOLs (activos/total), 🔥 Canonical calls, ✅ Approval rate, 📤 Published |
| `LiveFeed`       | Dashboard | Eventos en tiempo real via Socket.IO (scored, approved/rejected, normalized)         |
| `TopTokensTable` | Dashboard | Top token scores con chain badge, score gauge, tier                                  |
| `KolLeaderboard` | /kols     | Tabla de KOLs por reputación                                                         |

### Componentes compartidos (`shared/ui`)

- `Button` — 4 variantes (primary/secondary/ghost/danger), 3 tamaños
- `Badge` — 7 tonos de color para estados del pipeline
- `Card` / `CardTitle` — contenedor consistente con fondo slate-900

---

## 3. API endpoints consumidos

> Fuente de verdad: `src/shared/api/endpoints.ts` (ver [`AGENTS.md`](AGENTS.md) §BACKEND CONTRACT). Proxied via Vite (backend → `localhost:3030`; feed → `/ingestion-api/*` reescrito a `/api/*` en SU ingestion por env).

### KOL Identity / Reputation (`telegram-kol/identity`, `telegram-kol/reputation`; feed vía ingestion)

| Query                | Endpoint                                        | Polling  |
| -------------------- | ----------------------------------------------- | -------- |
| Lista de KOLs (feed) | `GET /ingestion-api/feed/sources?type=kol`      | 30s      |
| Reputaciones         | `GET /telegram-kol/reputation/kols`             | 30s      |
| Top reputaciones     | `GET /telegram-kol/reputation/kols/top`         | 30s      |
| Reputación por KOL   | `GET /telegram-kol/reputation/kols/:id`         | 30s      |
| Set lifecycle        | `POST /kols/:id/lifecycle`                      | mutation |
| Backfill             | `POST /telegram-kol/identity/kols/:id/backfill` | mutation |

### Pipeline Data

| Query                   | Endpoint                                          | Polling |
| ----------------------- | ------------------------------------------------- | ------- |
| Calls canónicos         | `GET /token/normalization/tokens/recent`          | 10s     |
| Top scores              | `GET /token/scoring/tokens/top`                   | 5s      |
| Scores recientes        | `GET /token/scoring/tokens/recent`                | 5s      |
| Decisiones recientes    | `GET /token/vip-call-approval/decisions/recent`   | 5s      |
| Decisiones aprobadas    | `GET /token/vip-call-approval/decisions/approved` | 5s      |
| Decisiones rechazadas   | `GET /token/vip-call-approval/decisions/rejected` | 5s      |
| Publicaciones exitosas  | `GET /vip-calls/calls/published`                  | 5s      |
| Publicaciones fallidas  | `GET /vip-calls/calls/failed`                     | 15s     |
| Snapshot por token      | `GET /token/enrichment/snapshots/:chain/:address` | —       |
| Score por token         | `GET /token/scoring/tokens/:chain/:address`       | —       |
| Call canónico por token | `GET /token/normalization/tokens/:chain/:address` | —       |

### Crypto-News (backend `feed-publisher/*` + feed en ingestion)

| Query                                | Endpoint                                                        | Polling |
| ------------------------------------ | --------------------------------------------------------------- | ------- |
| Mensajes (feed)                      | `GET /ingestion-api/feed/messages?limit=50&type=crypto-news`    | 15/30s  |
| Fuentes (feed)                       | `GET /ingestion-api/feed/sources`                               | —       |
| Media (feed)                         | `GET /ingestion-api/media/:channelId/:messageId/:index`         | —       |
| Queue / counts                       | `GET /crypto-news-publisher/queue` · `/counts`                  | 10s     |
| Keywords / phrases / blacklist / llm | `GET /crypto-news-publisher/{keywords,phrases,blacklist,llm}/*` | 10s     |

### Settings / Scheduling / Tracking

| Query                                          | Endpoint                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Señales / filtros / umbrales / presets / audit | `GET /settings/{signals,filters,thresholds,presets,audit}/*`                                              |
| Scheduling + rotation-config                   | `GET /crypto-news-scheduling/{scheduling,rotation-config,media-library,media}/*`                          |
| Calls seguidos / gate                          | `GET /call-tracking/tracked` · `GET /call-tracking/tracked/:chain/:address` · `/call-tracking/gate-allow` |
| Ingestion config/health                        | `GET /ingestion/{config,health}`                                                                          |

### Mutations (Ops)

| Operación      | Endpoint                                |
| -------------- | --------------------------------------- |
| Replay message | `POST /token/intake/extraction/extract` |

---

## 4. Tiempo real (Socket.IO)

Cliente Socket.IO conectado a `http://localhost:3030` con reconexión automática.

### Eventos escuchados en LiveFeed

| Evento                          | Descripción                            |
| ------------------------------- | -------------------------------------- |
| `scoring.token.scored`          | Token evaluado con score               |
| `token-gating.decision.applied` | Decisión de filtro (APPROVED/REJECTED) |
| `normalization.call.normalized` | Token canónico creado                  |

### Rooms disponibles

- `chain:solana`, `chain:evm`
- `verdict:approved`, `verdict:rejected`
- `published:all`
- `score:>=70`

### Indicador de conexión

Badge fijo abajo a la derecha: `WS ●` (verde, conectado) / `WS ○` (rojo, desconectado).

---

## 5. Arquitectura (Feature-Sliced Design)

```
src/
├── app/                    ← Setup de la app
│   ├── entry.tsx           # Entry point (createRoot)
│   ├── index.tsx           # <App />: providers wrapper
│   ├── router/routes.tsx   # React Router config (8 rutas: /, tokens, tokens/:chain/:address, kols, feed, playground, threads, ops)
│   ├── layouts/            # RootLayout (header nav + Outlet)
│   ├── providers/          # QueryProvider + SocketProvider
│   └── styles/             # Tailwind directives (globals.css)
├── pages/                  ← Páginas enteras (1 por ruta)
├── widgets/                ← Bloques compuestos (KpiCards, LiveFeed, etc.)
├── features/               ← Acciones de usuario (BackfillButton, ReplayForm, etc.)
├── entities/               ← Modelo de dominio del backend
│   ├── kol/
│   ├── canonical-call/
│   ├── token-score/
│   ├── token-classification/
│   ├── token-snapshot/
│   ├── filter-decision/
│   ├── published-call/
│   └── kol-reputation/
└── shared/                 ← Infraestructura cross-cutting
    ├── api/                # HTTP client + endpoints
    ├── realtime/           # Socket.IO + useEventStream hook
    ├── ui/                 # Button, Badge, Card
    └── lib/                # format.ts (USD, %, tiempo relativo)
```

### Patrón por entidad

```
entities/<x>/
├── api/<x>-queries.ts    ← query keys + fetch functions
├── model/use-<x>.ts      ← useQuery/useMutation hooks (con polling)
├── ui/<x>.tsx            ← componentes presentacionales
└── index.ts              ← barrel export
```

### Manejo de estado

- **TanStack React Query** para server state (única fuente de datos)
- Sin Redux/Zustand/Context — todo el estado viene del backend via HTTP polling + WebSocket
- `staleTime: 5s`, `retry: 1`, `refetchOnWindowFocus: false`
- Mutations invalidan queries relacionadas en `onSuccess`

---

## 6. Dependencias

Removidas (cero imports verificado): `recharts`, `zustand`, `lucide-react`, `zod`.
Se queda: `msw` (devDep, test-only vía `msw/node` en suites de threads-publisher).

---

## 7. Problemas conocidos

- **Tipos duplicados (parcial)**: `ScoreTier` ya importa de `shared/realtime/events` (alineado con backend); `Chain` sigue duplicado
- **Sin error boundaries**: la app no tiene React Error Boundaries
- **Sin skeletons**: solo texto "Cargando..." — sin componentes skeleton

---

## 8. Setup local

El frontend se sirve desde el monorepo raíz:

```bash
npm install
npm run dev:frontend       # Vite dev server on :5173
# o
npm run dev                # backend + frontend en paralelo
```

Requiere el backend corriendo en `:3030` (ver [`apps/backend/README.md`](../backend/README.md)).
