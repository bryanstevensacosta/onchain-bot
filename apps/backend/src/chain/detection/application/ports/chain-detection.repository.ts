import { ChainDetectionResult } from 'chain/detection/domain/entities/chain-detection-result.entity';

export abstract class ChainDetectionRepository {
  public abstract save(result: ChainDetectionResult): Promise<void>;
  public abstract findByAddress(
    address: string,
  ): Promise<ChainDetectionResult | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ChainDetectionResult>>;
}
