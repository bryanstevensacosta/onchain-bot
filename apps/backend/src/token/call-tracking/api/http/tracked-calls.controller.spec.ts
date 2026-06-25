import { Test, TestingModule } from '@nestjs/testing';
import { TrackedCallsController } from './tracked-calls.controller';
import { ListTrackedCallsUseCase } from 'token/call-tracking/application/handlers/list-tracked-calls.use-case';
import { GetTrackedCallUseCase } from 'token/call-tracking/application/handlers/get-tracked-call.use-case';
import { CanRepublishTokenUseCase } from 'token/call-tracking/application/handlers/can-republish-token.use-case';
import { TrackedPublishedCallRepository } from 'token/call-tracking/application/ports/tracked-published-call.repository';
import { SettingsService } from 'settings/application/services/settings.service';

class StubTrackedRepo extends TrackedPublishedCallRepository {
  records = new Map<string, Record<string, unknown>>();
  async findByChainAndAddress(chain: string, address: string) {
    const key = `${chain}:${address.toLowerCase()}`;
    return (this.records.get(key) as never) ?? null;
  }
  async findActive(limit: number) {
    return Array.from(this.records.values()).slice(0, limit) as never;
  }
  async findMany() {
    return Array.from(this.records.values()) as never;
  }
  async save() {
    throw new Error('not used');
  }
}

describe('TrackedCallsController', () => {
  let controller: TrackedCallsController;
  let repo: StubTrackedRepo;
  let settings: { getFiltersByType: jest.Mock };

  beforeEach(async () => {
    repo = new StubTrackedRepo();
    settings = { getFiltersByType: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackedCallsController],
      providers: [
        ListTrackedCallsUseCase,
        GetTrackedCallUseCase,
        CanRepublishTokenUseCase,
        { provide: TrackedPublishedCallRepository, useValue: repo },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    controller = module.get(TrackedCallsController);
  });

  it('GET /tracked returns mapped list', async () => {
    repo.records.set('solana:abc', {
      id: 'solana:abc',
      kolId: 'kol_x',
      chain: 'solana',
      address: 'abc',
      ticker: 'WIF',
      mcAtPublish: 1000,
      mcNow: 2000,
      milestonesHit: [2],
      maxMilestone: 2,
      priceDropPercent: 100,
      publishedAt: new Date('2026-06-24T10:00:00Z'),
      lastUpdatedAt: new Date('2026-06-24T11:00:00Z'),
      isActive: true,
    });
    const out = await controller.list({});
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].id).toBe('solana:abc');
    expect(out[0].publishedAt).toBe('2026-06-24T10:00:00.000Z');
  });

  it('GET /tracked/:chain/:address returns single record', async () => {
    repo.records.set('solana:abc', {
      id: 'solana:abc',
      kolId: 'kol_x',
      chain: 'solana',
      address: 'abc',
      ticker: null,
      mcAtPublish: 1000,
      mcNow: null,
      milestonesHit: [],
      maxMilestone: null,
      priceDropPercent: null,
      publishedAt: new Date(),
      lastUpdatedAt: new Date(),
      isActive: true,
    });
    const out = await controller.get('solana', 'abc');
    expect(out.id).toBe('solana:abc');
  });

  it('GET /tracked/:chain/:address throws NotFound when missing', async () => {
    await expect(controller.get('solana', 'missing')).rejects.toThrow();
  });

  it('POST /gate-allow returns allowed result', async () => {
    settings.getFiltersByType.mockResolvedValue([
      { value: 'tracking_enabled', numericValue: 1 },
      { value: 'milestone_min_hours_ago', numericValue: 72 },
      { value: 'milestone_min_multiple', numericValue: 2 },
      { value: 'price_drop_max_percent', numericValue: 90 },
    ]);
    repo.records.set('solana:abc', {
      id: 'solana:abc',
      kolId: 'kol_x',
      chain: 'solana',
      address: 'abc',
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 5000,
      milestonesHit: [2, 5],
      maxMilestone: 5,
      priceDropPercent: 400,
      publishedAt: new Date(),
      lastUpdatedAt: new Date(),
      isActive: true,
    });
    const out = await controller.gateAllow({ chain: 'solana', address: 'abc' });
    expect(out.allowed).toBe(true);
  });
});
