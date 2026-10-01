import { DomainError, ErrorCode } from '../kernel/domain-error';
import {
  DEFAULT_OWNER_ID,
  OWNER_ID_HEADER,
  assertBindingOwner,
  normalizeOwnerId,
} from './owner-binding';

describe('owner-binding (todo 23, P50, failing-first)', () => {
  it('exposes the x-owner-id binding header name', () => {
    expect(OWNER_ID_HEADER).toBe('x-owner-id');
    expect(DEFAULT_OWNER_ID).toBe('default');
  });

  it('normalizeOwnerId trims and nulls blanks', () => {
    expect(normalizeOwnerId('  owner-a ')).toBe('owner-a');
    expect(normalizeOwnerId('')).toBeNull();
    expect(normalizeOwnerId('   ')).toBeNull();
    expect(normalizeOwnerId(undefined)).toBeNull();
    expect(normalizeOwnerId(42)).toBeNull();
  });

  it('skips the check for internal direct calls (undefined requester)', () => {
    expect(() =>
      assertBindingOwner('owner-a', undefined, 'tpl-1'),
    ).not.toThrow();
  });

  it('matches the template owner', () => {
    expect(() =>
      assertBindingOwner('owner-a', 'owner-a', 'tpl-1'),
    ).not.toThrow();
  });

  it('rejects a missing HTTP binding with FORBIDDEN (binding required)', () => {
    try {
      assertBindingOwner('owner-a', null, 'tpl-1');
      fail('expected FORBIDDEN');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it('rejects a foreign binding with FORBIDDEN (adversarial: publish on somebody else template)', () => {
    try {
      assertBindingOwner('owner-a', 'owner-evil', 'tpl-1');
      fail('expected FORBIDDEN');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      const details = (err as DomainError).details ?? {};
      expect((err as DomainError).code).toBe(ErrorCode.FORBIDDEN);
      expect(details.templateId).toBe('tpl-1');
    }
  });
});
