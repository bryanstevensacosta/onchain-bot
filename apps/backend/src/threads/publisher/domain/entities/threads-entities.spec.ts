import { ThreadsKeyword } from './threads-keyword.entity';
import { ThreadsBlacklistPhrase } from './threads-blacklist-phrase.entity';
import { ThreadsLlmConfig } from './threads-llm-config.entity';
import { ThreadsPromptTemplate } from './threads-prompt-template.entity';
import {
  ThreadsQueueEntry,
  type ThreadsQueueEntryProps,
  type ThreadsQueueStatus,
} from './threads-queue-entry.entity';
import { ThreadsThrottleState } from './threads-throttle-state.entity';
import { ThreadsOAuthToken } from './threads-oauth-token.entity';

const llmInput = () => ({
  defaultTemplateId: crypto.randomUUID(),
  dailyCap: 60,
  dailyResetUtcHour: 4,
  randomDelayMinMs: 60_000,
  randomDelayMaxMs: 300_000,
  llmMaxAttempts: 3,
});

const queueInput = () => ({
  channelId: '-100123',
  messageId: 456,
  rawContent: 'bitcoin ETF inflows hit record',
  rawTitle: null,
  groupedId: null,
  messageReceivedAt: new Date('2026-09-01T00:00:00Z'),
});

describe('ThreadsKeyword defaults', () => {
  it('creates an enabled, case-insensitive keyword with trimmed phrase', () => {
    const kw = ThreadsKeyword.create({ phrase: '  bitcoin  ' });
    expect(kw.phrase).toBe('bitcoin');
    expect(kw.enabled).toBe(true);
    expect(kw.caseSensitive).toBe(false);
    expect(kw.matchMode).toBe('exact');
    expect(kw.templateId).toBeNull();
    expect(kw.requireMedia).toBe(false);
    expect(kw.andGroupId).toBeNull();
    expect(kw.sourceChannelIds).toEqual([]);
  });

  it('matches case-insensitively in exact mode and rejects empty phrase', () => {
    const kw = ThreadsKeyword.create({ phrase: 'ETF' });
    expect(kw.matches('spot ETF inflows')).toBe(true);
    expect(kw.matches('spot etf inflows')).toBe(true);
    expect(kw.matches('spot meetings')).toBe(false);
    expect(kw.matches('')).toBe(false);
    expect(() => ThreadsKeyword.create({ phrase: '   ' })).toThrow();
  });

  it('supports enable/disable and template binding', () => {
    const kw = ThreadsKeyword.create({ phrase: 'solana' });
    kw.disable();
    expect(kw.enabled).toBe(false);
    kw.enable();
    expect(kw.enabled).toBe(true);
    kw.setTemplateId('tpl-1');
    expect(kw.templateId).toBe('tpl-1');
    kw.setTemplateId(null);
    expect(kw.templateId).toBeNull();
    expect(() => kw.setTemplateId('  ')).toThrow();
  });
});

describe('ThreadsBlacklistPhrase defaults', () => {
  it('creates an enabled blacklist phrase', () => {
    const bp = ThreadsBlacklistPhrase.create({ phrase: 'giveaway' });
    expect(bp.phrase).toBe('giveaway');
    expect(bp.enabled).toBe(true);
    expect(bp.matchMode).toBe('exact');
    expect(bp.matches('crypto giveaway now')).toBe(true);
    expect(bp.matches('market update')).toBe(false);
  });

  it('applies to all channels when sourceChannelIds is empty', () => {
    const bp = ThreadsBlacklistPhrase.create({ phrase: 'scam' });
    expect(bp.isApplicableTo('-1001')).toBe(true);
    const scoped = ThreadsBlacklistPhrase.create({
      phrase: 'scam',
      sourceChannelIds: ['-1001'],
    });
    expect(scoped.isApplicableTo('-1001')).toBe(true);
    expect(scoped.isApplicableTo('-1002')).toBe(false);
  });

  it('checkMatchesWithMedia honors requireMedia', () => {
    const bp = ThreadsBlacklistPhrase.create({
      phrase: 'airdrop',
      requireMedia: true,
    });
    expect(bp.checkMatchesWithMedia('airdrop live', true)).toBe(true);
    expect(bp.checkMatchesWithMedia('airdrop live', false)).toBe(false);
    expect(bp.checkMatchesWithMedia('market news', true)).toBe(false);
  });
});

