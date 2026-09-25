import { ContentFilterService } from './content-filter.service';

describe('ContentFilterService (ReDoS-safe)', () => {
  const service = new ContentFilterService();

  it('applies active filters in priority order', () => {
    const out = service.filterContent('hello scam world', [
      {
        pattern: 'scam',
        replacement: '[blocked]',
        flags: 'gi',
        priority: 1,
        isActive: true,
      },
      {
        pattern: 'hello',
        replacement: 'hi',
        flags: 'gi',
        priority: 0,
        isActive: true,
      },
    ]);
    expect(out).toBe('hi [blocked] world');
  });

  it('skips inactive filters and invalid patterns', () => {
    const out = service.filterContent('hello world', [
      {
        pattern: 'hello',
        replacement: 'hi',
        flags: 'gi',
        priority: 0,
        isActive: false,
      },
      {
        pattern: '([a-z',
        replacement: 'x',
        flags: 'g',
        priority: 1,
        isActive: true,
      },
    ]);
    expect(out).toBe('hello world');
  });

  it('skips patterns that exceed the max length guard', () => {
    const out = service.filterContent('hello world', [
      {
        pattern: `hello${'x'.repeat(600)}`,
        replacement: '',
        flags: 'g',
        priority: 0,
        isActive: true,
      },
    ]);
    expect(out).toBe('hello world');
  });

  it('filters title and content together', () => {
    const res = service.filterTitleAndContent('FREE promo', 'free MINT now', [
      {
        pattern: 'free',
        replacement: '[redacted]',
        flags: 'gi',
        priority: 0,
        isActive: true,
      },
    ]);
    expect(res).toEqual({
      title: '[redacted] promo',
      content: '[redacted] MINT now',
    });
    expect(service.filterTitleAndContent(null, 'abc', []).content).toBe('abc');
  });

  it('catastrophic pattern returns promptly instead of hanging', () => {
    const started = Date.now();
    const out = service.filterContent('aaaaaaaaaa!', [
      {
        pattern: '(a+)+$',
        replacement: 'X',
        flags: '',
        priority: 0,
        isActive: true,
      },
    ]);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(typeof out).toBe('string');
  });

  it('logs a warning when a replace exceeds the timeout budget', () => {
    const warn = jest.spyOn(
      service['logger'] as unknown as { warn: (...args: unknown[]) => void },
      'warn',
    );
    const realNow = Date.now;
    let calls = 0;
    Date.now = jest.fn(() => {
      calls += 1;
      return calls === 1 ? 0 : 10_000;
    });
    try {
      service.filterContent('abc', [
        {
          pattern: 'b',
          replacement: 'B',
          flags: '',
          priority: 0,
          isActive: true,
        },
      ]);
    } finally {
      Date.now = realNow;
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
