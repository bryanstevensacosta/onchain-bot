# Draft: Fix /live Page - Empty Dashboard

## Problem Analysis
- **URL visitada:** http://localhost:5173/live
- **Síntoma:** Página vacía, solo muestra indicador WS conectado
- **Mensaje en UI:** "Esperando eventos del pipeline… (WS conectado)"
- **Console errors:** 404 favicon.ico (menor)

## Arquitectura Encontrada

### Stack
- **Frontend:** React + Vite (puerto 5173)
- **Backend:** NestJS (puerto 3030) - también sirve WebSocket
- **WebSocket:** Socket.IO en `http://localhost:3030/socket.io`

### Código relevante
- **Route:** `apps/frontend/src/pages/live-feed/index.tsx`
- **Widget:** `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx`
- **Socket client:** `apps/frontend/src/shared/realtime/socket.ts`
- **WS URL:** `http://localhost:3030` (configurable via VITE_WS_URL)
- **Gateway:** `apps/backend/src/shared/ws/gateway/ws.gateway.ts`

### Eventos que LiveFeed escucha
- `scoring.token.scored` - Token evaluado
- `token-gating.decision.applied` - Decisión de filtro
- `normalization.call.normalized` - Token canónico creado

### Rooms unidos
- `chain:solana`
- `chain:evm`

## Hipótesis del Problema

1. **Backend no está corriendo** - No hay emit de eventos
2. **Backend corriendo pero no emite eventos** - Pipeline está idle
3. **Socket conectado pero no hay datos** - Rooms no funcionan
4. **Ruta de events mal configurada** - Eventos no se están broadcast

## Análisis Profundo

### Arquitectura verificada (OK)
- Frontend WS conecta a `http://localhost:3030` ✅
- Backend WS Gateway mapea eventos correctamente ✅
- Frontend `useEventStream` escuchando eventos correctos ✅

### Posible problema identificado
El pipeline está activo, pero los eventos del EventEmitter2 no se están emitiendo al WebSocket. Esto puede ser porque:

1. **El EventEmitter no está configurado correctamente** - El gateway usa `eventEmitter.onAny()` pero quizás no se emitió ningún evento aún
2. **No hay eventos siendo generados** - El pipeline necesita input (alpha-calls de Telegram) para generar eventos

### Preguntas clave

1. **¿Hay logs del backend mostrando eventos emitidos?**
   - Buscar en terminal: `scoring.token.scored`, `token-gating.decision.applied`

2. **¿El ingestion de Telegram está configurado?**
   - Verificar: `INGESTION_TELEGRAM_SEED_CHANNELS` en .env

3. **¿Quieres que agregue datos de prueba para generar eventos?**
   - Hay endpoint `POST /token/intake/extraction/extract` para probar