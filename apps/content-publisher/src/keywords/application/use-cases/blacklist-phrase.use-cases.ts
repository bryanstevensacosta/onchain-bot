import { Injectable } from '@nestjs/common';
import { BlacklistPhrase } from '../../domain/blacklist-phrase.entity';
import { BlacklistPhraseRepository } from '../ports/blacklist-phrase.repository';
import type { MatchMode } from '../../domain/match-mode';

export interface BlacklistPhraseView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly matchMode: MatchMode;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly createdAt: string;
}

export function toBlacklistPhraseView(
  phrase: BlacklistPhrase,
): BlacklistPhraseView {
  return {
    id: phrase.id,
    phrase: phrase.phrase,
    caseSensitive: phrase.caseSensitive,
    matchMode: phrase.matchMode,
    sourceChannelIds: phrase.sourceChannelIds,
    enabled: phrase.enabled,
    andGroupId: phrase.andGroupId,
    requireMedia: phrase.requireMedia,
    createdAt: phrase.createdAt.toISOString(),
  };
}

export interface CreateBlacklistPhraseInput {
  readonly phrase: string;
  readonly caseSensitive?: boolean;
  readonly matchMode?: MatchMode;
  readonly enabled?: boolean;
  readonly sourceChannelIds?: string[];
  readonly andGroupId?: string | null;
  readonly requireMedia?: boolean;
}

export interface UpdateBlacklistPhraseInput {
  readonly phrase?: string;
  readonly caseSensitive?: boolean;
  readonly matchMode?: MatchMode;
  readonly enabled?: boolean;
  readonly sourceChannelIds?: string[];
  readonly andGroupId?: string | null;
  readonly requireMedia?: boolean;
}

/**
 * CRUD use-cases for blacklist phrases (single + patch + remove).
 */
@Injectable()
export class BlacklistPhraseUseCases {
  public constructor(private readonly repo: BlacklistPhraseRepository) {}

  public async create(
    input: CreateBlacklistPhraseInput,
  ): Promise<BlacklistPhrase> {
    const phrase = BlacklistPhrase.create({
      phrase: input.phrase,
      caseSensitive: input.caseSensitive,
      matchMode: input.matchMode ?? 'exact',
      enabled: input.enabled,
      sourceChannelIds: input.sourceChannelIds ?? [],
      andGroupId: input.andGroupId ?? null,
      requireMedia: input.requireMedia ?? false,
    });
    await this.repo.save(phrase);
    return phrase;
  }

  public async createCompoundGroup(
    phrases: ReadonlyArray<Omit<CreateBlacklistPhraseInput, 'andGroupId'>>,
  ): Promise<BlacklistPhrase[]> {
    const andGroupId = crypto.randomUUID();
    const created: BlacklistPhrase[] = [];
    for (const item of phrases) {
      created.push(await this.create({ ...item, andGroupId }));
    }
    return created;
  }

  public async update(
    id: string,
    input: UpdateBlacklistPhraseInput,
  ): Promise<BlacklistPhrase> {
    const all = await this.repo.findAll();
    const existing = all.find((p) => p.id === id);
    if (!existing) {
      throw new Error(`Blacklist phrase ${id} not found`);
    }
    const updated = BlacklistPhrase.reconstitute({
      id: existing.id,
      phrase:
        input.phrase !== undefined ? input.phrase.trim() : existing.phrase,
      caseSensitive: input.caseSensitive ?? existing.caseSensitive,
      matchMode: input.matchMode ?? existing.matchMode,
      sourceChannelIds: input.sourceChannelIds ?? existing.sourceChannelIds,
      enabled: input.enabled ?? existing.enabled,
      andGroupId:
        input.andGroupId !== undefined ? input.andGroupId : existing.andGroupId,
      requireMedia: input.requireMedia ?? existing.requireMedia,
      createdAt: existing.createdAt,
    });
    await this.repo.save(updated);
    return updated;
  }

  public async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
