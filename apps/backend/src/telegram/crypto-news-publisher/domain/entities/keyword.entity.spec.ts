import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

describe('Keyword', () => {
  describe('create', () => {
    it('builds a keyword from a non-empty phrase', () => {
      const kw = Keyword.create({ phrase: 'bitcoin' });
      expect(kw.phrase).toBe('bitcoin');
      expect(kw.caseSensitive).toBe(false);
      expect(kw.enabled).toBe(true);
      expect(kw.templateId).toBeNull();
      expect(kw.requireMedia).toBe(false);
      expect(kw.id).toEqual(expect.any(String));
      expect(kw.createdAt).toBeInstanceOf(Date);
    });

    it('trims surrounding whitespace from the phrase', () => {
      const kw = Keyword.create({ phrase: '  ethereum  ' });
      expect(kw.phrase).toBe('ethereum');
    });

    it('honours explicit caseSensitive + enabled flags', () => {
      const kw = Keyword.create({
        phrase: 'SOL',
        caseSensitive: true,
        enabled: false,
      });
      expect(kw.caseSensitive).toBe(true);
      expect(kw.enabled).toBe(false);
    });

    it('honours explicit templateId override', () => {
      const tplId = crypto.randomUUID();
      const kw = Keyword.create({ phrase: 'btc', templateId: tplId });
      expect(kw.templateId).toBe(tplId);
    });

    it('treats undefined templateId as null', () => {
      const kw = Keyword.create({ phrase: 'btc' });
      expect(kw.templateId).toBeNull();
    });

    it('throws DomainError(VALIDATION) when the phrase is empty', () => {
      expect(() => Keyword.create({ phrase: '' })).toThrow(/phrase/);
      expect(() => Keyword.create({ phrase: '   ' })).toThrow(/phrase/);
    });

    it('throws DomainError(VALIDATION) when the phrase exceeds 200 chars', () => {
      const tooLong = 'a'.repeat(201);
      expect(() => Keyword.create({ phrase: tooLong })).toThrow(/exceeds/);
    });

    it('throws DomainError(VALIDATION) when templateId is empty string', () => {
      expect(() => Keyword.create({ phrase: 'btc', templateId: '' })).toThrow(
        /templateId/,
      );
    });

    it('preserves a provided id when supplied', () => {
      const fixedId = crypto.randomUUID();
      const kw = Keyword.create({ id: fixedId, phrase: 'btc' });
      expect(kw.id).toBe(fixedId);
    });

    it('defaults requireMedia to false when not provided', () => {
      const kw = Keyword.create({ phrase: 'btc' });
      expect(kw.requireMedia).toBe(false);
    });

    it('honours explicit requireMedia=true on create', () => {
      const kw = Keyword.create({ phrase: 'btc', requireMedia: true });
      expect(kw.requireMedia).toBe(true);
    });

    it('defaults andGroupId to null when not provided', () => {
      const kw = Keyword.create({ phrase: 'btc' });
      expect(kw.andGroupId).toBeNull();
    });

    it('honours explicit andGroupId on create', () => {
      const groupId = 'test-group-1';
      const kw = Keyword.create({ phrase: 'btc', andGroupId: groupId });
      expect(kw.andGroupId).toBe(groupId);
    });
  });

  describe('matches', () => {
    describe('case-insensitive (default)', () => {
      const kw = Keyword.create({ phrase: 'bitcoin' });

      it('returns true when phrase is contained verbatim', () => {
        expect(kw.matches('bitcoin hits 100k')).toBe(true);
      });

      it('returns true when phrase appears in different case', () => {
        expect(kw.matches('BITCOIN is pumping')).toBe(true);
        expect(kw.matches('Bitcoin news today')).toBe(true);
      });

      it('returns false when phrase is absent', () => {
        expect(kw.matches('ethereum only news')).toBe(false);
      });

      it('returns false for empty content', () => {
        expect(kw.matches('')).toBe(false);
      });

      it('matches substrings inside larger tokens (e.g. btc in btcusdt)', () => {
        const kw2 = Keyword.create({ phrase: 'btc', matchMode: 'substring' });
        expect(kw2.matches('btcusdt pair is live')).toBe(true);
      });
    });

    describe('case-sensitive', () => {
      const kw = Keyword.create({ phrase: 'BTC', caseSensitive: true });

      it('matches exact case only', () => {
        expect(kw.matches('BTC is up')).toBe(true);
        expect(kw.matches('btc is down')).toBe(false);
        expect(kw.matches('Btc sideways')).toBe(false);
      });
    });
  });

  describe('enable / disable', () => {
    it('toggles enabled flag', () => {
      const kw = Keyword.create({ phrase: 'sol' });
      expect(kw.enabled).toBe(true);
      kw.disable();
      expect(kw.enabled).toBe(false);
      kw.enable();
      expect(kw.enabled).toBe(true);
    });
  });

  describe('setTemplateId', () => {
    it('binds a template id', () => {
      const kw = Keyword.create({ phrase: 'btc' });
      const tpl = crypto.randomUUID();
      kw.setTemplateId(tpl);
      expect(kw.templateId).toBe(tpl);
    });

    it('trims surrounding whitespace', () => {
      const kw = Keyword.create({ phrase: 'btc' });
      const tpl = crypto.randomUUID();
      kw.setTemplateId(`  ${tpl}  `);
      expect(kw.templateId).toBe(tpl);
    });

    it('clears the binding when passed null', () => {
      const kw = Keyword.create({
        phrase: 'btc',
        templateId: crypto.randomUUID(),
      });
      kw.setTemplateId(null);
      expect(kw.templateId).toBeNull();
    });

    it('throws on empty string', () => {
      const kw = Keyword.create({ phrase: 'btc' });
      expect(() => kw.setTemplateId('')).toThrow(/templateId/);
      expect(() => kw.setTemplateId('   ')).toThrow(/templateId/);
    });
  });

  describe('reconstitute', () => {
    it('rehydrates from persisted props without validation', () => {
      const originalId = crypto.randomUUID();
      const originalDate = new Date('2026-01-01T00:00:00Z');
      const tpl = crypto.randomUUID();
      const kw = Keyword.reconstitute({
        id: originalId,
        phrase: 'arbitrary',
        caseSensitive: true,
        templateId: tpl,
        enabled: false,
        requireMedia: true,
        andGroupId: null,
        createdAt: originalDate,
      });
      expect(kw.id).toBe(originalId);
      expect(kw.phrase).toBe('arbitrary');
      expect(kw.caseSensitive).toBe(true);
      expect(kw.templateId).toBe(tpl);
      expect(kw.enabled).toBe(false);
      expect(kw.requireMedia).toBe(true);
      expect(kw.andGroupId).toBeNull();
      expect(kw.createdAt).toBe(originalDate);
    });

    it('preserves a null templateId through reconstitute', () => {
      const kw = Keyword.reconstitute({
        id: crypto.randomUUID(),
        phrase: 'foo',
        caseSensitive: false,
        templateId: null,
        enabled: true,
        requireMedia: false,
        andGroupId: null,
        createdAt: new Date(),
      });
      expect(kw.templateId).toBeNull();
    });
  });
});
