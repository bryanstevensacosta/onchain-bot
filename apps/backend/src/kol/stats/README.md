# Stats BC (`kol/stats/`)

> **Estado:** stub (Fase 5 del kol-refactor plan). Se completará en fases
> futuras con datos de uso real.

Owns los **leaderboards read-only** del autoaprendizaje.

## Plan

- `GET /telegram-kol/stats/kol-leaderboard?limit=&minConfidence=` —
  top KOLs por score (proxy inicial: `KolReputation.findTop`).
- `GET /telegram-kol/stats/top-calls` — top calls por `avgAthMultiple` o por `score`.
- `GET /telegram-kol/stats/roi-trends?windowDays=` — evolución temporal del
  ROI promedio ponderado por confianza del KOL.
- `GET /telegram-kol/stats/alpha-callers` — KOLs con mayor `alphaCallerCount`
  (veces que fueron el first-call sobre un proyecto con 10+ network calls).

## Estado actual (Fase 5)

Por ahora el widget `KolLeaderboard` (en el frontend) consume directamente
`/kol/reputation/kols/top`. El endpoint dedicado de stats se
implementará cuando haya suficientes datos en producción para que las
agregaciones específicas (per-chain, per-window, ROI-weighted) tengan
sentido estadístico.
