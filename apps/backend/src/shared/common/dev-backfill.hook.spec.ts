import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { DevBackfillHook } from 'shared/common/dev-backfill.hook';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolHandle } from 'kol/identity/domain/value-objects/kol-handle.vo';

/**
 * In-memory fake KolRepository — only findAll is exercised by the hook,
 * but the abstract class requires all 5 methods to be implemented.
 */
class FakeKolRepository extends KolRepository {
  public readonly kols: Kol[] = [];
  public async save(_kol: Kol): Promise<void> {
    await Promise.resolve();
  }
  public async findById(_id: KolId): Promise<Kol | null> {
    await Promise.resolve();
    return null;
  }
  public async findAll(): Promise<ReadonlyArray<Kol>> {
    await Promise.resolve();
    return this.kols;
  }
  public async delete(_id: KolId): Promise<void> {
    await Promise.resolve();
  }
  public async updateTitle(_id: KolId, _newTitle: string): Promise<boolean> {
    await Promise.resolve();
    return false;
  }
}

interface OrchestratorBehavior {
  readonly result: { ingested: number; total: number };
  readonly error: Error | null;
}

/**
 * Duck-typed fake orchestrator — the hook only calls `backfillKol(id, limit)`.
 * Avoids extending KolIngestionOrchestratorUseCase (which has 5 constructor deps).
 */
function buildFakeOrchestrator(
  behavior: OrchestratorBehavior,
): Pick<KolIngestionOrchestratorUseCase, 'backfillKol'> {
  return {
    backfillKol: jest.fn(
      async (
        _id: string,
        _limit: number,
      ): Promise<{ ingested: number; total: number }> => {
        if (behavior.error) {
          throw behavior.error;
        }
        return behavior.result;
      },
    ),
  };
}

function buildFakeModuleRef(
  kolRepo: KolRepository,
  orchestrator: Pick<KolIngestionOrchestratorUseCase, 'backfillKol'>,
): ModuleRef {
  return {
    get: jest.fn((token: unknown) => {
      if (token === KolRepository) return kolRepo;
      if (token === KolIngestionOrchestratorUseCase) return orchestrator;
      throw new Error(`Unexpected token: ${String(token)}`);
    }),
  } as unknown as ModuleRef;
}

function buildFakeConfig(nodeEnv: string): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'app.nodeEnv') return nodeEnv;
      return fallback;
    }),
  } as unknown as ConfigService;
}

function buildActiveKol(idValue: string, title: string): Kol {
  return Kol.create({
    id: KolId.fromString(idValue),
    handle: KolHandle.fromString('testkol'),
    title,
  });
}

describe('DevBackfillHook', () => {
  let loggedMessages: string[];
  let warnedMessages: string[];

  beforeEach(() => {
    loggedMessages = [];
    warnedMessages = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        loggedMessages.push(String(message));
      });
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        warnedMessages.push(String(message));
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: backfillKol resolves → per-KOL log, no warn, no skipped summary', async () => {
    const kol = buildActiveKol('123456789', 'TestKol');
    const kolRepo = new FakeKolRepository();
    kolRepo.kols.push(kol);
    const orchestrator = buildFakeOrchestrator({
      result: { ingested: 3, total: 5 },
      error: null,
    });
    const moduleRef = buildFakeModuleRef(kolRepo, orchestrator);
    const config = buildFakeConfig('development');

    const hook = new DevBackfillHook(config, moduleRef);
    await hook.onApplicationBootstrap();

    expect(orchestrator.backfillKol).toHaveBeenCalledWith('123456789', 5);
    expect(loggedMessages.some((m) => m.includes('+3/5 msgs'))).toBe(true);
    expect(loggedMessages.some((m) => m.includes('Dev backfill skipped'))).toBe(
      false,
    );
    expect(warnedMessages).toEqual([]);
  });

  it('PeerUser: backfillKol throws PeerUser → no per-KOL warn, single skipped summary', async () => {
    const kol = buildActiveKol('123456789', 'TestKol');
    const kolRepo = new FakeKolRepository();
    kolRepo.kols.push(kol);
    const orchestrator = buildFakeOrchestrator({
      result: { ingested: 0, total: 0 },
      error: new Error(
        'Could not find the input entity for {"userId":"123456789","className":"PeerUser"}',
      ),
    });
    const moduleRef = buildFakeModuleRef(kolRepo, orchestrator);
    const config = buildFakeConfig('development');

    const hook = new DevBackfillHook(config, moduleRef);
    await hook.onApplicationBootstrap();

    expect(orchestrator.backfillKol).toHaveBeenCalledWith('123456789', 5);
    expect(warnedMessages).toEqual([]);
    expect(
      loggedMessages.some(
        (m) =>
          m ===
          'Dev backfill skipped 1 KOL(s) (MTProto session not a member — join the channels to enable backfill).',
      ),
    ).toBe(true);
  });

  it('USER_NOT_PARTICIPANT: backfillKol throws USER_NOT_PARTICIPANT → no per-KOL warn, single skipped summary', async () => {
    const kol = buildActiveKol('123456789', 'TestKol');
    const kolRepo = new FakeKolRepository();
    kolRepo.kols.push(kol);
    const orchestrator = buildFakeOrchestrator({
      result: { ingested: 0, total: 0 },
      error: new Error('USER_NOT_PARTICIPANT for channel 123456789'),
    });
    const moduleRef = buildFakeModuleRef(kolRepo, orchestrator);
    const config = buildFakeConfig('development');

    const hook = new DevBackfillHook(config, moduleRef);
    await hook.onApplicationBootstrap();

    expect(orchestrator.backfillKol).toHaveBeenCalledWith('123456789', 5);
    expect(warnedMessages).toEqual([]);
    expect(
      loggedMessages.some(
        (m) =>
          m ===
          'Dev backfill skipped 1 KOL(s) (MTProto session not a member — join the channels to enable backfill).',
      ),
    ).toBe(true);
  });

  it('generic error: backfillKol throws → per-KOL warn fires, no skipped summary', async () => {
    const kol = buildActiveKol('123456789', 'TestKol');
    const kolRepo = new FakeKolRepository();
    kolRepo.kols.push(kol);
    const orchestrator = buildFakeOrchestrator({
      result: { ingested: 0, total: 0 },
      error: new Error('something else'),
    });
    const moduleRef = buildFakeModuleRef(kolRepo, orchestrator);
    const config = buildFakeConfig('development');

    const hook = new DevBackfillHook(config, moduleRef);
    await hook.onApplicationBootstrap();

    expect(orchestrator.backfillKol).toHaveBeenCalledWith('123456789', 5);
    expect(
      warnedMessages.some(
        (m) => m === '  123456789: backfill failed — something else',
      ),
    ).toBe(true);
    expect(loggedMessages.some((m) => m.includes('Dev backfill skipped'))).toBe(
      false,
    );
  });
});
