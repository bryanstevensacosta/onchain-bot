import { Injectable } from '@nestjs/common';
import {
  MonitoredCallRecord,
  MonitoredCallRepository,
} from '../ports/monitored-call.repository';

export interface RegisterMonitoredCallInput {
  callId: string;
  chain: string;
  address: string;
  mcAtCall: number;
  publishedAt: Date;
}

@Injectable()
export class RegisterMonitoredCallUseCase {
  constructor(private readonly repo: MonitoredCallRepository) {}

  async execute(
    input: RegisterMonitoredCallInput,
  ): Promise<MonitoredCallRecord> {
    const existing = await this.repo.findByCallId(input.callId);
    if (existing) {
      return existing;
    }
    return this.repo.save({
      callId: input.callId,
      chain: input.chain,
      address: input.address,
      mcAtCall: input.mcAtCall,
      publishedAt: input.publishedAt,
      lastEvaluatedAt: null,
    });
  }
}
