import type { AgentEvent, ChatMessage, PairedDevice, SessionStatePatch } from '../../shared/types';
import { DeviceStore, type SettingsStoreLike } from './device-store';
import { SnapshotBuilder } from './snapshot-builder';
import { EventForwarder } from './event-forwarder';
import { WsServer } from './ws-server';
import { getOrCreateIdentity } from './identity';

export interface MobileBridge {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPairingQR(): Promise<{ qrPayload: string; expiresAt: number }>;
  listDevices(): Promise<PairedDevice[]>;
  revokeDevice(deviceId: string): Promise<void>;
  getStatus(): { running: boolean; port: number | null; connectedDevices: number };
  // Event ingestion — call from main.ts wherever events are emitted
  onAgentEvent(event: AgentEvent): void;
  onChat(messages: ChatMessage[]): void;
  onStatePatch(patch: SessionStatePatch): void;
  onChange(handler: () => void): () => void;
}

export interface MobileBridgeOptions {
  settings: SettingsStoreLike;
  desktopName: string;
}

export function createMobileBridge(opts: MobileBridgeOptions): MobileBridge {
  const deviceStore = new DeviceStore(opts.settings);
  const identity = getOrCreateIdentity(opts.settings);
  const snapshots = new SnapshotBuilder(opts.desktopName);
  const changeListeners = new Set<() => void>();
  const notifyChange = () => {
    for (const h of changeListeners) {
      try { h(); } catch (err) { console.warn('[mobile-bridge] listener failed', err); }
    }
  };
  const server = new WsServer({
    port: opts.settings.get().mobile?.port ?? null,
    desktopName: opts.desktopName,
    deviceStore,
    snapshots,
    identity,
    onChange: notifyChange,
  });
  const forwarder = new EventForwarder(snapshots, server);

  return {
    async start() { await server.start(); },
    async stop()  { await server.stop(); },
    async getPairingQR() { return server.generatePairingQR(); },
    async listDevices()  { return deviceStore.list(); },
    async revokeDevice(deviceId) { server.revokeDevice(deviceId); },
    getStatus() {
      return {
        running: server.getPort() !== null,
        port: server.getPort(),
        connectedDevices: server.getConnectedCount(),
      };
    },
    onAgentEvent: forwarder.onAgentEvent,
    onChat: forwarder.onChat,
    onStatePatch: forwarder.onStatePatch,
    onChange(handler) {
      changeListeners.add(handler);
      return () => { changeListeners.delete(handler); };
    },
  };
}
