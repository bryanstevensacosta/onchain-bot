import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChannelContentFilterConfigEntity } from '../../../infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

/**
 * Use case: Delete a content filter by ID.
 *
 * Returns true if the filter was deleted, false if it didn't exist.
 */
@Injectable()
export class DeleteFilterUseCase {
  private readonly logger = new Logger(DeleteFilterUseCase.name);

  constructor(private readonly dataSource: DataSource) {}

  public async execute(id: string): Promise<boolean> {
    const filterRepo = this.dataSource.getRepository(
      ChannelContentFilterConfigEntity,
    );

    const filter = await filterRepo.findOne({ where: { id } });
    if (!filter) {
      return false;
    }

    await filterRepo.remove(filter);

    this.logger.log(`Deleted filter ${id} from channel ${filter.channelId}`);

    return true;
  }
}
