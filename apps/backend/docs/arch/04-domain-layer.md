# Domain Layer

The **innermost** layer. Contains pure business logic with zero external dependencies.

## What Lives Here

| Component | Purpose | Imports |
|-----------|---------|---------|
| **Entities** | Objects with identity and lifecycle | None |
| **Value Objects** | Immutable, equality-by-value objects | None |
| **Domain Events** | Record of something that happened | None |
| **Business Rules** | Validation, invariants, calculations | None |
| **Domain Services** | Operations not fitting in a single entity | Only domain types |
| **Repository Ports** | Interface for persistence | Only domain types |

## Entity Example

```typescript
// domain/entities/order.entity.ts
export class Order {
  private constructor(
    public readonly id: OrderId,
    public readonly userId: UserId,
    public status: OrderStatus,
    public items: OrderItem[],
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  static create(userId: UserId, items: OrderItem[]): Order {
    if (items.length === 0) throw new Error('Order must have items');
    return new Order(
      new OrderId(uuid()),
      userId,
      OrderStatus.PENDING,
      items,
      new Date(),
      new Date(),
    );
  }

  cancel(): void {
    if (this.status === OrderStatus.SHIPPED) {
      throw new Error('Cannot cancel shipped order');
    }
    this.status = OrderStatus.CANCELLED;
    this.updatedAt = new Date();
  }
}
```

## Value Object Example

```typescript
// domain/value-objects/money.vo.ts
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {
    if (amount < 0) throw new Error('Amount cannot be negative');
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) throw new Error('Currency mismatch');
    return new Money(this.amount + other.amount, this.currency);
  }
}
```

## Repository Port Example

```typescript
// domain/ports/order.repository.port.ts
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  findByUserId(userId: UserId): Promise<Order[]>;
}
```

## Rules

- ❌ NO imports from outside the domain
- ❌ NO database calls
- ❌ NO HTTP calls
- ❌ NO framework decorators (`@Entity`, `@Column`, etc.)
- ✔ Pure TypeScript classes
- ✔ All business invariants enforced here
