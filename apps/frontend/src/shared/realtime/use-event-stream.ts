import { useEffect } from 'react';
import { getSocket } from './socket';
import type { WsEventName } from './events';

export function useEventStream<T>(
  event: WsEventName,
  handler: (payload: T) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const sub = (payload: T) => handler(payload);
    socket.on(event, sub);
    return () => {
      socket.off(event, sub);
    };
  }, [event, handler, enabled]);
}
