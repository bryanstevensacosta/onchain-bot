import { GetExtractionResultUseCase } from 'token/intake/extraction/application/handlers/get-extraction-result.use-case';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { DomainError } from 'shared/kernel/domain-error';

class InMemoryRepo extends ExtractionResultRepository {
  constructor(private readonly data: Map<string, ExtractionResult>) {
    super();
  }
  public async save(): Promise<void> {
    await Promise.resolve();
  }
  public async findByChannelAndMessage(
    c: string,
    m: number,
  ): Promise<ExtractionResult | null> {
    await Promise.resolve();
    return this.data.get(`${c}:${m}`) ?? null;
  }
  public async findRecent(): Promise<ReadonlyArray<ExtractionResult>> {
    await Promise.resolve();
    return [];
  }
}

describe('GetExtractionResultUseCase', () => {
  it('returns a view when the result exists', async () => {
    const result = ExtractionResult.create({
      kolId: 'chan-1',
      messageId: 7,
      occurredAt: new Date('2026-01-01T00:00:00Z'),
      contractAddresses: [],
      tickers: [],
      urls: [],
    });
    const repo = new InMemoryRepo(new Map([[result.id, result]]));
    const useCase = new GetExtractionResultUseCase(repo);

    const view = await useCase.execute('chan-1', 7);

    expect(view.id).toBe('chan-1:7');
    expect(view.kolId).toBe('chan-1');
    expect(view.messageId).toBe(7);
  });

  it('throws DomainError NOT_FOUND when the result is missing', async () => {
    const repo = new InMemoryRepo(new Map());
    const useCase = new GetExtractionResultUseCase(repo);

    await expect(useCase.execute('chan-x', 1)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(useCase.execute('chan-x', 1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
