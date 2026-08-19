# Plan: Persistir lastSeenMessageId en Redis para evitar re-ingestión

## Problema

El `TelegramMtprotoListenerAdapter` usa un `Map<string, number>` en memoria (`lastSeenMessageId`) para trackear el último messageId procesado por cada canal. Al reiniciar el backend:

1. El Map se vacía → `lastSeen = -1`
2. `minId: -1` → pide mensajes desde el inicio
3. Telegram retorna mensajes históricos
4. Se reprocesan mensajes ya ingestados previamente

**Impacto**: Duplicación de llamadas en el pipeline, posible spam de publicaciones al VIP channel.

## Solución

Usar **Redis** (ya habilitado en staging: `REDIS_ENABLED=true`) para persistir el `lastSeenMessageId` por canal.

## Scope

- [ ] Modificar `TelegramMtprotoListenerAdapter` para usar Redis
- [ ] No requiere cambios en el pipeline de extracción/parsing (solo persistencia de estado)
- [ ] No requiere cambios en la DB (TypeORM)

## No scope

- [ ] Deduplicación a nivel de messageId en el pipeline (queda como improvement futuro)
- [ ] Migración de datos existentes

## Arquitectura actual

```
TelegramMtprotoListenerAdapter
├── lastSeenMessageId: Map<string, number>  ← en memoria (se pierde en restart)
├── subscribe(channelIds) → startPollingLoop()
│   └── getMessages(peer, { minId: lastSeen, limit: 50 })
│       └── lastSeen = this.lastSeenMessageId.get(peerId) ?? -1
└── backfill(channelId, limit)
```

## Arquitectura propuesta

```
TelegramMtprotoListenerAdapter
├── lastSeenMessageId: Map<string, number>  ← cache en memoria (fallback)
├── redis: RedisService  ← inyectado
├── subscribe(channelIds)
│   └── Cargar desde Redis al iniciar: redis.get(`ingestion:lastSeen:${peerId}`)
│   └── Actualizar Redis al final de cada poll cycle (no por mensaje)
└── backfill(channelId, limit)  ← NO actualiza lastSeen (solo lee)
```

## Detalles de implementación

### 1. Inyectar RedisService

El `RedisService` está disponible en `shared/common/cache/redis.service.ts` y ya está configurado globalmente.

```typescript
import { RedisService } from 'shared/common/cache/redis.service';

constructor(
  // ... otros deps
  private readonly redis: RedisService,
) {}
```

### 2. Normalizar peerId para Redis key

Los peerIds pueden venir en varios formatos (`-1001234567890`, `@username`, `1234567890`). Normalizar siempre a formato numérico sin prefijos.

```typescript
private normalizePeerId(peerId: string): string {
  // Remover @ inicial
  let normalized = peerId.startsWith('@') ? peerId.slice(1) : peerId;
  // Remover -100 prefix si existe (son 4 caracteres: -100)
  if (normalized.startsWith('-100')) {
    normalized = normalized.slice(4);  // -1001234567890 → 1234567890
  }
  return normalized;
}
```

### 3. Cargar lastSeen desde Redis al iniciar

En `subscribe()`, antes de iniciar el polling loop:

