import { Navigate } from 'react-router-dom';

/**
 * @deprecated Sessions live at `/feed` (`FeedSessionsSection`).
 * Kept so stale imports keep compiling; the router redirects
 * `/profiles` → `/feed` for old bookmarks.
 */
export function ProfilesPage(): React.ReactElement {
  return <Navigate to="/feed" replace />;
}
