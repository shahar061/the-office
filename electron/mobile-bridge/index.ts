import type { AgentEvent, ChatMessage, PairedDevice, SessionStatePatch } from '../../shared/types';
import { DeviceStore, type SettingsStoreLike } from './device-store';
import { SnapshotBuilder } from './snapshot-builder';
import { EventForwarder } from './event-forwarder';
import { WsServer } from './ws-server';
import { getOrCreateIdentity } from './identity';
import { RelayConnection } from './relay-connection';

export interface MobileBridge {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPairingQR(): Promise<{ qrPayload: string; expiresAt: number }>;
  listDevices(): Promise<PairedDevice[]>;
  revokeDevice(deviceId: string): Promise<void>;
  getStatus(): { running: boolean; port: number | null; connectedDevices: number; pendingSas: string | null; v1DeviceCount: number };
  // Event ingestion — call from main.ts wherever events are emitted
  onAgentEvent(event: AgentEvent): void;
  onChat(messages: ChatMessage[]): void;
  onStatePatch(patch: SessionStatePatch): void;
  onChange(handler: () => void): () => void;
  onPhoneChat(handler: (msg: { body: string; agentId?: string; fromDeviceId: string; clientMsgId: string }) => void | Promise<void>): () => void;
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
  const phoneChatHandlers = new Set<(m: { body: string; agentId?: string; fromDeviceId: string; clientMsgId: string }) => void | Promise<void>>();

  // Declared BEFORE `new WsServer(...)` so that the onBroadcastToRelay callback
  // (which captures this map) sees the live reference.
  const relayConnections = new Map<string, RelayConnection>();

  const baseNotifyChange = () => {
    for (const h of changeListeners) {
      try { h(); } catch (err) { console.warn('[mobile-bridge] listener failed', err); }
    }
  };
  const notifyChange = () => {
    baseNotifyChange();
    try { syncRelayConnections(); } catch (err) { console.warn('[mobile-bridge] relay sync failed', err); }
  };
  let currentPendingSas: string | null = null;
  const server = new WsServer({
    port: opts.settings.get().mobile?.port ?? null,
    desktopName: opts.desktopName,
    deviceStore,
    snapshots,
    identity,
    onChange: notifyChange,
    onPendingSas: (sas) => {
      currentPendingSas = sas;
      notifyChange();
    },
    onPhoneChat: async (msg) => {
      for (const h of phoneChatHandlers) {
        try { await h(msg); } catch (err) { console.warn('[mobile-bridge] phone chat handler failed', err); }
      }
    },
    onBroadcastToRelay: (msg) => {
      for (const conn of relayConnections.values()) {
        conn.sendMessage(msg);
      }
    },
  });
  const forwarder = new EventForwarder(snapshots, server);

  function syncRelayConnections(): void {
    const devices = deviceStore.list();
    const wantedIds = new Set(
      devices
        .filter((d) => d.remoteAllowed && d.phoneIdentityPub && d.pairSignPriv && d.pairSignPub && d.sid)
        .map((d) => d.deviceId),
    );
    // Remove stale
    for (const [id, conn] of relayConnections) {
      if (!wantedIds.has(id)) {
        conn.stop();
        relayConnections.delete(id);
      }
    }
    // Add new
    for (const d of devices) {
      if (!wantedIds.has(d.deviceId) || relayConnections.has(d.deviceId)) continue;
      try {
        const conn = new RelayConnection({ desktop: identity, device: d });
        conn.on('connect', baseNotifyChange);
        conn.on('disconnect', baseNotifyChange);
        conn.on('error', (err) => console.warn('[relay]', d.deviceId, (err as Error).message));
        conn.on('message', (msg: import('../../shared/types').MobileMessageV2, deviceId: string) => {
          // Upstream chat from the phone comes over the relay path too.
          if (msg.type === 'chat') {
            for (const h of phoneChatHandlers) {
              try {
                void h({ body: msg.body, agentId: msg.agentId, fromDeviceId: deviceId, clientMsgId: msg.clientMsgId });
              } catch (err) {
                console.warn('[mobile-bridge] phone chat handler failed (relay)', err);
              }
            }
            // Ack handling on the relay path is a follow-up; the phone infers
            // success from the eventual chatFeed echo.
          }
        });
        conn.start();
        relayConnections.set(d.deviceId, conn);
      } catch (err) {
        console.warn('[relay] failed to start connection for', d.deviceId, (err as Error).message);
      }
    }
  }

  return {
    async start() {
      await server.start();
      syncRelayConnections();
    },
    async stop() {
      for (const conn of relayConnections.values()) conn.stop();
      relayConnections.clear();
      await server.stop();
    },
    async getPairingQR() { return server.generatePairingQR(); },
    async listDevices()  { return deviceStore.list(); },
    async revokeDevice(deviceId) { server.revokeDevice(deviceId); },
    getStatus() {
      const devices = deviceStore.list();
      const v1DeviceCount = devices.filter((d) => !d.phoneIdentityPub).length;
      return {
        running: server.getPort() !== null,
        port: server.getPort(),
        connectedDevices: server.getConnectedCount(),
        pendingSas: currentPendingSas,
        v1DeviceCount,
      };
    },
    onAgentEvent: forwarder.onAgentEvent,
    onChat: forwarder.onChat,
    onStatePatch: forwarder.onStatePatch,
    onChange(handler) {
      changeListeners.add(handler);
      return () => { changeListeners.delete(handler); };
    },
    onPhoneChat(handler) {
      phoneChatHandlers.add(handler);
      return () => { phoneChatHandlers.delete(handler); };
    },
  };
}
