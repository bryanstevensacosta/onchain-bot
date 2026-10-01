import { useFeedThreadsStatus } from '@/features/feed-publisher/model/use-threads-stub';
import { FEED_THREADS_NOT_IMPLEMENTED } from '@/features/feed-publisher/api/threads-stub-api';

/**
 * Threads stub section (Tramo 2, todo 9): feed-publisher exposes
 * `/api/threads` as a v1 skeleton (C1 — every route answers 501
 * THREADS_NOT_IMPLEMENTED until the v2 un-stubbing contract activates
 * it). This section renders that stub state explicitly instead of
 * crashing: stub code → deferred notice, API down → empty-state.
 */
export function FeedThreadsStubSection(): React.ReactElement {
  const { data, isLoading, error } = useFeedThreadsStatus();

  if (isLoading) {
    return <div className="text-slate-500">Cargando...</div>;
  }

  if (error || !data) {
    return (
      <div data-testid="feed-threads-empty" className="text-slate-500 text-sm">
        Threads status unavailable (feed-publisher unreachable).
      </div>
    );
  }

  if (data.error === FEED_THREADS_NOT_IMPLEMENTED) {
    return (
      <div data-testid="feed-threads-stub" className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-amber-500 rounded-full" />
          <span className="text-slate-200 font-semibold">
            Threads deferred to v2
          </span>
        </div>
        <p className="text-slate-400">{data.message}</p>
      </div>
    );
  }

  return (
    <div data-testid="feed-threads-empty" className="text-slate-500 text-sm">
      Unexpected threads status: {data.error}
    </div>
  );
}
