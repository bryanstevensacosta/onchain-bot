import { DomainError } from 'shared/kernel/domain-error';
import { ScheduledAd } from './scheduled-ad.entity';

describe('ScheduledAd', () => {
  it('creates a text post enabled with zero counters', () => {
    const ad = ScheduledAd.create({ name: 'launch', body: 'hello' });
    expect(ad.enabled).toBe(true);
    expect(ad.format).toBe('text');
    expect(ad.timesPublished).toBe(0);
    expect(ad.consecutiveFailures).toBe(0);
    expect(ad.lastPublishedAt).toBeNull();
  });

  it('rejects unknown formats', () => {
    expect(() =>
      ScheduledAd.create({ name: 'x', body: 'y', format: 'sticker' as never }),
    ).toThrow(DomainError);
  });

  it('enforces per-format media invariants', () => {
    expect(() =>
      ScheduledAd.create({ name: 'p', body: 'b', format: 'photo' }),
    ).toThrow(/requires imageMediaId/);
    expect(() =>
      ScheduledAd.create({ name: 'v', body: 'b', format: 'video' }),
    ).toThrow(/requires videoMediaId/);
    expect(() =>
      ScheduledAd.create({ name: 'a', body: 'b', format: 'album' }),
    ).toThrow(/at least one albumMediaId/);
  });

  it('accepts photo/video/album with their media', () => {
    expect(() =>
      ScheduledAd.create({
        name: 'p',
        body: 'b',
        format: 'photo',
        imageMediaId: 'm1',
      }),
    ).not.toThrow();
    expect(() =>
      ScheduledAd.create({
        name: 'v',
        body: 'b',
        format: 'video',
        videoMediaId: 'm2',
      }),
    ).not.toThrow();
    expect(() =>
      ScheduledAd.create({
        name: 'a',
        body: 'b',
        format: 'album',
        albumMediaIds: ['m1', 'm2'],
      }),
    ).not.toThrow();
  });

  it('treats expiresAt === now as expired (inclusive boundary)', () => {
    const now = new Date('2026-09-25T10:00:00.000Z');
    const ad = ScheduledAd.create({ name: 'e', body: 'b', expiresAt: now });
    expect(ad.isExpired(now)).toBe(true);
    expect(ad.isExpired(new Date('2026-09-25T09:59:59.999Z'))).toBe(false);
  });

  it('refuses to enable an expired post', () => {
    const past = new Date('2026-09-20T10:00:00.000Z');
    const ad = ScheduledAd.fromSnapshot({
      ...ScheduledAd.create({ name: 'e', body: 'b' }),
      id: 'id-1',
      name: 'e',
      body: 'b',
      imageMediaId: null,
      enabled: false,
      order: 0,
      timesPublished: 0,
      consecutiveFailures: 0,
      lastPublishedAt: null,
      expiresAt: past,
      expirationAction: 'disable',
      createdAt: past,
      updatedAt: past,
    });
    expect(() => ad.enable(new Date('2026-09-25T10:00:00.000Z'))).toThrow(
      DomainError,
    );
  });

  it('markPublished bumps counters and clears failures immutably', () => {
    const ad = ScheduledAd.create({ name: 'p', body: 'b' });
    const now = new Date();
    const next = ad.markPublished(now);
    expect(next.timesPublished).toBe(1);
    expect(next.consecutiveFailures).toBe(0);
    expect(next.lastPublishedAt).toBe(now);
    expect(ad.timesPublished).toBe(0);
  });
});
