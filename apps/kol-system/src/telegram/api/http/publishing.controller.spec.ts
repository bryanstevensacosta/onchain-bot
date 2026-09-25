import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TelegramModule } from '../../telegram.module';
import { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';

describe('PublishingController (todo 11, failing-first)', () => {
  let app: INestApplication;
  const sent: Array<{ chatId: string; text: string }> = [];

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    sent.length = 0;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TelegramModule],
    })
      .overrideProvider(TelegramPublisherPort)
      .useValue({
        sendMessage: async (input: { chatId: string; text: string }) => {
          sent.push({ chatId: input.chatId, text: input.text });
          return { ok: true, messageId: 3, error: null };
        },
      })
      .overrideProvider(BotTokenResolverPort)
      .useValue({ resolveBotToken: async () => 'TEST-TOKEN' })
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    const templates = app.get(TemplateRepository);
    const tpl = (await templates.findById('vip-calls'))!;
    tpl.assignChannel('bot-1', '@mirror');
    tpl.markChannelVerified();
    await templates.save(tpl);
  });

  afterEach(async () => {
    delete process.env.ENCRYPTION_KEY;
    await app.close();
  });

  it('POST /api/publishing/publish posts to the mirror channel via the catalog bot', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .post('/api/publishing/publish')
      .send({
        templateId: 'vip-calls',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
      })
      .expect(201);
    expect(res.body.published).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe('@mirror');
    const recent = await request(server)
      .get('/api/publishing/recent')
      .expect(200);
    expect(recent.body.jobs).toHaveLength(1);
  });

  it('POST /api/publishing/publish rejects null ticker without posting', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/publishing/publish')
      .send({
        templateId: 'vip-calls',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: null,
        chain: 'solana',
        address: 'ABC',
      })
      .expect(400);
    expect(sent).toHaveLength(0);
  });
});
