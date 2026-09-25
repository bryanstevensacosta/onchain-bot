import { ChannelContentFilterConfig } from './channel-content-filter-config.entity';

describe('ChannelContentFilterConfig', () => {
  it('creates a valid per-channel rule', () => {
    const cfg = ChannelContentFilterConfig.create({
      channelId: '-1001234567890',
      pattern: 'BTC',
      replacement: 'bitcoin',
    });
    expect(cfg.channelId).toBe('-1001234567890');
    expect(cfg.flags).toBe('gi');
    expect(cfg.isActive).toBe(true);
    expect(cfg.toRegExp()).toBeInstanceOf(RegExp);
  });

  it('rejects non-numeric channel ids, bad patterns, bad flags', () => {
    expect(() =>
      ChannelContentFilterConfig.create({
        channelId: 'not-a-channel',
        pattern: 'x',
      }),
    ).toThrow();
    expect(() =>
      ChannelContentFilterConfig.create({
        channelId: '-1001',
        pattern: '([a-z',
      }),
    ).toThrow();
    expect(() =>
      ChannelContentFilterConfig.create({
        channelId: '-1001',
        pattern: 'x',
        flags: 'z',
      }),
    ).toThrow();
  });

  it('toggles active state and updates pattern/priority', () => {
    const cfg = ChannelContentFilterConfig.create({
      channelId: '-1001',
      pattern: 'x',
    });
    cfg.deactivate();
    expect(cfg.isActive).toBe(false);
    cfg.activate();
    expect(cfg.isActive).toBe(true);
    cfg.updatePattern('y');
    expect(cfg.pattern).toBe('y');
    cfg.setPriority(3);
    expect(cfg.priority).toBe(3);
    expect(() => cfg.setPriority(-1)).toThrow();
  });
});
