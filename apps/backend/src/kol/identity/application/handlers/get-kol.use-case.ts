import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import {
  KolMapper,
  KolView,
} from 'kol/identity/application/mappers/kol.mapper';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';

/**
 * Use case: fetch a KOL by id.
 */
@Injectable()
export class GetKolUseCase {
  constructor(private readonly kolRepo: KolRepository) {}

  public async execute(kolId: string): Promise<KolView> {
    const id = KolId.fromString(kolId);
    const kol = await this.kolRepo.findById(id);
    if (!kol) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Kol not found: ${kolId}`);
    }
    return KolMapper.toView(kol);
  }
}
