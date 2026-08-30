# Dev Mode Switching Guide

## Scripts Disponibles

- `npm run dev` - Modo droplet (USE_SSE_INGESTION=true)
- `npm run dev:mock` - Modo mock (USE_MOCK_INGESTION=true)
- `npm run cli:inject` - CLI para inyectar mensajes
- `npm run cli:replay` - Replay fixtures
- `npm run cli:record` - TODO: grabar mensajes

## Fixtures

Location: `apps/backend/fixtures/`
Example: `fixtures/ticker-null-bug.json`

## Verificar Modo

Los logs muestran:

- 🔄 SSE (remote)
- 🧪 Mock (CLI)
- 📡 MTProto (local)
