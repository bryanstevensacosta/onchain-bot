/**
 * Smoke test: verify cross-app imports work
 *
 * This test validates that backend can import from ingestion-telegram
 * via the @ingestion-telegram/telegram/* path alias.
 */

import {
  AbstractMessageTransformer,
  KolMessageTransformer,
  FeedMessageTransformer,
} from '@ingestion-telegram/telegram/transformation';

describe('Cross-app imports (backend → ingestion-telegram)', () => {
  it('should import AbstractMessageTransformer', () => {
    expect(AbstractMessageTransformer).toBeDefined();
    expect(typeof AbstractMessageTransformer).toBe('function');
  });

  it('should import KolMessageTransformer', () => {
    expect(KolMessageTransformer).toBeDefined();
    expect(typeof KolMessageTransformer).toBe('function');
  });

  it('should import FeedMessageTransformer', () => {
    expect(FeedMessageTransformer).toBeDefined();
    expect(typeof FeedMessageTransformer).toBe('function');
  });

  it('should instantiate KolMessageTransformer', () => {
    const transformer = new KolMessageTransformer();
    expect(transformer).toBeInstanceOf(AbstractMessageTransformer);
  });

  it('should instantiate FeedMessageTransformer', () => {
    const transformer = new FeedMessageTransformer();
    expect(transformer).toBeInstanceOf(AbstractMessageTransformer);
  });

  it('should transform a KOL message (integration)', () => {
    const transformer = new KolMessageTransformer();
    const raw = {
      id: 123,
      peerId: '456',
      message: 'Test message',
      date: 1609459200,
    };

    const result = transformer.transform(raw);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(123);
    expect(result!.text).toBe('Test message'); // Q1-B (adr-kol-raw-text.md): KOL text extracted
  });

  it('should transform a crypto-news message (integration)', () => {
    const transformer = new FeedMessageTransformer();
    const raw = {
      id: 123,
      peerId: '456',
      message: 'Breaking news',
      date: 1609459200,
    };

    const result = transformer.transform(raw);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(123);
    expect(result!.text).toBe('Breaking news');
  });
});
