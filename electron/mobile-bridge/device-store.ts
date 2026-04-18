import type { PairedDevice, AppSettings } from '../../shared/types';
import { randomBytes } from 'crypto';

export interface SettingsStoreLike {
  get(): AppSettings;
  update(patch: Partial<AppSettings>): AppSettings;
}

function randomSid(): string {
  return randomBytes(16).toString('base64url');
}

function fillDefaults(d: PairedDevice): PairedDevice {
  return {
    ...d,
    phoneIdentityPub: d.phoneIdentityPub ?? '',
    pairSignPriv: d.pairSignPriv ?? '',
    pairSignPub: d.pairSignPub ?? '',
    sid: d.sid ?? randomSid(),
    remoteAllowed: d.remoteAllowed ?? false,
    epoch: d.epoch ?? 0,
  };
}

export class DeviceStore {
  constructor(private settings: SettingsStoreLike) {
    // Approach A: one-time migration at startup — write back any devices missing
    // a sid so that subsequent list() calls see the same stable sid.
    const raw = this.settings.get().mobile?.devices ?? [];
    if (raw.some((d) => d.sid === undefined)) {
      const migrated = raw.map((d) =>
        d.sid === undefined ? { ...d, sid: randomSid() } : d,
      );
      this.writeDevices(migrated);
    }
  }

  list(): PairedDevice[] {
    const raw = this.settings.get().mobile?.devices ?? [];
    return raw.map(fillDefaults);
  }

  findById(deviceId: string): PairedDevice | undefined {
    return this.list().find((d) => d.deviceId === deviceId);
  }

  add(device: PairedDevice): void {
    const current = this.settings.get().mobile?.devices ?? [];
    const filtered = current.filter((d) => d.deviceId !== device.deviceId);
    // If this is a new device without a sid, assign one now so it is stable.
    const stored = device.sid === undefined ? { ...device, sid: randomSid() } : device;
    this.writeDevices([...filtered, stored]);
  }

  remove(deviceId: string): void {
    const current = this.settings.get().mobile?.devices ?? [];
    this.writeDevices(current.filter((d) => d.deviceId !== deviceId));
  }

  touch(deviceId: string, lastSeenAt: number): void {
    const current = this.settings.get().mobile?.devices ?? [];
    const next = current.map((d) =>
      d.deviceId === deviceId ? { ...d, lastSeenAt } : d,
    );
    this.writeDevices(next);
  }

  private writeDevices(devices: PairedDevice[]): void {
    const current = this.settings.get();
    const mobile = current.mobile ?? { enabled: true, port: null, devices: [] };
    this.settings.update({ mobile: { ...mobile, devices } });
  }
}
