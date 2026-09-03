import { Button } from '@/shared/ui';
import {
  useLlmConfig,
  useToggleMatching,
} from '@/features/crypto-news-publisher/model/use-llm-config';

export function MatchingToggleButton(): React.ReactElement {
  const { data: cfg, isLoading } = useLlmConfig();
  const toggleMut = useToggleMatching();

  const isEnabled = cfg?.enabled ?? false;
  const isWorking = isLoading || toggleMut.isPending;

  const handleToggle = () => {
    toggleMut.mutate(!isEnabled);
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={isEnabled ? 'danger' : 'primary'}
        size="sm"
        onClick={handleToggle}
        disabled={isWorking}
        className="min-w-[180px]"
      >
        {isWorking ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {isEnabled ? 'Stopping...' : 'Starting...'}
          </span>
        ) : isEnabled ? (
          '⏸ Stop Keyword Matching'
        ) : (
          '▶ Start Keyword Matching'
        )}
      </Button>
      <div className="text-xs text-slate-400">
        {isEnabled ? (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Queue processing active
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
            Queue processing paused
          </span>
        )}
      </div>
    </div>
  );
}
