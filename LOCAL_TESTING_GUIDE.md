# 🧪 Guía de Testing Local - Servicio de Ingesta Centralizado

## 📋 Prerequisitos

### 1. Servicios Requeridos

```bash
# PostgreSQL debe estar corriendo
# Redis debe estar corriendo
# Verificar:
psql -h localhost -p 5432 -U postgres -d onchain_bot -c "SELECT 1;"
redis-cli ping
```

### 2. Variables de Entorno

#### Backend `.env` o `.env.dev`

```bash
# Modo de ingesta: SSE (recomendado para testing)
USE_SSE_INGESTION=true
INGESTION_SERVICE_URL=http://localhost:3031

# MTProto debe estar DESHABILITADO para evitar AUTH_KEY_DUPLICATED
# NO incluir estas variables cuando USE_SSE_INGESTION=true:
# TELEGRAM_MTPROTO_API_ID=...
# TELEGRAM_MTPROTO_API_HASH=...
# TELEGRAM_MTPROTO_SESSION=...
```

#### Ingestion Service `.env`

```bash
# Ya existe en apps/ingestion-service/.env
# Verificar que tiene los valores correctos:
INGESTION_PORT=3031
INGESTION_API_BASE_URL=http://localhost:3031
INGESTION_TELEGRAM_MTPROTO_API_ID=...
INGESTION_TELEGRAM_MTPROTO_API_HASH=...
INGESTION_TELEGRAM_MTPROTO_SESSION=...
INGESTION_REDIS_HOST=localhost
INGESTION_DATABASE_HOST=localhost
```

---

## 🚀 Plan de Testing Paso a Paso

### **Test 1: Verificar Compilación** ✅ COMPLETADO

```bash
cd apps/ingestion-service
npm run build
# ✅ Exit Code: 0
```

---

### **Test 2: Levantar Ingestion Service Solo**

#### Terminal 1: Ingestion Service

```bash
cd /Users/bryanstevens/dev/onchain-bot/apps/ingestion-service
npm run start:dev
```

#### Verificaciones esperadas:

```bash
# Logs esperados:
# - "🚀 Ingestion Service listening on port 3031"
# - "MTProto client connected"
# - "Channels loaded: X"
# - "StreamService initialized"

# Test health endpoint:
curl http://localhost:3031/api/health | jq

# Respuesta esperada:
{
  "status": "ok",
  "mtproto": {
    "connected": true,
    "authorized": true,
    "lastPollAt": "2026-09-01T..."
  },
  "channels": {
    "total": 15,
    "active": 15,
    "kol": 10,
    "news": 5
  },
  "clients": {
    "connected": 0
  },
  "floodWait": {
    "count24h": 0,
    "maxSeconds24h": 0,
    "consecutiveFailures": 0
  },
  "uptime": 12345
}

# Test channels endpoint:
curl http://localhost:3031/api/channels | jq

# Respuesta esperada: array de canales monitoreados
```

#### ⚠️ Si falla:

- **Error: "MTProto session invalid"** → Regenerar session: `npm run telegram:gen-session`
- **Error: "Redis connection refused"** → Levantar Redis: `redis-server`
- **Error: "Database connection failed"** → Verificar PostgreSQL corriendo
- **Error: "No channels loaded"** → Verificar `INGESTION_TELEGRAM_SEED_*` en `.env`

---

### **Test 3: Test de SSE Stream (sin backend)**

#### Terminal 2: Cliente SSE Manual

```bash
# Conectarse al stream SSE:
curl -N http://localhost:3031/api/ingestion/stream

# Respuesta esperada (stream continuo):
event: connection:established
data: {"clientId":"...","timestamp":"...","message":"Connected to Ingestion Service SSE stream"}

event: health:ping
data: {"timestamp":"...","uptime":30000}

# (cada 30s se repite el ping)
```

#### Verificar en logs del ingestion-service:

```
[StreamService] SSE client connected (total: 1)
```

#### ⚠️ Si falla:

- **No response** → Verificar puerto 3031 no ocupado: `lsof -i :3031`
- **Connection closed immediately** → Revisar CORS config en `main.ts`

---

### **Test 4: Levantar Backend en SSE Mode**

#### Terminal 3: Backend

```bash
cd /Users/bryanstevens/dev/onchain-bot/apps/backend

# Verificar modo SSE está habilitado
export USE_SSE_INGESTION=true
export INGESTION_SERVICE_URL=http://localhost:3031

# Levantar backend
npm run start:dev
```

#### Logs esperados del backend:

