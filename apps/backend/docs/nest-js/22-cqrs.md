# CQRS (@nestjs/cqrs)

CQRS (Command and Query Responsibility Segregation) separates read and write operations into separate models. Nest provides a lightweight CQRS module.

## Installation

```bash
npm install --save @nestjs/cqrs
```

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [CqrsModule.forRoot()],
})
export class AppModule {}
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `commandPublisher` | Publisher for dispatching commands | `DefaultCommandPubSub` |
| `eventPublisher` | Publisher for events | `DefaultPubSub` |
| `queryPublisher` | Publisher for queries | `DefaultQueryPubSub` |
| `unhandledExceptionPublisher` | Publisher for unhandled exceptions | `DefaultUnhandledExceptionPubSub` |
| `eventIdProvider` | Service for unique event IDs | `DefaultEventIdProvider` |
| `rethrowUnhandled` | Rethrow unhandled exceptions | `false` |

## Architecture

```
Controller → CommandBus  → CommandHandler → Aggregate → EventBus → EventHandler
                                      ↘          ↙
                                    Repository
                                        
QueryBus → QueryHandler → Read Model
```

## Commands

Commands change application state. They are task-based.

### Command Class

```typescript
import { Command } from '@nestjs/cqrs';

export class KillDragonCommand extends Command<{ actionId: string }> {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {
    super();
  }
}
```

> `Command<T>` defines the return type. Optional — use `Command` without generic if no return type needed.

### Dispatching Commands

```typescript
import { CommandBus } from '@nestjs/cqrs';

@Injectable()
export class HeroesGameService {
  constructor(private commandBus: CommandBus) {}

  async killDragon(heroId: string, dragonId: string) {
    return this.commandBus.execute(
      new KillDragonCommand(heroId, dragonId),
    ); // → Promise<{ actionId: string }>
  }
}
```

### Command Handler

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(private repository: HeroesRepository) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.repository.findOneById(+heroId);
    hero.killEnemy(dragonId);
    await this.repository.persist(hero);

    return { actionId: crypto.randomUUID() };
  }
}
```

Register handlers as providers:

```typescript
@Module({
  providers: [KillDragonHandler],
})
export class HeroesModule {}
```

## Queries

Queries retrieve data. They are data-centric.

### Query Class

```typescript
import { Query } from '@nestjs/cqrs';

export class GetHeroQuery extends Query<Hero> {
  constructor(public readonly heroId: string) {
    super();
  }
}
```

### Dispatching Queries

```typescript
const hero = await this.queryBus.execute(new GetHeroQuery(heroId));
// "hero" type is auto-inferred as "Hero"
```

### Query Handler

```typescript
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

@QueryHandler(GetHeroQuery)
export class GetHeroHandler implements IQueryHandler<GetHeroQuery> {
  constructor(private repository: HeroesRepository) {}

  async execute(query: GetHeroQuery): Promise<Hero> {
    return this.repository.findOneById(query.heroId);
  }
}
```

## Events

Events notify other parts of the application about state changes.

### Event Class

```typescript
export class HeroKilledDragonEvent {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {}
}
```

### Event Handler

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

@EventsHandler(HeroKilledDragonEvent)
export class HeroKilledDragonHandler implements IEventHandler<HeroKilledDragonEvent> {
  constructor(private repository: HeroesRepository) {}

  handle(event: HeroKilledDragonEvent) {
    // Business logic (e.g., update read model)
  }
}
```

### Publishing Events

From a service:

```typescript
this.eventBus.publish(new HeroKilledDragonEvent(heroId, dragonId));
```

> ⚠️ Event handler errors **cannot** be caught by Exception filters. Handle them manually via try/catch or compensate with Sagas.

## Aggregate Roots

Aggregate roots manage domain events. Extend `AggregateRoot`:

```typescript
import { AggregateRoot } from '@nestjs/cqrs';

export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
  }

  killEnemy(enemyId: string) {
    // Business logic
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}
```

Merge with EventPublisher in the handler:

```typescript
import { EventPublisher } from '@nestjs/cqrs';

@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(
    private repository: HeroesRepository,
    private publisher: EventPublisher,
  ) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.publisher.mergeObjectContext(
      await this.repository.findOneById(+heroId),
    );
    hero.killEnemy(dragonId);
    hero.commit(); // dispatches all pending events
  }
}
```

