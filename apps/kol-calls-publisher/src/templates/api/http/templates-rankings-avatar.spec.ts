import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TemplatesModule } from '../../templates.module';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';
import { KolAvatarResolverService } from '../../../ingestion/application/services/kol-avatar-resolver.service';
import { ScoredCallRepository } from '../../../scoring/application/ports/scored-call.repository';
import { ScoredCall } from '../../../scoring/domain/entities/scored-call.entity';
import { Score } from '../../../scoring/domain/value-objects/score.vo';

describe('TemplatesController rankings avatarUrl (P19 caller display)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TemplatesModule],
    })
      .overrideProvider(TelegramAdminVerifierPort)
      .useValue({ verifyAdmin: async () => true })
      .overrideProvider(SourceValidatorPort)
      .useValue({
        validateSources: async (ids: string[]) => ({
          valid: ids,
          unknownIds: [],
        }),
      })
      .overrideProvider(KolAvatarResolverService)
      .useValue({
        resolveMany: async (callers: string[]) =>
          Object.fromEntries(
            callers.map((caller) => [caller, `/api/kol-avatar/${caller}`]),
          ),
      })
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
  });

  afterEach(async () => {
    delete process.env.ENCRYPTION_KEY;
    await app.close();
  });

  it('attaches avatarUrl per ranked call with placeholder fallback', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/templates')
      .send({ name: 'avatar-case' });
    expect(created.status).toBe(201);
    const templateId = created.body.id as string;

    const scored = app.get(ScoredCallRepository);
    await scored.save(
      ScoredCall.create({
        mentionId: '-1001:7:0',
        kolId: '-1001',
        messageId: 7,
        contractIndex: 0,
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        score: Score.fromNumber(90),
        avgKolReputation: 0.5,
        breakdown: [],
        scoredAt: new Date(),
      }),
    );

    const res = await request(app.getHttpServer()).get(
      `/api/templates/${templateId}/rankings`,
    );
    expect(res.status).toBe(200);
    expect(res.body.ranked).toHaveLength(1);
    expect(res.body.ranked[0]).toMatchObject({
      kolId: '-1001',
      avatarUrl: '/api/kol-avatar/-1001',
    });
  });
});
