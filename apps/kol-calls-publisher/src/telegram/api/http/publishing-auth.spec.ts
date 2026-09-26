import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TelegramModule } from '../../telegram.module';
import { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';
import { PublishingTemplate } from '../../../templates/domain/entities/publishing-template.entity';
import { OWNER_ID_HEADER } from '../../../shared/guards/owner-binding';

const API_KEY = 'task-23-matrix-key';

describe('Publishing auth matrix (todo 23, P50, failing-first)', () => {
  let app: INestApplication;
  const sent: Array<{ chatId: string; text: string }> = [];

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    process.env.KOL_SYSTEM_API_KEY = API_KEY;
    process.env.PUBLISH_RATE_LIMIT_PER_MIN = '30';
    sent.length = 0;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TelegramModule],
    })
      .overrideProvider(TelegramPublisherPort)
      .useValue({
        sendMessage: async (input: { chatId: string; text: string }) => {
          sent.push({ chatId: input.chatId, text: input.text });
          return { ok: true, messageId: 7, error: null };
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
    await templates.save(
      PublishingTemplate.create({
        id: 'owned-a',
        name: 'owned-a',
        ownerId: 'owner-a',
      }),
    );
    const verified = (await templates.findById('vip-calls'))!;
    verified.assignChannel('bot-1', '@mirror');
    verified.markChannelVerified();
    await templates.save(verified);
  });

  afterEach(async () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.KOL_SYSTEM_API_KEY;
    delete process.env.PUBLISH_RATE_LIMIT_PER_MIN;
    await app.close();
  });

  it('401 without key and 401 with a wrong key', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/publishing/recent').expect(401);
    await request(server)
      .post('/api/publishing/publish')
      .send({
        templateId: 'owned-a',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
      })
      .expect(401);
    await request(server)
      .get('/api/publishing/recent')
      .set('x-api-key', 'wrong')
      .expect(401);
    expect(sent).toHaveLength(0);
  });

  it('403 on foreign binding + audit denied (adversarial exploit simulation)', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .post('/api/publishing/publish')
      .set('x-api-key', API_KEY)
      .set(OWNER_ID_HEADER, 'owner-evil')
      .send({
        templateId: 'owned-a',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
      })
      .expect(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(sent).toHaveLength(0);
    const audit = await request(server)
      .get('/api/publishing/audit')
      .set('x-api-key', API_KEY)
      .expect(200);
    const denied = (audit.body.entries as Array<Record<string, unknown>>).find(
      (e) => e.action === 'denied',
    );
    expect(denied).toMatchObject({
      actor: 'owner-evil',
      templateId: 'owned-a',
    });
    expect(JSON.stringify(audit.body).toLowerCase()).not.toContain('bottoken');
  });

  it('blocks unverified channels (published:false, no Telegram call, audit blocked)', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .post('/api/publishing/publish')
      .set('x-api-key', API_KEY)
      .set(OWNER_ID_HEADER, 'owner-a')
      .send({
        templateId: 'owned-a',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
      })
      .expect(201);
    expect(res.body.published).toBe(false);
    expect(res.body.reason).toBe('BOT_NOT_CONFIGURED');
    expect(sent).toHaveLength(0);
    const audit = await request(server)
      .get('/api/publishing/audit')
      .set('x-api-key', API_KEY)
      .expect(200);
    const blocked = (audit.body.entries as Array<Record<string, unknown>>).find(
      (e) => e.action === 'blocked',
    );
    expect(blocked).toMatchObject({ templateId: 'owned-a' });
  });

  it('allows a legitimate owner-bound publish on a verified channel', async () => {
    const server = app.getHttpServer();
    const templates = app.get(TemplateRepository);
    const owned = (await templates.findById('owned-a'))!;
    owned.assignChannel('bot-1', '@mirror');
    owned.markChannelVerified();
    await templates.save(owned);
    const res = await request(server)
      .post('/api/publishing/publish')
      .set('x-api-key', API_KEY)
      .set(OWNER_ID_HEADER, 'owner-a')
      .send({
        templateId: 'owned-a',
        mentionId: 'solana:ABC:k1:1:0',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
      })
      .expect(201);
    expect(res.body.published).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
