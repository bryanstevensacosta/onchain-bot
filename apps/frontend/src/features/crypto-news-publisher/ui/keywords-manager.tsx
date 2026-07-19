import { KeywordsSection } from './keywords-section';
import { BlacklistManager } from './blacklist-manager';

export function KeywordsManager(): React.ReactElement {
  return (
    <>
      <KeywordsSection />
      <BlacklistManager />
    </>
  );
}
