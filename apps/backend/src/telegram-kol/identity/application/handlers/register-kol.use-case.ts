import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Kol } from 'telegram-kol/identity/domain/entities/kol.entity';
import { KolId } from 'telegram-kol/identity/domain/value-objects/kol-id.vo';
import { KolHandle } from 'telegram-kol/identity/domain/value-objects/kol-handle.vo';
import type { RegisterKolInput } from 'telegram-kol/identity/api/input/register-kol.input';
import {
  KolMapper,
  KolView,
} from 'telegram-kol/identity/application/mappers/kol.mapper';
import { KolRepository } from 'telegram-kol/identity/application/ports/kol.repository';
import { KolEventPublisher } from 'telegram-kol/ingestion/application/ports/kol-event.publisher';

/**
 * Use case: register a new Telegram KOL for ingestion.
 *
 * Publishes domain events via `KolEventPublisher` (owned by `telegram-kol/ingestion/`).
 */
@Injectable()
export class RegisterKolUseCase {
  constructor(
    private readonly kolRepo: KolRepository,
    private readonly eventPublisher: KolEventPublisher,
  ) {}

  public async execute(input: RegisterKolInput): Promise<KolView> {
    const id = KolId.fromString(input.kolId);
    const handle = input.handle ? KolHandle.fromString(input.handle) : null;

    const existing = await this.kolRepo.findById(id);
    if (existing) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Kol already registered: ${input.kolId}`,
      );
    }

    const kol = Kol.create({ id, handle, title: input.title });
    await this.kolRepo.save(kol);
    await this.eventPublisher.publishAll(kol.commit());
    return KolMapper.toView(kol);
  }
}
