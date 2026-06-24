import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import {
  KolMapper,
  KolView,
} from 'kol/identity/application/mappers/kol.mapper';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';

export type KolLifecycleTransition = 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';

export interface SetKolLifecycleInput {
  readonly kolId: string;
  readonly status: KolLifecycleTransition;
}

/**
 * Use case: change a KOL's lifecycle status.
 *
 * - `ACTIVE`: ingestion is allowed.
 * - `DORMANT`: registered but ingestion is paused.
 * - `BLACKLISTED`: hard-skipped; the seeder / listener will not re-attach.
 *
 * The repository owns the persistence; this use case enforces the
 * transition rules and emits the resulting view.
 */
@Injectable()
export class SetKolLifecycleUseCase {
  constructor(private readonly kolRepo: KolRepository) {}

  public async execute(input: SetKolLifecycleInput): Promise<KolView> {
    const id = KolId.fromString(input.kolId);
    const kol = await this.kolRepo.findById(id);
    if (!kol) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Kol not found: ${input.kolId}`,
      );
    }
    this.applyTransition(kol, input.status);
    await this.kolRepo.save(kol);
    return KolMapper.toView(kol);
  }

  private applyTransition(kol: Kol, status: KolLifecycleTransition): void {
    switch (status) {
      case 'ACTIVE':
        kol.activate();
        break;
      case 'DORMANT':
        kol.dormant();
        break;
      case 'BLACKLISTED':
        kol.blacklist();
        break;
    }
  }
}