### Auto-commit

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
    this.autoCommit = true; // events dispatch automatically
  }
}
```

### Merge class context (for new instances)

```typescript
const HeroModel = this.publisher.mergeClassContext(Hero);
const hero = new HeroModel('id'); // auto-publishes events
```

### Flexible Aggregate Roots

Three approaches:

**1. Class Inheritance** (extend directly)

```typescript
export class Hero extends AggregateRoot {
  killEnemy(enemyId: string) {
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}
```

**2. Mixin** (for existing hierarchies)

```typescript
import { WithAggregateRoot } from '@nestjs/cqrs';

abstract class Monster {
  constructor(protected readonly id: string) {}
  abstract roar(): void;
}

export class Dragon extends WithAggregateRoot(Monster) {
  roar(): void { console.log('Roarrrr!'); }
  die(): void {
    this.roar();
    this.apply(new DragonDiedEvent(this.id));
  }
}
```

**3. Custom implementation** (framework-agnostic)

```typescript
import { IAggregateRoot, IEvent } from '@nestjs/cqrs';

export class CustomEntity implements IAggregateRoot {
  private events: IEvent[] = [];

  getUncommittedEvents() { return this.events; }
  commit() { /* custom logic */ }
  uncommit() { /* custom logic */ }
  apply(event: IEvent) { this.events.push(event); }
  loadFromHistory(history: IEvent[]) { /* rebuild from events */ }
}
```

## Sagas

Sagas listen to events and trigger new commands (long-running workflows).

```typescript
import { Injectable } from '@nestjs/common';
import { ICommand, ofType, Saga } from '@nestjs/cqrs';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class HeroesGameSagas {
  @Saga()
  dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(HeroKilledDragonEvent),
      map((event) => new DropAncientItemCommand(event.heroId, fakeItemID)),
    );
  }
}
```

`ofType` filters the event stream. The returned command is auto-dispatched by `CommandBus`.

## Unhandled Exceptions

Subscribe to unhandled exceptions from event handlers:

```typescript
import { UnhandledExceptionBus } from '@nestjs/cqrs';
import { Subject, takeUntil } from 'rxjs';

@Injectable()
export class ExceptionService implements OnModuleDestroy {
  private destroy$ = new Subject<void>();

  constructor(private unhandledExceptionsBus: UnhandledExceptionBus) {
    this.unhandledExceptionsBus
      .pipe(takeUntil(this.destroy$))
      .subscribe((exceptionInfo) => {
        // Send to external service, terminate, or publish compensating event
      });
  }

  onModuleDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

Filter by exception type:

```typescript
this.unhandledExceptionsBus.pipe(
  UnhandledExceptionBus.ofType(TransactionNotAllowedException),
).subscribe((info) => { /* ... */ });
```

## Subscribe to All Events

`CommandBus`, `QueryBus`, and `EventBus` are Observables:

```typescript
constructor(private eventBus: EventBus) {
  this.eventBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((event) => {
      // Save to event store, log, etc.
    });
}
```

## Request-Scoped Handlers

Make handlers request-scoped for per-request caching, tracking, or multi-tenancy:

```typescript
import { AsyncContext, CommandHandler } from '@nestjs/cqrs';

// Define request context
export class MyRequest extends AsyncContext {
  constructor(public readonly user: User) { super(); }
}

// Pass context when executing
const myRequest = new MyRequest(user);
await this.commandBus.execute(
  new KillDragonCommand(heroId, dragonId),
  myRequest,
);

// Handle with scope
@CommandHandler(KillDragonCommand, { scope: Scope.REQUEST })
export class KillDragonHandler {
  constructor(@Inject(REQUEST) private request: MyRequest) {}
  async execute(command: KillDragonCommand) { /* ... */ }
}
```

Sagas are always singleton, but can access request context via event:

```typescript
@Saga()
dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
  return events$.pipe(
    ofType(HeroKilledDragonEvent),
    map((event) => {
      const request = AsyncContext.of(event);
      const command = new DropAncientItemCommand(event.heroId, fakeItemID);
      AsyncContext.merge(request, command);
      return command;
    }),
  );
}
```

## Full Module Structure

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { KillDragonHandler } from './commands/kill-dragon.handler';
import { GetHeroHandler } from './queries/get-hero.handler';
import { HeroKilledDragonHandler } from './events/hero-killed-dragon.handler';
import { HeroesGameSagas } from './sagas/heroes-game.saga';
import { HeroesRepository } from './repository/heroes.repository';

@Module({
  imports: [CqrsModule.forRoot()],
  providers: [
    // Command Handlers
    KillDragonHandler,
    // Query Handlers
    GetHeroHandler,
    // Event Handlers
    HeroKilledDragonHandler,
    // Sagas
    HeroesGameSagas,
    // Repositories
    HeroesRepository,
  ],
})
export class HeroesModule {}
```
