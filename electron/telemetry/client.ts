// TelemetryClient — orchestrates emit, queue, and batched upload.
//
// emit() is fire-and-forget; it appends to disk and returns immediately.
// A timer flushes every 30s, or sooner if the queue exceeds the high-water
// mark. Failed uploads leave the queue intact and we retry on the next tick.
//
// The whole client is a no-op when telemetry is disabled in settings —
// emit() drops events on the floor and the timer never starts. This keeps
// the opt-in promise honest: data never even hits disk until consent is given.

import type {
  TelemetryEvent,
  TelemetryEventPayload,
  TelemetryEventType,
  TelemetryEventsRequest,
  TelemetryEventsResponse,
  TelemetryErrorRequest,
  TelemetryErrorResponse,
} from '../../shared/types/telemetry';
import type { ThemeId } from '../../shared/types';
import { InstallIdStore } from './install-id';
import { TelemetryQueue } from './queue';

const FLUSH_INTERVAL_MS = 30_000;
const HIGH_WATER_MARK = 50;
const SEND_TIMEOUT_MS = 8_000;

export interface TelemetryClientDeps {
  fetch: typeof globalThis.fetch;
  workerUrl: string;
  /** Reads the live `enabled` flag — checked on every emit() and flush so
   *  the user toggle takes effect immediately. */
  isEnabled: () => boolean;
  getAppVersion: () => string;
  getOsPlatform: () => string;
  getLanguage: () => string;
  getTheme: () => ThemeId | undefined;
}

export class TelemetryClient {
  private deps: TelemetryClientDeps;
  private installIdStore: InstallIdStore;
  private queue: TelemetryQueue;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private bufferedCount = 0;

  constructor(userDataDir: string, deps: TelemetryClientDeps) {
    this.installIdStore = new InstallIdStore(userDataDir);
    this.queue = new TelemetryQueue(userDataDir);
    this.deps = deps;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // Try once on start in case there are events queued from a previous run.
    void this.flush();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  emit<T extends TelemetryEventType>(type: T, payload: TelemetryEventPayload[T]): void {
    if (!this.deps.isEnabled()) return;
    const event: TelemetryEvent<T> = {
      type,
      payload,
      clientAt: Date.now(),
    };
    this.queue.append(event);
    this.bufferedCount++;
    if (this.bufferedCount >= HIGH_WATER_MARK) {
      this.bufferedCount = 0;
      void this.flush();
    }
  }

  /** Mint a new install id (privacy panel "reset" action). */
  resetInstallId(): string {
    return this.installIdStore.regenerate();
  }

  getInstallId(): string {
    return this.installIdStore.get();
  }

  /** Wipe the local queue. Caller is responsible for the server-side delete. */
  clearLocal(): void {
    this.queue.clear();
    this.bufferedCount = 0;
  }

  /** Best-effort send of one error report. Never throws. */
  async reportError(req: Omit<TelemetryErrorRequest, 'installId' | 'appVersion' | 'osPlatform'>): Promise<void> {
    if (!this.deps.isEnabled()) return;
    const fullReq: TelemetryErrorRequest = {
      installId: this.installIdStore.get(),
      appVersion: this.deps.getAppVersion(),
      osPlatform: this.deps.getOsPlatform(),
      ...req,
    };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      const res = await this.deps.fetch(`${this.deps.workerUrl}/telemetry/errors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fullReq),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.warn('[TelemetryClient] error report rejected:', res.status);
      }
    } catch (err) {
      console.warn('[TelemetryClient] error report failed:', err);
    }
  }

  /** Best-effort delete of all server-side data for this install id. */
  async deleteRemoteData(): Promise<boolean> {
    const id = this.installIdStore.get();
    try {
      const res = await this.deps.fetch(`${this.deps.workerUrl}/telemetry/installs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (err) {
      console.warn('[TelemetryClient] delete remote failed:', err);
      return false;
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    if (!this.deps.isEnabled()) return;
    this.flushing = true;
    try {
      const { events, bytesRead } = this.queue.read();
      if (events.length === 0) return;

      const req: TelemetryEventsRequest = {
        installId: this.installIdStore.get(),
        appVersion: this.deps.getAppVersion(),
        osPlatform: this.deps.getOsPlatform(),
        language: this.deps.getLanguage(),
        theme: this.deps.getTheme() ?? '',
        events,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      let res: Response;
      try {
        res = await this.deps.fetch(`${this.deps.workerUrl}/telemetry/events`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        // 4xx with our worker means the payload itself is broken — drop it
        // so we don't loop forever on poison data. 5xx / network: keep the
        // queue intact and retry next tick.
        if (res.status >= 400 && res.status < 500) {
          console.warn('[TelemetryClient] worker rejected batch, dropping:', res.status);
          this.queue.acknowledge(bytesRead);
        } else {
          console.warn('[TelemetryClient] worker error, will retry:', res.status);
        }
        return;
      }

      try {
        const body = (await res.json()) as TelemetryEventsResponse;
        if (body.ok) this.queue.acknowledge(bytesRead);
        else this.queue.acknowledge(bytesRead); // server saw the request, accept their verdict
      } catch {
        // 200 with unparseable body — assume success, since the events landed.
        this.queue.acknowledge(bytesRead);
      }
    } catch (err) {
      // Network failure — leave queue intact, retry on next tick.
      console.warn('[TelemetryClient] flush failed:', err);
    } finally {
      this.flushing = false;
    }
  }
}

/** Build a stable fingerprint for grouping similar errors in the dashboard.
 *  Deterministic in (message + first 3 stack frames) so two crashes with the
 *  same root cause hash to the same id and group together on the server.
 *  Line/column numbers are stripped from frames so cosmetic shifts between
 *  releases don't fragment the grouping. */
export function fingerprintError(message: string, stack?: string): string {
  const frames = (stack ?? '')
    .split('\n')
    .slice(0, 3)
    .map((l) => l.trim().replace(/:\d+:\d+\)?/g, ')'))
    .join('|');
  const input = `${message}::${frames}`;
  // FNV-1a, 64-bit-ish via two parallel 32-bit hashes for low collision rate.
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}`;
}
