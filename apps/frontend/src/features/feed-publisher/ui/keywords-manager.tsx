import { KeywordsSection } from './keywords-section';
import { BlacklistManager } from './blacklist-manager';

/**
 * @deprecated Standalone /feed keywords panel (keywords-move): use the
 * Session window Keywords tab (`SessionTabPanels` → `KeywordsSection` +
 * `BlacklistManager` scoped per session) instead. Kept as a barrel export
 * for compat; no page renders it anymore.
 */
export function KeywordsManager(): React.ReactElement {
  return (
    <>
      <KeywordsSection />
      <BlacklistManager />
    </>
  );
}
