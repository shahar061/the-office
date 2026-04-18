import type { MobileMessageV2 } from '../types/shared';

export type TransportStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'connected'; desktopName: string }
  | { state: 'disconnected'; reason: string }
  | { state: 'error'; error: Error };

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
