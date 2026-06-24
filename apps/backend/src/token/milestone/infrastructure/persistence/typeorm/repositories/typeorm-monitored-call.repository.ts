import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  MonitoredCallRepository,
  MonitoredCallRecord,
} from '../../../../application/ports/monitored-call.repository';
import { MonitoredCallEntity } from '../../../../domain/entities/monitored-call.entity';

@Injectable()
export class TypeormMonitoredCallRepository extends MonitoredCallRepository {
  constructor(
    @InjectRepository(MonitoredCallEntity)
    private readonly repo: Repository<MonitoredCallEntity>,
  ) {
    super();
  }

  async findByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<MonitoredCallRecord | null> {
    const row = await this.repo.findOne({ where: { chain, address } });
    return row ? this.toRecord(row) : null;
  }

  async findByCallId(callId: string): Promise<MonitoredCallRecord | null> {
    const row = await this.repo.findOne({ where: { callId } });
    return row ? this.toRecord(row) : null;
  }

  async findActive(
    maxAgeMs: number,
    limit: number,
  ): Promise<MonitoredCallRecord[]> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const rows = await this.repo.find({
      where: { publishedAt: MoreThanOrEqual(cutoff) },
      take: limit,
      order: { publishedAt: 'ASC' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async save(call: MonitoredCallRecord): Promise<MonitoredCallRecord> {
    const entity = this.repo.create({
      callId: call.callId,
      chain: call.chain,
      address: call.address,
      mcAtCall: call.mcAtCall,
      publishedAt: call.publishedAt,
      lastEvaluatedAt: call.lastEvaluatedAt ?? null,
    });
    const saved = await this.repo.save(entity);
    return this.toRecord(saved);
  }

  async updateLastEvaluated(id: string, at: Date): Promise<void> {
    await this.repo.update({ id }, { lastEvaluatedAt: at });
  }

  async deactivate(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  private toRecord(row: MonitoredCallEntity): MonitoredCallRecord {
    return {
      id: row.id,
      callId: row.callId,
      chain: row.chain,
      address: row.address,
      mcAtCall: row.mcAtCall,
      publishedAt: row.publishedAt,
      lastEvaluatedAt: row.lastEvaluatedAt,
    };
  }
}
