# Testing Strategy

## Domain Layer (Pure Unit Tests)

No infrastructure needed. Fast, reliable tests.

```typescript
describe('Order', () => {
  it('should create an order with items', () => {
    const order = Order.create(userId, [validItem]);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.items).toHaveLength(1);
  });

  it('should not allow empty orders', () => {
    expect(() => Order.create(userId, [])).toThrow('Order must have items');
  });

  it('should cancel a pending order', () => {
    const order = Order.create(userId, [validItem]);
    order.cancel();
    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  it('should not cancel a shipped order', () => {
    const order = Order.create(userId, [validItem]);
    order.ship();
    expect(() => order.cancel()).toThrow('Cannot cancel shipped order');
  });
});
```

## Application Layer (Use Case Tests)

Test orchestrations with mocked ports.

```typescript
describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let mockRepo: MockProxy<OrderRepository>;

  beforeEach(() => {
    mockRepo = mock<OrderRepository>();
    useCase = new CreateOrderUseCase(mockRepo, eventBus);
  });

  it('should create and persist an order', async () => {
    const dto = new CreateOrderDto(userId.value, [itemDto]);
    await useCase.execute(dto);

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.PENDING }),
    );
  });
});
```

## Adapter Tests

### Repository (Integration Test)

```typescript
describe('TypeOrmOrderRepository', () => {
  let repo: TypeOrmOrderRepository;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ /* test DB config */ })],
      providers: [TypeOrmOrderRepository],
    }).compile();

    repo = module.get(TypeOrmOrderRepository);
  });

  it('should persist and retrieve an order', async () => {
    const order = Order.create(userId, [validItem]);
    await repo.save(order);

    const found = await repo.findById(order.id);
    expect(found?.status).toBe(OrderStatus.PENDING);
  });
});
```

### API (E2E Test)

```typescript
describe('POST /orders', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [OrderModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  it('should create an order', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .send({ userId: '123', items: [{ productId: '1', quantity: 2 }] })
      .expect(201);
    expect(res.body.status).toBe('created');
  });
});
```

## Test Pyramid by Layer

```
         ╱╲
        ╱ E2E ╲           API tests (few)
       ╱────────╲
      ╱  Adapter  ╲       Integration tests (some)
     ╱──────────────╲
    ╱  Application  ╲    Use case tests with mocks
   ╱──────────────────╲
  ╱     Domain         ╲  Pure unit tests (most)
 ╱────────────────────────╲
```
