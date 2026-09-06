import { Button } from '@/shared/ui';
import {
  useLlmConfig,
  useToggleMatching,
  useToggleLlm,
  useTogglePublishing,
} from '@/features/crypto-news-publisher/model/use-llm-config';

export function MatchingToggleButton(): React.ReactElement {
  const { data: cfg, isLoading } = useLlmConfig();
  const matchingMut = useToggleMatching();
  const llmMut = useToggleLlm();
  const publishingMut = useTogglePublishing();

  const isMatchingEnabled = cfg?.matchingEnabled ?? false;
  const isLlmEnabled = cfg?.llmEnabled ?? false;
  const isPublishingEnabled = cfg?.publishingEnabled ?? false;

  const isWorking =
    isLoading ||
    matchingMut.isPending ||
    llmMut.isPending ||
    publishingMut.isPending;

  return (
    <div className="space-y-3">
      {/* Matching Control */}
      <div className="flex items-center gap-3">
        <Button
          variant={isMatchingEnabled ? 'danger' : 'primary'}
          size="sm"
          onClick={() => matchingMut.mutate(!isMatchingEnabled)}
          disabled={isWorking}
          className="min-w-[180px]"
        >
          {matchingMut.isPending ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isMatchingEnabled ? 'Stopping...' : 'Starting...'}
            </span>
          ) : isMatchingEnabled ? (
            '⏸ Stop Keyword Matching'
          ) : (
            '▶ Start Keyword Matching'
          )}
        </Button>
        <div className="text-xs text-slate-400">
          {isMatchingEnabled ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Enqueuing matches
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
              Matching paused
            </span>
          )}
        </div>
      </div>

      {/* LLM Generation Control (hidden in production) */}
      {import.meta.env.VITE_APP_ENV !== 'production' && (
        <div className="flex items-center gap-3">
          <Button
            variant={isLlmEnabled ? 'danger' : 'primary'}
            size="sm"
            onClick={() => llmMut.mutate(!isLlmEnabled)}
            disabled={isWorking}
            className="min-w-[180px]"
          >
            {llmMut.isPending ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isLlmEnabled ? 'Disabling...' : 'Enabling...'}
              </span>
            ) : isLlmEnabled ? (
              '⏸ Disable LLM Generation'
            ) : (
              '▶ Enable LLM Generation'
            )}
          </Button>
          <div className="text-xs text-slate-400">
            {isLlmEnabled ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                LLM refines content
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
                Publishing raw content
              </span>
            )}
          </div>
        </div>
      )}

      {/* Publishing Control */}
      <div className="flex items-center gap-3">
        <Button
          variant={isPublishingEnabled ? 'danger' : 'primary'}
          size="sm"
          onClick={() => publishingMut.mutate(!isPublishingEnabled)}
          disabled={isWorking}
          className="min-w-[180px]"
        >
          {publishingMut.isPending ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isPublishingEnabled ? 'Stopping...' : 'Starting...'}
            </span>
          ) : isPublishingEnabled ? (
            '⏸ Stop Publishing'
          ) : (
            '▶ Start Publishing'
          )}
        </Button>
        <div className="text-xs text-slate-400">
          {isPublishingEnabled ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Queue draining active
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
              Publishing paused
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
