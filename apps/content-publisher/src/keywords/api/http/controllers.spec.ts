import { Test } from '@nestjs/testing';
import { KeywordsController } from './keywords.controller';
import { BlacklistController } from './blacklist.controller';
import { KeywordRepository } from '../../application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '../../application/ports/blacklist-phrase.repository';
import { PhraseRegistryService } from '../../application/services/phrase-registry.service';
import { KeywordUseCases } from '../../application/use-cases/keyword.use-cases';
import { BlacklistPhraseUseCases } from '../../application/use-cases/blacklist-phrase.use-cases';
import { Keyword } from '../../domain/keyword.entity';

describe('KeywordsController + BlacklistController', () => {
  async function build() {
    const store = new Map<string, Keyword>();
    const keywordRepo: KeywordRepository = {
      findAll: jest.fn(async () => [...store.values()]),
      findEnabled: jest.fn(async () =>
        [...store.values()].filter((k) => k.enabled),
      ),
      save: jest.fn(async (kw: Keyword) => {
        store.set(kw.id, kw);
      }),
      delete: jest.fn(async (id: string) => {
        store.delete(id);
      }),
    };
    const blacklistRepo: BlacklistPhraseRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [KeywordsController, BlacklistController],
      providers: [
        { provide: KeywordRepository, useValue: keywordRepo },
        { provide: BlacklistPhraseRepository, useValue: blacklistRepo },
        PhraseRegistryService,
        KeywordUseCases,
        BlacklistPhraseUseCases,
      ],
    }).compile();
    return {
      module,
      keywords: module.get(KeywordsController),
      blacklist: module.get(BlacklistController),
    };
  }

  it('creates, lists, updates and deletes a keyword', async () => {
    const { keywords, module } = await build();
    const created = await keywords.create({ phrase: 'ETF' });
    expect(created.phrase).toBe('ETF');
    expect(await keywords.list()).toHaveLength(1);
    const updated = await keywords.update(created.id, { enabled: false });
    expect(updated.enabled).toBe(false);
    await keywords.remove(created.id);
    expect(await keywords.list()).toHaveLength(0);
    await module.close();
  });

  it('creates an AND-group batch sharing one group id', async () => {
    const { keywords, module } = await build();
    const batch = await keywords.createBatch({
      phrases: [{ phrase: 'etf' }, { phrase: 'inflow' }],
    });
    expect(batch).toHaveLength(2);
    expect(batch[0].andGroupId).not.toBeNull();
    expect(batch[0].andGroupId).toBe(batch[1].andGroupId);
    await module.close();
  });

  it('rejects duplicate phrases with 409', async () => {
    const { keywords, module } = await build();
    await keywords.create({ phrase: 'ETF' });
    await expect(keywords.create({ phrase: 'etf' })).rejects.toMatchObject({
      status: 409,
    });
    await module.close();
  });

  it('blacklist controller starts empty', async () => {
    const { blacklist, module } = await build();
    await expect(blacklist.list()).resolves.toEqual([]);
    await module.close();
  });
});
