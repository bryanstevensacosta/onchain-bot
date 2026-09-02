# 🚀 Inicio Rápido - Testing Local

## Paso 1: Ejecutar Script de Verificación

```bash
./scripts/test-local-ingestion.sh
```

Este script interactivo te guiará por todos los checks de prerequisitos.

---

## Paso 2: Levantar Servicios (3 Terminales)

### Terminal 1: Ingestion Service

```bash
cd /Users/bryanstevens/dev/onchain-bot/apps/ingestion-service
npm run start:dev
```

**Logs esperados:**

```
🚀 Ingestion Service listening on port 3031
[TelegramClientManager] MTProto client connected
[StreamService] StreamService initialized
```

---

### Terminal 2: Backend en SSE Mode

```bash
cd /Users/bryanstevens/dev/onchain-bot/apps/backend

# Configurar modo SSE
export USE_SSE_INGESTION=true
export INGESTION_SERVICE_URL=http://localhost:3031

# Levantar backend
npm run start:dev
```

**Logs esperados:**

```
[SharedIngestionModule] 🔄 INGESTION MODE: SSE (remote Ingestion Service)
[TelegramSseListenerAdapter] SSE connection established
```

---

### Terminal 3: Monitoring & Tests

```bash
# Ver estado de salud
curl http://localhost:3031/api/health | jq

# Ver clientes conectados
curl http://localhost:3031/api/ingestion/stream/status | jq

# Conectarse al stream (ver eventos en tiempo real)
curl -N http://localhost:3031/api/ingestion/stream

# Ver canales monitoreados
curl http://localhost:3031/api/channels | jq
```

---

## Verificación Rápida

✅ **Ingestion-service OK:** Puerto 3031 respondiendo  
✅ **Backend conectado:** Logs muestran "SSE connection established"  
✅ **Stream funcionando:** `curl -N http://localhost:3031/api/ingestion/stream` muestra eventos  
✅ **Mensajes fluyen:** Enviar mensaje a Telegram → Ver logs en ambos servicios

---

## Troubleshooting Rápido

**Puerto 3031 ocupado:**

```bash
./scripts/test-local-ingestion.sh
# Seleccionar opción 9 (Kill ports)
```

**Backend no conecta:**

```bash
# Verificar variable de entorno:
echo $USE_SSE_INGESTION  # Debe mostrar "true"

# Si está vacío, exportar:
export USE_SSE_INGESTION=true
export INGESTION_SERVICE_URL=http://localhost:3031

# Reiniciar backend
```

**Session inválida:**

```bash
cd apps/ingestion-service
npm run telegram:gen-session
# Copiar session string a .env
```

---

## Documentación Completa

Ver: [LOCAL_TESTING_GUIDE.md](./LOCAL_TESTING_GUIDE.md)
