import { VipCallApprovalReason } from './vip-call-approval-reason.vo';

describe('VipCallApprovalReason', () => {
  describe('create', () => {
    it('accepts the new INVALID_ADDRESS code', () => {
      const reason = VipCallApprovalReason.create({
        code: 'INVALID_ADDRESS',
        message: 'Invalid Solana address: foo',
      });

      expect(reason.code).toBe('INVALID_ADDRESS');
      expect(reason.message).toBe('Invalid Solana address: foo');
    });

    const existingCodes = [
      'SCORE_TOO_LOW',
      'CLASSIFICATION_BLOCKED',
      'BLACKLISTED',
      'HONEYPOT_SUSPECTED',
      'RISK_WEIGHT_EXCEEDED',
      'INSUFFICIENT_DATA',
      'CHAIN_UNSUPPORTED',
    ] as const;

    it.each(existingCodes)('still accepts the existing code %s', (code) => {
      const reason = VipCallApprovalReason.create({
        code,
        message: `rejection: ${code}`,
      });

      expect(reason.code).toBe(code);
    });

    it('throws for a bogus code', () => {
      expect(() =>
        VipCallApprovalReason.create({
          code: 'BOGUS_CODE',
          message: 'foo',
        }),
      ).toThrow('Invalid filter reason code: BOGUS_CODE');
    });
  });
});
