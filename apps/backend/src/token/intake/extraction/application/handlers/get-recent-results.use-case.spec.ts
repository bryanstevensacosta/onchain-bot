import { GetRecentResultsUseCase } from 'token/intake/extraction/application/handlers/get-recent-results.use-case';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { DomainError } from 'shared/kernel/domain-error';

class InMemoryRepo extends ExtractionResultRepository {
  constructor(private readonly data: ReadonlyArray<ExtractionResult>) {
    super();
  }
  public async save(): Promise<void> {
    await Promise.resolve();
  }
  public async findByChannelAndMessage(): Promise<ExtractionResult | null> {
    await Promise.resolve();
    return null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>> {
    await Promise.resolve();
    return this.data.slice(-limit).reverse();
  }
}

const buildResult = (id: string): ExtractionResult =>
  ExtractionResult.create({
    kolId: id.split(':')[0],
    messageId: Number(id.split(':')[1]),
    occurredAt: new Date(),
    contractAddresses: [],
    tickers: [],
    urls: [],
  });

describe('GetRecentResultsUseCase', () => {
  it('returns at most `limit` results, most-recent first', async () => {
    const repo = new InMemoryRepo([
      buildResult('a:1'),
      buildResult('a:2'),
      buildResult('a:3'),
    ]);
    const useCase = new GetRecentResultsUseCase(repo);

    const views = await useCase.execute(2);

    expect(views).toHaveLength(2);
    expect(views[0].id).toBe('a:3');
    expect(views[1].id).toBe('a:2');
  });

  it('rejects non-positive limits', async () => {
    const repo = new InMemoryRepo([]);
    const useCase = new GetRecentResultsUseCase(repo);

    await expect(useCase.execute(0)).rejects.toBeInstanceOf(DomainError);
    await expect(useCase.execute(-1)).rejects.toBeInstanceOf(DomainError);
  });

  it('rejects limits above 500', async () => {
    const repo = new InMemoryRepo([]);
    const useCase = new GetRecentResultsUseCase(repo);

    await expect(useCase.execute(501)).rejects.toBeInstanceOf(DomainError);
  });

  it('returns empty array when no results exist', async () => {
    const repo = new InMemoryRepo([]);
    const useCase = new GetRecentResultsUseCase(repo);

    const views = await useCase.execute(10);

    expect(views).toEqual([]);
  });
});
