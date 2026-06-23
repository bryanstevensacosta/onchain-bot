import { QueryProvider, SocketProvider } from './providers';
import { AppRouter } from './router/routes';

export function App() {
  return (
    <QueryProvider>
      <SocketProvider>
        <AppRouter />
      </SocketProvider>
    </QueryProvider>
  );
}
