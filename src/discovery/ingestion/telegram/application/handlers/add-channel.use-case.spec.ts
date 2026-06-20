import { AddChannelUseCase } from 'discovery/ingestion/telegram/application/handlers/add-channel.use-case';
import { TelegramChannelRepository } from 'discovery/ingestion/telegram/application/ports/telegram-channel.repository';
import { TelegramEventPublisher } from 'discovery/ingestion/telegram/application/ports/telegram-event.publisher';
import { DomainError } from 'shared/kernel/domain-error';
import type { TelegramChannel } from 'discovery/ingestion/telegram/domain/entities/telegram-channel.entity';
import type { ChannelId } from 'discovery/ingestion/telegram/domain/value-objects/channel-id.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';
import type { AddChannelInput } from 'discovery/ingestion/telegram/api/input/add-channel.input';

class InMemoryChannelRepo extends TelegramChannelRepository {
  public readonly store = new Map<string, TelegramChannel>();
  public async save(channel: TelegramChannel): Promise<void> {
    this.store.set(channel.channelId.value, channel);
  }
  public async findById(id: ChannelId): Promise<TelegramChannel | null> {
    return this.store.get(id.value) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<TelegramChannel>> {
    return Array.from(this.store.values());
  }
  public async delete(id: ChannelId): Promise<void> {
    this.store.delete(id.value);
  }
  public async updateTitle(id: ChannelId, newTitle: string): Promise<boolean> {
    const channel = this.store.get(id.value);
    if (!channel) return false;
    channel.updateTitle(newTitle);
    return true;
  }
}

class InMemoryPublisher extends TelegramEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }
}

describe('AddChannelUseCase', () => {
  let repo: InMemoryChannelRepo;
  let publisher: InMemoryPublisher;
  let useCase: AddChannelUseCase;

  beforeEach(() => {
    repo = new InMemoryChannelRepo();
    publisher = new InMemoryPublisher();
    useCase = new AddChannelUseCase(repo, publisher);
  });

  it('adds a new channel and publishes events', async () => {
    const result = await useCase.execute({
      channelId: '1234567890',
      username: 'SpyDefi',
      title: 'SpyDefi',
    });

    expect(result.title).toBe('SpyDefi');
    expect(result.isActive).toBe(false);
    expect(repo.store.size).toBe(1);
  });

  it('rejects duplicate channel id', async () => {
    await useCase.execute({
      channelId: '1234567890',
      username: 'SpyDefi',
      title: 'SpyDefi',
    });

    await expect(
      useCase.execute({
        channelId: '1234567890',
        username: 'Other',
        title: 'Other',
      }),
    ).rejects.toThrow(DomainError);
  });

  it('rejects invalid channel id', async () => {
    await expect(
      useCase.execute({
        channelId: 'not-a-number',
        title: 'SpyDefi',
      }),
    ).rejects.toThrow(DomainError);
  });

  it('rejects invalid username', async () => {
    await expect(
      useCase.execute({
        channelId: '1234567890',
        username: '!@#$%',
        title: 'SpyDefi',
      }),
    ).rejects.toThrow(DomainError);
  });
});
