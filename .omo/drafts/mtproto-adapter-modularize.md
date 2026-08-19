---
slug: mtproto-adapter-modularize
status: drafting
intent: clear
pending-action: write .omo/plans/mtproto-adapter-modularize.md
approach: 'Extraer 6 responsabilidades del adapter en clases/servicios separados: ClientFactory, PollingOrchestrator, MediaDownloader, ChannelResolver, MessageMapper, ChannelOperations. Dejar adapter como thin orchestrator.'
---

# Draft: mtproto-adapter-modularize

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->

| ID                             | Outcome                                                  | Status |
| ------------------------------ | -------------------------------------------------------- | ------ |
| TelegramClientFactory          | Crea TelegramClient con sesión MTProto                   | active |
| PollingOrchestrator            | Gestiona staggered polling loop con sleep/flood handling | active |
| MediaDownloaderService         | Download + refresh de media Telegram                     | active |
| ChannelResolverService         | Resuelve peer IDs a entidades Telegram                   | active |
| MessageMapper                  | Mapea mensajes raw a TelegramRawMessage                  | active |
| ChannelOperationsService       | resolveChannelMetadata + joinChannel                     | active |
| TelegramMtprotoListenerAdapter | Thin orchestrator que/wirea los servicios                | active |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->

| Assumption                                            | Adopted Default                          | Rationale                                  | Reversible? |
| ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------ | ----------- |
| Todos los servicios van en mismo directorio           | `telegram/ingestion/shared/api/mtproto/` | Co-localización facilita imports relativos | Sí          |
| No se cambia la interfaz pública TelegramListenerPort | Mantener firma actual                    | BCs dependientes no deben break            | No          |
| Cada servicio es un clasets independiente             | Sí                                       | Hexagonal: 1 clase = 1 responsabilidad     | Sí          |

## Findings (cited - path:lines)

- `TelegramMtprotoListenerAdapter` actual: 794 líneas
- `TelegramListenerPort` interface: `telegram/ingestion/shared/domain/ports/telegram-listener.port.ts:1`
- Dependencies: `FloodWaitHandlerService`, `SleepWindowService`, `RedisService`, `CryptoNewsMediaDownloader`
- MediaExtractor ya extraído: 70 líneas en el mismo archivo

## Decisions (with rationale)

1. **Client Factory**: Extraer `ensureClient()` + configuración TelegramClient. ~30 líneas.
2. **Polling Orchestrator**: Extraer `startPollingLoop()` + estado de polling (queue, resolvers). ~85 líneas.
3. **Media Downloader**: Extraer `extractMediaAttachments()` + lógica de refresh. ~150 líneas.
4. **Channel Resolver**: Extraer `resolvePeerAsChannel()`. ~20 líneas.
5. **Message Mapper**: Extraer lógica de mapeo de RawTelegramMessage. ~50 líneas.
6. **Channel Operations**: Extraer `resolveChannelMetadata()` + `joinChannel()`. ~60 líneas.

Total a extraer: ~395 líneas → adapter final ~400 líneas (-50%).

## Scope IN

- Crear 6 servicios/clases separados
- Mantener interfaz `TelegramListenerPort` sin cambios
- Tests existentes deben pasar sin修改
- ESLint + TypeScript limpios

## Scope OUT (Must NOT have)

- No cambiar `TelegramMediaAttachment` type
- No cambiar `TelegramRawMessage` type
- No cambiar firmas de `TelegramListenerPort`
- No modificar otros BCs
- No crear nuevos módulos NestJS (solo clases TS)

## Open questions

- ¿Cada servicio debe ser `@Injectable()` o clase TS pura?
- ¿Prefieres un archivo por servicio o agrupar en `services/`?

## Approval gate

status: awaiting-approval

<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
