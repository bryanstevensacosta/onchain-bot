# Anti-Patterns & Common Mistakes

## Mezclar dominios en un solo BC

```typescript
// MAL: token/scoring conoce la implementación de channel-reputation
class CallScore {
  constructor(private readonly channelRepo: ChannelRepository) {}
  compute(): number { /* lee DB de canales */ }
}
```

**Solución**: `token/scoring` solo conoce el **puerto** `ChannelReputationPort`. La implementación vive en `token/channel-reputation/infrastructure/`.

## Anemic Domain Model

```typescript
// MAL: la entidad es solo data
class TokenCall {
  status: string;
  contractAddress: string;
  // sin comportamiento
}
```

**Solución**: la entidad enforce sus invariantes:

```typescript
class TokenCall {
  approve(score: CallScore): void {
    if (this.status !== CallStatus.SCORED) {
      throw new DomainError(ErrorCode.INVALID_STATE, 'Call must be SCORED before approve');
    }
    if (score.value < 0 || score.value > 100) {
      throw new DomainError(ErrorCode.VALIDATION, 'Score must be 0..100');
    }
    this.status = CallStatus.APPROVED;
  }
}
```

## ORM Entities como Domain Entities

```typescript
// MAL: dominio depende de TypeORM
@Entity()
class TokenCall {
  @PrimaryGeneratedColumn()
  id: string;
  @Column()
  status: string;
}
```

**Solución**: separar entidad de dominio (en `domain/`) de entidad ORM (en `infrastructure/`):

```typescript
// domain/entities/token-call.entity.ts — pure TS
export class TokenCall { /* invariantes + comportamiento */ }

// infrastructure/persistence/token-call.orm-entity.ts
@Entity()
export class TokenCallOrmEntity { /* mapping a DB */ }
```

> En el core v1 no hay ORM; los repos son in-memory. Esta regla se vuelve relevante al migrar a TypeORM/Prisma.

## Leak de infraestructura hacia application

```typescript
// MAL: el caso de uso llama DB directo
class EnrichTokenCallUseCase {
  async execute(cmd: EnrichTokenCallCommand) {
    await getConnection().getRepository(TokenCallOrmEntity).save({...});
  }
}
```

**Solución**: usar el puerto:

```typescript
class EnrichTokenCallUseCase {
  constructor(private readonly callRepo: TokenCallRepository) {}
  async execute(cmd: EnrichTokenCallCommand) {
    await this.callRepo.save(call);
  }
}
```

## Compartir entidades entre BCs

```typescript
// MAL: token/scoring importa la entidad de token/channel-reputation
import { ChannelReputation } from '../../channel-reputation/domain/entities/channel-reputation.entity';
```

**Solución**: usar el puerto o un DTO:

```typescript
// application/ports/channel-reputation.port.ts
export abstract class ChannelReputationPort {
  abstract getFor(channelId: ChannelId): Promise<ChannelReputationSnapshot>;
}
```

## Módulo gordo con todo

```
// MAL: estructura plana sin boundaries
src/
├── controllers/
├── services/
├── entities/
├── repositories/
```

**Solución**: agrupar por BC:

```
src/telegram/ingestion/...
src/token/intake/extraction/...
src/token/market-data/enrichment/...
```

## Saltarse el dominio por "velocidad"

```typescript
// MAL: update directo en DB salta las reglas del dominio
await callRepo.update(callId, { status: 'APPROVED' });
```

**Solución**: pasar siempre por el dominio:

```typescript
const call = await callRepo.findById(callId);
call.approve(score); // dominio valida
await callRepo.save(call);
```

## Acoplar BCs vía módulos NestJS

```typescript
// MAL: token/scoring importa el módulo de token/channel-reputation para usar su repo
@Module({
  imports: [ChannelReputationModule], // <- rompe el aislamiento
})
export class ScoringModule {}
```

**Solución**: el BC que expone (channel-reputation) registra su servicio/puerto en su propio `module.ts` y **NO** exporta el repo concreto. El BC consumidor (scoring) define su propio `ChannelReputationPort` y un adapter (in-memory en el core) lo implementa. Ver convención §8 de [`08-file-structure.md`](08-file-structure.md).

## Anti-Pattern Checklist

| Pattern | Problema | Solución |
|---|---|---|
| Shared DB tables | BCs acoplados en data layer | Per-BC in-memory repo (v1) / schema-per-BC (v2) |
| Global entities | Los cambios se propagan | Modelos privados por BC |
| Service usando `@Entity` | Dominio atado al ORM | Separar dominio de ORM |
| "Fat" service classes | Faltan boundaries de dominio | Extraer BCs |
| `any` cruzando BCs | Sin seguridad de contrato | DTOs y eventos fuertemente tipados |
| BC importando módulo de otro BC | Acoplamiento vía DI | Definir puerto y adapter in-memory |
| Update directo en DB | Saltarse invariantes | Pasar siempre por el agregado |
| Publicar evento antes de `commit()` | Eventos duplicados o sin atomicidad | `publishAll(aggregate.commitEvents())` después de `save()` |
