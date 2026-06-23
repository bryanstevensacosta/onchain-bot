# Domain Layer

The **innermost** layer. Contains pure business logic with zero external dependencies.

## What Lives Here

| Component | Purpose | Imports |
|-----------|---------|---------|
| **Entities** | Objects with identity and lifecycle (e.g. `TokenCall`, `ChannelReputation`) | None |
| **Value Objects** | Immutable, equality-by-value objects (e.g. `ContractAddress`, `ChainId`, `CallScore`) | None |
| **Domain Events** | Record of something that happened (e.g. `MessageIngested`, `CallApproved`) | None |
| **Business Rules** | Validation, invariants, calculations | None |
| **Domain Services** | Operations not fitting in a single entity | Only domain types |
| **Repository Ports** | Interface for persistence (e.g. `TokenCallRepository`) | Only domain types |

## Entity Example (SpyDefi core: `TokenCall`)

```typescript
// domain/entities/token-call.entity.ts
export class TokenCall {
  private constructor(
    public readonly id: CallId,
    public readonly contractAddress: ContractAddress,
    public readonly chainId: ChainId,
    public readonly ticker: Ticker,
    public readonly sourceChannelId: ChannelId,
    public readonly sourceMessageId: MessageId,
    public status: CallStatus,
    public readonly createdAt: Date,
  ) {}

  static create(props: {
    id: CallId;
    contractAddress: ContractAddress;
    chainId: ChainId;
    ticker: Ticker;
    sourceChannelId: ChannelId;
    sourceMessageId: MessageId;
  }): TokenCall {
    if (!props.contractAddress.value) {
      throw new DomainError(ErrorCode.NO_CONTRACT_ADDRESS, 'TokenCall requires a CA');
    }
    return new TokenCall(
      props.id,
      props.contractAddress,
      props.chainId,
      props.ticker,
      props.sourceChannelId,
      props.sourceMessageId,
      CallStatus.RAW,
      new Date(),
    );
  }

  markEnriched(snapshot: TokenSnapshotRef): void {
    if (this.status === CallStatus.PUBLISHED) {
      throw new DomainError(ErrorCode.INVALID_STATE, 'Cannot enrich a published call');
    }
    this.status = CallStatus.ENRICHED;
  }

  approve(score: CallScore): void {
    if (this.status !== CallStatus.SCORED) {
      throw new DomainError(ErrorCode.INVALID_STATE, 'Call must be SCORED before approve');
    }
    if (score.value < 0 || score.value > 100) {
      throw new DomainError(ErrorCode.VALIDATION, 'Score must be 0..100');
    }
    this.status = CallStatus.APPROVED;
  }

  reject(reason: RejectionReason): void {
    this.status = CallStatus.REJECTED;
    this.rejectionReason = reason;
  }
}
```

## Value Object Example (SpyDefi core: `ContractAddress`)

```typescript
// domain/value-objects/contract-address.vo.ts
export class ContractAddress extends ValueObject<{ value: string; chainHint?: ChainId }> {
  private static readonly EVM_RE = /^0x[a-fA-F0-9]{40}$/;
  private static readonly SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  static fromEvm(value: string): ContractAddress {
    if (!ContractAddress.EVM_RE.test(value)) {
      throw new DomainError(ErrorCode.INVALID_ADDRESS, `Invalid EVM address: ${value}`);
    }
    return new ContractAddress({ value: value.toLowerCase(), chainHint: undefined });
  }

  static fromSolana(value: string): ContractAddress {
    if (!ContractAddress.SOLANA_RE.test(value)) {
      throw new DomainError(ErrorCode.INVALID_ADDRESS, `Invalid Solana address: ${value}`);
    }
    return new ContractAddress({ value, chainHint: undefined });
  }

  isEvm(): boolean {
    return ContractAddress.EVM_RE.test(this.props.value);
  }
}
```

## Repository Port Example

```typescript
// domain/ports/token-call.repository.port.ts
export abstract class TokenCallRepository {
  abstract save(call: TokenCall): Promise<void>;
  abstract findById(id: CallId): Promise<TokenCall | null>;
  abstract findByAddress(addr: ContractAddress, chainId: ChainId): Promise<TokenCall[]>;
  abstract findPendingEnrichment(limit: number): Promise<TokenCall[]>;
}
```

> En el core, los puertos son siempre `abstract class` (no `interface`) — esto está fijado en [`08-file-structure.md`](08-file-structure.md).

## Rules

- NO imports from outside the domain (ni `infrastructure/`, ni `api/`, ni NestJS, ni el cliente `telegram`).
- NO database calls.
- NO HTTP calls.
- NO framework decorators (`@Entity`, `@Injectable`, etc.).
- Pure TypeScript classes.
- All business invariants enforced here.
- Las excepciones son `DomainError(ErrorCode.X, message)` (centralizado en `shared/domain/domain-error.ts`).
