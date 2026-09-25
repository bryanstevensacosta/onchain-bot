import { PhraseRegistryService } from './phrase-registry.service';
import { KeywordRepository } from '../ports/keyword.repository';
import { BlacklistPhraseRepository } from '../ports/blacklist-phrase.repository';
import { Keyword } from '../../domain/keyword.entity';
import { BlacklistPhrase } from '../../domain/blacklist-phrase.entity';
import { ConflictException } from '@nestjs/common';

describe('PhraseRegistryService', () => {
  function build(kws: Keyword[], bls: BlacklistPhrase[]) {
    const keywordRepo: KeywordRepository = {
      findAll: jest.fn().mockResolvedValue(kws),
      findEnabled: jest.fn().mockResolvedValue(kws),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const blacklistRepo: BlacklistPhraseRepository = {
      findAll: jest.fn().mockResolvedValue(bls),
      findEnabled: jest.fn().mockResolvedValue(bls),
      save: jest.fn(),
      delete: jest.fn(),
    };
    return new PhraseRegistryService(keywordRepo, blacklistRepo);
  }

  it('rejects intra-table duplicates case-insensitively', async () => {
    const svc = build(
      [Keyword.create({ phrase: 'ETF', matchMode: 'substring' })],
      [],
    );
    await expect(
      svc.throwIfDuplicate('keyword', 'etf', false, 'substring', null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects cross-table duplicates with identical settings', async () => {
    const svc = build(
      [],
      [BlacklistPhrase.create({ phrase: 'ETF', matchMode: 'substring' })],
    );
    await expect(
      svc.throwIfDuplicate('keyword', 'ETF', false, 'substring', null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows the same text cross-table when settings differ', async () => {
    const svc = build(
      [],
      [
        BlacklistPhrase.create({
          phrase: 'ETF',
          matchMode: 'substring',
          caseSensitive: true,
        }),
      ],
    );
    await expect(
      svc.throwIfDuplicate('keyword', 'ETF', false, 'substring', null),
    ).resolves.toBeUndefined();
  });

  it('skips compounds entirely', async () => {
    const svc = build(
      [Keyword.create({ phrase: 'ETF', matchMode: 'substring' })],
      [],
    );
    await expect(
      svc.throwIfDuplicate('keyword', 'ETF', false, 'substring', 'group-1'),
    ).resolves.toBeUndefined();
  });
});
