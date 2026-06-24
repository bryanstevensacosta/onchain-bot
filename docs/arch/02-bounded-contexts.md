# Bounded Contexts

A **Bounded Context** (BC) is an explicit boundary where:
- A domain model is valid
- The language is consistent (Ubiquitous Language)
- No mixing with other system models

## Example BCs

| Context | Responsibility |
|---------|---------------|
| `Auth` | Users, roles, permissions |
| `Payments` | Transactions, invoices, balances |
| `Trading` | Orders, positions, PnL |
| `Notifications` | Email, push, SMS delivery |

## BC Rules

- Each BC has its **own model**
- Each BC has its **own database** (ideally)
- Each BC has its **own business rules**
- BCs **never share entities** directly
- BCs **do not import** each other's internals

## Ubiquitous Language

Within a BC, all communication (code, docs, meetings) uses the same language:

```
User BC:  User, Role, Permission, Session
Payment BC: Transaction, Invoice, Balance, PaymentMethod
Trading BC: Order, Position, Fill, PnL, Instrument
```
