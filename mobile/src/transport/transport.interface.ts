import type { MobileMessageV2 } from '../types/shared';

export type TransportStatus =
  | { state: 'idle'; mode?: 'lan' | 'relay' }
  | { state: 'connecting'; mode?: 'lan' | 'relay' }
  | { state: 'connected'; desktopName: string; mode?: 'lan' | 'relay' }
  | { state: 'disconnected'; reason: string; mode?: 'lan' | 'relay' }
  | { state: 'error'; error: Error; mode?: 'lan' | 'relay' };

export type TransportEventMap = {
  status: (s: TransportStatus) => void;
  message: (m: MobileMessageV2) => void;
};

export interface Transport {
  connect(): void;
  disconnect(): void;
  send(msg: MobileMessageV2): void;
  on<K extends keyof TransportEventMap>(event: K, handler: TransportEventMap[K]): () => void;
}
