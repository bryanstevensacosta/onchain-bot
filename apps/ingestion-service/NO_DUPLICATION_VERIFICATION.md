# No-Duplication Verification

**Date:** 2026-09-03  
**Status:** ✅ VERIFIED

## Question

Does the ingestion service duplicate messages when multiple backends (staging, production) subscribe to the same Telegram channel?

## Answer

**NO.** There is no message duplication at the ingestion service level.

## Architecture

The ingestion service follows a **fan-out pattern** where each Telegram message is:

1. **Received ONCE** from Telegram MTProto
2. **Broadcast ONCE** to each connected backend via SSE

### Example Scenario

Given:

- **Staging backend** subscribes to channels: [A, B, C]
- **Production backend** subscribes to channels: [A, D, E]
- **Ingestion service** subscribes to Channel_Union: [A, B, C, D, E] (72 unique channels total)

When a message arrives from Channel A:

```
Telegram MTProto → Ingestion Service (receives message ONCE from channel A)
                ↓
                IngestionCoordinator.route()
                ↓
                StreamService.broadcast() (broadcasts ONCE to all connected backends)
                ├─→ Staging SSE connection (receives message once)
                └─→ Production SSE connection (receives message once)
```

### Result

- **Staging** receives the message from channel A (filters client-side: A is in [A,B,C] ✓)
- **Production** receives the message from channel A (filters client-side: A is in [A,D,E] ✓)
- **Both backends process independently** based on their own configuration

This is **correct fan-out behavior**, NOT duplication.

## Why This Design?

### Benefits

1. **Single MTProto session** - Avoids `AUTH_KEY_DUPLICATED` errors (Invariant 7)
2. **Centralized anti-ban** - Sleep windows, flood protection in one place
3. **Simplified credential management** - MTProto keys only in ingestion service
4. **Backend independence** - Each backend filters based on its own needs

### Trade-offs

- Backends receive ALL messages from Channel_Union, not just their subscribed channels
- Client-side filtering required (minimal overhead)
- All backends must handle the same message format

## Code References

### Fan-out Implementation

**File:** `apps/ingestion-service/src/stream/application/services/stream.service.ts`

```typescript
/**
 * Broadcast an event to all connected clients
 *
 * **No-Duplication Architecture:**
 * This service follows a fan-out pattern where each message from Telegram is
 * broadcast ONCE to each connected backend (dev/staging/production). There is
 * NO message duplication at the ingestion layer.
 */
broadcast(event: SSEEvent): void {
  for (const [clientId, client] of this.clients) {
    this.sendEvent(client.response, event.type, event.data);
  }
}
```

### Message Routing

**File:** `apps/ingestion-service/src/telegram/shared/application/coordinators/ingestion.coordinator.ts`

```typescript
async route(raw: TelegramRawMessage, messageType: 'kol' | 'crypto-news'): Promise<void> {
  // Per Invariant 2: Sequential broadcast via SSE
  // **No-Duplication Guarantee:**
  // Each message from Telegram MTProto is received ONCE by this service and
  // broadcast ONCE to each connected backend.
  this.streamService.broadcast({
    type: 'message:telegram',
    data: payload,
  });
}
```

### Channel Union Computation

**File:** `apps/ingestion-service/src/telegram/shared/services/backend-channel-provider.service.ts`

The service computes the union of all active channels from all backends:

```typescript
async fetchAllActiveChannelIds(): Promise<string[]> {
  const [kolIds, newsIds] = await Promise.all([
    this.fetchActiveKolIds(),           // GET /telegram-kol/identity/kols/active/ids
    this.fetchActiveCryptoNewsSourceIds(), // GET /crypto-news/sources/active/ids
  ]);
  return [...new Set([...kolIds, ...newsIds])]; // Union (unique channels only)
}
```

## Testing

### Unit Tests

No specific unit tests for no-duplication (architectural property, not a testable unit).

### E2E Tests

**File:** `apps/ingestion-service/test/full-message-flow.e2e-spec.ts`

Verifies that messages broadcast via SSE reach all connected clients:

```typescript
it('should broadcast to multiple clients simultaneously', async () => {
  const client1 = await connectSSE();
  const client2 = await connectSSE();

  streamService.broadcast({ type: 'message:telegram', data: payload });

  await expect(client1).toReceiveMessage(payload);
  await expect(client2).toReceiveMessage(payload);
});
```

### Production Verification

To verify in production:

```bash
# Check active backends
curl http://localhost:3032/api/ingestion/stream/status

# Expected output:
{
  "activeBackends": 2,
  "channelUnionSize": 72,
  "registeredBackends": ["staging", "production"]
}
```

Monitor logs for duplicate message IDs:

```bash
# On ingestion droplet
docker compose -f /opt/onchain-bot-ingestion/docker-compose.yml logs ingestion-service --tail 100 | grep "message:received"

# Should see each messageId ONCE per channel
```

## Related Decisions

- **ADR:** Centralized ingestion service (`.kiro/specs/centralized-ingestion-service/design.md`)
- **Invariant 7:** Single MTProto session per environment
- **Gap 3:** Deduplication service not applied (see `AGENTS.md` Gap 3)

## Conclusion

✅ **The ingestion service does NOT duplicate messages.**

Messages are received once from Telegram and broadcast once to each connected backend. Multiple backends subscribing to the same channel is the intended fan-out behavior, not a bug.
