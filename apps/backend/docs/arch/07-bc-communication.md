# Communication Between Bounded Contexts

## ❌ Anti-patterns

- Sharing database tables between contexts
- Importing entities from another context
- Direct class coupling

## ✅ Correct approaches

### 1. Domain Events

```typescript
// Order Context publishes
export class OrderCreatedEvent {
  constructor(public readonly orderId: string, public readonly userId: string, public readonly total: Money) {}
}

// Payment Context subscribes
@EventsHandler(OrderCreatedEvent)
export class CreatePaymentHandler implements IEventHandler<OrderCreatedEvent> {
  constructor(private readonly createPayment: CreatePaymentUseCase) {}

  async handle(event: OrderCreatedEvent) {
    await this.createPayment.execute(new CreatePaymentCommand(event.orderId, event.total));
  }
}
```

### 2. Internal API (REST/gRPC)

```typescript
// Payment Context exposes an API
@Controller('payments')
export class PaymentController {
  @Get(':orderId')
  async getByOrderId(@Param('orderId') orderId: string) {
    return this.getPaymentByOrder.execute(new GetPaymentByOrderQuery(orderId));
  }
}
```

### 3. Message Broker (Kafka/RabbitMQ)

```typescript
// Producer
@Injectable()
export class EventPublisher {
  constructor(private readonly eventBus: EventBus) {}

  publish(event: DomainEvent): void {
    this.eventBus.publish(event); // published to Kafka via adapter
  }
}

// Consumer (in another BC)
@Processor('order-events')
export class OrderEventConsumer {
  @Process('order.created')
  async handle(data: { orderId: string; total: number }) {
    // Payment BC receives the event
  }
}
```

## Context Mapping

| Relationship | Description |
|-------------|-------------|
| **Partnership** | Two contexts collaborate on a shared goal |
| **Shared Kernel** | A small, shared subset of the domain model |
| **Customer-Supplier** | One context supplies data another consumes |
| **Conformist** | One context conforms to another's model |
| **Anticorruption Layer** | A translation layer between contexts |
| **Open Host Service** | A well-defined protocol/API |
| **Published Language** | Formal shared language (e.g., events) |

## DTOs for Cross-Context Communication

```typescript
// Shared DTO (not domain entity!)
export interface OrderDto {
  readonly orderId: string;
  readonly userId: string;
  readonly total: number;
  readonly currency: string;
  readonly status: string;
}
```
