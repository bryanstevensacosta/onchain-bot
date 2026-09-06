# Ingestion Service - Preguntas Frecuentes

## 🎯 Arquitectura Final

```
┌────────────────────────────────────────────────────────────┐
│  DROPLET (Ingestion Service - Puerto 3032 público)         │
│  - Cuenta Telegram dedicada (API_ID producción)            │
│  - 1 SOLO entorno (producción)                             │
│  - Deploy: solo master branch                              │
└──────┬─────────────────┬───────────────┬──────────────────┘
       │ SSE             │ SSE           │ SSE
       ▼                 ▼               ▼
   Dev Local        Staging          Production
   (consume)        (consume)        (consume)

┌────────────────────────────────────────────────────────────┐
│  DEV LOCAL (Ingestion Service - Puerto 3031 opcional)      │
│  - Cuenta Telegram separada (API_ID dev)                   │
│  - Para testing de ingestion-service solamente             │
│  - NO corre simultáneamente con droplet                    │
└────────────────────────────────────────────────────────────┘
```

## ❓ Preguntas y Respuestas

### 1. ¿Necesito variables MTProto en dev local?

**❌ NO.** Dev local solo necesita:

```bash
# apps/backend/.env.dev
USE_SSE_INGESTION=true
INGESTION_REMOTE_URL=http://144.126.203.139:3032

# ❌ NO incluir:
# INGESTION_TELEGRAM_MTPROTO_*
```

**Razón:** Dev consume mensajes vía SSE, no conecta a Telegram directamente.

---

### 2. ¿Cómo pruebo cambios en ingestion-service localmente?

Tienes 3 opciones:

#### Opción A: Mocks (Recomendada) ⭐

```typescript
// Usa datos fake, sin Telegram API
export class TelegramClientMockAdapter {
  async *subscribe() {
    while (true) {
      yield this.generateFakeMessage();
      await sleep(5000);
    }
  }
}
```

```bash
# .env.dev.local
USE_MOCK_TELEGRAM=true
INGESTION_MODE=mock
```

**Ventajas:**

- ✅ Sin AUTH_KEY_DUPLICATED
- ✅ Control total sobre test data
- ✅ Más rápido

#### Opción B: Kill Switch

```bash
# 1. Detener droplet ingestion
ssh root@144.126.203.139
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.ingestion.yml stop

# 2. Correr local con credenciales reales
npm run start:dev

# 3. Cuando termines, revertir
# Local: Ctrl+C
# Droplet: docker compose ... start
```

**Desventajas:**

- ⚠️ Downtime en staging/prod mientras pruebas

#### Opción C: Cuenta Separada ⭐ (IMPLEMENTADO)

**✅ Configuración actual:** Dev local usa credenciales separadas, droplet usa producción.

```bash
# Local: apps/ingestion-service/.env
INGESTION_TELEGRAM_MTPROTO_API_ID=34691112  # Dev account
INGESTION_TELEGRAM_MTPROTO_API_HASH=<dev_hash>
INGESTION_TELEGRAM_MTPROTO_SESSION=<dev_session>

# Droplet: /opt/onchain-bot/apps/ingestion-service/.env
INGESTION_TELEGRAM_MTPROTO_API_ID=<prod_id>  # Production account
INGESTION_TELEGRAM_MTPROTO_API_HASH=<prod_hash>
INGESTION_TELEGRAM_MTPROTO_SESSION=<prod_session>
```

**Ventajas:**

- ✅ Sin conflictos AUTH_KEY_DUPLICATED
- ✅ Ambos pueden correr simultáneamente
- ✅ Testing aislado

**Nota:** Nunca corras dev local y droplet con las MISMAS credenciales simultáneamente.

---

### 3. ¿Necesito un repositorio separado para ingestion-service?

**❌ NO.** Usa el monorepo actual con workflow independiente.

**Estructura:**

