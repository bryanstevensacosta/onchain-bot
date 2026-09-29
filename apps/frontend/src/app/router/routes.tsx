/**
 * @deprecated Tramo 2 todo 15 (barrido JSDoc): legacy 'crypto-news' route shim below.
 * New path: '/feed' (FeedPage). Removal at cutover T2-11; keep the redirect until then.
 */
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { RootLayout } from '@/app/layouts/root-layout';
import { DashboardPage } from '@/pages/dashboard';
import { TokensExplorerPage } from '@/pages/tokens-explorer';
import { TokenDetailPage } from '@/pages/token-detail';
import { KolsPage } from '@/pages/kols';
import { OpsPage } from '@/pages/ops';
import { FeedPage } from '@/pages/feed';
import { PlaygroundPage } from '@/pages/playground';
import { TemplateDashboardPage } from '@/pages/template-dashboard';
import { ThreadsPage } from '@/pages/threads';
import { MarketDataPage } from '@/pages/market-data';
import { DexterPage } from '@/pages/dexter';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tokens', element: <TokensExplorerPage /> },
      { path: 'tokens/:chain/:address', element: <TokenDetailPage /> },
      { path: 'kols', element: <KolsPage /> },
      { path: 'feed', element: <FeedPage /> },
      { path: 'profiles', element: <Navigate to="/feed" replace /> },
      { path: 'crypto-news', element: <Navigate to="/feed" replace /> }, // @deprecated T2-15: legacy shim -> '/feed'; remove at cutover T2-11.
      { path: 'playground', element: <PlaygroundPage /> },
      { path: 'threads', element: <ThreadsPage /> },
      { path: 'templates', element: <TemplateDashboardPage /> },
      { path: 'market-data', element: <MarketDataPage /> },
      { path: 'dexter', element: <DexterPage /> },
      { path: 'ops', element: <OpsPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
