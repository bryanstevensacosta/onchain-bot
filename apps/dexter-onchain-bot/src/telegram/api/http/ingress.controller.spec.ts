import { ForbiddenException } from '@nestjs/common';
import { DexterIngressController } from './ingress.controller';

const UPDATE = {
  update_id: 1,
  message: {
    message_id: 2,
    date: 1700000000,
    chat: { id: 42, type: 'private' },
    from: { id: 7, is_bot: false, first_name: 'Test' },
    text: '/start',
  },
};

function makeController(ingressSecret: string | null) {
  const botConfig = { get: () => ({ ingressSecret }) };
  const router = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const controller = new DexterIngressController(
    botConfig as never,
    router as never,
  );
  return { controller, router };
}

describe('DexterIngressController (dexter gateway todo 6)', () => {
  it('fans out gateway updates to the router with 201', async () => {
    const { controller, router } = makeController('s3cret');
    const out = await controller.handle(UPDATE as never, 'vault-9', 's3cret');
    expect(out).toEqual({ ok: true });
    expect(router.dispatch).toHaveBeenCalledTimes(1);
  });

  it('rejects missing gateway marker and wrong secrets', async () => {
    const { controller, router } = makeController('s3cret');
    await expect(
      controller.handle(UPDATE as never, undefined, 's3cret'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.handle(UPDATE as never, 'vault-9', 'wrong'),
    ).rejects.toThrow(ForbiddenException);
    expect(router.dispatch).not.toHaveBeenCalled();
  });

  it('acks dispatch errors without retry-storming (201)', async () => {
    const botConfig = { get: () => ({ ingressSecret: 's3cret' }) };
    const router = {
      dispatch: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const controller = new DexterIngressController(
      botConfig as never,
      router as never,
    );
    const out = await controller.handle(UPDATE as never, 'vault-9', 's3cret');
    expect(out).toEqual({ ok: true });
  });

  it('accepts unsigned fan-out when no secret is configured (dev only)', async () => {
    const { controller, router } = makeController(null);
    const out = await controller.handle(UPDATE as never, 'vault-9', undefined);
    expect(out).toEqual({ ok: true });
    expect(router.dispatch).toHaveBeenCalledTimes(1);
  });
});
