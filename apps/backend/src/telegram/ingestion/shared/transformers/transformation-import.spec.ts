/**
 * Smoke test: verify cross-app imports work
 *
 * This test validates that backend can import from ingestion-service
 * via the @ingestion-service/telegram/* path alias.
 */

import {
  AbstractMessageTransformer,
  KolMessageTransformer,
  CryptoNewsMessageTransformer,
} from '@ingestion-service/telegram/transformation';

describe('Cross-app imports (backend → ingestion-service)', () => {
  it('should import AbstractMessageTransformer', () => {
    expect(AbstractMessageTransformer).toBeDefined();
    expect(typeof AbstractMessageTransformer).toBe('function');
  });

  it('should import KolMessageTransformer', () => {
    expect(KolMessageTransformer).toBeDefined();
    expect(typeof KolMessageTransformer).toBe('function');
  });

  it('should import CryptoNewsMessageTransformer', () => {
    expect(CryptoNewsMessageTransformer).toBeDefined();
    expect(typeof CryptoNewsMessageTransformer).toBe('function');
  });

  it('should instantiate KolMessageTransformer', () => {
    const transformer = new KolMessageTransformer();
    expect(transformer).toBeInstanceOf(AbstractMessageTransformer);
  });

  it('should instantiate CryptoNewsMessageTransformer', () => {
    const transformer = new CryptoNewsMessageTransformer();
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
    expect(result!.text).toBe(''); // ToS invariant
  });

  it('should transform a crypto-news message (integration)', () => {
    const transformer = new CryptoNewsMessageTransformer();
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
