import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DomainError } from 'shared/kernel/domain-error';
import { ScheduledPostsModule } from './scheduled-posts.module';
import { ScheduledPostsController } from './api/http/scheduled-posts.controller';
import { SessionBindingAuthorizer } from './domain/ports/session-binding.authorizer';
import { FireDuePostsUseCase } from './application/use-cases/fire-due-posts.use-case';
import type { SchedulePostDto } from './api/http/schedule-post.dto';

const KEY = '3f6b4c2a-0000-4000-8000-000000000001';

function dto(overrides: Partial<SchedulePostDto> = {}): SchedulePostDto {
  return {
    sessionId: 'morning-desk',
    binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
    contentKind: 'pre-written',
    text: 'GM',
    mediaIds: [],
    buttons: null,
    scheduleKind: 'once',
    fireAt: '2026-09-27T08:00:00.000Z',
    idempotencyKey: KEY,
    ...overrides,
  } as SchedulePostDto;
}

function mockRes(): { status: jest.Mock; code: number } {
  const holder = { code: 0 };
  return {
    code: 0,
    status: jest.fn().mockImplementation((code: number) => {
      holder.code = code;
      return {};
    }),
  } as unknown as { status: jest.Mock; code: number };
}

describe('ScheduledPostsController', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, message_id: 777 }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  async function booted() {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
        ScheduledPostsModule,
      ],
    }).compile();
    const authorizer = module.get(SessionBindingAuthorizer) as unknown as {
      seed: (session: unknown) => Promise<void>;
    };
    await authorizer.seed({
      sessionId: 'morning-desk',
      active: true,
      bindings: [
        {
          bindingId: 'b-1',
          target: 'telegram',
          botId: 'bot_X',
          defaultChatId: '-100123',
          botVerified: true,
          publishDelayMs: 0,
          dailyCap: 10,
        },
      ],
    });
    return { module, controller: module.get(ScheduledPostsController) };
  }

  it('creates (201) then replays the original (200) on duplicate keys', async () => {
    const { module, controller } = await booted();
    const firstRes = mockRes();
    const first = (await controller.create(dto(), firstRes as never)) as { id: string };
    expect(firstRes.status).toHaveBeenCalledWith(201);
    const replayRes = mockRes();
    const replay = (await controller.create(dto(), replayRes as never)) as { id: string };
    expect(replayRes.status).toHaveBeenCalledWith(200);
    expect(replay.id).toBe(first.id);
    await module.close();
  });

  it('lists, reads, cancels by owner and fires publish-now end to end', async () => {
    const { module, controller } = await booted();
    const res = mockRes();
    const created = (await controller.create(dto(), res as never)) as { id: string };
    const listed = await controller.list('morning-desk');
    expect(listed).toHaveLength(1);
    const read = (await controller.byId(created.id)) as { id: string };
    expect(read.id).toBe(created.id);
    await expect(controller.byId('sp_ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const fire = module.get(FireDuePostsUseCase);
    const fired = await fire.fireDue(new Date('2026-09-27T08:00:30.000Z'));
    expect(fired).toHaveLength(1);

    await expect(controller.remove(created.id, 'morning-desk')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await module.close();
  });

  it('rejects cross-session cancel with 403-class ownership', async () => {
    const { module, controller } = await booted();
    const created = (await controller.create(dto(), mockRes() as never)) as { id: string };
    await expect(controller.remove(created.id, 'intruder')).rejects.toBeInstanceOf(DomainError);
    await module.close();
  });
});
