import { TemplateBot } from '../../../template/domain/entities/template-bot.entity';
import { InMemoryTemplateBotRepository } from '../../../template/infrastructure/repositories/in-memory-template-bot.repository';
import { ErrorCode } from 'shared/kernel/domain-error';
import { PublishingSession } from '../../domain/entities/publishing-session.entity';
import {
  isBotAuthorizedFor,
  SessionPublishAuthorizer,
} from './session-publish-authorizer.service';

function verifiedBot(
  id: string,
  target: 'telegram' | 'threads',
  channel: string,
): TemplateBot {
  const bot = TemplateBot.create({
    id,
    label: id,
    target,
    tokenCiphertext: 'iv:tag:data',
    defaultChatId: channel,
  });
  bot.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
  return bot;
}

describe('SessionPublishAuthorizer (todo 14, P50)', () => {
  it('authorizes the bound session x target with a verified channel', async () => {
    const bots = new InMemoryTemplateBotRepository();
    await bots.save(verifiedBot('tg-1', 'telegram', '@news'));
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'News',
      telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
    });
    const bot = await authorizer.authorize(
      session,
      'telegram',
      'tg-1',
      '@news',
    );
    expect(bot.id).toBe('tg-1');
  });

  it('rejects unpublished sessions (publishing switch off) as foreign', async () => {
    const bots = new InMemoryTemplateBotRepository();
    await bots.save(verifiedBot('tg-1', 'telegram', '@news'));
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'Off',
      publishingEnabled: false,
      telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
    });
    await expect(
      authorizer.authorize(session, 'telegram', 'tg-1', '@news'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('rejects bindings the session never made (cross-session bot reuse)', async () => {
    const bots = new InMemoryTemplateBotRepository();
    await bots.save(verifiedBot('tg-1', 'telegram', '@news'));
    await bots.save(verifiedBot('tg-2', 'telegram', '@other'));
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'News',
      telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
    });
    await expect(
      authorizer.authorize(session, 'telegram', 'tg-2', '@other'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('rejects unknown bot ids as foreign (no existence leak)', async () => {
    const bots = new InMemoryTemplateBotRepository();
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'News',
      telegramTargets: [{ botId: 'ghost', chatId: '@news' }],
    });
    await expect(
      authorizer.authorize(session, 'telegram', 'ghost', '@news'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('rejects unverified bots (admin verification required)', async () => {
    const bots = new InMemoryTemplateBotRepository();
    await bots.save(
      TemplateBot.create({
        id: 'tg-raw',
        label: 'Raw',
        target: 'telegram',
        tokenCiphertext: 'iv:tag:data',
        defaultChatId: '@news',
      }),
    );
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'News',
      telegramTargets: [{ botId: 'tg-raw', chatId: '@news' }],
    });
    await expect(
      authorizer.authorize(session, 'telegram', 'tg-raw', '@news'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('rejects target mismatches (telegram bot on the threads target)', async () => {
    const bots = new InMemoryTemplateBotRepository();
    await bots.save(verifiedBot('tg-1', 'telegram', '@news'));
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'Mixed',
      threadsTargets: [{ botId: 'tg-1', chatId: '@news' }],
    });
    await expect(
      authorizer.authorize(session, 'threads', 'tg-1', '@news'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('rejects channel hijacks (chatId outside the verified channel)', async () => {
    const bots = new InMemoryTemplateBotRepository();
    await bots.save(verifiedBot('tg-1', 'telegram', '@news'));
    const authorizer = new SessionPublishAuthorizer(bots);
    const session = PublishingSession.create({
      name: 'News',
      telegramTargets: [{ botId: 'tg-1', chatId: '@evil' }],
    });
    await expect(
      authorizer.authorize(session, 'telegram', 'tg-1', '@evil'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('isBotAuthorizedFor mirrors the same rules for the cron path', () => {
    const bot = verifiedBot('tg-1', 'telegram', '@news');
    expect(isBotAuthorizedFor(bot, 'telegram', '@news')).toBe(true);
    expect(isBotAuthorizedFor(bot, 'telegram', '@evil')).toBe(false);
    expect(isBotAuthorizedFor(bot, 'threads', '@news')).toBe(false);
    const unverified = TemplateBot.create({
      id: 'tg-raw',
      label: 'Raw',
      target: 'telegram',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@news',
    });
    expect(isBotAuthorizedFor(unverified, 'telegram', '@news')).toBe(false);
  });
});
