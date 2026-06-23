import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { getSocket } from '@/shared/realtime';

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setConnected(true);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <>
      {children}
      <div
        className={`fixed bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${
          connected
            ? 'bg-green-900/60 text-green-300'
            : 'bg-red-900/60 text-red-300'
        }`}
        title="WebSocket connection status"
      >
        WS {connected ? '●' : '○'}
      </div>
    </>
  );
}
