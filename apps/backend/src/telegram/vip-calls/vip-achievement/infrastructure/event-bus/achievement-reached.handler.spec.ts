/**
 * Workaround for pre-existing broken re-export chain in `telegram/shared/index.ts`
 * (line 25 references `in-process-publishing-event.publisher` which does not exist
 * in the repo). The handler imports `MessageFormatterPort` / `TelegramPublisherPort`
 * from `telegram/shared`, which would otherwise fail to load. We mock the module
 * here at the SPEC level (not in production) so the handler can be instantiated
 * in tests, while still providing the real abstract classes so test fakes can
 * extend them.
 */
jest.mock('telegram/shared', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const portMod = require('telegram/shared/domain/ports/telegram-publisher.port');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fmtMod = require('telegram/shared/domain/ports/message-formatter.port');
  return {
    TelegramPublisherPort: portMod.TelegramPublisherPort,
    MessageFormatterPort: fmtMod.MessageFormatterPort,
  };
});

import { AchievementReachedHandler } from './achievement-reached.handler';
import { CallAchievementReachedEvent } from 'token/achievement/domain/events/call-achievement-reached.event';
import { VipCallsMessageFormatterAdapter } from '../../../vip-channel/infrastructure/formatters/vip-message-formatter.adapter';
import { TelegramPublisherPort } from 'telegram/shared';
import {
  VipAchievementRecord,
  VipAchievementRepository,
} from '../../application/ports/vip-achievement.repository';

const CALL_ID = 'solana:ABC';
const CHAIN = 'solana';
const ADDRESS = 'ABC';
const MC_AT_CALL = 10_000;
const MC_NOW = 50_000;
const MULTIPLE = 5;
const MESSAGE_ID = 4242;

function makeEvent(
  overrides: Partial<{ multiple: number; mcNow: number; callId: string }> = {},
): CallAchievementReachedEvent {
  return new CallAchievementReachedEvent(CALL_ID, {
    callId: overrides.callId ?? CALL_ID,
    chain: CHAIN,
    address: ADDRESS,
    multiple: overrides.multiple ?? MULTIPLE,
    mcAtCall: MC_AT_CALL,
    mcNow: overrides.mcNow ?? MC_NOW,
    notifiedAt: new Date().toISOString(),
  });
}

class FakeVipAchievementRepository extends VipAchievementRepository {
  public saveResult: VipAchievementRecord | null = null;
  public saved: VipAchievementRecord[] = [];
  public updated: Array<{
    callId: string;
    threshold: number;
    messageId: number;
  }> = [];

  // `save` returns null to signal "already recorded" (atomic dedup).
  // Tests flip `saveResult` to simulate the concurrent-invocation case.
  async save(
    record: VipAchievementRecord,
  ): Promise<VipAchievementRecord | null> {
    if (this.saveResult === null && record.callId === '__force_null__') {
      return null;
    }
    if (this.saveResult) {
      this.saved.push(this.saveResult);
      return this.saveResult;
    }
    const persisted: VipAchievementRecord = {
      id: 'persisted-1',
      ...record,
    };
    this.saved.push(persisted);
    return persisted;
  }

  async updateTelegramMessageId(
    callId: string,
    threshold: number,
    messageId: number,
  ): Promise<void> {
    this.updated.push({ callId, threshold, messageId });
  }

  // Unused abstract members — required to keep TS happy.
  async findByCall(): Promise<VipAchievementRecord[]> {
    return [];
  }
  async findThresholdsForCall(): Promise<number[]> {
    return [];
  }
  async existsByCallAndThreshold(): Promise<boolean> {
    return false;
  }
  async countByCall(): Promise<number> {
    return 0;
  }
}

class FakeTelegramPublisher extends TelegramPublisherPort {
  public lastMessage = '';
  public okResult: {
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  } = { ok: true, messageId: MESSAGE_ID, error: null };

  async sendMessage(
    _chatId: string,
    text: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    this.lastMessage = text;
    return this.okResult;
  }

  async sendPhoto(): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    return { ok: false, messageId: null, error: 'stub' };
  }

  async sendMediaGroup(): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    return { ok: false, messageId: null, error: 'stub' };
  }

  async sendVideo(): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    return { ok: false, messageId: null, error: 'stub' };
  }
}

/**
 * The handler's `formatter` field is typed as `VipCallsMessageFormatterAdapter`
 * but resolved at runtime via the `MessageFormatterPort` token. For unit tests
 * we provide a minimal stub exposing only `formatMilestoneMessage` and cast it.
 */
function makeFormatter(): VipCallsMessageFormatterAdapter {
  return {
    formatMilestoneMessage: (input: {
      chain: string;
      address: string;
      multiple: number;
      mcAtCall: number;
      mcNow: number;
    }): string =>
      `🚀 MILESTONE ${input.multiple}x ${input.chain} ${input.address} mcAt=${input.mcAtCall} mcNow=${input.mcNow}`,
    // Unused abstract members from MessageFormatterPort — required to satisfy TS.
    format: () => '',
    formatKeyboard: () => null,
  } as unknown as VipCallsMessageFormatterAdapter;
}

