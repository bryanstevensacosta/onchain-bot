# Testing Strategy

## Domain Layer (Pure Unit Tests)

Sin infraestructura. Tests rápidos y deterministas.

```typescript
describe('TokenCall', () => {
  it('should create with valid props', () => {
    const call = TokenCall.create({
      id: new CallId('c1'),
      contractAddress: ContractAddress.fromEvm('0xabc...'),
      chainId: new ChainId('ethereum'),
      ticker: new Ticker('PEPE'),
      sourceChannelId: new ChannelId('@kol_alpha'),
      sourceMessageId: new MessageId('m1'),
    });
    expect(call.status).toBe(CallStatus.RAW);
  });

  it('should reject empty contract address', () => {
    expect(() =>
      TokenCall.create({
        id: new CallId('c1'),
        contractAddress: '' as any,
        chainId: new ChainId('ethereum'),
        ticker: new Ticker('PEPE'),
        sourceChannelId: new ChannelId('@kol_alpha'),
        sourceMessageId: new MessageId('m1'),
      }),
    ).toThrow(DomainError);
  });

  it('should not allow approve before score', () => {
    const call = TokenCall.create(/* ... */);
    expect(() => call.approve(new CallScore(80))).toThrow('must be SCORED');
  });

  it('should not allow enriching a published call', () => {
    const call = TokenCall.create(/* ... */);
    call.markEnriched(mockSnapshotRef());
    call.applyScore(new CallScore(80));
    call.approve(new CallScore(80));
    call.markPublished();
    expect(() => call.markEnriched(mockSnapshotRef())).toThrow('Cannot enrich a published call');
  });
});
```

## Application Layer (Use Case Tests con mocks de puertos)

```typescript
describe('EnrichTokenCallUseCase', () => {
  let useCase: EnrichTokenCallUseCase;
  let callRepo: MockProxy<TokenCallRepository>;
  let snapshotRepo: MockProxy<TokenSnapshotRepository>;
  let marketData: MockProxy<MarketDataProvider>;
  let publisher: MockProxy<EventPublisher>;

  beforeEach(() => {
    callRepo = mock<TokenCallRepository>();
    snapshotRepo = mock<TokenSnapshotRepository>();
    marketData = mock<MarketDataProvider>();
    publisher = mock<EventPublisher>();
    useCase = new EnrichTokenCallUseCase(callRepo, snapshotRepo, marketData, publisher);
  });

  it('should fetch market data, persist snapshot and publish event', async () => {
    const call = TokenCall.create(/* ... */);
    callRepo.findById.mockResolvedValue(call);
    marketData.fetchPairs.mockResolvedValue([/* pairs */]);

    await useCase.execute(
      new EnrichTokenCallCommand({ callId: 'c1', contractAddress: '0xabc...', chainId: 'ethereum' }),
    );

    expect(snapshotRepo.save).toHaveBeenCalled();
    expect(publisher.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(TokenSnapshotTakenEvent)]),
    );
  });

  it('should throw NOT_FOUND when call does not exist', async () => {
    callRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(new EnrichTokenCallCommand({ /* ... */ })))
      .rejects.toThrow(DomainError);
  });
});
```

## Adapter Tests

### In-Memory Repository (Unit + smoke)

```typescript
describe('InMemoryTokenCallRepository', () => {
  let repo: InMemoryTokenCallRepository;

  beforeEach(() => {
    repo = new InMemoryTokenCallRepository();
  });

  it('should save and find by id', async () => {
    const call = TokenCall.create(/* ... */);
    await repo.save(call);
    const found = await repo.findById(call.id);
    expect(found?.id.value).toBe(call.id.value);
  });

  it('should evict oldest when capacity reached', async () => {
    const smallRepo = new InMemoryTokenCallRepository(2);
    const c1 = TokenCall.create({ id: new CallId('c1'), /* ... */ });
    const c2 = TokenCall.create({ id: new CallId('c2'), /* ... */ });
    const c3 = TokenCall.create({ id: new CallId('c3'), /* ... */ });
    await smallRepo.save(c1);
    await smallRepo.save(c2);
    await smallRepo.save(c3);
    expect(await smallRepo.findById(c1.id)).toBeNull();
    expect(await smallRepo.findById(c3.id)).not.toBeNull();
  });
});
```

### HTTP Client (Integration con mock server o `nock`)

```typescript
describe('DexScreenerClient', () => {
  let client: DexScreenerClient;

  beforeEach(() => {
    client = new DexScreenerClient(mockHttpService);
  });

  it('should map DexScreener pairs to DexPair', async () => {
    nock('https://api.dexscreener.com')
      .get('/latest/dex/tokens/0xabc')
      .reply(200, { pairs: [/* fixture */] });

    const pairs = await client.fetchPairs(new ChainId('ethereum'), ContractAddress.fromEvm('0xabc'));
    expect(pairs).toHaveLength(/* ... */);
  });
});
```

### E2E (boot del core)

```typescript
describe('SpyDefi Core E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  it('should ingest → parse → enrich → score → publish a Telegram call', async () => {
    // Disparar evento de MessageIngested simulado
    // Esperar a que el pipeline termine
    // Verificar PublishedCall persistido
  });
});
```

## Test Pyramid del core

```
         ╱╲
        ╱ E2E ╲           Pipeline completo (pocos, lentos)
       ╱────────╲
      ╱  Adapter  ╲       Repos in-memory, clients HTTP (algunos)
     ╱──────────────╲
    ╱  Application  ╲    Use cases con puertos mockeados (varios)
   ╱──────────────────╲
  ╱     Domain         ╲  Tests puros (muchos, rápidos)
 ╱────────────────────────╲
```

## Convenciones de testing del core

- Tests del dominio **nunca** importan de `infrastructure/` ni `api/`.
- Tests de application usan `jest-mock-extended` (`mock<T>()`) para los puertos.
- Los tests de adapter de HTTP client usan `nock` o `msw` con fixtures JSON reales del provider.
- No se mockea el bus de eventos; en su lugar, en los tests de application, se inyecta un `EventPublisher` mock y se verifica con `publishAll`.
- Coverage objetivo: dominio 100%, application 90%+, adapters 60%+.
