# Application Layer

Coordinates use cases. Contains **no business logic** — it orchestrates domain objects.

## What Lives Here

| Component | Purpose |
|-----------|---------|
| **Use Cases (Commands / Queries)** | Complete operations the system performs |
| **Command Handlers** | Execute commands (state-changing) |
| **Query Handlers** | Execute queries (read-only) |
| **Inbound Ports** | Interfaces that define what the application does |
| **DTOs** | Data transfer objects for input/output |
| **Mappers** | Convert domain ↔ DTO |

## Use Case Example

```typescript
// application/use-cases/create-order.use-case.ts
export class CreateOrderUseCase {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(dto: CreateOrderDto): Promise<void> {
    const items = dto.items.map(i => new OrderItem(i.productId, i.quantity));

    const order = Order.create(dto.userId, items);

    await this.orderRepo.save(order);

    this.eventBus.publish(new OrderCreatedEvent(order.id));
  }
}
```

## Command Pattern Example

```typescript
// application/commands/cancel-order.command.ts
export class CancelOrderCommand {
  constructor(public readonly orderId: string) {}
}

@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CancelOrderCommand): Promise<void> {
    const order = await this.orderRepo.findById(new OrderId(command.orderId));
    if (!order) throw new NotFoundException('Order not found');

    order.cancel(); // domain business logic

    await this.orderRepo.save(order);
    this.eventBus.publish(new OrderCancelledEvent(order.id));
  }
}
```

## Query Example

```typescript
// application/queries/get-order.query.ts
export class GetOrderQuery {
  constructor(public readonly orderId: string) {}
}

@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(query: GetOrderQuery): Promise<OrderDto> {
    const order = await this.orderRepo.findById(new OrderId(query.orderId));
    if (!order) throw new NotFoundException();
    return OrderMapper.toDto(order);
  }
}
```

## Rules

- ✔ Orchestrates domain objects
- ✔ Uses ports (interfaces), not concrete adapters
- ❌ NO business rules here (those belong in domain)
- ❌ NO direct database calls
- ❌ NO framework-specific logic