```
[SharedIngestionModule] 🔄 INGESTION MODE: SSE (remote Ingestion Service)
[SharedIngestionModule]    └─ Service URL: http://localhost:3031
[TelegramSseListenerAdapter] Subscribing to SSE stream for 15 channels: http://localhost:3031/api/ingestion/stream
[TelegramSseListenerAdapter] SSE connection established
```

#### Logs esperados del ingestion-service:

```
[StreamService] SSE client connected (total: 2)  # (o más si hay otros clientes)
```

#### Verificar conexión:

```bash
# Desde Terminal 4:
curl http://localhost:3031/api/ingestion/stream/status | jq

# Respuesta esperada:
{
  "connectedClients": 2,  # (curl + backend)
  "totalMessagesBroadcast": 0,
  "uptime": 123456
}
```

#### ⚠️ Si backend no conecta:

- **Error: "SSE connection failed"** → Verificar `INGESTION_SERVICE_URL` es correcta
- **Warning: "MTProto (local) - DEPRECATED"** → Variable `USE_SSE_INGESTION` no está configurada
- **Error: "fetch is not defined"** → Node.js < 18, actualizar o usar polyfill

---

### **Test 5: Flujo Completo de Mensajes**

#### Escenario: Recibir un mensaje de Telegram

**Paso 1:** Enviar mensaje de prueba a un canal monitoreado

```bash
# Desde Telegram app o bot:
# Enviar mensaje a uno de los canales configurados en INGESTION_TELEGRAM_SEED_*
```

**Paso 2:** Verificar logs del ingestion-service

```
[IngestionCoordinator] Message received: peerId=-100..., messageId=12345
[DeduplicationService] New message (not duplicate)
[LastSeenManager] Updated cursor: -100... → 12345
[StreamService] Broadcasting to 2 clients
```

**Paso 3:** Verificar logs del backend

```
[TelegramSseListenerAdapter] Received SSE event: message:telegram
[TelegramSseListenerAdapter] Message payload: peerId=-100..., messageId=12345
[IngestionCoordinator] Routing message to pipeline
[StoreNewsMessageUseCase] Message stored  # (si es crypto-news)
# O
[KolIngestionOrchestratorUseCase] Processing KOL message  # (si es KOL)
```

**Paso 4:** Verificar en base de datos

```bash
# Crypto-news:
psql -h localhost -U postgres -d onchain_bot -c "SELECT * FROM crypto_news_messages ORDER BY created_at DESC LIMIT 1;"

# KOL (si procesa tokens):
psql -h localhost -U postgres -d onchain_bot -c "SELECT * FROM token_calls ORDER BY occurred_at DESC LIMIT 1;"
```

#### ⚠️ Si no fluyen mensajes:

- **Logs: "Skipping duplicate"** → Mensaje ya procesado, enviar mensaje nuevo
- **No logs en backend** → Verificar filtrado por channelIds en `TelegramSseListenerAdapter`
- **Error: "text field empty"** → ESPERADO (Invariant 1), texto no cruza SSE por ToS
- **Error: "Media file not found"** → Verificar que ingestion-service descargó media antes de broadcast

---

### **Test 6: Servir Media Files**

#### Paso 1: Identificar media URL de un mensaje con foto

```bash
# En logs del backend, buscar:
# media: [{ url: "http://localhost:3031/api/media/-100.../12345/0" }]
```

#### Paso 2: Probar servir media

```bash
curl -I http://localhost:3031/api/media/-100XXXXXXXXXX/12345/0

# Response esperado:
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 245678
Cache-Control: public, max-age=31536000
ETag: "..."
```

#### Paso 3: Descargar y verificar

```bash
curl http://localhost:3031/api/media/-100XXXXXXXXXX/12345/0 -o /tmp/test-media.jpg
open /tmp/test-media.jpg  # (debería abrir la imagen)
```

#### ⚠️ Si falla:

- **404 Not Found** → Media no fue descargada. Revisar logs de `MtprotoMediaDownloader`
- **500 Internal Error** → Verificar permisos de `uploads/crypto-news/media/`
- **Wrong MIME type** → Magic byte detection fallback, verificar contenido del archivo

---

### **Test 7: Reconexión Automática**

#### Paso 1: Matar ingestion-service

```bash
# En Terminal 1 (ingestion-service):
# Presionar Ctrl+C
```

#### Paso 2: Verificar logs del backend

```
[TelegramSseListenerAdapter] SSE connection failed, reconnecting in 1000ms
[TelegramSseListenerAdapter] SSE connection failed, reconnecting in 2000ms
[TelegramSseListenerAdapter] SSE connection failed, reconnecting in 4000ms
...
```