function makeHandler(deps?: {
  repo?: FakeVipAchievementRepository;
  publisher?: FakeTelegramPublisher;
  formatter?: VipCallsMessageFormatterAdapter;
}): AchievementReachedHandler {
  const repo = deps?.repo ?? new FakeVipAchievementRepository();
  const publisher = deps?.publisher ?? new FakeTelegramPublisher();
  const formatter = deps?.formatter ?? makeFormatter();
  return new AchievementReachedHandler(formatter, publisher, repo);
}

describe('AchievementReachedHandler', () => {
  it('subscribes to CallAchievementReachedEvent', () => {
    expect(CallAchievementReachedEvent.EVENT_NAME).toBe(
      'achievement.call.reached',
    );
  });

  describe('happy path', () => {
    it('atomically saves → formats → sends → stamps telegramMessageId', async () => {
      const repo = new FakeVipAchievementRepository();
      const publisher = new FakeTelegramPublisher();
      const handler = makeHandler({ repo, publisher });

      await handler.handle(makeEvent());

      // 1. save called with the right record
      expect(repo.saved).toHaveLength(1);
      expect(repo.saved[0]).toMatchObject({
        callId: CALL_ID,
        threshold: MULTIPLE,
        telegramMessageId: null,
      });
      // 2. sendMessage was called with the formatted message
      expect(publisher.lastMessage).toContain(`MILESTONE ${MULTIPLE}x`);
      // 3. updateTelegramMessageId stamped with the returned id
      expect(repo.updated).toEqual([
        { callId: CALL_ID, threshold: MULTIPLE, messageId: MESSAGE_ID },
      ]);
    });

    it('does not stamp messageId when sendMessage returns ok=true but messageId=null', async () => {
      const repo = new FakeVipAchievementRepository();
      const publisher = new FakeTelegramPublisher();
      publisher.okResult = { ok: true, messageId: null, error: null };
      const handler = makeHandler({ repo, publisher });

      await handler.handle(makeEvent());

      expect(repo.updated).toHaveLength(0);
    });
  });

  describe('dedup path (atomic save returns null)', () => {
    it('returns without sending when the (callId, threshold) is already recorded', async () => {
      const repo = new FakeVipAchievementRepository();
      const publisher = new FakeTelegramPublisher();
      // Simulate concurrent invocation: save() returns null
      repo.saveResult = null;
      // Use a sentinel callId so the fake returns null
      const handler = makeHandler({ repo, publisher });

      await handler.handle(makeEvent({ callId: '__force_null__' }));

      // No send, no update — handler returned early
      expect(publisher.lastMessage).toBe('');
      expect(repo.updated).toHaveLength(0);
    });
  });

  describe('send failure path', () => {
    it('does NOT stamp telegramMessageId when publisher returns ok=false', async () => {
      const repo = new FakeVipAchievementRepository();
      const publisher = new FakeTelegramPublisher();
      publisher.okResult = {
        ok: false,
        messageId: null,
        error: 'telegram rate limit',
      };
      const handler = makeHandler({ repo, publisher });

      await handler.handle(makeEvent());

      // save happened, send was attempted, but update skipped
      expect(repo.saved).toHaveLength(1);
      expect(publisher.lastMessage).not.toBe('');
      expect(repo.updated).toHaveLength(0);
    });
  });

  describe('general error path', () => {
    it('catches unexpected errors thrown by the repository and does not propagate', async () => {
      const repo = new FakeVipAchievementRepository();
      repo.save = (): Promise<VipAchievementRecord | null> => {
        throw new Error('postgres down');
      };
      const publisher = new FakeTelegramPublisher();
      const handler = makeHandler({ repo, publisher });

      // Should not throw — handler logs and swallows
      await expect(handler.handle(makeEvent())).resolves.toBeUndefined();

      // Publisher was never reached
      expect(publisher.lastMessage).toBe('');
      expect(repo.updated).toHaveLength(0);
    });

    it('catches unexpected errors thrown by the publisher', async () => {
      const repo = new FakeVipAchievementRepository();
      const publisher = new FakeTelegramPublisher();
      publisher.sendMessage = (): Promise<{
        readonly ok: boolean;
        readonly messageId: number | null;
        readonly error: string | null;
      }> => {
        throw new Error('network blip');
      };
      const handler = makeHandler({ repo, publisher });

      await expect(handler.handle(makeEvent())).resolves.toBeUndefined();

      // save happened, send threw, update skipped
      expect(repo.saved).toHaveLength(1);
      expect(repo.updated).toHaveLength(0);
    });
  });
});
