import { Injectable } from '@nestjs/common';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';

/**
 * ListActiveKolIdsUseCase - Returns only the kolId values of active KOLs
 *
 * Used by ingestion-service to fetch the list of KOL channels to subscribe to.
 * Returns only the IDs (not full aggregates) for lightweight transport.
 */
@Injectable()
export class ListActiveKolIdsUseCase {
  constructor(private readonly kolRepo: KolRepository) {}

  public async execute(): Promise<ReadonlyArray<string>> {
    const activeKols = await this.kolRepo.findActive();
    return activeKols.map((kol) => kol.kolId.value);
  }
}
