import { ContentNormalizerService } from './content-normalizer.service';

describe('ContentNormalizerService', () => {
  describe('normalize', () => {
    it('should normalize basic text', () => {
      const result = ContentNormalizerService.normalize('Hello World');
      expect(result).toBe('hello world');
    });

    it('should strip markdown bold and italic', () => {
      const result = ContentNormalizerService.normalize('**BTC** hits $120K');
      expect(result).toBe('btc hits $120k');
    });

    it('should strip markdown links', () => {
      const result = ContentNormalizerService.normalize(
        '[click here](https://example.com)',
      );
      expect(result).toBe('click here');
    });

    it('should handle exclamation marks correctly', () => {
      const result = ContentNormalizerService.normalize(
        'Bitcoin hits $120K!!!',
      );
      expect(result).toBe('bitcoin hits $120k');
    });

    it('should remove emojis', () => {
      const result = ContentNormalizerService.normalize('BTC is up 🚀🚀🚀');
      expect(result).toBe('btc is up');
    });

    it('should handle accents', () => {
      const result = ContentNormalizerService.normalize(
        'Bitcoin está subiendo',
      );
      expect(result).toBe('bitcoin esta subiendo');
    });

    it('should collapse repeated punctuation', () => {
      const result = ContentNormalizerService.normalize('Wow!!!! Really???');
      expect(result).toBe('wow! really');
    });

    it('should remove leading/trailing punctuation', () => {
      const result = ContentNormalizerService.normalize('...hello world...');
      expect(result).toBe('hello world');
    });

    it('should preserve $ # @ and interior punctuation', () => {
      const result = ContentNormalizerService.normalize(
        '$BTC #crypto @user test.com',
      );
      expect(result).toBe('$btc #crypto @user test.com');
    });

    it('should collapse whitespace', () => {
      const result = ContentNormalizerService.normalize(
        'hello    world   test',
      );
      expect(result).toBe('hello world test');
    });

    it('should handle the example from spec: BlackRock and MicroStrategy Buy Bitcoin', () => {
      const result = ContentNormalizerService.normalize(
        'BlackRock and MicroStrategy Buy Bitcoin, SEC Watches',
      );
      expect(result).toBe(
        'blackrock and microstrategy buy bitcoin, sec watches',
      );
    });
  });

  describe('extractNumbers', () => {
    it('should extract basic numbers', () => {
      const result =
        ContentNormalizerService.extractNumbers('The price is 100');
      expect(result).toEqual([100]);
    });

    it('should handle K suffix', () => {
      const result = ContentNormalizerService.extractNumbers('BTC $120K');
      expect(result).toEqual([120000]);
    });

    it('should handle M suffix', () => {
      const result = ContentNormalizerService.extractNumbers('ETH $3.5B');
      expect(result).toEqual([3500000000]);
    });

    it('should handle B suffix', () => {
      const result =
        ContentNormalizerService.extractNumbers('Market cap $500M');
      expect(result).toEqual([500000000]);
    });

    it('should handle T suffix', () => {
      const result = ContentNormalizerService.extractNumbers('$5T market');
      expect(result).toEqual([5000000000000]);
    });

    it('should handle percentage', () => {
      const result = ContentNormalizerService.extractNumbers('+5% daily');
      expect(result).toEqual([0.05]);
    });

    it('should handle comma decimal separator', () => {
      const result = ContentNormalizerService.extractNumbers('Price: 1,5M');
      expect(result).toEqual([1500000]);
    });

    it('should extract multiple numbers', () => {
      const result = ContentNormalizerService.extractNumbers(
        'BTC $120K, ETH $3.5B, +5% daily',
      );
      expect(result).toEqual([120000, 3500000000, 0.05]);
    });
  });

  describe('extractEntities', () => {
    it('should extract capitalized words', () => {
      const result = ContentNormalizerService.extractEntities(
        'BlackRock and MicroStrategy Buy Bitcoin',
      );
      expect(result).toContain('blackrock');
      expect(result).toContain('microstrategy');
      expect(result).toContain('bitcoin');
    });

    it('should filter short words', () => {
      const result =
        ContentNormalizerService.extractEntities('The Bitcoin is up');
      expect(result).not.toContain('the');
      expect(result).toContain('bitcoin');
    });

    it('should filter sentence starters', () => {
      const result = ContentNormalizerService.extractEntities(
        'However Bitcoin crashed',
      );
      expect(result).not.toContain('however');
      expect(result).toContain('bitcoin');
    });

    it('should handle multi-word proper nouns', () => {
      const result = ContentNormalizerService.extractEntities(
        'United States and China agree',
      );
      expect(result).toContain('united');
      expect(result).toContain('states');
      expect(result).toContain('china');
    });

    it('should handle Spanish text', () => {
      const result =
        ContentNormalizerService.extractEntities('Bitcoin se dispara');
      expect(result).toContain('bitcoin');
    });

    it('should return unique and sorted', () => {
      const result = ContentNormalizerService.extractEntities(
        'Bitcoin Bitcoin Ethereum Bitcoin',
      );
      expect(result).toEqual(['bitcoin', 'ethereum']);
    });
  });

  describe('extractCashtags', () => {
    it('should extract cashtags', () => {
      const result = ContentNormalizerService.extractCashtags(
        '$BTC and $ETH pumping!',
      );
      expect(result).toEqual(['BTC', 'ETH']);
    });

    it('should handle multiple cashtags', () => {
      const result = ContentNormalizerService.extractCashtags(
        '$BTC and $ETH pumping! $SOL also up',
      );
      expect(result).toEqual(['BTC', 'ETH', 'SOL']);
    });

    it('should uppercase cashtags', () => {
      const result = ContentNormalizerService.extractCashtags('$btc');
      expect(result).toEqual(['BTC']);
    });

    it('should return unique and sorted', () => {
      const result = ContentNormalizerService.extractCashtags('$BTC $ETH $BTC');
      expect(result).toEqual(['BTC', 'ETH']);
    });

    it('should filter short cashtags', () => {
      const result = ContentNormalizerService.extractCashtags('$A $BTC');
      expect(result).toEqual(['BTC']);
    });
  });
});
