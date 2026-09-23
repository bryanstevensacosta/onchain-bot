import { Test, TestingModule } from '@nestjs/testing';
import { LastSeenManager } from './last-seen-manager.service';
import { RedisService } from 'shared/common/cache/redis.service';

describe('LastSeenManager - monotonic cursor', () => {
  let manager: LastSeenManager;
  let module: TestingModule;

  const mockRedisService = {
    isEnabled: jest.fn().mockReturnValue(false),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    getClient: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        LastSeenManager,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();
    manager = module.get<LastSeenManager>(LastSeenManager);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should never move the cursor backward on out-of-order processing', () => {
    const peerId = 'channel_album';

    manager.set(peerId, 19827);
    expect(manager.get(peerId)).toBe(19827);

    // Late album first-part (lower ID) must not rewind the polling minId
    manager.set(peerId, 19826);
    expect(manager.get(peerId)).toBe(19827);
  });

  it('should advance the cursor for genuinely newer messages', () => {
    const peerId = 'channel_seq';

    manager.set(peerId, 19826);
    manager.set(peerId, 19827);
    manager.set(peerId, 19828);

    expect(manager.get(peerId)).toBe(19828);
  });

  it('should keep per-peer cursors independent', () => {
    manager.set('peer_a', 100);
    manager.set('peer_b', 50);

    manager.set('peer_a', 90); // backward — ignored
    manager.set('peer_b', 60); // forward — accepted

    expect(manager.get('peer_a')).toBe(100);
    expect(manager.get('peer_b')).toBe(60);
  });

  it('should default unknown peers to -1', () => {
    expect(manager.get('never_seen')).toBe(-1);
  });
});
