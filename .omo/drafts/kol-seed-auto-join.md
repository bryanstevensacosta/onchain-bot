---
slug: kol-seed-auto-join
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/kol-seed-auto-join.md
approach: Add joinChannel() to TelegramListenerPort, implement it via GramJS Api.channels.JoinChannel, use it in KolSeeder when resolveChannelMetadata fails.
---

# Draft: kol-seed-auto-join

## Findings (cited - path:lines)
1. GramJS (`telegram` ^2.26.22) soporta `Api.channels.JoinChannel` — no se usa actualmente en el proyecto (apps/backend/package.json)
2. `TelegramListenerPort` está en `apps/backend/src/telegram/ingestion/domain/ports/telegram-listener.port.ts:42-60` — define 4 métodos (subscribe, backfill, resolveChannelMetadata, disconnect)
3. `TelegramMtprotoListenerAdapter` implementa el port en `apps/backend/src/telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts:25-304` — tiene `client: TelegramClient` y `resolvePeerAsChannel`
4. `KolSeeder.onApplicationBootstrap()` en `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:40` — itera KOL_SEED, resuelve metadata, skipea si no es channel
5. `resolveMetadata` en el seeder (línea 161) — cuando `resolveChannelMetadata` falla, devuelve `kind: 'user'`; el seeder luego skipea con `kind !== 'channel'`
6. 45 seeds fallan porque la cuenta "Soporte Crypto Shooterss" no es miembro de esos canales — no pueden resolverse via MTProto sin membership
7. `channels.joinChannel` solo funciona para canales públicos (no privados sin invite link)
8. Error `CHANNEL_PRIVATE` si el canal es privado y no tienes invite link

## Decisiones
1. **Añadir `joinChannel` al port**: es un método nuevo que extiende el contrato. Coherente con la semántica del port (operaciones sobre canales Telegram)
2. **Implementar vía GramJS**: `client.invoke(new Api.channels.JoinChannel({ channel }))` — la librería ya está en el proyecto
3. **Modificar el seeder**: en lugar de skippear, intentar join y reintentar resolución
4. **No cambiar el guard `kind !== 'channel'` del seeder**: en su lugar, cambiar el `kind` que devuelve `resolveMetadata` para que refleje correctamente el estado post-join

## Scope IN
- `TelegramListenerPort` — nuevo método `joinChannel(peerId: string): Promise<JoinResult>`
- `TelegramMtprotoListenerAdapter` — implementación de `joinChannel`
- `KolSeeder.resolveMetadata` — auto-join antes de fallback
- KolSeeder — eliminar guard `kind === 'channel'` o reemplazar por `kind === 'unknown'`

## Scope OUT
- No modificar la lógica de polling/suscripción
- No modificar otros puertos o adaptadores
- No modificar la seed list
- No añadir dependencias nuevas

## Approval gate
status: awaiting-approval
