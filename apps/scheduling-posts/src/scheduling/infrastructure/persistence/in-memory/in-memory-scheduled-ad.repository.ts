import { Injectable } from '@nestjs/common';
import { ScheduledAd } from '../../../domain/scheduled-ad.entity';
import { ScheduledAdRepository } from '../../../domain/ports/scheduled-ad.repository';

/**
 * In-memory `ScheduledAdRepository` — the LIVE binding until GAP-1.
 *
 * `findAll` returns catalog order (ascending `order`); `save` enforces
 * the unique-`name` invariant with a PG-shaped `{ code: '23505' }`
 * error so controllers map duplicates to 409 without a database.
 */
@Injectable()
export class InMemoryScheduledAdRepository extends ScheduledAdRepository {
  private readonly rows = new Map<string, ScheduledAd>();

  public async findAll(): Promise<ReadonlyArray<ScheduledAd>> {
    return [...this.rows.values()].sort((a, b) => a.order - b.order);
  }

  public async findAllActive(now: Date): Promise<ReadonlyArray<ScheduledAd>> {
    return (await this.findAll()).filter(
      (ad) => ad.enabled && !ad.isExpired(now),
    );
  }

  public async findExpired(now: Date): Promise<ReadonlyArray<ScheduledAd>> {
    return [...this.rows.values()].filter((ad) => ad.isExpired(now));
  }

  public async findById(id: string): Promise<ScheduledAd | null> {
    return this.rows.get(id) ?? null;
  }

  public async save(ad: ScheduledAd): Promise<ScheduledAd> {
    for (const existing of this.rows.values()) {
      if (existing.id !== ad.id && existing.name === ad.name) {
        throw Object.assign(new Error(`duplicate name: ${ad.name}`), {
          code: '23505',
        });
      }
    }
    this.rows.set(ad.id, ad);
    return ad;
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  public async incrementFailures(id: string): Promise<void> {
    const ad = this.rows.get(id);
    if (ad) {
      this.rows.set(id, ad.incrementFailure());
    }
  }

  public async disable(id: string): Promise<void> {
    const ad = this.rows.get(id);
    if (ad) {
      this.rows.set(id, ad.disable());
    }
  }

  public async markPublished(
    id: string,
    _messageId: string,
    at: Date,
  ): Promise<void> {
    const ad = this.rows.get(id);
    if (ad) {
      this.rows.set(id, ad.markPublished(at));
    }
  }
}
