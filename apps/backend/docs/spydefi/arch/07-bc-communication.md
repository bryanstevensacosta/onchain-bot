# Communication Between Bounded Contexts

## Anti-patterns (prohibidos en el core)

- Compartir tablas de DB entre BCs.
- Importar entidades de otro BC (e.g. `import { TokenCall } from '../../token/intake/parsing/domain/...'`).
- Acoplamiento directo entre clases (llamar métodos de otro BC sin pasar por un puerto o evento).
- Compartir un `Map` o servicio singleton entre dos BCs.

## Enfoques correctos

### 1. Domain Events in-process (`@nestjs/event-emitter`)

Esta es la forma **predominante** de comunicación entre BCs del core.

```typescript
// BC publicador: token/intake/parsing
export class TokenCallParsedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'token.call.parsed' as const;
  readonly eventName = TokenCallParsedEvent.EVENT_NAME;
  readonly payload: Readonly<{
    callId: string;
    contractAddress: string;
    chainId: string;
    ticker: string;
    sourceChannelId: string;
    sourceMessageId: string;
  }>;

  constructor(props: TokenCallParsedEvent['payload']) {
    super();
    this.payload = Object.freeze({ ...props });
  }
}

// BC consumidor: token/normalization
@Injectable()
export class TokenCallParsedHandler
  implements IEventHandler<TokenCallParsedEvent> {

  constructor(private readonly normalize: NormalizeTokenCallUseCase) {}

  @OnEvent(TokenCallParsedEvent.EVENT_NAME)
  async handle(event: TokenCallParsedEvent): Promise<void> {
    await this.normalize.execute(
      new NormalizeTokenCallCommand({
        callId: event.payload.callId,
        contractAddress: event.payload.contractAddress,
        chainId: event.payload.chainId,
        // ...
      }),
    );
  }
}
```

> En el core, **todos los eventos extienden `DomainEvent`** (de `shared`), llevan `eventName` constante y `payload` inmutable (`Object.freeze`). Esto está fijado en la convención §8 de cada README de BC.

### 2. Internal API in-process (puerto de aplicación)

Cuando un BC necesita **leer estado** de otro BC (no solo reaccionar a eventos), expone un puerto (abstract class) y un adapter in-memory lo implementa. En el repo de producto, ese adapter se reemplaza por uno que lea de la DB persistente.

```typescript
// BC que expone: token/channel-reputation
// application/ports/channel-reputation.port.ts
export abstract class ChannelReputationPort {
  abstract getFor(channelId: ChannelId): Promise<ChannelReputationSnapshot>;
  abstract recordCallOutcome(call: CallOutcome): Promise<void>;
}

// BC que consume: token/scoring
// application/use-cases/score-token-call.use-case.ts
constructor(
  private readonly callRepo: TokenCallRepository,
  private readonly channelReputation: ChannelReputationPort, // <- puerto
  // ...
) {}
```

### 3. Message Broker (futuro, fuera del core)

Cuando el core se despliegue como worker separado y los BCs de producto vivan en otro proceso, se introduce Kafka/RabbitMQ. El core **no asume broker**; en el core la comunicación es 100% in-process.

## Context Mapping (aplicado al core de SpyDefi)

| Relación | Ejemplo en el core |
|---|---|
| **Partnership** | `token/scoring` ↔ `token/channel-reputation` (colaboran en el score) |
| **Customer-Supplier** | `token/market-data/enrichment` provee `TokenSnapshotTaken` que consume `token/classification`, `token/honeypot` y `token/scoring` |
| **Conformist** | `chain/detection` se conforma al modelo de `chain/registry` (catálogo de chains) |
| **Open Host Service** | `shared/domain` expone `DomainEvent`, `ValueObject`, `AggregateRoot`, `DomainError` como API estable |
| **Published Language** | Todos los eventos del core extienden `DomainEvent` con `eventName` y `payload` tipado |

## DTOs para comunicación cross-context

```typescript
// DTO compartido publicado en el evento (no la entidad)
export interface TokenCallParsedPayload {
  readonly callId: string;
  readonly contractAddress: string;
  readonly chainId: string;
  readonly ticker: string;
  readonly sourceChannelId: string;
  readonly sourceMessageId: string;
}
```

> **Regla de oro del core:** nunca exponer la entidad `TokenCall` (con sus métodos) en un payload. Solo el DTO plano y serializable. La entidad se reconstruye en el BC consumidor vía factory.
