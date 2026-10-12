import { BadRequestException } from '@nestjs/common';
import { DeliveryPoliciesController } from './delivery-policies.controller';
import { InMemorySchedulingConfigRepository } from '@/scheduling/infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';

function makeController(): DeliveryPoliciesController {
  const repo = new InMemorySchedulingConfigRepository();
  return new DeliveryPoliciesController(repo);
}

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err as BadRequestException).getStatus?.() ?? null;
  }
}

/**
 * R-c DeliveryPoliciesController seam (failing-first): canonical
 * per-target routes (`GET/PATCH
 * /api/scheduling/delivery-policies/:target`, 400 on unknown target)
 * over the in-memory (mocked) `SchedulingConfigRepository`.
 */
describe('DeliveryPoliciesController (R-c)', () => {
  it('GET :target returns the seeded policy view', async () => {
    const controller = makeController();
    await expect(controller.get('telegram')).resolves.toEqual({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      dailyCap: 20,
      resetHour: 0,
    });
    await expect(controller.get('threads')).resolves.toEqual({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      dailyCap: 20,
      resetHour: 0,
    });
  });

  it('GET unknown target fails 400', async () => {
    const controller = makeController();
    await expect(statusOf(controller.get('sms'))).resolves.toBe(400);
  });

  it('PATCH :target updates one target without touching the sibling', async () => {
    const controller = makeController();
    const updated = await controller.update('telegram', {
      delayMinMs: 1_000,
      delayMaxMs: 2_000,
      dailyCap: 3,
      resetHour: 5,
    });
    expect(updated).toEqual({
      delayMinMs: 1_000,
      delayMaxMs: 2_000,
      dailyCap: 3,
      resetHour: 5,
    });
    await expect(controller.get('threads')).resolves.toEqual({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      dailyCap: 20,
      resetHour: 0,
    });
  });

  it('PATCH unknown target fails 400', async () => {
    const controller = makeController();
    await expect(
      statusOf(controller.update('sms', { dailyCap: 1 })),
    ).resolves.toBe(400);
  });

  it('PATCH inverted range fails 400', async () => {
    const controller = makeController();
    await expect(
      statusOf(
        controller.update('telegram', {
          delayMinMs: 9_000,
          delayMaxMs: 1_000,
        }),
      ),
    ).resolves.toBe(400);
  });
});
