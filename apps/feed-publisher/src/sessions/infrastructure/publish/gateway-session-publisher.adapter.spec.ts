import { GatewaySessionPublisher } from './gateway-session-publisher.adapter';
import type { SessionPublishPlan } from '@/sessions/application/ports/session-publisher.port';
import type { TargetDispatcherPort } from '@/target/application/ports/target-dispatcher.port';

function makeDispatcher(result: { ok: boolean }): {
  dispatcher: { dispatch: jest.Mock };
  plans: SessionPublishPlan[];
} {
  const plans: SessionPublishPlan[] = [];
  const dispatcher = {
    dispatch: jest
      .fn()
      .mockImplementation(
        (input: {
          target: SessionPublishPlan['target'];
          botId: string;
          chatId: string;
          content: string;
        }) => {
          plans.push({
            sessionId: 's1',
            target: input.target,
            botId: input.botId,
            chatId: input.chatId,
            mode: 'raw',
            content: input.content,
          });
          return Promise.resolve(
            result.ok
              ? { ok: true, remoteId: 'vault-777' }
              : { ok: false, error: 'target boom', held: false },
          );
        },
      ),
  };
  return { dispatcher, plans };
}

describe('GatewaySessionPublisher', () => {
  it('delegates plans to the target dispatcher (sessions keep working)', async () => {
    const { dispatcher } = makeDispatcher({ ok: true });
    const publisher = new GatewaySessionPublisher(dispatcher);
    await publisher.publish({
      sessionId: 's1',
      target: 'telegram',
      botId: 'local-bot-9',
      chatId: '@c',
      mode: 'raw',
      content: 'hello session',
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'telegram',
        botId: 'local-bot-9',
        chatId: '@c',
        content: 'hello session',
      }),
    );
  });

  it('routes threads plans to the threads leg (todo 10)', async () => {
    const { dispatcher } = makeDispatcher({ ok: true });
    const publisher = new GatewaySessionPublisher(dispatcher);
    await publisher.publish({
      sessionId: 's1',
      target: 'threads',
      botId: 'th-1',
      chatId: '@digest',
      mode: 'llm',
      content: 'hello threads',
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'threads', botId: 'th-1' }),
    );
  });

  it('fail-closes dispatcher errors with a throw (audited upstream)', async () => {
    const { dispatcher } = makeDispatcher({ ok: false });
    const publisher = new GatewaySessionPublisher(dispatcher);
    await expect(
      publisher.publish({
        sessionId: 's1',
        target: 'telegram',
        botId: 'local-bot-9',
        chatId: '@c',
        mode: 'raw',
        content: 'hello session',
      }),
    ).rejects.toThrow('target boom');
  });

  it('fail-closes when the target dispatcher is unwired', async () => {
    const publisher = new GatewaySessionPublisher();
    await expect(
      publisher.publish({
        sessionId: 's1',
        target: 'telegram',
        botId: 'b',
        chatId: '@c',
        mode: 'raw',
        content: 'hi',
      }),
    ).rejects.toThrow('unwired');
  });
});
