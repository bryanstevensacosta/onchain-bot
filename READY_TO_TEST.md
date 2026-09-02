# ✅ Sistema Listo para Testing Local

## 🎯 Estado Actual

### ✅ Prerequisitos COMPLETOS

- ✅ Node.js v22.22.3 instalado
- ✅ Docker instalado y corriendo
- ✅ PostgreSQL corriendo en Docker (Up 7 hours, healthy)
- ✅ Redis corriendo en Docker (Up, healthy)
- ✅ Puerto 3030 disponible (backend)
- ✅ Puerto 3031 disponible (ingestion-service)

### ✅ Ingestion Service LISTO

- ✅ Compila sin errores (`npm run build` ✓)
- ✅ `.env` configurado con MTProto session
- ✅ MTProto API ID y API HASH configurados

### 🟡 Backend - Requiere Configuración SSE Mode

- 🟡 Agregar `USE_SSE_INGESTION=true` a `.env.dev` o exportar variable

---

## 🚀 COMENZAR TESTING AHORA

### Opción 1: Quick Start (3 Terminales)

#### Terminal 1: Ingestion Service

```bash
cd /Users/bryanstevens/dev/onchain-bot/apps/ingestion-service
npm run start:dev
```

**Esperar log:** `🚀 Ingestion Service listening on port 3031`

---

#### Terminal 2: Backend (SSE Mode)

```bash
cd /Users/bryanstevens/dev/onchain-bot/apps/backend

# Configurar SSE mode
export USE_SSE_INGESTION=true
export INGESTION_SERVICE_URL=http://localhost:3031

# Levantar backend
npm run start:dev
```

**Esperar log:** `[SharedIngestionModule] 🔄 INGESTION MODE: SSE (remote Ingestion Service)`

---

#### Terminal 3: Verificación

```bash
# Health check
curl http://localhost:3031/api/health | jq

# Ver canales monitoreados
curl http://localhost:3031/api/channels | jq

# Conectarse al stream SSE (ver eventos en tiempo real)
curl -N http://localhost:3031/api/ingestion/stream

# Ver clientes conectados
curl http://localhost:3031/api/ingestion/stream/status | jq
```

---

### Opción 2: Configurar Backend .env.dev (Persistente)

```bash
# Agregar a apps/backend/.env.dev:
echo "USE_SSE_INGESTION=true" >> apps/backend/.env.dev
echo "INGESTION_SERVICE_URL=http://localhost:3031" >> apps/backend/.env.dev

# Luego solo:
cd apps/backend && npm run start:dev
```

---

## 📊 Verificaciones Post-Inicio

### 1. Ingestion Service Health

```bash
curl http://localhost:3031/api/health | jq
```

**Respuesta esperada:**

```json
{
  "status": "ok",
  "mtproto": {
    "connected": true,
    "authorized": true,
    "lastPollAt": "2026-09-01T..."
  },
  "channels": { "total": 15, "active": 15 },
  "clients": { "connected": 1 }, // 👈 Backend conectado
  "floodWait": { "count24h": 0 }
}
```

---

### 2. Backend Logs - Modo SSE

```
[SharedIngestionModule] 🔄 INGESTION MODE: SSE (remote Ingestion Service)
[SharedIngestionModule]    └─ Service URL: http://localhost:3031
[TelegramSseListenerAdapter] Subscribing to SSE stream for X channels
[TelegramSseListenerAdapter] SSE connection established
```

**❌ Si ves esto:** `⚠️ INGESTION MODE: MTProto (local) - DEPRECATED`
→ La variable `USE_SSE_INGESTION` no está configurada

---

### 3. Ingestion Service Logs - Cliente Conectado

```
[StreamService] SSE client connected (total: 1)
[StreamService] Client connected: <uuid>
```

---

## 🧪 Test de Flujo Completo

### 1. Enviar mensaje de prueba a Telegram

Envía un mensaje a cualquier canal configurado en:

- `INGESTION_TELEGRAM_SEED_KOLS`
- `INGESTION_TELEGRAM_SEED_NEWS`

### 2. Verificar logs del Ingestion Service

```
[IngestionCoordinator] Message received: peerId=-100..., messageId=12345
[DeduplicationService] New message (not duplicate)
[StreamService] Broadcasting to 1 clients
```

### 3. Verificar logs del Backend

```
[TelegramSseListenerAdapter] Received SSE event: message:telegram
[IngestionCoordinator] Routing message to pipeline
```

### 4. Verificar en base de datos

```bash
docker exec -it alpha-meta-token-scanner-postgres \
  psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner \
  -c "SELECT * FROM crypto_news_messages ORDER BY created_at DESC LIMIT 1;"
```

---

## 🎯 Siguientes Pasos

Una vez que veas mensajes fluyendo correctamente:

1. ✅ Verificar que media se sirve: `curl -I http://localhost:3031/api/media/...`
2. ✅ Test de reconexión: Matar ingestion-service y ver que backend reconecta
3. ✅ Test de rollback: Configurar `USE_SSE_INGESTION=false` y ver MTProto mode
4. ✅ Documentar cualquier issue encontrado
5. 🔜 Commit de cambios (si hay fixes necesarios)

---

## 🐛 Troubleshooting

### "Cannot find module..."

```bash
cd apps/ingestion-service && npm install
cd apps/backend && npm install
```

### "Port already in use"

```bash
# Ver qué está usando el puerto
lsof -ti :3031 | xargs kill -9
lsof -ti :3030 | xargs kill -9
```

### "Redis connection refused"

```bash
cd apps/backend && docker compose up -d redis
redis-cli ping  # Debe responder PONG
```

### "PostgreSQL connection failed"

```bash
cd apps/backend && docker compose up -d postgres
docker ps | grep postgres  # Debe mostrar "healthy"
```

### "MTProto session invalid"

```bash
cd apps/ingestion-service
npm run telegram:gen-session
# Copiar session string a .env
```

---

## 📚 Documentación

- **Guía completa:** [LOCAL_TESTING_GUIDE.md](./LOCAL_TESTING_GUIDE.md)
- **Quick start:** Este archivo
- **Prerequisites check:** `./scripts/check-prerequisites.sh`