#### Paso 3: Reiniciar ingestion-service

```bash
# En Terminal 1:
npm run start:dev
```

#### Paso 4: Verificar reconexión del backend

```
[TelegramSseListenerAdapter] SSE connection established
[DisconnectionTracker] Client reconnected after downtime
```

#### ⚠️ Si no reconecta:

- **Stuck en backoff** → Reiniciar backend también
- **Error: "Max reconnect attempts"** → No debería pasar (loop infinito), revisar código

---

### **Test 8: Rollback a MTProto Mode**

#### Paso 1: Detener ingestion-service

```bash
# Terminal 1: Ctrl+C
```

#### Paso 2: Configurar backend para MTProto mode

```bash
# En .env o export:
export USE_SSE_INGESTION=false
# O simplemente omitir la variable (default es false)

# Asegurarse de tener credenciales MTProto:
export TELEGRAM_MTPROTO_API_ID=...
export TELEGRAM_MTPROTO_API_HASH=...
export TELEGRAM_MTPROTO_SESSION=...
```

#### Paso 3: Reiniciar backend

```bash
# Terminal 3:
# Ctrl+C, luego:
npm run start:dev
```

#### Paso 4: Verificar logs

```
[SharedIngestionModule] ⚠️  INGESTION MODE: MTProto (local) - DEPRECATED
[SharedIngestionModule]    └─ This mode is deprecated and maintained only for emergency rollback
[TelegramMtprotoListenerAdapter] Connecting to Telegram MTProto...
[TelegramMtprotoListenerAdapter] Connected and authorized
```

#### ⚠️ Si falla:

- **Error: AUTH_KEY_DUPLICATED** → Ingestion-service todavía corriendo, detener primero
- **Session invalid** → Regenerar: `cd apps/backend && npm run telegram:gen-session`

---

## 🎯 Checklist de Pruebas Exitosas

- [ ] **Test 1:** Ingestion-service compila sin errores
- [ ] **Test 2:** Ingestion-service levanta y conecta a Telegram
- [ ] **Test 3:** Endpoint `/api/health` responde OK
- [ ] **Test 4:** Stream SSE acepta conexiones
- [ ] **Test 5:** Backend conecta vía SSE
- [ ] **Test 6:** Mensajes fluyen de Telegram → Ingestion → Backend → DB
- [ ] **Test 7:** Media se sirve correctamente vía HTTP
- [ ] **Test 8:** Reconexión automática funciona
- [ ] **Test 9:** Rollback a MTProto funciona en < 5 minutos

---

## 🐛 Troubleshooting Común

### "Cannot find module '@nestjs/...'"

```bash
cd apps/ingestion-service
npm install
```

### "Port 3031 already in use"

```bash
lsof -ti :3031 | xargs kill -9
```

### "Redis connection failed"

```bash
# Instalar y levantar Redis:
brew install redis  # macOS
redis-server &
```

### "PostgreSQL connection refused"

```bash
# Verificar PostgreSQL corriendo:
brew services list | grep postgresql
# Si no está corriendo:
brew services start postgresql@14  # (o tu versión)
```

### "Session string empty or invalid"

```bash
# Regenerar session (en backend o ingestion-service):
cd apps/backend  # o apps/ingestion-service
npm run telegram:gen-session
# Copiar output a .env
```

### "Text field empty in backend"

```
✅ ESPERADO - Invariant 1 (ToS compliance)
El texto raw NO cruza el SSE stream.
Backends deben consultar la DB si necesitan el texto completo.
```

---

## 📊 Métricas de Éxito

### Latencia SSE (Requirement 8.1)

```bash
# Enviar mensaje a Telegram
# Medir tiempo hasta log en backend
# Target: < 500ms (p95)
```

### Estabilidad de Conexión (Requirement 8.4)

```bash
# Dejar corriendo 1 hora
# Verificar sin disconnects inesperados
# Target: 0 disconnects no intencionales
```

### FLOOD_WAIT Count (Requirement 11.7)

```bash
curl http://localhost:3031/api/health | jq '.floodWait.count24h'
# Target: < 10 en 24h
```

---

## ✅ Siguiente Paso

Una vez que **todos los tests pasen en local**, el siguiente paso es:

1. ✅ Documentar cualquier issue encontrado
2. ✅ Commit de cambios necesarios
3. ✅ Actualizar esta guía con issues/soluciones
4. 🔜 Proceder con deployment a staging (futuro)
