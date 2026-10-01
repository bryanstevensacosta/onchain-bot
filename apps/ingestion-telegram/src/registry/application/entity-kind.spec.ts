import {
  assertSubscribableKind,
  classifyEntityKind,
  normalizeResolveInput,
} from './entity-kind';

/**
 * P57/P57-bis kind taxonomy (FAILING-FIRST).
 *
 * Single `client.getEntity()` returns `User|Chat|Channel` (`className`)
 * + `bot` flag in ONE call (GramJS docs pattern) — no title heuristics.
 */
describe('classifyEntityKind (single-getEntity taxonomy)', () => {
  it('Channel + broadcast → channel', () => {
    expect(
      classifyEntityKind({ className: 'Channel', broadcast: true } as any),
    ).toBe('channel');
  });

  it('Channel + megagroup → supergroup', () => {
    expect(
      classifyEntityKind({ className: 'Channel', megagroup: true } as any),
    ).toBe('supergroup');
  });

  it('plain Channel (neither flag) → channel', () => {
    expect(classifyEntityKind({ className: 'Channel' } as any)).toBe('channel');
  });

  it('Chat → group', () => {
    expect(classifyEntityKind({ className: 'Chat' } as any)).toBe('group');
  });

  it('User + bot → bot', () => {
    expect(classifyEntityKind({ className: 'User', bot: true } as any)).toBe(
      'bot',
    );
  });

  it('User without bot flag → user', () => {
    expect(classifyEntityKind({ className: 'User' } as any)).toBe('user');
  });

  it('unrecognized shape → unknown', () => {
    expect(classifyEntityKind({ className: 'Update' } as any)).toBe('unknown');
    expect(classifyEntityKind(null)).toBe('unknown');
    expect(classifyEntityKind(undefined)).toBe('unknown');
  });
});

describe('assertSubscribableKind (channel/group-only guard)', () => {
  it.each(['channel', 'supergroup', 'group'] as const)('allows %s', (kind) => {
    expect(() => assertSubscribableKind(kind, '-1001')).not.toThrow();
  });

  it.each(['user', 'bot', 'unknown'] as const)(
    'rejects %s with explicit 400',
    (kind) => {
      try {
        assertSubscribableKind(kind, '-1001');
        throw new Error('should have thrown');
      } catch (error: any) {
        expect(error?.status).toBe(400);
        expect(String(error?.message)).toMatch(/user|bot|unknown/i);
        expect(String(error?.message)).toMatch(/channel|group/i);
      }
    },
  );
});

describe('normalizeResolveInput (@handle|id|t.me)', () => {
  it('keeps @handle as-is for getEntity', () => {
    expect(normalizeResolveInput('@durov')).toBe('@durov');
  });

  it('adds @ to bare handles', () => {
    expect(normalizeResolveInput('durov')).toBe('@durov');
  });

  it('keeps numeric ids as-is', () => {
    expect(normalizeResolveInput('-1001234567890')).toBe('-1001234567890');
    expect(normalizeResolveInput('123456')).toBe('123456');
  });

  it('extracts handle from t.me URLs', () => {
    expect(normalizeResolveInput('https://t.me/durov')).toBe('@durov');
    expect(normalizeResolveInput('t.me/durov')).toBe('@durov');
    expect(normalizeResolveInput('https://telegram.me/durov')).toBe('@durov');
  });

  it('rejects empty input with 400', () => {
    expect(() => normalizeResolveInput('')).toThrow();
    expect(() => normalizeResolveInput('   ')).toThrow();
  });

  it('rejects invite links (+hash) with explicit 400', () => {
    expect(() => normalizeResolveInput('https://t.me/+AbCdEf123')).toThrow();
  });
});
