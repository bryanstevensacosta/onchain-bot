/* eslint-disable @typescript-eslint/unbound-method */
import { TokenFilteredEvent } from 'token/token-gating/domain/events/token-filtered.event';
import { TokenApprovedPublishHandler } from './token-approved-publish.handler';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';

function makeEvent(): TokenFilteredEvent {
  return new TokenFilteredEvent({
    chain: 'solana',
    address: 'ABC123',
    score: 80,
    classification: 'GOOD',
    decidedAt: new Date(),
  });
}

describe('TokenApprovedPublishHandler', () => {
  it('subscribes to filters.token.approved', () => {
    expect(TokenFilteredEvent.EVENT_NAME).toBe('filters.token.approved');
  });

  it('invokes publish.execute with chain, address, score, classification from event', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'call-1' });
    const handler = new TokenApprovedPublishHandler({
      execute,
    } as unknown as VipCallsPublishUseCase);

    await handler.handle(makeEvent());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: 'ABC123',
      score: 80,
      classification: 'GOOD',
    });
  });

  it('swallows publish errors and logs warning (does not throw)', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('telegram down'));
    const handler = new TokenApprovedPublishHandler({
      execute,
    } as unknown as VipCallsPublishUseCase);

    await expect(handler.handle(makeEvent())).resolves.toBeUndefined();
  });
});