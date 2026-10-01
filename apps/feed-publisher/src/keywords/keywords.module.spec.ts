import { Test } from '@nestjs/testing';
import { KeywordsModule } from './keywords.module';
import { KeywordRepository } from './application/ports/keyword.repository';
import { BlacklistPhraseRepository } from './application/ports/blacklist-phrase.repository';
import { AllowedKeywordMatcher } from './application/services/keyword-matcher.service';
import { BlacklistMatcher } from './application/services/blacklist-matcher.service';
import { PhraseRegistryService } from './application/services/phrase-registry.service';
import { KeywordUseCases } from './application/use-cases/keyword.use-cases';
import { BlacklistPhraseUseCases } from './application/use-cases/blacklist-phrase.use-cases';

describe('KeywordsModule', () => {
  it('wires the keywords graph (todo 3)', async () => {
    const module = await Test.createTestingModule({
      imports: [KeywordsModule],
    }).compile();
    expect(module.get(KeywordsModule)).toBeDefined();
    expect(module.get(KeywordRepository)).toBeDefined();
    expect(module.get(BlacklistPhraseRepository)).toBeDefined();
    expect(module.get(AllowedKeywordMatcher)).toBeDefined();
    expect(module.get(BlacklistMatcher)).toBeDefined();
    expect(module.get(PhraseRegistryService)).toBeDefined();
    expect(module.get(KeywordUseCases)).toBeDefined();
    expect(module.get(BlacklistPhraseUseCases)).toBeDefined();
    await module.close();
  });
});
