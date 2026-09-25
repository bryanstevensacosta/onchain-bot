import { ThreadBuilderService } from './thread-builder.service';

describe('ThreadBuilderService', () => {
  it('builds a DRAFT thread from message inputs', () => {
    const builder = new ThreadBuilderService();
    const thread = builder.build([
      { content: 'first', delaySeconds: 0 },
      { content: 'second', mediaUrls: ['https://cdn/x.png'] },
    ]);
    expect(thread.status).toBe('DRAFT');
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[1].mediaUrls).toEqual(['https://cdn/x.png']);
  });

  it('rejects empty input without touching any repository', () => {
    const builder = new ThreadBuilderService();
    expect(() => builder.build([])).toThrow('at least one message');
  });
});