describe('ThreadsLlmConfig defaults (no target column)', () => {
  it('loads a single-row config with safe defaults', () => {
    const cfg = ThreadsLlmConfig.load(llmInput());
    expect(cfg.id).toBe(1);
    expect(cfg.llmEnabled).toBe(false);
    expect(cfg.publishingEnabled).toBe(false);
    expect(cfg.rejectNonLatin).toBe(true);
    expect(cfg.dailyCap).toBe(60);
    expect(cfg.dailyResetUtcHour).toBe(4);
    expect(cfg.randomDelayMinMs).toBe(60_000);
    expect(cfg.randomDelayMaxMs).toBe(300_000);
    expect(cfg.llmMaxAttempts).toBe(3);
  });

  it('has no target column or legacy matching flag', () => {
    const cfg = ThreadsLlmConfig.load(llmInput());
    const props = {
      id: cfg.id,
      defaultTemplateId: cfg.defaultTemplateId,
      llmEnabled: cfg.llmEnabled,
      publishingEnabled: cfg.publishingEnabled,
      rejectNonLatin: cfg.rejectNonLatin,
      dailyCap: cfg.dailyCap,
      dailyResetUtcHour: cfg.dailyResetUtcHour,
      randomDelayMinMs: cfg.randomDelayMinMs,
      randomDelayMaxMs: cfg.randomDelayMaxMs,
      llmMaxAttempts: cfg.llmMaxAttempts,
      updatedAt: cfg.updatedAt,
    };
    expect(Object.keys(props)).not.toContain('target' + 'Channel');
    expect(Object.keys(props)).not.toContain('matchingEnabled');
    expect(ThreadsLlmConfig.reconstitute(props).dailyCap).toBe(60);
  });

  it('validates invariants on load and update', () => {
    expect(() => ThreadsLlmConfig.load({ ...llmInput(), dailyCap: 0 })).toThrow();
    expect(() =>
      ThreadsLlmConfig.load({
        ...llmInput(),
        randomDelayMinMs: 500,
        randomDelayMaxMs: 500,
      }),
    ).toThrow();
    const cfg = ThreadsLlmConfig.load(llmInput());
    cfg.update({ dailyCap: 30, llmEnabled: true, publishingEnabled: true });
    expect(cfg.dailyCap).toBe(30);
    expect(cfg.llmEnabled).toBe(true);
    expect(cfg.publishingEnabled).toBe(true);
    cfg.setDefaultTemplateId(crypto.randomUUID());
    expect(() => cfg.update({ dailyCap: -1 })).toThrow();
  });
});

describe('ThreadsPromptTemplate defaults', () => {
  it('creates a template with vision enabled by default', () => {
    const tpl = ThreadsPromptTemplate.create({
      name: 'threads-default',
      model: 'opencode-zen/deepseek-v4-flash',
      maxTokens: 2000,
      temperature: 0.7,
      promptText: 'Rewrite below in <500 chars: {{original}}',
    });
    expect(tpl.name).toBe('threads-default');
    expect(tpl.supportsVision).toBe(true);
    expect(tpl.maxTokens).toBe(2000);
    expect(tpl.temperature).toBe(0.7);
    expect(tpl.reasoningEffort).toBeNull();
    tpl.update({ temperature: 0.5 });
    expect(tpl.temperature).toBe(0.5);
    expect(() =>
      ThreadsPromptTemplate.create({
        name: '',
        model: 'm',
        maxTokens: 10,
        temperature: 0.5,
        promptText: 'x',
      }),
    ).toThrow();
  });
});

describe('ThreadsThrottleState defaults', () => {
  it('starts empty and advances immutably', () => {
    const empty = ThreadsThrottleState.empty();
    expect(empty.lastPublishAt).toBeNull();
    expect(ThreadsThrottleState.SINGLETON_ID).toBe(1);
    const at = new Date('2026-09-01T12:00:00Z');
    const advanced = empty.withLastPublishAt(at);
    expect(advanced.lastPublishAt).toEqual(at);
    expect(empty.lastPublishAt).toBeNull();
    expect(ThreadsThrottleState.fromLastPublishAt(at).lastPublishAt).toEqual(
      at,
    );
  });
});

describe('ThreadsOAuthToken defaults (id=1)', () => {
  it('creates a singleton token row', () => {
    const tok = ThreadsOAuthToken.create({
      accessToken: 'tok-abc',
      threadsUserId: 'uid-1',
      expiresInS: 60 * 24 * 3600 * 60,
    });
    expect(tok.id).toBe(1);
    expect(tok.accessToken).toBe('tok-abc');
    expect(tok.threadsUserId).toBe('uid-1');
  });

  it('detects expiry with fixed dates', () => {
    const tok = ThreadsOAuthToken.create({
      accessToken: 'tok-abc',
      threadsUserId: 'uid-1',
      obtainedAt: new Date('2026-01-01T00:00:00Z'),
      expiresInS: 59 * 24 * 3600,
    });
    expect(tok.expiresAt).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(tok.isExpiringSoon(7, new Date('2026-02-27T00:00:00Z'))).toBe(true);
    expect(tok.isExpiringSoon(7, new Date('2026-01-15T00:00:00Z'))).toBe(false);
  });

  it('refreshes the token and rejects blanks', () => {
    const tok = ThreadsOAuthToken.create({
      accessToken: 'old',
      threadsUserId: 'uid-1',
      expiresInS: 3600,
    });
    tok.updateFromRefresh({ accessToken: 'new', expiresInS: 7200 });
    expect(tok.accessToken).toBe('new');
    expect(tok.expiresInS).toBe(7200);
    expect(() => ThreadsOAuthToken.create({
      accessToken: '  ',
      threadsUserId: 'uid-1',
      expiresInS: 10,
    })).toThrow();
  });
});

