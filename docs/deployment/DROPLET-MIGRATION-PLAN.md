# Plan de Migración: Ingestion Service Compartido (Droplet)

## 🎯 Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────────┐
│  DROPLET (144.126.203.139)                                  │
│                                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │  onchain-bot-ingestion (puerto 3032→3031)      │         │
│  │  - MTProto session de production               │         │
│  │  - Broadcast vía SSE a ambos backends          │         │
│  │  - Conectado a 2 redes Docker                  │         │
│  └──────┬──────────────────────────┬──────────────┘         │
│         │ SSE                      │ SSE                     │
│         ▼                          ▼                         │
│  ┌─────────────┐          ┌─────────────┐                   │
│  │ Production  │          │  Staging    │                   │
│  │ Backend     │          │  Backend    │                   │
│  │ :3030       │          │  :3031      │                   │
│  │ (sin MTProto)          │ (sin MTProto)│                   │
│  └─────────────┘          └─────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## 📝 Resumen de Cambios

### Nuevo Servicio

- **Ingestion Service** (onchain-bot-ingestion)
  - Puerto HOST: `127.0.0.1:3032`
  - Puerto INTERNO: `3031`
  - Redes: `onchain-bot-net` + `onchain-bot-staging-net`
  - Credenciales: Las de production actual (API_ID: 21903336)

### Backends Modificados

**Production Backend:**

- ❌ ELIMINAR: Variables `INGESTION_TELEGRAM_MTPROTO_*`
- ✅ AGREGAR: `USE_SSE_INGESTION=true`
- ✅ AGREGAR: `INGESTION_REMOTE_URL=http://onchain-bot-ingestion:3031`

**Staging Backend:**

- Ya está configurado (MTProto disabled)
- ✅ AGREGAR: `USE_SSE_INGESTION=true`
- ✅ AGREGAR: `INGESTION_REMOTE_URL=http://onchain-bot-ingestion:3031`

## 🚀 Pasos de Migración

### FASE 1: Preparación (sin downtime)

```bash
# 1. SSH al droplet
ssh root@144.126.203.139

# 2. Navegar a directorio
cd /opt/onchain-bot

# 3. Backup de configuración actual
cp apps/backend/.env.production apps/backend/.env.production.backup-$(date +%Y%m%d-%H%M%S)

# 4. Backup de base de datos
docker exec onchain-bot-postgres pg_dump -U alpha_meta_token_scanner \
  alpha_meta_token_scanner > /tmp/prod-backup-$(date +%Y%m%d-%H%M%S).sql

# 5. Crear directorio para ingestion-service
mkdir -p apps/ingestion-service
```

### FASE 2: Copiar Archivos de Configuración

```bash
# 6. Subir docker-compose.ingestion.yml
# (Desde tu máquina local)
scp /tmp/docker-compose.ingestion.yml root@144.126.203.139:/opt/onchain-bot/apps/backend/

# 7. Subir .env.production para ingestion-service
scp /tmp/ingestion-service.env.production root@144.126.203.139:/opt/onchain-bot/apps/ingestion-service/.env.production
```

### FASE 3: Modificar Backend Configurations

```bash
# 8. En el droplet, editar production backend .env
cd /opt/onchain-bot
nano apps/backend/.env.production

# ELIMINAR o comentar estas líneas:
# INGESTION_TELEGRAM_MTPROTO_API_ID=...
# INGESTION_TELEGRAM_MTPROTO_API_HASH=...
# INGESTION_TELEGRAM_MTPROTO_SESSION=...

# AGREGAR estas líneas:
USE_SSE_INGESTION=true
INGESTION_REMOTE_URL=http://onchain-bot-ingestion:3031

# Guardar: Ctrl+X, Y, Enter

# 9. Editar staging backend .env
cd /opt/onchain-bot-staging
nano apps/backend/.env.staging

# AGREGAR (si no existen):
USE_SSE_INGESTION=true
INGESTION_REMOTE_URL=http://onchain-bot-ingestion:3031

# Guardar: Ctrl+X, Y, Enter
```

### FASE 4: Deploy Ingestion Service (⚠️ DOWNTIME: ~2 minutos)

```bash
# 10. Desde /opt/onchain-bot, levantar ingestion-service
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.ingestion.yml up -d --build

# 11. Esperar a que inicie (15-20 segundos)
sleep 20

# 12. Verificar health del ingestion-service
curl -s http://localhost:3032/api/health | jq '.'

# Debe mostrar:
# {
#   "status": "ok",
#   "mtproto": {
#     "connected": true,
#     "authorized": true
#   },
#   "channels": {
#     "total": 45
#   }
# }

# Si el health check falla, revisar logs:
docker compose -f docker-compose.ingestion.yml logs ingestion-service --tail 100
```

### FASE 5: Restart Production Backend

