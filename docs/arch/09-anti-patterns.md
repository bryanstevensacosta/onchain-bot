# Anti-Patterns & Common Mistakes

## ❌ Mixing Domains in One Context

```typescript
// BAD: User context knows about payments
class User {
  payments: Payment[];
  calculateBalance(): Money { ... }
}
```

**Solution**: Separate into User BC and Payment BC. Communicate via events.

## ❌ Anemic Domain Model

```typescript
// BAD: Entity is just a data bag
class Order {
  status: string;
  items: OrderItem[];

  // No behavior — logic lives in services
}
```

**Solution**: Entities enforce their own invariants:

```typescript
class Order {
  cancel(): void {
    if (this.status === 'shipped') throw new Error('Cannot cancel');
    this.status = 'cancelled';
  }
}
```

## ❌ ORM Entitites as Domain Entities

```typescript
// BAD: Domain depends on TypeORM
@Entity()
class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  status: string;
}
```

**Solution**: Separate ORM entities (in adapters) from domain entities:

```typescript
// domain/order.entity.ts — pure TS
export class Order { ... }

// infrastructure/order.entity.ts — ORM decorators
@Entity()
export class OrderEntity { ... }
```

## ❌ Leaking Infrastructure into Application

```typescript
// BAD: Use case calls DB directly
class CreateOrderUseCase {
  async execute(dto: CreateOrderDto) {
    await getConnection().getRepository(OrderEntity).save(dto); // direct DB
  }
}
```

**Solution**: Use repository interfaces (ports):

```typescript
class CreateOrderUseCase {
  constructor(private readonly repo: OrderRepository) {}
  async execute(dto: CreateOrderDto) {
    await this.repo.save(order);
  }
}
```

## ❌ Sharing Entities Between Contexts

```typescript
// BAD: Payment imports User entity
import { User } from '../../user/domain/entities/user.entity';
```

**Solution**: Use events or DTOs:

```typescript
interface PaymentDto {
  userId: string;
  amount: number;
}
```

## ❌ Fat Module with Everything

```
// BAD: Flat structure with no boundaries
src/
├── controllers/
├── services/
├── entities/
├── repositories/
```

**Solution**: Group by bounded context:

```
src/user/domain/...
src/payment/domain/...
```

## ❌ Bypassing Domain for "Speed"

```typescript
// BAD: Direct DB update skips domain rules
await orderRepo.update(orderId, { status: 'cancelled' });
```

**Solution**: Always go through domain:

```typescript
const order = await orderRepo.findById(orderId);
order.cancel(); // domain validates
await orderRepo.save(order);
```

## Anti-Pattern Checklist

| Pattern | Problem | Solution |
|---------|---------|----------|
| Shared DB tables | BCs coupled at data layer | Per-BC databases or schemas |
| Global entities | Changes ripple across system | Private per-BC models |
| Service using @Entity | Domain tied to ORM | Separate domain/ORM entities |
| "Fat" service classes | Missing domain boundaries | Extract bounded contexts |
| `any` types crossing BCs | No contract safety | Strongly typed events/DTOs |
