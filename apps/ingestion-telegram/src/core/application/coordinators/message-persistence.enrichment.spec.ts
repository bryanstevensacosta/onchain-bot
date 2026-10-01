import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessagePersistenceCoordinator } from './message-persistence.coordinator';
import { StreamService } from 'stream/application/services/stream.service';
import { DeduplicationService } from '../services/deduplication.service';
import { LastSeenManager } from '@/core/infrastructure/services/last-seen-manager.service';
import { RedisService } from 'shared/common/cache/redis.service';
import { TelegramFeedMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';
import type { MessagePayload } from '@/core/domain/types/message-payload';

/**
 * Central todo 12 (P57): enriched SSE frames carry handle/avatarUrl.
 *
 * FAILING-FIRST: the coordinator does not look up the source row yet —
 * `handle`/`avatarUrl` are absent from broadcast payloads. RED until the
 * enrichment lands.
 *
 * Invariants pinned here:
 * - enrichment is read-only + fail-open (DB trouble still broadcasts).
 * - never-update + no-dup intact (duplicate → exactly 1 frame).
 * - unknown channels broadcast with null handle but an always-servable
 *   avatarUrl (placeholder 200 downstream).
 */
describe('MessagePersistenceCoordinator SSE enrichment (central todo 12)', () => {
  let coordinator: MessagePersistenceCoordinator;
  let module: TestingModule;
  const broadcasted: MessagePayload[] = [];

  const mockRedisService = {
    isEnabled: jest.fn().mockReturnValue(false),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    getClient: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'app') {
        return { api: { baseUrl: 'http://localhost:3031' } };
      }
      return undefined;
    }),
  };

  function buildModule(sourcesValue: unknown): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [
        MessagePersistenceCoordinator,
        StreamService,
        DeduplicationService,
        LastSeenManager,
        {
          provide: TelegramFeedMessageRepository,
          useValue: {
            findByChannelAndMessageId: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: TelegramFeedSourceRepository,
          useValue: sourcesValue,
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
  }

  function rawMessage(channelId: string, messageId: number) {
    return {
      peerId: channelId,
      messageId,
      text: 'hello world',
      occurredAt: new Date(),
      media: [],
      entities: [],
    };
  }

  beforeEach(() => {
    broadcasted.length = 0;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('enriches the SSE frame with handle/avatarUrl/sourceUrl', async () => {
    module = await buildModule({
      findByChannelId: jest.fn().mockResolvedValue({
        channelId: '-1001',
        handle: 'alpha',
        title: 'Alpha',
        url: 'https://t.me/alpha',
      }),
    });
    coordinator = module.get(MessagePersistenceCoordinator);
    const stream = module.get(StreamService);
    jest.spyOn(stream, 'broadcast').mockImplementation((event: any) => {
      if (event.type === 'message:telegram') {
        broadcasted.push(event.data);
      }
    });

    await coordinator.route(rawMessage('-1001', 1), 'kol');

    expect(broadcasted).toHaveLength(1);
    expect(broadcasted[0]).toMatchObject({
      peerId: '-1001',
      messageId: 1,
      messageType: 'kol',
      handle: 'alpha',
      avatarUrl: '/api/kol-avatar/-1001',
      sourceUrl: 'https://t.me/alpha',
    });
  });

  it('broadcasts unknown channels with null handle but a servable avatarUrl', async () => {
    module = await buildModule({
      findByChannelId: jest.fn().mockResolvedValue(null),
    });
    coordinator = module.get(MessagePersistenceCoordinator);
    const stream = module.get(StreamService);
    jest.spyOn(stream, 'broadcast').mockImplementation((event: any) => {
      if (event.type === 'message:telegram') {
        broadcasted.push(event.data);
      }
    });

    await coordinator.route(rawMessage('-1999', 7), 'crypto-news');

    expect(broadcasted).toHaveLength(1);
    expect(broadcasted[0]).toMatchObject({
      handle: null,
      avatarUrl: '/api/kol-avatar/-1999',
    });
  });

  it('stays fail-open when the source lookup throws (MTProto/DB trouble)', async () => {
    module = await buildModule({
      findByChannelId: jest.fn().mockRejectedValue(new Error('db down')),
    });
    coordinator = module.get(MessagePersistenceCoordinator);
    const stream = module.get(StreamService);
    const spy = jest
      .spyOn(stream, 'broadcast')
      .mockImplementation((event: any) => {
        if (event.type === 'message:telegram') {
          broadcasted.push(event.data);
        }
      });

    await expect(
      coordinator.route(rawMessage('-1001', 3), 'kol'),
    ).resolves.not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(broadcasted).toHaveLength(1);
    expect(broadcasted[0]).toMatchObject({ handle: null });
  });

  it('keeps no-dup intact: duplicate routes broadcast exactly once', async () => {
    module = await buildModule({
      findByChannelId: jest.fn().mockResolvedValue({
        channelId: '-1001',
        handle: 'alpha',
        title: 'Alpha',
        url: 'https://t.me/alpha',
      }),
    });
    coordinator = module.get(MessagePersistenceCoordinator);
    const stream = module.get(StreamService);
    jest.spyOn(stream, 'broadcast').mockImplementation((event: any) => {
      if (event.type === 'message:telegram') {
        broadcasted.push(event.data);
      }
    });

    await coordinator.route(rawMessage('-1001', 42), 'kol');
    await coordinator.route(rawMessage('-1001', 42), 'kol');

    expect(broadcasted).toHaveLength(1);
    expect(broadcasted[0]).toMatchObject({ handle: 'alpha' });
  });
});
