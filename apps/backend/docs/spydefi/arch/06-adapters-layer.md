# Adapters Layer

Concrete implementations of ports. This is where frameworks, databases, and external APIs live.

## Inbound Adapters

Drive the application. Receive external input and translate to use case calls.

### Telegram MTProto Listener (SpyDefi core: `telegram/ingestion`)

```typescript
// infrastructure/telegram/telegram-ingestion.listener.ts
@Injectable()
export class TelegramIngestionListener implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly onMessage: IngestTelegramMessageUseCase,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    const client = new TelegramClient(
      this.config.get('telegram.apiId', { infer: true }),
      this.config.get('telegram.apiHash', { infer: true }),
      { connectionRetries: 5 },
    );
    await client.start({
      phoneNumber: () => prompt('Phone: '),
      password: () => prompt('2FA: '),
      phoneCode: () => prompt('Code: '),
      onError: (err) => this.logger.error(err),
    });

    client.addEventHandler(async (event) => {
      const message = event.message;
      await this.onMessage.execute(
        new IngestTelegramMessageCommand({
          channelId: String(message.peerId),
          messageId: String(message.id),
          text: message.text ?? '',
          sentAt: message.date,
        }),
      );
    }, new NewMessage({}));

    this.client = client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.disconnect();
  }
}
```

### Event Handler (consumer in-process)

```typescript
// infrastructure/event-handlers/token-snapshot-taken.handler.ts
@Injectable()
export class TokenSnapshotTakenHandler
  implements IEventHandler<TokenSnapshotTakenEvent> {

  constructor(private readonly classify: ClassifyTokenUseCase) {}

  @OnEvent('token.snapshot.taken')
  async handle(event: TokenSnapshotTakenEvent): Promise<void> {
    await this.classify.execute(
      new ClassifyTokenCommand({
        callId: event.callId,
        snapshot: event.snapshot,
      }),
    );
  }
}
```

## Outbound Adapters

Implement the ports required by the application/domain.

### In-Memory Repository (SpyDefi core, default)

```typescript
// infrastructure/repositories/in-memory-token-call.repository.ts
@Injectable()
export class InMemoryTokenCallRepository extends TokenCallRepository {
  private readonly store = new Map<string, TokenCall>();

  async save(call: TokenCall): Promise<void> {
    this.store.set(call.id.value, call);
  }

  async findById(id: CallId): Promise<TokenCall | null> {
    return this.store.get(id.value) ?? null;
  }

  async findByAddress(addr: ContractAddress, chainId: ChainId): Promise<TokenCall[]> {
    return [...this.store.values()].filter(
      (c) =>
        c.contractAddress.equals(addr) &&
        c.chainId.equals(chainId),
    );
  }

  async findPendingEnrichment(limit: number): Promise<TokenCall[]> {
    return [...this.store.values()]
      .filter((c) => c.status === CallStatus.RAW)
      .slice(0, limit);
  }
}
```

> Los repositorios in-memory del core llevan **FIFO eviction** (capacity 500–10 000 según BC). El swap a TypeORM/Prisma no toca ningún BC consumer.

### HTTP Client Adapter (DexScreener)

```typescript
// infrastructure/clients/dexscreener.client.ts
@Injectable()
export class DexScreenerClient extends MarketDataProvider {
  constructor(private readonly http: HttpService) {
    super();
  }

  async fetchPairs(chainId: ChainId, address: ContractAddress): Promise<DexPair[]> {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address.value}`;
    const { data } = await firstValueFrom(
      this.http.get<DexScreenerResponse>(url, { params: { chainId: chainId.value } }),
    );
    return data.pairs.map(DexPairMapper.fromDexScreener);
  }
}
```

### Mappers

```typescript
// infrastructure/mappers/token-call.mapper.ts
export class TokenCallMapper {
  static toDto(call: TokenCall): TokenCallDto {
    return {
      id: call.id.value,
      contractAddress: call.contractAddress.value,
      chainId: call.chainId.value,
      ticker: call.ticker.value,
      status: call.status,
      createdAt: call.createdAt.toISOString(),
    };
  }
}
```

## Module Wiring (SpyDefi core: `token/intake/extraction`)

```typescript
// extraction.module.ts
@Module({
  imports: [],
  controllers: [ExtractionController],
  providers: [
    ExtractCandidatesUseCase,
    ExtractCandidatesHandler,
    {
      provide: RawCandidateRepository,
      useClass: InMemoryRawCandidateRepository,
    },
    {
      provide: EventPublisher,
      useClass: InProcessEventEmitterPublisher,
    },
  ],
  exports: [ExtractCandidatesUseCase],
})
export class ExtractionModule {}
```

> Convenciones SpyDefi core:
> - Todos los tokens de DI (`provide: X`) usan `abstract class` del dominio como token, NUNCA strings.
> - El `EventPublisher` se importa de `shared` y siempre es un wrapper sobre `@nestjs/event-emitter`.
> - `InMemory*Repository` es la única implementación de repo que se exporta; el swap a TypeORM/Prisma se hace en otro módulo paralelo, no en este.
