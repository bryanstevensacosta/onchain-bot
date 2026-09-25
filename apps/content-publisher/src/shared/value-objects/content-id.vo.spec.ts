import { ContentId } from './content-id.vo';

describe('ContentId', () => {
  it('builds a normalized composite key', () => {
    expect(ContentId.from('crypto-news', 'CoinDesk', 'ABC123').raw).toBe(
      'crypto-news:coindesk:abc123',
    );
  });

  it('rejects empty segments', () => {
    expect(() => ContentId.from('crypto-news', '', 'x')).toThrow(
      'ContentId segments must be non-empty',
    );
  });
});