```
onchain-bot/ (mismo repo)
├── apps/
│   ├── backend/          # Deploy: dev → staging, master → prod
│   ├── frontend/         # Deploy: dev → staging, master → prod
│   └── ingestion-service/ # Deploy: master → prod (solo 1 entorno)
└── .github/workflows/
    ├── deploy.yml         # Backend + Frontend prod
    ├── deploy-staging.yml # Backend + Frontend staging
    └── deploy-ingestion.yml # Ingestion prod (nuevo)
```

**Branches:**

- `master` → Deploy ingestion a droplet
- `dev` → NO deploy ingestion (solo backend/frontend)

**Deploy ingestion SOLO cuando:**

- Cambios en `apps/ingestion-service/**`
- Push a `master`

---

### 4. Ingestion Service: ¿1 o 3 entornos?

**Respuesta: Depende de tu caso de uso.**

#### Escenario A: 1 Ingestion (Recomendado para mayoría) ⭐

```
┌─────────────────────┐
│ Ingestion (droplet) │
│ - Monitorea 45 KOLs │
└──────┬──────────────┘
       │ Broadcast
       ├─→ Dev (consume todo)
       ├─→ Staging (consume todo)
       └─→ Prod (consume todo)
```

**Cuándo usar:**

- ✅ Quieres que dev/staging usen datos reales
- ✅ Canales de producción son suficientes para testing
- ✅ Máxima simplicidad

#### Escenario B: 1 Ingestion + Filtrado

```
┌─────────────────────┐
│ Ingestion (droplet) │
│ - Monitorea 50 KOLs │
└──────┬──────────────┘
       │ Broadcast (todos los canales)
       ├─→ Dev (filtra 5 canales)
       ├─→ Staging (filtra 10 canales)
       └─→ Prod (usa los 50)
```

**Cuándo usar:**

- ✅ Dev/staging solo necesitan subconjunto
- ✅ Quieres reducir carga en dev/staging
- ✅ Mismo ingestion, pero procesamiento selectivo

**Implementación:**

```typescript
// Backend dev/staging: apps/backend/.env.dev
INGESTION_CHANNEL_FILTER=1234567890,0987654321  # Solo estos

// SseIngestionClientAdapter filtra:
if (INGESTION_CHANNEL_FILTER) {
  const allowed = INGESTION_CHANNEL_FILTER.split(',');
  if (!allowed.includes(message.peerId)) {
    continue;  // Skip
  }
}
```

#### Escenario C: 2 Ingestions (Si staging DEBE ser diferente)

```
┌───────────────────┐  ┌──────────────────┐
│ Ingestion-Prod    │  │ Ingestion-Test   │
│ - 45 KOLs reales  │  │ - 5 canales test │
│ - Cuenta empresa  │  │ - Cuenta dev     │
└────┬──────────────┘  └────┬─────────────┘
     │                      │
     ├─→ Prod              ├─→ Dev
     └─→ Staging           └─→ (alternativa)
```

**Cuándo usar:**

- ⚠️ Staging necesita canales diferentes a prod
- ⚠️ No quieres mezclar test data con prod data
- ⚠️ Puedes mantener 2 cuentas Telegram

**Costo:**

- 2 cuentas Telegram
- 2 ingestion-services
- Mayor complejidad

---

### 5. ¿Qué pasa si inicio ingestion local mientras droplet está corriendo?

**🚨 AUTH_KEY_DUPLICATED** - Telegram detecta 2 sesiones y desconecta ambas.

**Cómo evitarlo:**

1. Usa **Opción A (Mocks)** para desarrollo
2. O usa **Opción B (Kill Switch)** deteniendo droplet primero
3. O usa **Opción C (Cuenta separada)** con diferentes credenciales

---

### 6. ¿Ingestion service tiene .env.dev, .env.staging, .env.production?

**NO. Solo tiene `.env.production`** (un solo entorno).

```bash
# ✅ SÍ existe (droplet)
apps/ingestion-service/.env.production

# ❌ NO existen
apps/ingestion-service/.env.dev        # No necesario
apps/ingestion-service/.env.staging    # No necesario

# 🧪 Opcional (solo para pruebas locales)
apps/ingestion-service/.env.dev.local  # Mocks o cuenta dev
```