```bash
# 13. Restart production backend para cargar nueva config
docker compose -f docker-compose.prod.yml restart backend

# 14. Esperar reconexión (10-15 segundos)
sleep 15

# 15. Verificar logs de production backend
docker compose -f docker-compose.prod.yml logs backend --tail 50 | grep -i "sse\|ingestion"

# Buscar:
# ✓ "Using SSE ingestion client (remote mode)"
# ✓ "SSE connection established"
# ❌ NO debe haber "MTProto client initialized"
```

### FASE 6: Restart Staging Backend

```bash
# 16. Restart staging backend
cd /opt/onchain-bot-staging
docker compose -f docker-compose.staging.yml restart backend

# 17. Verificar logs de staging backend
docker compose -f docker-compose.staging.yml logs backend --tail 50 | grep -i "sse\|ingestion"

# Buscar:
# ✓ "Using SSE ingestion client (remote mode)"
# ✓ "SSE connection established"
```

### FASE 7: Verificación End-to-End

```bash
# 18. Verificar mensajes llegando a production
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=5 | jq '.'

# 19. Verificar clientes conectados al ingestion-service
curl -s http://localhost:3032/api/health | jq '.clients'

# Debe mostrar:
# {
#   "connected": 2  ← Production + Staging
# }

# 20. Monitorear logs por 5 minutos
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.ingestion.yml logs -f ingestion-service

# Buscar:
# ✓ "message:received" events
# ✓ "SSE clients: 2"
# ❌ NO debe haber "AUTH_KEY_DUPLICATED"
# ❌ NO debe haber "FLOOD_WAIT" errors
```

### FASE 8: Cleanup (Después de 24h de operación estable)

```bash
# 21. Remover backups antiguos (opcional)
rm /opt/onchain-bot/apps/backend/.env.production.backup-*
rm /tmp/prod-backup-*.sql  # Después de confirmar que todo funciona
```

## ⏱️ Tiempos Estimados

- **Preparación (Fase 1-3):** 10 minutos (sin downtime)
- **Deploy (Fase 4-6):** 2-3 minutos (⚠️ downtime)
- **Verificación (Fase 7):** 5-10 minutos
- **Total:** ~20 minutos

## 🔙 Rollback (Si hay problemas)

```bash
# Rollback rápido (<2 minutos):

# 1. Detener ingestion-service
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.ingestion.yml down

# 2. Restaurar backend production .env
cd /opt/onchain-bot
cp apps/backend/.env.production.backup-* apps/backend/.env.production

# 3. Editar .env.production
nano apps/backend/.env.production
# Cambiar: USE_SSE_INGESTION=false
# Descomentar: INGESTION_TELEGRAM_MTPROTO_* variables

# 4. Restart production backend
docker compose -f docker-compose.prod.yml restart backend

# 5. Verificar MTProto reconectado
docker compose -f docker-compose.prod.yml logs backend --tail 50 | grep "MTProto"
```

## ✅ Criterios de Éxito

- [ ] Ingestion service health = "ok"
- [ ] MTProto connected = true, authorized = true
- [ ] Channels total = 45
- [ ] Clients connected = 2 (production + staging)
- [ ] Production backend logs show "SSE connection established"
- [ ] Staging backend logs show "SSE connection established"
- [ ] No "AUTH_KEY_DUPLICATED" errors en logs
- [ ] Mensajes llegando a ambos backends (verificar dashboard)
- [ ] Uptime > 1 hora sin reconexiones

## 📊 Monitoreo Post-Migración

```bash
# Health check periódico
watch -n 30 'curl -s http://localhost:3032/api/health | jq ".mtproto, .clients, .floodWait"'

# Logs en tiempo real
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.ingestion.yml logs -f ingestion-service

# Verificar mensajes procesados
curl -s http://localhost:3030/api/dashboard/stats | jq '.messages'
```

## 🐛 Troubleshooting

### Problema: AUTH_KEY_DUPLICATED

**Causa:** Backend production todavía tiene MTProto activo.

**Solución:**

```bash
# Verificar que backend NO tiene INGESTION_TELEGRAM_MTPROTO_* sin comentar
grep "INGESTION_TELEGRAM_MTPROTO" /opt/onchain-bot/apps/backend/.env.production

# Debe estar comentado (#) o eliminado
# Si no, comentar y restart backend
```

### Problema: SSE Connection Failed

**Causa:** Ingestion service no está en la red correcta.

**Solución:**

```bash
# Verificar redes del ingestion-service
docker inspect onchain-bot-ingestion | jq '.[0].NetworkSettings.Networks'

# Debe mostrar: onchain-bot-net Y onchain-bot-staging-net
```

### Problema: No Messages Flowing

**Causa:** Channels no seeded correctamente.

**Solución:**

```bash
# Verificar canales
curl -s http://localhost:3032/api/channels | jq '. | length'

# Debe mostrar: 45
# Si es 0, revisar logs de seeding
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.ingestion.yml logs ingestion-service | grep "seed"
```

## 📞 Referencias

- Spec: `.kiro/specs/centralized-ingestion-service/`
- Health endpoint: `http://localhost:3032/api/health`
- Production backend: `http://localhost:3030`
- Staging backend: `http://localhost:3031` (puerto actual, no cambia)
