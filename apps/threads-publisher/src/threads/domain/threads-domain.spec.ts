import { ThreadsKeyword } from './threads-keyword.entity';
import { ThreadsBlacklistPhrase } from './threads-blacklist-phrase.entity';
import {
  DEFAULT_THREADS_LLM_MODEL,
  ThreadsLlmConfig,
  resolveThreadsLlmModel,
} from './threads-llm-config.entity';
import { ThreadsPromptTemplate } from './threads-prompt-template.entity';
import { ThreadsThrottleState } from './threads-throttle-state.entity';

describe('threads domain parity', () => {
  it('matches AND-groups', () => {
    const kw = new ThreadsKeyword({ id: 'k1', phrase: 'bitcoin, etf' });
    expect(kw.matchesText('Bitcoin ETF approved')).toBe(true);
    expect(kw.matchesText('Bitcoin only')).toBe(false);
  });

  it('blocks on blacklist', () => {
    const bl = new ThreadsBlacklistPhrase('b1', 'scam');
    expect(bl.blocksText('this is a SCAM')).toBe(true);
    expect(bl.blocksText('legit news')).toBe(false);
  });

  it('gates LLM on llm AND publishing', () => {
    const full = new ThreadsLlmConfig({
      llmEnabled: true,
      publishingEnabled: true,
      rejectNonLatin: false,
      dailyCap: 60,
      llmMaxAttempts: 3,
      model: resolveThreadsLlmModel(),
    });
    expect(full.shouldGenerateLlm()).toBe(true);
    const paused = new ThreadsLlmConfig({
      llmEnabled: true,
      publishingEnabled: false,
      rejectNonLatin: false,
      dailyCap: 60,
      llmMaxAttempts: 3,
      model: resolveThreadsLlmModel(),
    });
    expect(paused.shouldGenerateLlm()).toBe(false);
  });

  it('seeds threads-default from env-configured model (no pinned provider)', () => {
    expect(DEFAULT_THREADS_LLM_MODEL).not.toContain('/');
    const prev = process.env.THREADS_LLM_MODEL;
    try {
      delete process.env.THREADS_LLM_MODEL;
      const view = ThreadsPromptTemplate.defaultSeed().toView();
      expect(view.model).toBe(DEFAULT_THREADS_LLM_MODEL);
      expect(view.maxTokens).toBe(2000);
      expect(view.temperature).toBe(0.7);
      expect(view.vision).toBe(false);
      expect(ThreadsLlmConfig.default().toView().model).toBe(
        DEFAULT_THREADS_LLM_MODEL,
      );
      process.env.THREADS_LLM_MODEL = 'env-model';
      expect(ThreadsPromptTemplate.defaultSeed().toView().model).toBe(
        'env-model',
      );
      expect(ThreadsLlmConfig.default().toView().model).toBe('env-model');
      expect(
        ThreadsPromptTemplate.defaultSeed('explicit-model').toView().model,
      ).toBe('explicit-model');
    } finally {
      if (prev === undefined) {
        delete process.env.THREADS_LLM_MODEL;
      } else {
        process.env.THREADS_LLM_MODEL = prev;
      }
    }
  });

  it('enforces throttle bounds', () => {
    const state = new ThreadsThrottleState();
    const now = new Date();
    expect(state.canPublish(now, 60, 60_000)).toBe(true);
    state.recordPublish(now);
    expect(state.canPublish(now, 60, 60_000)).toBe(false);
    expect(
      state.canPublish(new Date(now.getTime() + 300_000), 60, 60_000),
    ).toBe(true);
  });
});
