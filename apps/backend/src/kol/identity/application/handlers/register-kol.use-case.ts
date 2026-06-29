import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolHandle } from 'kol/identity/domain/value-objects/kol-handle.vo';
import type { RegisterKolInput } from 'kol/identity/api/input/register-kol.input';
import {
  KolMapper,
  KolView,
} from 'kol/identity/application/mappers/kol.mapper';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher';

/**
 * Use case: register a new Telegram KOL for ingestion.
 *
 * Publishes domain events via `KolEventPublisher` (owned by `kol/identity/`).
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
    const title = input.title?.trim() || input.kolId;

    const existing = await this.kolRepo.findById(id);
    if (existing) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Kol already registered: ${input.kolId}`,
      );
    }

    const kol = Kol.create({ id, handle, title });
    await this.kolRepo.save(kol);
    await this.eventPublisher.publishAll(kol.commit());
    return KolMapper.toView(kol);
  }
}
