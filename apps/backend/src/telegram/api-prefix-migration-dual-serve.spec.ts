import { PATH_METADATA } from '@nestjs/common/constants';
import { QueueController } from 'telegram/crypto-news-publisher/api/http/queue.controller';
import { QueueMediaController } from 'telegram/crypto-news-publisher/api/http/queue-media.controller';
import { KeywordsController } from 'telegram/crypto-news-publisher/api/http/keywords.controller';
import { PhrasesController } from 'telegram/crypto-news-publisher/api/http/phrases.controller';
import { BlacklistController } from 'telegram/crypto-news-publisher/api/http/blacklist.controller';
import { LlmConfigController } from 'telegram/crypto-news-publisher/api/http/llm-config.controller';
import { AdsController } from 'telegram/crypto-news-ads/api/http/ads.controller';
import { AdsRotationConfigController } from 'telegram/crypto-news-ads/api/http/ads-rotation-config.controller';
import { AdsMediaController } from 'telegram/crypto-news-ads/api/http/ads-media.controller';
import { MatchingConfigController } from 'telegram/crypto-news-integration/api/http/matching-config.controller';
import { ThreadsKeywordsController } from 'threads/publisher/api/http/keywords.controller';
import { ThreadsBlacklistController } from 'threads/publisher/api/http/blacklist.controller';
import { ThreadsPhrasesController } from 'threads/publisher/api/http/phrases.controller';
import { ThreadsQueueController } from 'threads/publisher/api/http/queue.controller';
import { ThreadsLlmConfigController } from 'threads/publisher/api/http/llm-config.controller';
import { CryptoNewsController } from 'telegram/ingestion/crypto-news/api/http/crypto-news.controller';
import { FeedFiltersController } from 'telegram/ingestion/crypto-news/api/http/feed-filters.controller';
import { OpsBackupsController } from 'src/ops/backups/api/http/ops-backups.controller';

type ControllerClass = new (...args: never[]) => object;

function pathsOf(controller: ControllerClass): string[] {
  const raw: unknown = Reflect.getMetadata(PATH_METADATA, controller);
  return Array.isArray(raw) ? (raw as string[]) : [raw as string];
}

describe('P41 API prefix migration dual-serve (T2 todo 13 Fase 1)', () => {
  it.each([
    [QueueController, 'crypto-news-publisher/queue', 'feed-publisher/queue'],
    [
      QueueMediaController,
      'crypto-news-publisher/queue',
      'feed-publisher/queue',
    ],
    [
      KeywordsController,
      'crypto-news-publisher/keywords',
      'feed-publisher/keywords',
    ],
    [
      PhrasesController,
      'crypto-news-publisher/phrases',
      'feed-publisher/phrases',
    ],
    [
      BlacklistController,
      'crypto-news-publisher/blacklist',
      'feed-publisher/blacklist',
    ],
    [LlmConfigController, 'crypto-news-publisher/llm', 'feed-publisher/llm'],
  ] as Array<[ControllerClass, string, string]>)(
    'dual-serves %p old+new',
    (controller, oldPrefix, newPrefix) => {
      const paths = pathsOf(controller);
      expect(paths).toContain(oldPrefix);
      expect(paths).toContain(newPrefix);
    },
  );

  it.each([
    [AdsController, 'crypto-news-ads/ads', 'feed-scheduling/ads'],
    [
      AdsRotationConfigController,
      'crypto-news-ads/rotation-config',
      'feed-scheduling/rotation-config',
    ],
    [AdsMediaController, 'crypto-news-ads', 'feed-scheduling'],
  ] as Array<[ControllerClass, string, string]>)(
    'dual-serves %p old+new',
    (controller, oldPrefix, newPrefix) => {
      const paths = pathsOf(controller);
      expect(paths).toContain(oldPrefix);
      expect(paths).toContain(newPrefix);
    },
  );

  it('dual-serves matching old+new', () => {
    const paths = pathsOf(MatchingConfigController);
    expect(paths).toContain('crypto-news/matching');
    expect(paths).toContain('feed-matching');
  });

  it.each([
    [ThreadsKeywordsController, 'feed-threads-publisher/keywords'],
    [ThreadsBlacklistController, 'feed-threads-publisher/blacklist'],
    [ThreadsPhrasesController, 'feed-threads-publisher/phrases'],
    [ThreadsQueueController, 'feed-threads-publisher/queue'],
    [ThreadsLlmConfigController, 'feed-threads-publisher/llm'],
  ] as Array<[ControllerClass, string]>)(
    'dual-serves %p old+new',
    (controller, newPrefix) => {
      const paths = pathsOf(controller);
      expect(paths).toContain(newPrefix);
      expect(paths.some((p) => p.startsWith('threads-publisher/'))).toBe(true);
    },
  );

  it('keeps legacy crypto-news filters controller intact', () => {
    expect(pathsOf(CryptoNewsController)).toContain('crypto-news');
  });

  it('serves new feed-filters prefix', () => {
    expect(pathsOf(FeedFiltersController)).toContain('feed-filters');
  });

  it('keeps ops/backups unrenamed', () => {
    expect(pathsOf(OpsBackupsController)).toContain('ops/backups');
  });
});
