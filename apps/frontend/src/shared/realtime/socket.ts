import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/shared/config/env';
import type { ServerHello } from './events';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) return socket;

  socket = io(WS_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('hello', (payload: ServerHello) => {
    if (import.meta.env.DEV) {
      console.debug('[ws] hello', payload);
    }
  });

  return socket;
}

export function joinRoom(room: string): void {
  getSocket().emit('join', { room });
}

export function leaveRoom(room: string): void {
  getSocket().emit('leave', { room });
}

export const ROOMS = {
  chainSolana: 'chain:solana',
  chainEvm: 'chain:evm',
  verdictApproved: 'verdict:approved',
  verdictRejected: 'verdict:rejected',
  publishedAll: 'published:all',
  scoreGte70: 'score:>=70',
} as const;