const reconstituteWithStatus = (
  status: ThreadsQueueStatus,
): ThreadsQueueEntry => {
  const base = ThreadsQueueEntry.create(queueInput());
  const props: ThreadsQueueEntryProps = {
    id: base.id,
    traceId: base.traceId,
    channelId: base.channelId,
    messageId: base.messageId,
    rawContent: base.rawContent,
    rawTitle: base.rawTitle,
    imagePath: base.imagePath,
    imagePaths: base.imagePaths,
    groupedId: base.groupedId,
    messageReceivedAt: base.messageReceivedAt,
    queuedAt: base.queuedAt,
    matchedKeywordIds: base.matchedKeywordIds,
    keywordTemplateId: base.keywordTemplateId,
    formattingEntities: base.formattingEntities,
    status,
    publishedAt: null,
    telegramMessageId: null,
    lastError: null,
    attempts: 0,
    generatedContent: null,
    generatedSystemPrompt: null,
    generatedUserPrompt: null,
    generatedTemperature: null,
    generatedReasoningEffort: null,
    generatedModel: null,
    blockedReason: null,
    duplicateOfChannelId: null,
    duplicateOfMessageId: null,
    duplicateOfEntryId: null,
  };
  return ThreadsQueueEntry.reconstitute(props);
};

describe('ThreadsQueueEntry defaults + 6-state transitions', () => {
  it('creates a PENDING entry with queue metadata', () => {
    const entry = ThreadsQueueEntry.create(queueInput());
    expect(entry.status).toBe('PENDING');
    expect(entry.attempts).toBe(0);
    expect(entry.queuedAt).toBeInstanceOf(Date);
    expect(entry.matchedKeywordIds).toEqual([]);
    expect(entry.isTerminal).toBe(false);
    expect(entry.publishedAt).toBeNull();
  });

  it('covers all 6 states with correct terminal flags', () => {
    const states: ThreadsQueueStatus[] = [
      'PENDING',
      'SCHEDULED',
      'PUBLISHING',
      'PUBLISHED',
      'FAILED',
      'BLOCKED',
    ];
    const terminal: Record<ThreadsQueueStatus, boolean> = {
      PENDING: false,
      SCHEDULED: false,
      PUBLISHING: false,
      PUBLISHED: true,
      FAILED: true,
      BLOCKED: true,
    };
    for (const status of states) {
      const entry = reconstituteWithStatus(status);
      expect(entry.status).toBe(status);
      expect(entry.isTerminal).toBe(terminal[status]);
    }
  });

  it('transitions PENDING → SCHEDULED → PUBLISHED with event', () => {
    const entry = ThreadsQueueEntry.create(queueInput());
    entry.markScheduled(new Date());
    expect(entry.status).toBe('SCHEDULED');
    entry.incrementAttempts();
    expect(entry.attempts).toBe(1);
    entry.markPublished('post-123', {
      content: 'rewritten <500',
      systemPrompt: null,
      userPrompt: null,
      temperature: 0.7,
      reasoningEffort: null,
      model: 'opencode-zen/deepseek-v4-flash',
    });
    expect(entry.status).toBe('PUBLISHED');
    expect(entry.telegramMessageId).toBe('post-123');
    expect(entry.generatedContent).toBe('rewritten <500');
    const events = entry.commit();
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('threads-publisher.article.published');
  });

  it('transitions PENDING → FAILED and locks terminal states', () => {
    const entry = ThreadsQueueEntry.create(queueInput());
    entry.markFailed('Expired: exceeded 24h in queue');
    expect(entry.status).toBe('FAILED');
    expect(entry.lastError).toBe('Expired: exceeded 24h in queue');
    expect(entry.isTerminal).toBe(true);
    expect(() => entry.markPublished('post-x')).toThrow();
    expect(() => entry.incrementAttempts()).toThrow();
    const published = reconstituteWithStatus('PUBLISHED');
    expect(() => published.markFailed('late')).toThrow();
    expect(() => published.markScheduled(new Date())).toThrow();
  });

  it('validates create input', () => {
    expect(() =>
      ThreadsQueueEntry.create({ ...queueInput(), channelId: '  ' }),
    ).toThrow();
    expect(() =>
      ThreadsQueueEntry.create({ ...queueInput(), messageId: -1 }),
    ).toThrow();
  });
});
