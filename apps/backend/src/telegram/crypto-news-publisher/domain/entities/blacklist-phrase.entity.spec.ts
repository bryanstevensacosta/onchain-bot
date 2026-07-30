import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';

describe('BlacklistPhrase', () => {
  describe('create', () => {
    it('builds a blacklist phrase from a non-empty phrase', () => {
      const bp = BlacklistPhrase.create({ phrase: 'scam' });
      expect(bp.phrase).toBe('scam');
      expect(bp.caseSensitive).toBe(false);
      expect(bp.enabled).toBe(true);
      expect(bp.andGroupId).toBeNull();
      expect(bp.requireMedia).toBe(false);
      expect(bp.id).toEqual(expect.any(String));
      expect(bp.createdAt).toBeInstanceOf(Date);
    });

    it('trims surrounding whitespace from the phrase', () => {
      const bp = BlacklistPhrase.create({ phrase: '  fraud  ' });
      expect(bp.phrase).toBe('fraud');
    });

    it('honours explicit caseSensitive + enabled flags', () => {
      const bp = BlacklistPhrase.create({
        phrase: 'PONZI',
        caseSensitive: true,
        enabled: false,
      });
      expect(bp.caseSensitive).toBe(true);
      expect(bp.enabled).toBe(false);
    });

    it('honours explicit andGroupId override', () => {
      const groupId = crypto.randomUUID();
      const bp = BlacklistPhrase.create({ phrase: 'rug', andGroupId: groupId });
      expect(bp.andGroupId).toBe(groupId);
    });

    it('treats undefined andGroupId as null', () => {
      const bp = BlacklistPhrase.create({ phrase: 'rug' });
      expect(bp.andGroupId).toBeNull();
    });

    it('honours explicit requireMedia=true on create', () => {
      const bp = BlacklistPhrase.create({ phrase: 'moon', requireMedia: true });
      expect(bp.requireMedia).toBe(true);
    });

    it('defaults requireMedia to false when not provided', () => {
      const bp = BlacklistPhrase.create({ phrase: 'rug' });
      expect(bp.requireMedia).toBe(false);
    });

    it('throws DomainError(VALIDATION) when the phrase is empty', () => {
      expect(() => BlacklistPhrase.create({ phrase: '' })).toThrow(/phrase/);
      expect(() => BlacklistPhrase.create({ phrase: '   ' })).toThrow(/phrase/);
    });

    it('throws DomainError(VALIDATION) when the phrase exceeds 200 chars', () => {
      const tooLong = 'a'.repeat(201);
      expect(() => BlacklistPhrase.create({ phrase: tooLong })).toThrow(
        /exceeds/,
      );
    });

    it('preserves a provided id when supplied', () => {
      const fixedId = crypto.randomUUID();
      const bp = BlacklistPhrase.create({ id: fixedId, phrase: 'rug' });
      expect(bp.id).toBe(fixedId);
    });
  });

  describe('matches', () => {
    describe('case-insensitive (default)', () => {
      const bp = BlacklistPhrase.create({ phrase: 'scam' });

      it('returns true when phrase is contained verbatim', () => {
        expect(bp.matches('this is a scam alert')).toBe(true);
      });

      it('returns true when phrase appears in different case', () => {
        expect(bp.matches('SCAM detected')).toBe(true);
        expect(bp.matches('Scam warning')).toBe(true);
      });

      it('returns false when phrase is absent', () => {
        expect(bp.matches('legitimate project')).toBe(false);
      });

      it('returns false for empty content', () => {
        expect(bp.matches('')).toBe(false);
      });

      it('matches substrings inside larger tokens (e.g. btc in btcusdt)', () => {
        const bp2 = BlacklistPhrase.create({
          phrase: 'btc',
          matchMode: 'substring',
        });
        expect(bp2.matches('btcusdt pair is live')).toBe(true);
      });
    });

    describe('case-sensitive', () => {
      const bp = BlacklistPhrase.create({
        phrase: 'PONZI',
        caseSensitive: true,
      });

      it('matches exact case only', () => {
        expect(bp.matches('PONZI scheme')).toBe(true);
        expect(bp.matches('ponzi scheme')).toBe(false);
        expect(bp.matches('Ponzi scheme')).toBe(false);
      });
    });

    describe('exact match mode', () => {
      it('does not match substrings in larger words', () => {
        const bp = BlacklistPhrase.create({ phrase: 'AI', matchMode: 'exact' });
        expect(bp.matches('AI is smart')).toBe(true);
        expect(bp.matches('chain')).toBe(false);
        expect(bp.matches('cairo')).toBe(false);
      });

      it('matches with word boundaries', () => {
        const bp = BlacklistPhrase.create({ phrase: 'AI', matchMode: 'exact' });
        expect(bp.matches("AI's")).toBe(true);
        expect(bp.matches('AI,')).toBe(true);
      });

      it('matches phrases starting with # (hashtags)', () => {
        const bp = BlacklistPhrase.create({
          phrase: '#Bitcoin ETFs',
          matchMode: 'exact',
        });
        expect(bp.matches('\n#Bitcoin ETFs:\n')).toBe(true);
        expect(bp.matches('text #Bitcoin ETFs more')).toBe(true);
        expect(bp.matches('ab#Bitcoin ETFs')).toBe(false);
      });

      it('matches phrases starting with @ (usernames)', () => {
        const bp = BlacklistPhrase.create({
          phrase: '@user',
          matchMode: 'exact',
        });
        expect(bp.matches('hello @user how are you')).toBe(true);
        expect(bp.matches('hello@user')).toBe(false);
      });

      it('matches phrases starting with $ (tickers)', () => {
        const bp = BlacklistPhrase.create({
          phrase: '$BTC',
          matchMode: 'exact',
        });
        expect(bp.matches('price $BTC is up')).toBe(true);
        expect(bp.matches('price$BTC')).toBe(false);
      });
    });
  });

  describe('checkMatchesWithMedia', () => {
    describe('requireMedia=false (default)', () => {
      const bp = BlacklistPhrase.create({
        phrase: 'scam',
        requireMedia: false,
      });

      it('returns true when phrase matches, regardless of hasMedia', () => {
        expect(bp.checkMatchesWithMedia('this is a scam', true)).toBe(true);
        expect(bp.checkMatchesWithMedia('this is a scam', false)).toBe(true);
      });

      it('returns false when phrase does not match', () => {
        expect(bp.checkMatchesWithMedia('legitimate project', true)).toBe(
          false,
        );
        expect(bp.checkMatchesWithMedia('legitimate project', false)).toBe(
          false,
        );
      });
    });

    describe('requireMedia=true', () => {
      const bp = BlacklistPhrase.create({ phrase: 'moon', requireMedia: true });

      it('returns true when phrase matches AND hasMedia=true', () => {
        expect(bp.checkMatchesWithMedia('to the moon!', true)).toBe(true);
      });

      it('returns false when phrase matches but hasMedia=false', () => {
        expect(bp.checkMatchesWithMedia('to the moon!', false)).toBe(false);
      });

      it('returns false when phrase does not match (even with media)', () => {
        expect(bp.checkMatchesWithMedia('to the stars', true)).toBe(false);
      });
    });
  });

  describe('reconstitute', () => {
    it('rehydrates from persisted props without validation', () => {
      const originalId = crypto.randomUUID();
      const originalDate = new Date('2026-01-01T00:00:00Z');
      const groupId = crypto.randomUUID();
      const bp = BlacklistPhrase.reconstitute({
        id: originalId,
        phrase: 'arbitrary',
        caseSensitive: true,
        andGroupId: groupId,
        requireMedia: true,
        enabled: false,
        createdAt: originalDate,
      });
      expect(bp.id).toBe(originalId);
      expect(bp.phrase).toBe('arbitrary');
      expect(bp.caseSensitive).toBe(true);
      expect(bp.andGroupId).toBe(groupId);
      expect(bp.requireMedia).toBe(true);
      expect(bp.enabled).toBe(false);
      expect(bp.createdAt).toBe(originalDate);
    });

    it('preserves a null andGroupId through reconstitute', () => {
      const bp = BlacklistPhrase.reconstitute({
        id: crypto.randomUUID(),
        phrase: 'foo',
        caseSensitive: false,
        andGroupId: null,
        requireMedia: false,
        enabled: true,
        createdAt: new Date(),
      });
      expect(bp.andGroupId).toBeNull();
    });

    it('defaults requireMedia to false when not provided in reconstitute', () => {
      const bp = BlacklistPhrase.reconstitute({
        id: crypto.randomUUID(),
        phrase: 'bar',
        caseSensitive: false,
        enabled: true,
        createdAt: new Date(),
      });
      expect(bp.requireMedia).toBe(false);
    });
  });

  describe('isApplicableTo', () => {
    it('returns true when sourceChannelIds is empty (applies to all)', () => {
      const bp = BlacklistPhrase.create({ phrase: 'scam' });
      expect(bp.isApplicableTo('any-channel')).toBe(true);
    });

    it('returns true when channelId is in sourceChannelIds', () => {
      const bp = BlacklistPhrase.create({
        phrase: 'scam',
        sourceChannelIds: ['channel-1', 'channel-2'],
      });
      expect(bp.isApplicableTo('channel-1')).toBe(true);
      expect(bp.isApplicableTo('channel-2')).toBe(true);
    });

    it('returns false when channelId is not in sourceChannelIds', () => {
      const bp = BlacklistPhrase.create({
        phrase: 'scam',
        sourceChannelIds: ['channel-1'],
      });
      expect(bp.isApplicableTo('channel-3')).toBe(false);
    });
  });

  describe('enable / disable', () => {
    it('toggles enabled flag', () => {
      const bp = BlacklistPhrase.create({ phrase: 'scam' });
      expect(bp.enabled).toBe(true);
      bp.disable();
      expect(bp.enabled).toBe(false);
      bp.enable();
      expect(bp.enabled).toBe(true);
    });
  });
});
