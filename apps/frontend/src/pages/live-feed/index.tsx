import { useEffect, useState } from 'react';
import { LiveFeed } from '@/widgets/live-feed';
import { getSocket } from '@/shared/realtime';

export function LiveFeedPage() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live feed</h1>
          <p className="text-sm text-slate-400">
            Eventos del pipeline en tiempo real vía WebSocket.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-slate-400">
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>
      <LiveFeed />
    </div>
  );
}
