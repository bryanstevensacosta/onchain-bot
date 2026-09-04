import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChannelContentFilterConfigEntity } from '../../../infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

export interface ToggleFilterResult {
  id: string;
  isActive: boolean;
}

/**
 * Use case: Toggle the isActive state of a content filter.
 *
 * Returns the new isActive state.
 */
@Injectable()
export class ToggleFilterUseCase {
  private readonly logger = new Logger(ToggleFilterUseCase.name);

  constructor(private readonly dataSource: DataSource) {}

  public async execute(id: string): Promise<ToggleFilterResult> {
    const filterRepo = this.dataSource.getRepository(
      ChannelContentFilterConfigEntity,
    );

    const filter = await filterRepo.findOne({ where: { id } });
    if (!filter) {
      throw new Error(`Filter ${id} not found`);
    }

    filter.isActive = !filter.isActive;
    const updated = await filterRepo.save(filter);

    this.logger.log(
      `Toggled filter ${id} to ${updated.isActive ? 'active' : 'inactive'}`,
    );

    return {
      id: updated.id,
      isActive: updated.isActive,
    };
  }
}
