# Alpha Meta Token Scanner

Monorepo — pipeline NestJS que descubre, valida y republica alpha-calls de tokens on-chain desde canales de Telegram KOL, con dashboard React para monitorización en tiempo real.

| App | Stack | Puerto |
|-----|-------|--------|
| **backend** | NestJS 11 + TypeORM + Postgres + EventEmitter2 + Socket.IO | `:3030` |
| **frontend** | React 18 + Vite 5 + TanStack Query + Socket.IO + Tailwind | `:5173` |

---

## Comandos

```bash
npm install              # hoisting workspaces (apps/backend + apps/frontend)

npm run dev              # backend + frontend en paralelo (concurrently)
npm run dev:backend      # solo NestJS (--watch)
npm run dev:frontend     # solo Vite dev server

npm run build            # ambos
npm test                 # tests de ambos workspaces
npm run lint / format    # calidad

npm run docker:up        # postgres + pgAdmin (apps/backend/docker-compose.yml)
```

## URLs (dev)

| Servicio | URL |
|----------|-----|
| Backend API | http://localhost:3030 |
| Frontend | http://localhost:5173 |
| Postgres | `localhost:5432` |
| pgAdmin | http://localhost:5050 |

## Estructura

```
alpha-meta-token-scanner/
├── apps/
│   ├── backend/               ← NestJS (DDD hexagonal, 16 BCs, 14 tablas)
│   │   ├── src/               # 15k+ líneas
│   │   ├── dist/              # compilado
│   │   ├── docker-compose.yml # postgres + pgAdmin
│   │   └── .env               # secrets
│   └── frontend/              ← React + Vite (FSD, 6 páginas, 5 widgets)
│       ├── src/
│       │   ├── app/           # providers (Query, Socket), router, layout
│       │   ├── pages/         # Dashboard, Live, Tokens, TokenDetail, KOLs, Ops
│       │   ├── widgets/       # KpiCards, LiveFeed, TopTokensTable, KolLeaderboard
│       │   ├── entities/      # kol, canonical-call, token-score, filter-decision, ...
│       │   ├── features/      # ReplayForm, BackfillButton, SetKolLifecycleButton
│       │   └── shared/        # api, realtime (Socket.IO), ui (Button, Badge, Card), lib
│       └── vite.config.ts
├── docs-money/                # Documentación del negocio (ToS, rate limits, fixes)
├── scripts/                   # cleanup-ports.mjs
└── package.json               # workspace root
```

## Pipeline

```
Telegram KOL (MTProto)
  │  llamada directa (sin event bus — fix-1, texto crudo nunca cruza eventos)
  ▼
Extraction  →  Parsing  →  Normalization
                              │
                    ┌─────────┤
                    ▼         ▼
           ChainDetection   Enrichment (DexScreener, Birdeye, Helius, GeckoTerminal)
                    │         │
                    └─────────┤
                              ▼
                       Classification
                              │
                              ▼
                         Scoring (0-100)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              Filters    Honeypot   CallTracking
           (APPROVED/   (análisis   (evaluación
            REJECTED)    heurístico)  post-publicación)
                    │
                    ▼
           Telegram Publishing (MTProto)
                    │
                    ▼
           Canal de output (Telegram)
```

Cada etapa es un **Bounded Context** con puertos hexagonales, repos in-memory + TypeORM, eventos in-process y tests.

## Documentación por app

- **[Backend README](apps/backend/README.md)** — arquitectura, BCs, endpoints, entidades, configuración
- **[Frontend README](apps/frontend/README.md)** — páginas, widgets, API calls, real-time, FSD
- **[frontend.md](frontend.md)** — especificación UX/UI de referencia (1416 líneas)
- **[kol-refactor.md](kol-refactor.md)** — plan de refactor del BC de KOLs
- **[optimize.md](optimize.md)** — plan de optimización de rendimiento
- **[docs-money/](docs-money/)** — ToS de Telegram, rate limits, fix-1
