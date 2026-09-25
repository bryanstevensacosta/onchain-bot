import * as path from 'node:path';
import {
  FeedPathBuilder,
  FEED_MEDIA_PATH_SEGMENT,
  LEGACY_MEDIA_PATH_SEGMENT,
  rewriteMediaFilePathPrefix,
} from './feed-path-builder';

/**
 * Unit tests for the feed prefix rewrite + path builder.
 *
 * `rewriteMediaFilePathPrefix` MUST mirror the rename migration's UPDATE
 * semantics exactly (segment swap, backslash normalization, match-only).
 * Any drift between the two strands rows (janitor reads `file_path`).
 */
describe('rewriteMediaFilePathPrefix', () => {
  it('rewrites an absolute legacy path to the feed prefix', () => {
    expect(
      rewriteMediaFilePathPrefix(
        '/app/uploads/crypto-news/media/-1001234567890/167_0.jpg',
      ),
    ).toBe('/app/uploads/feed/media/-1001234567890/167_0.jpg');
  });

  it('rewrites a relative legacy path to the feed prefix', () => {
    expect(
      rewriteMediaFilePathPrefix('uploads/crypto-news/media/ch/1_0.png'),
    ).toBe('uploads/feed/media/ch/1_0.png');
  });

  it('normalizes backslashes before rewriting (Windows-authored rows)', () => {
    expect(
      rewriteMediaFilePathPrefix(
        'C:\\app\\uploads\\crypto-news\\media\\ch\\1_0.jpg',
      ),
    ).toBe('C:/app/uploads/feed/media/ch/1_0.jpg');
  });

  it('leaves empty-string rows byte-identical (benign, glob-served)', () => {
    expect(rewriteMediaFilePathPrefix('')).toBe('');
  });

  it('leaves already-new feed paths byte-identical', () => {
    const feed = '/app/uploads/feed/media/ch/1_0.jpg';
    expect(rewriteMediaFilePathPrefix(feed)).toBe(feed);
  });

  it('leaves foreign layouts without the segment byte-identical', () => {
    const foreign = '/var/lib/other-media/ch/1_0.jpg';
    expect(rewriteMediaFilePathPrefix(foreign)).toBe(foreign);
  });

  it('leaves near-miss segment text without trailing slash byte-identical', () => {
    const near = '/app/uploads/crypto-news/media-backup/ch/1_0.jpg';
    expect(rewriteMediaFilePathPrefix(near)).toBe(near);
  });

  it('exposes the exact segments the migration swaps', () => {
    expect(LEGACY_MEDIA_PATH_SEGMENT).toBe('crypto-news/media');
    expect(FEED_MEDIA_PATH_SEGMENT).toBe('feed/media');
  });
});

describe('FeedPathBuilder (feed root)', () => {
  const builder = new FeedPathBuilder({
    root: path.join('/tmp', 'uploads', 'feed', 'media'),
    recursive: true,
  });

  it('builds media paths under the feed segment', () => {
    const built = builder.buildMediaPath('-1001234567890', 167, 0, '.jpg');
    expect(built).toBe(
      path.join(
        '/tmp',
        'uploads',
        'feed',
        'media',
        '-1001234567890',
        '167_0.jpg',
      ),
    );
    expect(built).toContain(`${path.sep}feed${path.sep}media${path.sep}`);
    expect(built).not.toContain('crypto-news');
  });

  it('resolves channel directories under the feed segment', () => {
    const dir = builder.getMediaDirectory('-1001234567890');
    expect(dir).toBe(
      path.join('/tmp', 'uploads', 'feed', 'media', '-1001234567890'),
    );
  });

  it('round-trips a built path through parseMediaPath', () => {
    const built = builder.buildMediaPath('-1001', 167, 2, '.mp4');
    expect(builder.parseMediaPath(built)).toEqual({
      channelId: '-1001',
      messageId: 167,
      index: 2,
      extension: '.mp4',
    });
  });
});
