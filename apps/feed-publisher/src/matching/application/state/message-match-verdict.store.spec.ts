import { MessageMatchVerdictStore } from './message-match-verdict.store';

describe('MessageMatchVerdictStore', () => {
  it('returns null for unknown messages', () => {
    const store = new MessageMatchVerdictStore();
    expect(store.find('-1001', 1)).toBeNull();
  });

  it('persists the ephemeral match verdict for later status reads', () => {
    const store = new MessageMatchVerdictStore();
    store.save({
      channelId: '-1001',
      messageId: 7,
      matched: true,
      blocked: false,
      matchedKeywords: [{ id: 'kw-1', phrase: 'etf' }],
      blockedBy: [],
      filteredTitle: null,
      filteredContent: 'spot etf inflows',
      evaluatedAt: new Date().toISOString(),
    });
    const found = store.find('-1001', 7);
    expect(found).not.toBeNull();
    expect(found?.matched).toBe(true);
    expect(found?.matchedKeywords).toEqual([{ id: 'kw-1', phrase: 'etf' }]);
    expect(store.find('-1001', 8)).toBeNull();
  });

  it('overwrites the verdict on re-evaluation', () => {
    const store = new MessageMatchVerdictStore();
    const base = {
      channelId: '-1001',
      messageId: 7,
      matched: true,
      blocked: false,
      matchedKeywords: [{ id: 'kw-1', phrase: 'etf' }],
      blockedBy: [],
      filteredTitle: null,
      filteredContent: 'spot etf inflows',
      evaluatedAt: new Date().toISOString(),
    };
    store.save(base);
    store.save({ ...base, matched: false, matchedKeywords: [] });
    expect(store.find('-1001', 7)?.matched).toBe(false);
  });
});
