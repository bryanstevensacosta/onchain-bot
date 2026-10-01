import { BadRequestException } from '@nestjs/common';
import { decodeFeedCursor, encodeFeedCursor } from './feed-cursor';

describe('feed-cursor (opaque keyset cursor)', () => {
  it('roundtrips publishedAt + id through encode/decode', () => {
    const publishedAt = new Date('2026-09-21T10:00:00.000Z');
    const id = '11111111-1111-1111-1111-111111111111';

    const cursor = encodeFeedCursor(publishedAt, id);

    expect(typeof cursor).toBe('string');
    expect(cursor.length).toBeGreaterThan(0);
    expect(decodeFeedCursor(cursor)).toEqual({ publishedAt, id });
  });

  it('accepts ISO strings in encode (same cursor as Date input)', () => {
    const id = '22222222-2222-2222-2222-222222222222';

    expect(encodeFeedCursor('2026-09-21T10:00:00.000Z', id)).toBe(
      encodeFeedCursor(new Date('2026-09-21T10:00:00.000Z'), id),
    );
  });

  it('is opaque: the raw id is not readable without decoding', () => {
    const id = '33333333-3333-3333-3333-333333333333';

    expect(
      encodeFeedCursor(new Date('2026-09-21T10:00:00.000Z'), id),
    ).not.toContain(id);
  });

  it.each([[''], ['not-a-cursor'], ['!!!'], ['e30=']])(
    'rejects malformed cursor %j with 400',
    (cursor) => {
      let error: unknown;
      try {
        decodeFeedCursor(cursor);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects well-formed base64url JSON with missing/empty fields with 400', () => {
    const bad = [
      Buffer.from(JSON.stringify({}), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ p: 'x' }), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ i: 'y' }), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ p: '', i: 'y' }), 'utf8').toString(
        'base64url',
      ),
      Buffer.from(JSON.stringify({ p: 'not-a-date', i: 'y' }), 'utf8').toString(
        'base64url',
      ),
      Buffer.from(JSON.stringify([1, 2]), 'utf8').toString('base64url'),
    ];

    for (const cursor of bad) {
      expect(() => decodeFeedCursor(cursor)).toThrow(BadRequestException);
    }
  });
});
