import { PreviewFiltersUseCase } from './preview-filters.use-case';
import { InMemoryChannelFilterRepository } from '@/filters/infrastructure/persistence/in-memory/in-memory-channel-filter.repository';
import { ChannelContentFilterConfig } from '@/filters/domain/channel-content-filter-config.entity';

describe('PreviewFiltersUseCase', () => {
  async function build() {
    const repo = new InMemoryChannelFilterRepository();
    return { repo, useCase: new PreviewFiltersUseCase(repo) };
  }

  it('chains active filters by priority and marks RAW versus filtered', async () => {
    const { repo, useCase } = await build();
    await repo.save(
      ChannelContentFilterConfig.create({
        channelId: '-1001',
        pattern: 'foo',
        replacement: 'bar',
        flags: 'g',
        priority: 0,
      }),
    );
    await repo.save(
      ChannelContentFilterConfig.create({
        channelId: '-1001',
        pattern: 'bar',
        replacement: 'baz',
        flags: 'g',
        priority: 1,
      }),
    );
    const res = await useCase.execute({
      channelId: '-1001',
      title: 'foo headline',
      content: 'foo body',
    });
    expect(res.rawTitle).toBe('foo headline');
    expect(res.rawContent).toBe('foo body');
    expect(res.filteredTitle).toBe('baz headline');
    expect(res.filteredContent).toBe('baz body');
    expect(res.filtersApplied).toBe(2);
    expect(res.steps).toHaveLength(2);
    expect(res.steps[0].applied).toBe(true);
    expect(res.steps[0].contentAfter).toBe('bar body');
    expect(res.steps[1].applied).toBe(true);
    expect(res.steps[1].contentAfter).toBe('baz body');
  });

  it('skips inactive filters with a reason and leaves content untouched', async () => {
    const { repo, useCase } = await build();
    await repo.save(
      ChannelContentFilterConfig.create({
        channelId: '-1001',
        pattern: 'foo',
        replacement: 'bar',
        flags: 'g',
        priority: 0,
        isActive: false,
      }),
    );
    const res = await useCase.execute({
      channelId: '-1001',
      title: null,
      content: 'foo body',
    });
    expect(res.filteredContent).toBe('foo body');
    expect(res.filtersApplied).toBe(0);
    expect(res.steps[0].applied).toBe(false);
    expect(res.steps[0].skippedReason).toBe('inactive');
  });

  it('skips invalid and overlong patterns without breaking the chain', async () => {
    const { repo, useCase } = await build();
    await repo.save(
      ChannelContentFilterConfig.reconstitute({
        id: 'bad-pattern',
        channelId: '-1001',
        pattern: '([',
        replacement: '',
        flags: 'g',
        isActive: true,
        priority: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    await repo.save(
      ChannelContentFilterConfig.reconstitute({
        id: 'long-pattern',
        channelId: '-1001',
        pattern: 'x'.repeat(513),
        replacement: '',
        flags: 'g',
        isActive: true,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    await repo.save(
      ChannelContentFilterConfig.create({
        channelId: '-1001',
        pattern: 'foo',
        replacement: 'bar',
        flags: 'g',
        priority: 2,
      }),
    );
    const res = await useCase.execute({
      channelId: '-1001',
      title: null,
      content: 'foo body',
    });
    expect(res.filteredContent).toBe('bar body');
    expect(res.filtersApplied).toBe(1);
    expect(res.steps[0].skippedReason).toBe('invalid-pattern');
    expect(res.steps[1].skippedReason).toBe('pattern-too-long');
    expect(res.steps[2].applied).toBe(true);
  });

  it('returns RAW content unchanged for a channel without filters', async () => {
    const { useCase } = await build();
    const res = await useCase.execute({
      channelId: '-1001',
      title: null,
      content: 'untouched body',
    });
    expect(res.filteredContent).toBe('untouched body');
    expect(res.steps).toHaveLength(0);
    expect(res.filtersApplied).toBe(0);
  });
});
