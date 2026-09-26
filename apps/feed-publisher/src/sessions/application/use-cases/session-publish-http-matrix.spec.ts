import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../../../health/api/http/health.controller';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { ApiKeyGuard } from '../../../shared/guards/api-key.guard';
import { ContentTemplateRepository } from '../../../template/domain/ports/content-template.repository';
import { TemplateBotRepository } from '../../../template/domain/ports/template-bot.repository';
import { TemplateBot } from '../../../template/domain/entities/template-bot.entity';
import { InMemoryContentTemplateRepository } from '../../../template/infrastructure/repositories/in-memory-content-template.repository';
import { InMemoryTemplateBotRepository } from '../../../template/infrastructure/repositories/in-memory-template-bot.repository';
import { PublishingSession } from '../../domain/entities/publishing-session.entity';
import { PublishingSessionRepository } from '../../domain/ports/publishing-session.repository';
import { SessionPublisherPort } from '../ports/session-publisher.port';
import { InMemoryPublishingSessionRepository } from '../../infrastructure/repositories/in-memory-publishing-session.repository';
import { RecordingSessionPublisher } from '../../infrastructure/publish/recording-session-publisher.adapter';
import { PublishAuditLog } from '../services/publish-audit-log.service';
import { PublishRateLimiter } from '../services/publish-rate-limiter.service';
import { SessionPublishAuthorizer } from '../services/session-publish-authorizer.service';
import { PublishSessionMessageUseCase } from './publish-session-message.use-case';
import { PublishingSessionUseCases } from './publishing-session.use-cases';
import { PublishAuditController } from '../../api/http/publish-audit.controller';
import { SessionsController } from '../../api/http/sessions.controller';

const API_KEY = 'matrix-key';

/**
 * HTTP auth matrix (todo 14, P50): 401 without/a bad key on every
 * guarded route, 200 on health without a key, and the publish
 * 403 (foreign) / 404 / 429 / 201 matrix with an audit trail.
 */
describe('session publish HTTP matrix (todo 14, P50)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.FEED_PUBLISHER_API_KEY = API_KEY;
    const sessions = new InMemoryPublishingSessionRepository();
    const bots = new InMemoryTemplateBotRepository();
    const verified = TemplateBot.create({
      id: 'tg-1',
      label: 'News',
      target: 'telegram',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@news',
    });
    verified.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
    await bots.save(verified);
    await bots.save(
      TemplateBot.create({
        id: 'tg-raw',
        label: 'Raw',
        target: 'telegram',
        tokenCiphertext: 'iv:tag:data',
        defaultChatId: '@news',
      }),
    );
    await sessions.save(
      PublishingSession.create({
        id: 'tab-news',
        name: 'News',
        telegramTargets: [
          { botId: 'tg-1', chatId: '@news' },
          { botId: 'tg-1', chatId: '@evil' },
          { botId: 'tg-raw', chatId: '@news' },
        ],
      }),
    );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        HealthController,
        SessionsController,
        PublishAuditController,
      ],
      providers: [
        PublishingSessionUseCases,
        PublishSessionMessageUseCase,
        SessionPublishAuthorizer,
        PublishAuditLog,
        {
          provide: PublishRateLimiter,
          useValue: new PublishRateLimiter(10, 60_000),
        },
        RecordingSessionPublisher,
        { provide: SessionPublisherPort, useClass: RecordingSessionPublisher },
        {
          provide: PublishingSessionRepository,
          useValue: sessions,
        },
        {
          provide: ContentTemplateRepository,
          useClass: InMemoryContentTemplateRepository,
        },
        { provide: TemplateBotRepository, useValue: bots },
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalGuards(new ApiKeyGuard(new Reflector()));
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    delete process.env.FEED_PUBLISHER_API_KEY;
    await app.close();
  });

  it('GET /api/health stays public (200, no key)', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('401s guarded routes without a key or with a bad key', async () => {
    await request(app.getHttpServer()).get('/api/sessions').expect(401);
    await request(app.getHttpServer())
      .get('/api/sessions')
      .set('x-api-key', 'wrong')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/sessions/tab-news/publish')
      .send({
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@news',
        content: 'x',
      })
      .expect(401);
  });

  it('201s an owned binding with a key, 403s the foreign matrix', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/sessions/tab-news/publish')
      .set('x-api-key', API_KEY)
      .send({
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@news',
        content: 'market alpha',
      })
      .expect(201);
    await request(server)
      .post('/api/sessions/tab-news/publish')
      .set('x-api-key', API_KEY)
      .send({
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@evil',
        content: 'hijack',
      })
      .expect(403);
    await request(server)
      .post('/api/sessions/tab-news/publish')
      .set('x-api-key', API_KEY)
      .send({
        target: 'telegram',
        botId: 'tg-raw',
        chatId: '@news',
        content: 'unverified',
      })
      .expect(403);
    await request(server)
      .post('/api/sessions/ghost/publish')
      .set('x-api-key', API_KEY)
      .send({
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@news',
        content: 'ghost',
      })
      .expect(404);
    const audit = await request(server)
      .get('/api/publish-audit')
      .set('x-api-key', API_KEY)
      .expect(200);
    const results = (audit.body as Array<{ result: string }>).map(
      (entry) => entry.result,
    );
    expect(results).toEqual(['published', 'blocked', 'blocked']);
    expect(JSON.stringify(audit.body)).not.toMatch(/token|ciphertext/i);
  });
});
