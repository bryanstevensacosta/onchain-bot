import { Injectable } from '@nestjs/common';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';

/**
 * In-memory implementation of KolRepository.
 *
 * Replace with TypeORM / Prisma adapter when persistence is added.
 * Lives in infrastructure so the application layer stays pure.
 */
@Injectable()
export class InMemoryKolRepository extends KolRepository {
  private readonly store = new Map<string, Kol>();

  public async save(kol: Kol): Promise<void> {
    this.store.set(kol.kolId.value, kol);
  }

  public async findById(id: KolId): Promise<Kol | null> {
    return this.store.get(id.value) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<Kol>> {
    return Array.from(this.store.values());
  }

  public async delete(id: KolId): Promise<void> {
    this.store.delete(id.value);
  }

  public async updateTitle(id: KolId, newTitle: string): Promise<boolean> {
    const kol = this.store.get(id.value);
    if (!kol) {
      return false;
    }
    kol.updateTitle(newTitle);
    return true;
  }
}
