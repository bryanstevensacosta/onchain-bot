import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from '@/app/layouts/root-layout';
import { DashboardPage } from '@/pages/dashboard';
import { LiveFeedPage } from '@/pages/live-feed';
import { TokensExplorerPage } from '@/pages/tokens-explorer';
import { TokenDetailPage } from '@/pages/token-detail';
import { KolsPage } from '@/pages/kols';
import { OpsPage } from '@/pages/ops';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'live', element: <LiveFeedPage /> },
      { path: 'tokens', element: <TokensExplorerPage /> },
      { path: 'tokens/:chain/:address', element: <TokenDetailPage /> },
      { path: 'kols', element: <KolsPage /> },
      { path: 'ops', element: <OpsPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
