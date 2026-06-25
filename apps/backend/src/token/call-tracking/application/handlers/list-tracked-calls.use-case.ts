import { Injectable } from '@nestjs/common';
import { TrackedPublishedCallRepository } from '../ports/tracked-published-call.repository';

export interface ListTrackedCallsQuery {
  readonly minMilestone?: number;
  readonly maxPriceDrop?: number;
  readonly hasMilestones?: boolean;
  readonly limit?: number;
}

@Injectable()
export class ListTrackedCallsUseCase {
  constructor(private readonly repo: TrackedPublishedCallRepository) {}

  async execute(query: ListTrackedCallsQuery) {
    return this.repo.findMany({
      activeOnly: true,
      ...(query.minMilestone !== undefined && {
        minMilestone: query.minMilestone,
      }),
      ...(query.maxPriceDrop !== undefined && {
        maxPriceDropPercent: query.maxPriceDrop,
      }),
      ...(query.hasMilestones !== undefined && {
        hasMilestones: query.hasMilestones,
      }),
      limit: query.limit ?? 50,
    });
  }
}
