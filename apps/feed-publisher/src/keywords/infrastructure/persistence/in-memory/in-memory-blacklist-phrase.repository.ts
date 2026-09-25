import { Injectable } from '@nestjs/common';
import { BlacklistPhrase } from '../../../domain/blacklist-phrase.entity';
import { BlacklistPhraseRepository } from '../../../application/ports/blacklist-phrase.repository';

/**
 * In-memory `BlacklistPhraseRepository` — the LIVE binding until GAP-1.
 */
@Injectable()
export class InMemoryBlacklistPhraseRepository extends BlacklistPhraseRepository {
  private readonly store = new Map<string, BlacklistPhrase>();

  public async findAll(): Promise<ReadonlyArray<BlacklistPhrase>> {
    return [...this.store.values()];
  }

  public async findEnabled(): Promise<ReadonlyArray<BlacklistPhrase>> {
    return [...this.store.values()].filter((p) => p.enabled);
  }

  public async save(blacklistPhrase: BlacklistPhrase): Promise<void> {
    this.store.set(blacklistPhrase.id, blacklistPhrase);
  }

  public async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
