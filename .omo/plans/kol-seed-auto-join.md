# kol-seed-auto-join - Work Plan

## TL;DR (For humans)

**What you'll get:** El seeder, en vez de skippear los 45 seeds por "no eres miembro del canal", va a intentar unirse automáticamente vía MTProto. Si el canal es público y el join funciona, resuelve el título/handle real. Si el canal es privado (necesita invite link), registra el KOL con placeholder y avisa. Sin warnings, sin skips, sin trabajo manual.

**Why this approach:** GramJS ya está en el proyecto. `channels.joinChannel` es un método MTProto oficial. El flujo es: intentar resolver metadata → si falla → intentar join → si join funciona → reintentar metadata.

**What it will NOT do:** No modificará la seed list. No modificará polling/suscripción. No añadirá dependencias.

**Effort:** Short
**Risk:** Low — el join está protegido por rate limits de Telegram (FLOOD_WAIT), solo se ejecuta en seed time, y no afecta a KOLs ya registrados

---

> TL;DR (machine): Short effort, Low risk. Add joinChannel to TelegramListenerPort + adapter, use in KolSeeder when resolveChannelMetadata fails.

## Scope
### Must have
- `joinChannel(peerId: string)` en `TelegramListenerPort` — devuelve `{ joined: boolean; error?: string }`
- Implementación en `TelegramMtprotoListenerAdapter` vía GramJS `Api.channels.JoinChannel` con manejo de errores (`CHANNEL_PRIVATE`, `USER_ALREADY_PARTICIPANT`, `CHANNELS_TOO_MUCH`, `CHANNEL_INVALID`)
- Modificación en `KolSeeder.resolveMetadata` — cuando `resolveChannelMetadata` falla, intentar `joinChannel`, y si el join funciona, reintentar metadata
- Modificación en `KolSeeder` — cambiar el guard de `kind !== 'channel'` a `kind === 'unknown'` para que los `'user'` (que ahora representan "canal privado sin join") se registren igual con placeholder

### Must NOT have
- No cambiar la seed list ni los IDs
- No modificar polling/suscripción
- No modificar otros puertos
- No nuevas dependencias npm

## Todos
- [ ] 1. Add `joinChannel` method to `TelegramListenerPort`
  What to do:
    - Add to `apps/backend/src/telegram/ingestion/domain/ports/telegram-listener.port.ts`:
      ```typescript
      export interface JoinChannelResult {
        joined: boolean;
        wasAlreadyMember: boolean;
        error?: string;
      }
      
      // Add method:
      joinChannel(peerId: string): Promise<JoinChannelResult>;
      ```
  Must NOT do: Do not change existing method signatures.
  References: `apps/backend/src/telegram/ingestion/domain/ports/telegram-listener.port.ts:42-60`
  Acceptance criteria: Interface compiles with the new method.
  Commit: Y

- [ ] 2. Implement `joinChannel` in `TelegramMtprotoListenerAdapter`
  What to do:
    - Add import: `import { Api } from 'telegram';` at the top of `apps/backend/src/telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts`
    - Implement method using the existing `client` (call `this.ensureClient()`):
      ```typescript
      async joinChannel(peerId: string): Promise<JoinChannelResult> {
        const client = this.ensureClient();
        try {
          const peer = await this.resolvePeerAsChannel(peerId);
          await client.invoke(new Api.channels.JoinChannel({ channel: peer }));
          return { joined: true, wasAlreadyMember: false };
        } catch (err) {
          const msg = (err as Error)?.message ?? '';
          if (msg.includes('USER_ALREADY_PARTICIPANT')) {
            return { joined: true, wasAlreadyMember: true };
          }
          if (msg.includes('CHANNEL_PRIVATE') || msg.includes('CHANNEL_INVALID')) {
            return { joined: false, wasAlreadyMember: false, error: `Channel is private or invalid: ${peerId}` };
          }
          if (msg.includes('CHANNELS_TOO_MUCH')) {
            return { joined: false, wasAlreadyMember: false, error: `Account has joined too many channels` };
          }
          if (msg.includes('FLOOD_WAIT')) {
            return { joined: false, wasAlreadyMember: false, error: `Flood wait: ${msg}` };
          }
          return { joined: false, wasAlreadyMember: false, error: msg };
        }
      }
      ```
    - The method should NOT throw — always return a `JoinChannelResult`
  Must NOT do: Do not modify existing methods. Do not modify the `client` config or connection logic.
  References: `apps/backend/src/telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts:237-250` (resolvePeerAsChannel pattern)
  Acceptance criteria: Method returns proper result objects for success/error cases.
  Commit: Y

- [ ] 3. Modify `KolSeeder` to auto-join + fix the kind guard
  What to do:
    - In `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts`:
    - In `resolveMetadata` method (line 211-244), modify the catch block:
      ```typescript
      } catch (err) {
        // Falló la resolución → intentar unirse al canal
        const joinResult = await this.listener.joinChannel(kolId).catch(() => null);
        if (joinResult?.joined) {
          // Join exitoso → reintentar metadata
          const meta = await this.listener.resolveChannelMetadata(kolId);
          try {
            await this.metadataCache.upsert({...});
          } catch { /* ignore */ }
          return { title: meta.title, handle: meta.handle, kind: meta.kind };
        }
        // No se pudo unir — log específico del motivo
        const reason = joinResult?.error ?? (err instanceof Error ? err.message : 'Unknown');
        this.logger.warn(
          `Could not resolve or join channel ${kolId}: ${reason}` +
          (reason.includes('private') ? '. This channel requires an invite link.' : ''),
        );
        return { title: `Telegram channel ${kolId}`, handle: null, kind: 'user' };
      }
      ```
    - In the main loop (line 90), change the guard from:
      ```typescript
      if (kind !== 'channel') {
      ```
      to:
      ```typescript
      if (kind === 'unknown') {
      ```
      This way `'user'` (private channel, couldn't join) still registers with placeholder, only truly unresolvable is skipped.
  Must NOT do: Do not change the seed data. Do not change the registerKol.execute() call.
  References: `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:90-98` (kind guard), `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:211-244` (resolveMetadata catch)
  Acceptance criteria:
    - When resolveChannelMetadata throws and joinChannel succeeds → KOL is registered with resolved metadata
    - When resolveChannelMetadata throws and joinChannel fails (private) → KOL registered with placeholder
    - When resolveChannelMetadata throws and joinChannel fails (invalid) → KOL is skipped (kind='unknown')
    - All existing KOLs in DB are unaffected
  Commit: Y

## Final verification wave
- [ ] F1. Verify `npx tsc --noEmit` passes (backend)
- [ ] F2. Verify `npm run start:dev` boots with 0 UnknownDependenciesException
- [ ] F3. Verify seed summary shows fewer `notAKol` (some channels may be joinable)
- [ ] F4. Verify backend tests pass

## Commit strategy
Single commit or 3 commits (port + adapter + seeder).

## Success criteria
1. No more warnings about "not a broadcast channel" for public/joinable channels
2. Public channels in the seed list get joined automatically and registered with resolved metadata
3. Private channels get registered with placeholder and a log message about needing invite link
4. Invalid/unresolvable channels are still skipped with `kind='unknown'`
