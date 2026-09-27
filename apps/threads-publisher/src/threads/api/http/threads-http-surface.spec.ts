import { ThreadsKeywordsController } from './threads-keywords.controller';
import { ThreadsBlacklistController } from './threads-blacklist.controller';
import { ThreadsLlmConfigController } from './threads-llm-config.controller';
import { ThreadsMatchingController } from './threads-matching.controller';
import { FeedThreadsController } from 'feed-threads/api/http/feed-threads.controller';
import { HealthController } from 'health/api/http/health.controller';

describe('threads http surface', () => {
  it('keywords CRUD roundtrip', async () => {
    const ctrl = new ThreadsKeywordsController();
    const created = (await ctrl.create({ phrase: 'bitcoin' })) as { id: string };
    expect((await ctrl.list()).length).toBe(1);
    await ctrl.remove(created.id);
    expect((await ctrl.list()).length).toBe(0);
  });

  it('blacklist CRUD roundtrip', async () => {
    const ctrl = new ThreadsBlacklistController();
    const created = (await ctrl.create({ phrase: 'scam' })) as { id: string };
    expect((await ctrl.list()).length).toBe(1);
    await ctrl.remove(created.id);
    expect((await ctrl.list()).length).toBe(0);
  });

  it('llm config roundtrip + matching health 6 fields', async () => {
    const llm = new ThreadsLlmConfigController();
    expect(await llm.getConfig()).toMatchObject({ dailyCap: 60 });
    const matching = new ThreadsMatchingController();
    expect(await matching.getConfig()).toEqual({ enabled: true });
    const health = await matching.health();
    expect(Object.keys(health)).toHaveLength(6);
  });

  it('feed threads create + enqueue', async () => {
    const ctrl = new FeedThreadsController();
    const thread = await ctrl.create({ messages: [{ content: 'm1' }] });
    expect(thread.status).toBe('DRAFT');
    const queued = await ctrl.enqueue(thread.id);
    expect(queued.status).toBe('QUEUED');
    expect((await ctrl.list()).length).toBe(1);
  });

  it('health returns ok with components', async () => {
    const ctrl = new HealthController();
    expect(ctrl.getHealth()).toEqual({ status: 'ok' });
    const full = await ctrl.health();
    expect(full.status).toBe('ok');
    expect(full.components.length).toBeGreaterThanOrEqual(2);
  });
});