**Razón:** Ingestion es un servicio compartido, no tiene entornos.

---

### 7. ¿Cómo escalar horizontalmente (múltiples droplets)?

Si en el futuro necesitas **alta disponibilidad**:

```
┌────────────────────┐   ┌────────────────────┐
│ Ingestion-Primary  │   │ Ingestion-Standby  │
│ (activo)           │   │ (backup)           │
└──────┬─────────────┘   └────────────────────┘
       │                      ▲
       │ Heartbeat checks     │ Failover
       ▼                      │
  Load Balancer ──────────────┘
       │
       ├─→ Dev
       ├─→ Staging
       └─→ Prod
```

**Requiere:**

- Leader election (Redis/etcd)
- Health checks
- Automatic failover

**Pero NO lo necesitas ahora** (sobre-ingeniería).

---

### 8. ¿Puedo deployar ingestion-service a otro proveedor (Fly.io, Railway)?

**✅ SÍ.** Es una aplicación standalone.

```bash
# Deploy a Fly.io ejemplo
fly launch --dockerfile apps/ingestion-service/Dockerfile
fly secrets set INGESTION_TELEGRAM_MTPROTO_SESSION=...
fly deploy
```

**Ventajas:**

- ✅ Independiente del droplet
- ✅ Mejor uptime (infraestructura gestionada)
- ✅ Fácil escalar

**Consideraciones:**

- Media storage (usar S3/R2 en vez de disco local)
- Redis externo (Upstash/Redis Cloud)
- Postgres externo (Supabase/Neon)

---

## 📋 Checklist de Implementación

### Fase 1: Centralizar Ingestion (Lo que falta)

- [ ] Exponer puerto 3032 públicamente en droplet
- [ ] Configurar firewall: `ufw allow 3032/tcp`
- [ ] Backend dev local apunta a droplet: `http://144.126.203.139:3032`
- [ ] NO correr ingestion-service en dev local
- [ ] Verificar 3 clientes conectados

### Fase 2: Development Workflow

- [ ] Implementar mock adapter para pruebas locales
- [ ] Documentar "kill switch" para testing real
- [ ] Agregar feature flag: `USE_MOCK_TELEGRAM`

### Fase 3: CI/CD

- [ ] Crear workflow `.github/workflows/deploy-ingestion.yml`
- [ ] Deploy solo en `master` branch
- [ ] Health checks post-deploy
- [ ] Verificar clientes conectados

### Fase 4: Monitoring

- [ ] Alertas si `clients.connected < 2`
- [ ] Alertas si `mtproto.connected = false`
- [ ] Dashboard Grafana para métricas

---

## 🎓 Conceptos Clave

### Ingestion Service ≠ Backend

| Aspecto   | Backend                           | Ingestion Service        |
| --------- | --------------------------------- | ------------------------ |
| Entornos  | 3 (dev/staging/prod)              | 1 (prod)                 |
| Deploy    | Por branch                        | Solo master              |
| State     | Stateful (DB, sessions)           | Stateless (solo MTProto) |
| Escalado  | Horizontal (múltiples instancias) | Single instance          |
| Propósito | Lógica de negocio                 | Solo ingesta             |

### SSE ≠ WebSocket

| Aspecto     | SSE                   | WebSocket     |
| ----------- | --------------------- | ------------- |
| Dirección   | Server → Client (uni) | Bidireccional |
| Protocolo   | HTTP/1.1              | TCP upgrade   |
| Reconnect   | Automático            | Manual        |
| Overhead    | Bajo                  | Medio         |
| Caso de uso | Broadcast read-only   | Chat, gaming  |

**Para Ingestion: SSE es perfecto** (solo necesitas server → clients).

---

## 🚀 Próximos Pasos Recomendados

1. **Implementar versión centralizada** (lo que discutimos)
2. **Agregar mock adapter** para desarrollo local
3. **Deploy workflow independiente** para ingestion
4. **Monitoreo básico** (health checks + alerts)
5. **(Futuro) Evaluar Fly.io** si droplet se vuelve limitante
