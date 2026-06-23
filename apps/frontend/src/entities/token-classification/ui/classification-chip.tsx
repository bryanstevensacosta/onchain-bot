import { Badge } from '@/shared/ui';
import { classificationTone, type Classification } from '../model/types';

export function ClassificationChip({ value }: { value: Classification }) {
  return <Badge tone={classificationTone(value)}>{value}</Badge>;
}
