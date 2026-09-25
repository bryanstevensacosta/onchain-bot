import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { ApprovalModule } from '../../approval.module';
import { ScoredCallRepository } from '../../../scoring/application/ports/scored-call.repository';
import { ScoredCall } from '../../../scoring/domain/entities/scored-call.entity';
import { Score } from '../../../scoring/domain/value-objects/score.vo';

describe('ApprovalsController (todo 11, failing-first)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ApprovalModule],
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
    const scoredRepo = app.get(ScoredCallRepository);
    await scoredRepo.save(
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
    await app.close();
  });

  it('GET /api/approvals/pending starts empty; request enqueues; approve dequeues', async () => {
    const server = app.getHttpServer();
    const empty = await request(server)
      .get('/api/approvals/pending')
      .expect(200);
    expect(empty.body.pending).toEqual([]);
    const enqueued = await request(server)
      .post('/api/approvals/request')
      .send({ templateId: 'vip-calls', mentionId: 'solana:ABC:k1:1:0' })
      .expect(201);
    expect(enqueued.body.status).toBe('pending');
    const pending = await request(server)
      .get('/api/approvals/pending?templateId=vip-calls')
      .expect(200);
    expect(pending.body.pending).toHaveLength(1);
    expect(pending.body.pending[0].id).toBe('vip-calls:solana:ABC:k1:1:0');
    const id = encodeURIComponent('vip-calls:solana:ABC:k1:1:0');
    const approved = await request(server)
      .post(`/api/approvals/${id}/approve`)
      .send({})
      .expect(201);
    expect(approved.body.status).toBe('approved');
    const drained = await request(server)
      .get('/api/approvals/pending')
      .expect(200);
    expect(drained.body.pending).toEqual([]);
  });

  it('POST /:id/reject removes it from pending', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/approvals/request')
      .send({ templateId: 'vip-calls', mentionId: 'solana:ABC:k1:1:0' })
      .expect(201);
    const id = encodeURIComponent('vip-calls:solana:ABC:k1:1:0');
    const rejected = await request(server)
      .post(`/api/approvals/${id}/reject`)
      .send({ reason: 'MANUAL' })
      .expect(201);
    expect(rejected.body.status).toBe('rejected');
    const pending = await request(server)
      .get('/api/approvals/pending')
      .expect(200);
    expect(pending.body.pending).toEqual([]);
  });

  it('POST /evaluate auto-decides a passing mention', async () => {
    const server = app.getHttpServer();
    const decided = await request(server)
      .post('/api/approvals/evaluate')
      .send({ templateId: 'vip-calls', mentionId: 'solana:ABC:k1:1:0' })
      .expect(201);
    expect(decided.body.status).toBe('approved');
  });
});
