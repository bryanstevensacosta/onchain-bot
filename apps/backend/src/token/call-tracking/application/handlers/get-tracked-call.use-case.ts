import { Injectable } from '@nestjs/common';
import { TrackedPublishedCallRepository } from '../ports/tracked-published-call.repository';

@Injectable()
export class GetTrackedCallUseCase {
  constructor(private readonly repo: TrackedPublishedCallRepository) {}

  async execute(chain: string, address: string) {
    return this.repo.findByChainAndAddress(chain, address);
  }
}
