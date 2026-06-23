export type KolLifecycleStatus = 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';

export interface KolView {
  id: string;
  handle: string | null;
  title: string;
  isActive: boolean;
  lifecycleStatus: KolLifecycleStatus;
  lastIngestedAt: string | null;
}
