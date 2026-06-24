# Application Layer

Coordinates use cases. Contains **no business logic** — it orchestrates domain objects.

## What Lives Here

| Component | Purpose |
|-----------|---------|
| **Use Cases (Commands / Queries)** | Complete operations the system performs (e.g. `EnrichTokenCallUseCase`, `ScoreTokenCallUseCase`) |
| **Event Handlers** | Reaccionan a eventos de otros BCs y disparan use cases |
| **Inbound Ports** | Interfaces que definen qué hace el BC (a menudo el propio use case) |
| **DTOs** | Data transfer objects para input/output entre capas |
| **Mappers** | Convierten DTOs ↔ entidades de dominio |

## Use Case Example (SpyDefi core: `ScoreTokenCallUseCase`)

```typescript
// application/use-cases/score-token-call.use-case.ts
@Injectable()
export class ScoreTokenCallUseCase {
  constructor(
    private readonly callRepo: TokenCallRepository,
    private readonly channelReputation: ChannelReputationPort,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(command: ScoreTokenCallCommand): Promise<CallScore> {
    const call = await this.callRepo.findById(new CallId(command.callId));
    if (!call) throw new DomainError(ErrorCode.NOT_FOUND, `Call ${command.callId} not found`);

    const snapshot = command.snapshot; // viene del command (input validado)
    const reputation = await this.channelReputation.getFor(new ChannelId(call.sourceChannelId.value));

    const score = CallScore.compute({
      classification: command.classification,
      snapshot,
      buzz: command.buzz,
      reputation,
    });

    call.applyScore(score);  // domain enforces invariants

    await this.callRepo.save(call);
    await this.eventPublisher.publishAll(call.commitEvents());

    return score;
  }
}
```

## Event Handler Example (SpyDefi core: `NormalizedCallExtractedHandler`)

```typescript
// application/event-handlers/normalized-call-extracted.handler.ts
@Injectable()
export class NormalizedCallExtractedHandler
  implements IEventHandler<NormalizedCallExtractedEvent> {

  constructor(private readonly enrich: EnrichTokenCallUseCase) {}

  async handle(event: NormalizedCallExtractedEvent): Promise<void> {
    await this.enrich.execute(
      new EnrichTokenCallCommand({
        callId: event.callId,
        contractAddress: event.contractAddress,
        chainId: event.chainId,
      }),
    );
  }
}
```

## DTO Example

```typescript
// application/dto/enrich-token-call.dto.ts
export class EnrichTokenCallDto {
  @IsString() @IsNotEmpty()
  callId!: string;

  @IsString() @Matches(/^0x[a-fA-F0-9]{40}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  contractAddress!: string;

  @IsString() @IsNotEmpty()
  chainId!: string;
}
```

## Rules

- Orchestrates domain objects.
- Uses ports (interfaces), not concrete adapters.
- NO business rules here (those belong in domain).
- NO direct database calls.
- NO framework-specific logic en el dominio; en la capa de aplicación SÍ se permite `@Injectable()` de NestJS.
- Errores: usar `DomainError(ErrorCode.X, message)` para que el handler de eventos nunca haga throw sin clasificar.
