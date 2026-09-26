import { GetPendingApprovalsUseCase } from './get-pending-approvals.use-case';
import { InMemoryCallApprovalRepository } from '../../infrastructure/repositories/in-memory-call-approval.repository';
import { CallApproval } from '../../domain/entities/call-approval.entity';

describe('GetPendingApprovalsUseCase (todo 11, failing-first)', () => {
  it('lists pending approvals, optionally scoped by template', async () => {
    const repo = new InMemoryCallApprovalRepository();
    const pending = CallApproval.create({
      templateId: 'vip-calls',
      mentionId: 'm1',
      kolId: 'k1',
      chain: 'solana',
      address: 'A',
      ticker: 'X',
      score: 90,
    });
    const decided = CallApproval.create({
      templateId: 'vip-calls',
      mentionId: 'm2',
      kolId: 'k1',
      chain: 'solana',
      address: 'B',
      ticker: 'Y',
      score: 91,
    });
    decided.approve();
    const other = CallApproval.create({
      templateId: 'gems',
      mentionId: 'm3',
      kolId: 'k1',
      chain: 'solana',
      address: 'C',
      ticker: 'Z',
      score: 92,
    });
    await repo.save(pending);
    await repo.save(decided);
    await repo.save(other);
    const uc = new GetPendingApprovalsUseCase(repo);
    const all = await uc.execute({});
    expect(all.pending.map((a) => a.id).sort()).toEqual([
      'gems:m3',
      'vip-calls:m1',
    ]);
    const scoped = await uc.execute({ templateId: 'vip-calls' });
    expect(scoped.pending.map((a) => a.id)).toEqual(['vip-calls:m1']);
  });
});
