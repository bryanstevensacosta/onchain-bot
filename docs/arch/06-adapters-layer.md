# Adapters Layer

Concrete implementations of ports. This is where frameworks, databases, and external APIs live.

## Inbound Adapters

Drive the application. Receive external input and translate to use case calls.

### REST Controller

```typescript
// adapters/api/order.controller.ts
@Controller('orders')
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly getOrder: GetOrderHandler,
  ) {}

  @Post()
  async create(@Body() dto: CreateOrderDto) {
    await this.createOrder.execute(dto);
    return { status: 'created' };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const command = new CancelOrderCommand(id);
    await this.cancelOrder.execute(command);
    return { status: 'cancelled' };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const query = new GetOrderQuery(id);
    return this.getOrder.execute(query);
  }
}
```

### GraphQL Resolver

```typescript
// adapters/graphql/order.resolver.ts
@Resolver()
export class OrderResolver {
  constructor(private readonly getOrder: GetOrderHandler) {}

  @Query(() => OrderDto)
  async order(@Args('id') id: string) {
    return this.getOrder.execute(new GetOrderQuery(id));
  }
}
```

### Queue Consumer

```typescript
// adapters/consumers/payment-confirmed.consumer.ts
@Processor('payments')
export class PaymentConfirmedConsumer {
  constructor(private readonly confirmOrder: ConfirmOrderUseCase) {}

  @Process('payment.confirmed')
  async handle(job: Job<{ orderId: string }>) {
    await this.confirmOrder.execute(new ConfirmOrderCommand(job.data.orderId));
  }
}
```

## Outbound Adapters

Implement the ports required by the application/domain.

### Database Repository

```typescript
// adapters/repositories/typeorm-order.repository.ts
export class TypeOrmOrderRepository implements OrderRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
  ) {}

  async save(order: Order): Promise<void> {
    const entity = OrderMapper.toPersistence(order);
    await this.repo.save(entity);
  }

  async findById(id: OrderId): Promise<Order | null> {
    const entity = await this.repo.findOneBy({ id: id.value });
    return entity ? OrderMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: UserId): Promise<Order[]> {
    const entities = await this.repo.findBy({ userId: userId.value });
    return entities.map(e => OrderMapper.toDomain(e));
  }
}
```

### HTTP Client Adapter

```typescript
// adapters/clients/payment-api.client.ts
export class PaymentApiClient implements PaymentGateway {
  constructor(private readonly http: HttpService) {}

  async charge(amount: Money, token: string): Promise<PaymentResult> {
    const { data } = await firstValueFrom(
      this.http.post('https://payments.example.com/charge', {
        amount: amount.amount,
        currency: amount.currency,
        token,
      }),
    );
    return data;
  }
}
```

### Mappers

```typescript
// adapters/mappers/order.mapper.ts
export class OrderMapper {
  static toDomain(entity: OrderEntity): Order {
    return Order.create(
      new OrderId(entity.id),
      entity.items.map(i => new OrderItem(i.productId, i.quantity)),
    );
  }

  static toPersistence(order: Order): OrderEntity {
    const entity = new OrderEntity();
    entity.id = order.id.value;
    entity.items = order.items.map(i => ({ productId: i.productId, quantity: i.quantity }));
    return entity;
  }

  static toDto(order: Order): OrderDto {
    return {
      id: order.id.value,
      items: order.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      status: order.status,
    };
  }
}
```

## Module Wiring

```typescript
// adapters/modules/order.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity]), CqrsModule],
  controllers: [OrderController],
  providers: [
    CreateOrderUseCase,
    CancelOrderUseCase,
    GetOrderHandler,
    { provide: OrderRepository, useClass: TypeOrmOrderRepository },
  ],
})
export class OrderModule {}
```
