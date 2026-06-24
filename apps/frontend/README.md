# apps/frontend — Alpha Meta Token Scanner Dashboard

React 18 + Vite 5 dashboard para monitorizar en tiempo real el pipeline de alpha-calls. Dark theme, polling + WebSocket, 6 páginas.

**Stack**: React 18 · Vite 5 · TanStack Query v5 · Socket.IO · Tailwind CSS 3 · React Router v6

---

## 1. Páginas y rutas

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | Dashboard | KPIs (KOLs, calls, approval rate, published) + Live Feed + Top Tokens |
| `/live` | Live Feed | Feed completo de eventos del pipeline en tiempo real |
| `/tokens` | Tokens Explorer | Tokens canónicos recientes (deduplicados) |
| `/tokens/:chain/:address` | Token Detail | Detalle de un token: score, snapshot, decisiones |
| `/kols` | KOLs | Lista de KOLs, controles de lifecycle, leaderboard de reputación |
| `/ops` | Ops Panel | Replay de mensajes a través del pipeline |

Navegación sticky en header con 5 links (Dashboard · Live · Tokens · KOLs · Ops).

---

## 2. Widgets

| Widget | Ubicación | Descripción |
|--------|-----------|-------------|
| `KpiCards` | Dashboard | 4 cards: 📡 KOLs (activos/total), 🔥 Canonical calls, ✅ Approval rate, 📤 Published |
| `LiveFeed` | Dashboard + /live | Eventos en tiempo real via Socket.IO (scored, approved/rejected, normalized) |
| `TopTokensTable` | Dashboard | Top token scores con chain badge, score gauge, tier |
| `KolLeaderboard` | /kols | Tabla de KOLs por reputación |

### Componentes compartidos (`shared/ui`)

- `Button` — 4 variantes (primary/secondary/ghost/danger), 3 tamaños
- `Badge` — 7 tonos de color para estados del pipeline
- `Card` / `CardTitle` — contenedor consistente con fondo slate-900

---

## 3. API endpoints consumidos

Proxied via Vite (`/api` → `localhost:3030`).

### KOL Identity / Reputation (BCs `kol/identity`, `kol/reputation`)

| Query | Endpoint | Polling |
|-------|----------|---------|
| Lista de KOLs | `GET /kols` | 30s |
| Reputaciones | `GET /kols` | 30s |
| Top reputaciones | `GET /kols/top` | 30s |
| Set lifecycle | `POST /kols/:id/lifecycle` | mutation |
| Backfill | `POST /kols/:id/backfill` | mutation |

### Pipeline Data

| Query | Endpoint | Polling |
|-------|----------|---------|
| Calls canónicos | `GET /token/normalization/tokens/recent` | 10s |
| Top scores | `GET /token/scoring/tokens/top` | 5s |
| Scores recientes | `GET /token/scoring/tokens/recent` | 5s |
| Decisiones recientes | `GET /token/token-gating/decisions/recent` | 5s |
| Decisiones aprobadas | `GET /token/token-gating/decisions/approved` | 5s |
| Decisiones rechazadas | `GET /token/token-gating/decisions/rejected` | 5s |
| Publicaciones exitosas | `GET /vip-calls/calls/published` | 5s |
| Publicaciones fallidas | `GET /vip-calls/calls/failed` | 15s |
| Snapshot por token | `GET /token/market-data/snapshots/:chain/:address` | — |
| Score por token | `GET /token/scoring/tokens/:chain/:address` | — |
| Call canónico por token | `GET /token/normalization/tokens/:chain/:address` | — |

### Mutations (Ops)

| Operación | Endpoint |
|-----------|----------|
| Replay message | `POST /token/intake/extraction/extract` |

---

## 4. Tiempo real (Socket.IO)

Cliente Socket.IO conectado a `http://localhost:3030` con reconexión automática.

### Eventos escuchados en LiveFeed

| Evento | Descripción |
|--------|-------------|
| `scoring.token.scored` | Token evaluado con score |
| `token-gating.decision.applied` | Decisión de filtro (APPROVED/REJECTED) |
| `normalization.call.normalized` | Token canónico creado |

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
│   ├── router/routes.tsx   # React Router config (6 rutas)
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

## 6. Dependencias no utilizadas

Las siguientes están en `package.json` pero **nunca se importan** en el código fuente:

| Librería | Uso planeado |
|----------|--------------|
| `recharts` | Gráficos (ROI trends, price charts) |
| `zustand` | Estado local (no necesario hoy — React Query cubre todo) |
| `lucide-react` | Iconos (hoy se usan emojis textuales) |
| `zod` | Validación de esquemas |

---

## 7. Problemas conocidos

- **`hace 0s` en LiveFeed**: los eventos scored siempre muestran "hace 0s" (hardcoded, no usa timestamp real)
- **Tipos duplicados**: `Chain`, `ScoreTier` etc. existen en `entities/` y en `shared/realtime/events.ts` sin compartir
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
