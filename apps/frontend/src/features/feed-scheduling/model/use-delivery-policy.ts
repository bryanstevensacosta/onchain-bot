import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deliveryPolicyKeys,
  fetchDeliveryPolicy,
  updateDeliveryPolicy,
  type DeliveryPolicy,
  type DeliveryPolicyTarget,
  type UpdateDeliveryPolicyBody,
} from '@/features/feed-scheduling/api/delivery-policy-api';

/**
 * Canonical per-target delivery policy (R-c). Polled every 10s
 * alongside the rotation config. Reads the new route first and falls
 * back to `rotation-config` on 404 (see `fetchDeliveryPolicy`).
 */
export function useDeliveryPolicy(target: DeliveryPolicyTarget) {
  return useQuery<DeliveryPolicy>({
    queryKey: deliveryPolicyKeys.one(target),
    queryFn: () => fetchDeliveryPolicy(target),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useUpdateDeliveryPolicy(target: DeliveryPolicyTarget) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateDeliveryPolicyBody) =>
      updateDeliveryPolicy(target, patch),
    onSuccess: (saved) => {
      qc.setQueryData(deliveryPolicyKeys.one(target), saved);
      qc.invalidateQueries({ queryKey: deliveryPolicyKeys.one(target) });
    },
  });
}
