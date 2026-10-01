import { PublishingJob } from './publishing-job.entity';

describe('PublishingJob entity (todo 11, failing-first)', () => {
  it('creates reserved and enforces a non-null ticker pre-publisher', () => {
    const job = PublishingJob.create({
      templateId: 'vip-calls',
      mentionId: 'solana:ABC:k1:1:0',
      ticker: 'BONK',
      chain: 'solana',
      address: 'ABC',
      channelTarget: '@mirror',
      message: 'hello',
    });
    expect(job.status).toBe('reserved');
    expect(job.ticker).toBe('BONK');
    expect(() =>
      PublishingJob.create({
        templateId: 'vip-calls',
        mentionId: 'm',
        ticker: null,
        chain: 'solana',
        address: 'ABC',
        channelTarget: '@mirror',
        message: 'hello',
      }),
    ).toThrow(/ticker must be resolved before publishing/);
    expect(() =>
      PublishingJob.create({
        templateId: 'vip-calls',
        mentionId: 'm',
        ticker: '  ',
        chain: 'solana',
        address: 'ABC',
        channelTarget: '@mirror',
        message: 'hello',
      }),
    ).toThrow(/ticker must be resolved before publishing/);
  });

  it('markPublished / markFailed finalize with events', () => {
    const job = PublishingJob.create({
      templateId: 'vip-calls',
      mentionId: 'm',
      ticker: 'BONK',
      chain: 'solana',
      address: 'ABC',
      channelTarget: '@mirror',
      message: 'hello',
    });
    job.markPublished(42);
    expect(job.status).toBe('published');
    expect(job.telegramMessageId).toBe(42);
    expect(job.commit().map((e) => e.eventName)).toContain(
      'publishing.telegram.published',
    );

    const failed = PublishingJob.create({
      templateId: 'vip-calls',
      mentionId: 'm2',
      ticker: 'BONK',
      chain: 'solana',
      address: 'DEF',
      channelTarget: '@mirror',
      message: 'hello',
    });
    failed.markFailed('sendMessage: 401');
    expect(failed.status).toBe('failed');
    expect(failed.commit().map((e) => e.eventName)).toContain(
      'publishing.telegram.failed',
    );
  });
});
