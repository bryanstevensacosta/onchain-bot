import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';

const validBase = {
  defaultTemplateId: '00000000-0000-0000-0000-000000000001',
  targetChannel: '-100',
  enabled: true,
  dailyCap: 36,
  dailyResetUtcHour: 4,
  randomDelayMinMs: 180_000,
  randomDelayMaxMs: 900_000,
  llmMaxAttempts: 3,
};

describe('LlmConfig', () => {
  describe('load', () => {
    it('builds an LlmConfig from valid inputs', () => {
      const cfg = LlmConfig.load(validBase);
      expect(cfg.id).toBe(1);
      expect(cfg.defaultTemplateId).toBe(validBase.defaultTemplateId);
      expect(cfg.targetChannel).toBe('-100');
      expect(cfg.enabled).toBe(true);
      expect(cfg.dailyCap).toBe(36);
      expect(cfg.dailyResetUtcHour).toBe(4);
      expect(cfg.randomDelayMinMs).toBe(180_000);
      expect(cfg.randomDelayMaxMs).toBe(900_000);
      expect(cfg.llmMaxAttempts).toBe(3);
      expect(cfg.updatedAt).toBeInstanceOf(Date);
    });

    it('uses id = 1 by default', () => {
      const cfg = LlmConfig.load(validBase);
      expect(cfg.id).toBe(1);
    });
  });

  describe('validation', () => {
    it('throws when defaultTemplateId is empty', () => {
      expect(() =>
        LlmConfig.load({ ...validBase, defaultTemplateId: '' }),
      ).toThrow(/defaultTemplateId/);
      expect(() =>
        LlmConfig.load({ ...validBase, defaultTemplateId: '   ' }),
      ).toThrow(/defaultTemplateId/);
    });

    it('throws when dailyCap is not positive', () => {
      expect(() => LlmConfig.load({ ...validBase, dailyCap: 0 })).toThrow(
        /dailyCap/,
      );
      expect(() => LlmConfig.load({ ...validBase, dailyCap: -5 })).toThrow(
        /dailyCap/,
      );
    });

    it('throws when dailyResetUtcHour is out of 0..23', () => {
      expect(() =>
        LlmConfig.load({ ...validBase, dailyResetUtcHour: -1 }),
      ).toThrow(/dailyResetUtcHour/);
      expect(() =>
        LlmConfig.load({ ...validBase, dailyResetUtcHour: 24 }),
      ).toThrow(/dailyResetUtcHour/);
    });

    it('throws when dailyResetUtcHour is not an integer', () => {
      expect(() =>
        LlmConfig.load({ ...validBase, dailyResetUtcHour: 4.5 }),
      ).toThrow(/dailyResetUtcHour/);
    });

    it('accepts boundary values for dailyResetUtcHour', () => {
      expect(() =>
        LlmConfig.load({ ...validBase, dailyResetUtcHour: 0 }),
      ).not.toThrow();
      expect(() =>
        LlmConfig.load({ ...validBase, dailyResetUtcHour: 23 }),
      ).not.toThrow();
    });

    it('throws when randomDelayMinMs is negative', () => {
      expect(() =>
        LlmConfig.load({ ...validBase, randomDelayMinMs: -1 }),
      ).toThrow(/randomDelayMinMs/);
    });

    it('throws when randomDelayMinMs >= randomDelayMaxMs', () => {
      expect(() =>
        LlmConfig.load({
          ...validBase,
          randomDelayMinMs: 500,
          randomDelayMaxMs: 500,
        }),
      ).toThrow(/randomDelayMaxMs/);
      expect(() =>
        LlmConfig.load({
          ...validBase,
          randomDelayMinMs: 600,
          randomDelayMaxMs: 500,
        }),
      ).toThrow(/randomDelayMaxMs/);
    });

    it('throws when llmMaxAttempts is not a positive integer', () => {
      expect(() => LlmConfig.load({ ...validBase, llmMaxAttempts: 0 })).toThrow(
        /llmMaxAttempts/,
      );
      expect(() =>
        LlmConfig.load({ ...validBase, llmMaxAttempts: -1 }),
      ).toThrow(/llmMaxAttempts/);
      expect(() =>
        LlmConfig.load({ ...validBase, llmMaxAttempts: 1.5 }),
      ).toThrow(/llmMaxAttempts/);
    });
  });

  describe('update', () => {
    const build = (): LlmConfig => LlmConfig.load(validBase);

    it('updates the provided fields and bumps updatedAt', async () => {
      const cfg = build();
      const originalUpdatedAt = cfg.updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      cfg.update({ targetChannel: '-200', enabled: false });
      expect(cfg.targetChannel).toBe('-200');
      expect(cfg.enabled).toBe(false);
      expect(cfg.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
      // untouched
      expect(cfg.dailyCap).toBe(36);
    });

    it('rejects an out-of-range dailyResetUtcHour', () => {
      const cfg = build();
      expect(() => cfg.update({ dailyResetUtcHour: 25 })).toThrow(
        /dailyResetUtcHour/,
      );
    });

    it('rejects randomDelayMaxMs <= randomDelayMinMs after the patch', () => {
      const cfg = build();
      expect(() =>
        cfg.update({ randomDelayMinMs: 999_999, randomDelayMaxMs: 999_999 }),
      ).toThrow(/randomDelayMaxMs/);
    });

    it('accepts a non-positive dailyCap, throws', () => {
      const cfg = build();
      expect(() => cfg.update({ dailyCap: 0 })).toThrow(/dailyCap/);
    });
  });

  describe('setDefaultTemplateId', () => {
    it('swaps the binding and bumps updatedAt', async () => {
      const cfg = LlmConfig.load(validBase);
      const originalUpdatedAt = cfg.updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      const newId = '00000000-0000-0000-0000-000000000002';
      cfg.setDefaultTemplateId(newId);
      expect(cfg.defaultTemplateId).toBe(newId);
      expect(cfg.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });

    it('rejects empty strings', () => {
      const cfg = LlmConfig.load(validBase);
      expect(() => cfg.setDefaultTemplateId('')).toThrow(/defaultTemplateId/);
      expect(() => cfg.setDefaultTemplateId('   ')).toThrow(
        /defaultTemplateId/,
      );
    });

    it('trims whitespace', () => {
      const cfg = LlmConfig.load(validBase);
      const id = '00000000-0000-0000-0000-000000000003';
      cfg.setDefaultTemplateId(`  ${id}  `);
      expect(cfg.defaultTemplateId).toBe(id);
    });
  });

  describe('reconstitute', () => {
    it('skips validation entirely', () => {
      const cfg = LlmConfig.reconstitute({
        id: 1,
        defaultTemplateId: '00000000-0000-0000-0000-000000000099',
        targetChannel: '',
        enabled: false,
        rejectNonLatin: true,
        dailyCap: 1,
        dailyResetUtcHour: 0,
        randomDelayMinMs: 0,
        randomDelayMaxMs: 1,
        llmMaxAttempts: 1,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(cfg.id).toBe(1);
      expect(cfg.dailyResetUtcHour).toBe(0);
    });
  });

  describe('rejectNonLatin', () => {
    // (a) load() without rejectNonLatin -> defaults to true
    it('load() defaults rejectNonLatin to true when omitted', () => {
      const cfg = LlmConfig.load(validBase);
      expect(cfg.rejectNonLatin).toBe(true);
    });

    // (b) load({ rejectNonLatin: false }) -> getter is false
    it('load({ rejectNonLatin: false }) sets the flag to false', () => {
      const cfg = LlmConfig.load({ ...validBase, rejectNonLatin: false });
      expect(cfg.rejectNonLatin).toBe(false);
    });

    // (c) update({ rejectNonLatin: false }) -> getter changes to false
    it('update({ rejectNonLatin: false }) flips the flag to false', () => {
      const cfg = LlmConfig.load(validBase);
      expect(cfg.rejectNonLatin).toBe(true);
      cfg.update({ rejectNonLatin: false });
      expect(cfg.rejectNonLatin).toBe(false);
    });

    // (d) update({}) -> getter unchanged
    it('update({}) leaves rejectNonLatin unchanged (no-op)', () => {
      const cfg = LlmConfig.load({ ...validBase, rejectNonLatin: false });
      cfg.update({});
      expect(cfg.rejectNonLatin).toBe(false);
    });

    // (e) reconstitute({ ...completeProps, rejectNonLatin: false }) -> getter is false
    it('reconstitute() honors the explicit rejectNonLatin: false value', () => {
      const cfg = LlmConfig.reconstitute({
        id: 1,
        defaultTemplateId: '00000000-0000-0000-0000-000000000099',
        targetChannel: '',
        enabled: false,
        dailyCap: 1,
        dailyResetUtcHour: 0,
        randomDelayMinMs: 0,
        randomDelayMaxMs: 1,
        llmMaxAttempts: 1,
        rejectNonLatin: false,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(cfg.rejectNonLatin).toBe(false);
    });
  });
});
