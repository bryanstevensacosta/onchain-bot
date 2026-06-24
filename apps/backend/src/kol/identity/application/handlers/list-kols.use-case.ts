import { Injectable } from '@nestjs/common';
import {
  KolMapper,
  KolView,
} from 'kol/identity/application/mappers/kol.mapper';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';

/**
 * Use case: list all monitored KOLs.
 */
@Injectable()
export class ListKolsUseCase {
  constructor(private readonly kolRepo: KolRepository) {}

  public async execute(): Promise<ReadonlyArray<KolView>> {
    const kols = await this.kolRepo.findAll();
    return kols.map((k) => KolMapper.toView(k));
  }
}
