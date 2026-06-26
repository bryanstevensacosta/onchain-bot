# Draft: Implement WebSocket Gateway (Socket.IO)

## Contexto
El frontend usa `socket.io-client` para conectarse a `ws://localhost:3030/socket.io/` y escuchar eventos del pipeline en tiempo real. El backend NO tiene Socket.IO configurado — no hay Gateway, no hay dependencias. Las conexiones WS fallan con error de conexión.

## Mapeo de Eventos

### Backend (Domain Events via EventEmitter2) → Frontend (WS_EVENTS)

| Backend eventName | Frontend WS_EVENT | Match |
|---|---|---|
| `telegram.message.ingested` | `telegram.message.ingested` | ✅ |
| `extraction.candidates.extracted` | `extraction.candidates.extracted` | ✅ |
| `parsing.call.parsed` | `parsing.call.parsed` | ✅ |
| `normalization.call.normalized` | `normalization.call.normalized` | ✅ |
| `enrichment.token.enriched` | `enrichment.token.enriched` | ✅ |
| `classification.token.classified` | `classification.token.classified` | ✅ |
| `scoring.token.scored` | `scoring.token.scored` | ✅ |
| `filters.token.approved` | `token-gating.decision.applied` | ❌ Diferente nombre |
| `filters.token.rejected` | `token-gating.decision.applied` | ❌ Diferente nombre |
| `publishing.telegram.published` | `publishing.telegram.published` | ✅ |
| `publishing.telegram.failed` | `publishing.telegram.failed` | ✅ |
| (no existe en backend) | `analytics.evaluation.completed` | ❌ No implementado |

### Frontend espera:
- Evento `hello` al conectar con `{ serverTime, missedSince, bufferedCount }`
- Eventos `join` / `leave` para manejo de rooms

## Dependencias a instalar
- `@nestjs/platform-socket.io`
- `socket.io`

## Archivos
- CREAR: `apps/backend/src/shared/ws/gateway/ws.gateway.ts`
- CREAR: `apps/backend/src/shared/ws/ws.module.ts`
- MODIFICAR: `apps/backend/src/app.module.ts` (importar WsModule)
- MODIFICAR: `apps/backend/package.json` (agregar dependencias)

## Decisions
- Gateway escucha eventos del EventEmitter2 via `onAny()` y hace broadcast a todos los clientes conectados
- `filters.token.approved` y `filters.token.rejected` se mapean ambos a `token-gating.decision.applied`
- `analytics.evaluation.completed` se omite (no existe en backend aún)
