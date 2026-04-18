// mobile/src/transport/create.ts
import { LanWsTransport } from './lan-ws.transport';
import { RelayWsTransport } from './relay-ws.transport';
import { CompositeTransport } from './composite.transport';
import type { Transport } from './transport.interface';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

export function createTransportForDevice(device: PairedDeviceCredentials): Transport {
  const lan = device.host !== ''
    ? new LanWsTransport({
        host: device.host,
        port: device.port,
        device: {
          deviceId: device.deviceId,
          deviceToken: device.deviceToken,
          identityPriv: device.identityPriv,
          desktopIdentityPub: device.desktopIdentityPub,
        },
      })
    : null;

  const relay = device.remoteAllowed && device.relayToken
    ? new RelayWsTransport({
        device: {
          deviceId: device.deviceId,
          deviceToken: device.deviceToken,
          identityPriv: device.identityPriv,
          desktopIdentityPub: device.desktopIdentityPub,
          sid: device.sid,
        },
        token: device.relayToken,
      })
    : null;

  // Diagnostic kept from pre-refactor SessionScreen — useful when the phone
  // lands without a connectable channel (e.g. stale credentials missing relayToken).
  // eslint-disable-next-line no-console
  console.log('[createTransportForDevice]', JSON.stringify({
    deviceId: device.deviceId,
    hasHost: device.host !== '',
    remoteAllowed: device.remoteAllowed,
    hasRelayToken: !!device.relayToken,
    builtLan: lan !== null,
    builtRelay: relay !== null,
  }));

  return new CompositeTransport(lan, relay);
}