```typescript
for (const peerId of channelIds) {
  const key = `ingestion:lastSeen:${this.normalizePeerId(peerId)}`;
  try {
    const cached = await this.redis.get(key);
    if (cached) {
      const parsed = parseInt(cached, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        this.lastSeenMessageId.set(peerId, parsed);
      }
    }
  } catch (err) {
    this.logger.warn(
      `Failed to load lastSeen from Redis for ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Fallback: usar Map vacío (comportamiento actual)
  }
}
```

### 4. Persistir al final de cada poll cycle (NO por mensaje)

**CRITICAL**: Para evitar 50+ Redis round-trips por ciclo, actualizar Redis UNA SOLA VEZ por ciclo de polling con el messageId más alto visto.

```typescript
// Al final del loop de polling por canal (después de procesar todos los mensajes nuevos)
const lastSeen = this.lastSeenMessageId.get(peerId);
if (lastSeen !== undefined && lastSeen > 0) {
  const key = `ingestion:lastSeen:${this.normalizePeerId(peerId)}`;
  try {
    await this.redis.set(key, lastSeen.toString());
  } catch (err) {
    this.logger.warn(
      `Failed to persist lastSeen to Redis for ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    // No es fatal: el Map en memoria ya tiene el valor
  }
}
```

### 5. Backfill NO actualiza lastSeen

El método `backfill()` es para recuperar mensajes históricos bajo demanda. NO debe actualizar el lastSeen ni escribir a Redis.

```typescript
// En backfill(), NO hacer:
// this.lastSeenMessageId.set(channelId, rawMsg.id);
// await this.redis.set(...)
// El lastSeen se mantiene igual para no afectar el polling normal
```

### 6. Manejo de errores y fallback

```typescript
// En constructor o al inicio de subscribe()
if (!this.redis.isEnabled()) {
  this.logger.warn('Redis not enabled - using in-memory Map only');
  // this.redis stays null, all Redis operations become no-ops
}

// Wrapper para operaciones Redis con fallback
private async safeRedisSet(key: string, value: string): Promise<void> {
  if (!this.redis?.isEnabled()) return;
  try {
    await this.redis.set(key, value);
  } catch (err) {
    this.logger.warn(`Redis set failed (key=${key}): ${err instanceof Error ? err.message : String(err)}`);
    // No es fatal - el Map en memoria sirve como fallback
  }
}
```

### 7. TTL

Sin TTL - el lastSeen debe persistir indefinidamente.

## Riesgos

| Riesgo                                        | Mitigación                                        |
| --------------------------------------------- | ------------------------------------------------- |
| Redis no responde                             | Fallback a Map en memoria (comportamiento actual) |
| Redis cae mid-operation                       | Logs + continue; Map funciona como fallback       |
| Mensajes inválidos (NaN)                      | Validación antes de setear Map                    |
| Primer poll tras restart trae muchos mensajes | Implementar deduplicación en pipeline (futuro)    |
| Keys huérfanas si se elimina un KOL           | Limpiar keys al hacer `DELETE /kols/:id` (futuro) |
| Race condition backfill + polling             | Backfill no toca lastSeen                         |

## Alternativas consideradas

| Alternativa                           | Pros                                               | Contras                       |
| ------------------------------------- | -------------------------------------------------- | ----------------------------- |
| **A) Redis** (elegida)                | Rápido, ya disponible en staging, survive restarts | Requiere Redis activo         |
| B) DB columna `lastIngestedMessageId` | Persistente, simple                                | Más lento, requiere migración |
| C) Deduplicación en pipeline          | Resuelve el problema de raíz                       | Mayor cambio, más complejo    |

## Files a modificar

- `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts`
  - Importar `RedisService`
  - Agregar al constructor
  - Agregar método `normalizePeerId()`
  - Modificar `subscribe()` para cargar desde Redis
  - Modificar polling loop para persistir al final del ciclo
  - Modificar `backfill()` para NO tocar lastSeen
  - Agregar `safeRedisSet()` helper

## Tests

- [ ] Verificar que al iniciar con Redis disponible, se cargan los lastSeen desde Redis
- [ ] Verificar que tras un poll cycle completo, se guarda UNA sola vez en Redis
- [ ] Verificar fallback a Map en memoria cuando Redis no está disponible
- [ ] Verificar que parseInt con valor inválido (NaN) no rompe
- [ ] Verificar que backfill() NO actualiza lastSeen ni Redis
- [ ] Verificar que tras restart, no se re-procesan mensajes old
- [ ] Verificar que peerId se normaliza correctamente (-100, @ prefixes)

## Rollback

Si esta change causa problemas en producción:

1. Set `REDIS_ENABLED=false` en `.env.staging` / `.env.production`
2. Restart del backend — reverts a in-memory Map behavior
3. No data migration needed (Redis keys pueden quedar o limpiarse manualmente)

```bash
# Limpiar keys de Redis si es necesario (opcional)
redis-cli KEYS "ingestion:lastSeen:*" | xargs redis-cli DEL
```

## Commands post-deploy

```bash
# No requiere commands especiales
# Redis ya está corriendo en staging y prod
```
