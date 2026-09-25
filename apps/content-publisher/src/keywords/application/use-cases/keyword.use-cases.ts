import { Injectable } from '@nestjs/common';
import { Keyword } from '../../domain/keyword.entity';
import { KeywordRepository } from '../ports/keyword.repository';
import type { MatchMode } from '../../domain/match-mode';

export interface KeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly templateId: string | null;
  readonly matchMode: MatchMode;
  readonly createdAt: string;
}

export function toKeywordView(keyword: Keyword): KeywordView {
  return {
    id: keyword.id,
    phrase: keyword.phrase,
    caseSensitive: keyword.caseSensitive,
    sourceChannelIds: keyword.sourceChannelIds,
    enabled: keyword.enabled,
    andGroupId: keyword.andGroupId,
    requireMedia: keyword.requireMedia,
    templateId: keyword.templateId,
    matchMode: keyword.matchMode,
    createdAt: keyword.createdAt.toISOString(),
  };
}

export interface CreateKeywordInput {
  readonly phrase: string;
  readonly caseSensitive?: boolean;
  readonly enabled?: boolean;
  readonly sourceChannelIds?: string[];
  readonly templateId?: string | null;
  readonly andGroupId?: string | null;
  readonly requireMedia?: boolean;
  readonly matchMode?: MatchMode;
}

export interface UpdateKeywordInput {
  readonly phrase?: string;
  readonly caseSensitive?: boolean;
  readonly enabled?: boolean;
  readonly sourceChannelIds?: string[];
  readonly templateId?: string | null;
  readonly andGroupId?: string | null;
  readonly requireMedia?: boolean;
  readonly matchMode?: MatchMode;
}

/**
 * CRUD use-cases for allowed keywords (single + patch + remove).
 * Duplicate validation lives in the controllers via PhraseRegistryService
 * (mirrors the backend wiring).
 */
@Injectable()
export class KeywordUseCases {
  public constructor(private readonly repo: KeywordRepository) {}

  public async create(input: CreateKeywordInput): Promise<Keyword> {
    const keyword = Keyword.create({
      phrase: input.phrase,
      caseSensitive: input.caseSensitive,
      enabled: input.enabled,
      sourceChannelIds: input.sourceChannelIds ?? [],
      templateId: input.templateId ?? null,
      andGroupId: input.andGroupId ?? null,
      requireMedia: input.requireMedia ?? false,
      matchMode: input.matchMode,
    });
    await this.repo.save(keyword);
    return keyword;
  }

  public async createCompoundGroup(
    phrases: ReadonlyArray<Omit<CreateKeywordInput, 'andGroupId'>>,
  ): Promise<Keyword[]> {
    const andGroupId = crypto.randomUUID();
    const created: Keyword[] = [];
    for (const item of phrases) {
      created.push(await this.create({ ...item, andGroupId }));
    }
    return created;
  }

  public async update(id: string, input: UpdateKeywordInput): Promise<Keyword> {
    const all = await this.repo.findAll();
    const existing = all.find((k) => k.id === id);
    if (!existing) {
      throw new Error(`Keyword ${id} not found`);
    }
    const updated = Keyword.reconstitute({
      id: existing.id,
      phrase:
        input.phrase !== undefined ? input.phrase.trim() : existing.phrase,
      caseSensitive: input.caseSensitive ?? existing.caseSensitive,
      sourceChannelIds: input.sourceChannelIds ?? existing.sourceChannelIds,
      templateId:
        input.templateId !== undefined ? input.templateId : existing.templateId,
      enabled: input.enabled ?? existing.enabled,
      andGroupId:
        input.andGroupId !== undefined ? input.andGroupId : existing.andGroupId,
      requireMedia: input.requireMedia ?? existing.requireMedia,
      matchMode: input.matchMode ?? existing.matchMode,
      createdAt: existing.createdAt,
    });
    await this.repo.save(updated);
    return updated;
  }

  public async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
