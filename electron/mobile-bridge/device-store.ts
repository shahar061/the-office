import type { PairedDevice, AppSettings } from '../../shared/types';

export interface SettingsStoreLike {
  get(): AppSettings;
  update(patch: Partial<AppSettings>): AppSettings;
}

export class DeviceStore {
  constructor(private settings: SettingsStoreLike) {}

  list(): PairedDevice[] {
    return this.settings.get().mobile?.devices ?? [];
  }

  findById(deviceId: string): PairedDevice | undefined {
    return this.list().find((d) => d.deviceId === deviceId);
  }

  add(device: PairedDevice): void {
    const current = this.list();
    const filtered = current.filter((d) => d.deviceId !== device.deviceId);
    this.writeDevices([...filtered, device]);
  }

  remove(deviceId: string): void {
    this.writeDevices(this.list().filter((d) => d.deviceId !== deviceId));
  }

  touch(deviceId: string, lastSeenAt: number): void {
    const next = this.list().map((d) =>
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
