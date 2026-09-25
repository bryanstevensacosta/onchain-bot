import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ScoredCallRepository } from '../src/scoring/application/ports/scored-call.repository';
import { ScoredCall } from '../src/scoring/domain/entities/scored-call.entity';
import { Score } from '../src/scoring/domain/value-objects/score.vo';

/**
 * Mirror-channel publish e2e (Tramo 1, todo 11).
 *
 * No real Telegram traffic: global fetch is stubbed as the Bot API
 * (getMe/getChatMember verify admin, sendMessage captures the post).
 * Flow: seed scored mention -> catalog bot -> assign + verify channel on
 * the `vip-calls` seed -> request + approve -> publish -> mirror got 1 card.
 */
describe('Publishing mirror-channel e2e (todo 11)', () => {
  let app: INestApplication;
  const sent: Array<{ url: string; chatId: string; text: string }> = [];

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    sent.length = 0;
    (global as unknown as { fetch: unknown }).fetch = async (
      url: string,
      init: { body?: string },
    ) => {
      const body = (init?.body ? JSON.parse(init.body) : {}) as Record<
        string,
        unknown
      >;
      if (url.includes('/getMe')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { id: 123 } }),
        };
      }
      if (url.includes('/getChatMember')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { status: 'administrator' } }),
        };
      }
      if (url.includes('/sendMessage')) {
        sent.push({
          url,
          chatId: body.chat_id as string,
          text: body.text as string,
        });
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 99 } }),
        };
      }
      return { ok: false, json: async () => ({ ok: false }) };
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.get(ScoredCallRepository).save(
      ScoredCall.create({
        mentionId: 'solana:ABC:k1:1:0',
        kolId: 'k1',
        messageId: 1,
        contractIndex: 0,
        chain: 'solana',
        address: 'ABC',
        score: Score.fromNumber(82),
        avgKolReputation: 0.5,
        breakdown: [],
        scoredAt: new Date(),
      }),
    );
  });

  afterEach(async () => {
    delete (global as unknown as { fetch?: unknown }).fetch;
    delete process.env.ENCRYPTION_KEY;
    await app.close();
  });

  it('approve -> publish posts exactly 1 card to the mirror channel', async () => {
    const server = app.getHttpServer();
    const bot = await request(server)
      .post('/api/telegram-bots')
      .send({ label: 'mirror-bot', token: 'TEST:TOKEN' })
      .expect(201);
    const assigned = await request(server)
      .patch('/api/templates/vip-calls/channel')
      .send({ botId: bot.body.id, channelTarget: '@mirror' })
      .expect(200);
    expect(assigned.body.canPublish).toBe(true);

    await request(server)
      .post('/api/approvals/request')
      .send({ templateId: 'vip-calls', mentionId: 'solana:ABC:k1:1:0' })
      .expect(201);
    const id = encodeURIComponent('vip-calls:solana:ABC:k1:1:0');
    await request(server)
      .post(`/api/approvals/${id}/approve`)
      .send({})
      .expect(201);

    const published = await request(server)
      .post('/api/publishing/publish')
      .send({
        templateId: 'vip-calls',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
        marketCapUsd: 12_500_000,
      })
      .expect(201);
    expect(published.body.published).toBe(true);
    expect(published.body.messageId).toBe(99);

    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe('@mirror');
    expect(sent[0].text).toContain('$SOLANA | $BONK');
    expect(sent[0].text).toContain('$12.50M');

    const pending = await request(server)
      .get('/api/approvals/pending')
      .expect(200);
    expect(pending.body.pending).toEqual([]);
    const recent = await request(server)
      .get('/api/publishing/recent')
      .expect(200);
    expect(recent.body.jobs).toHaveLength(1);
    expect(recent.body.jobs[0].status).toBe('published');
  });
});
