// Anonymous install identifier. Generated once on first launch and persisted
// to userData/install-id.txt — never tied to PII, never sent over the wire
// for any purpose other than aggregating events from the same machine.
//
// The user can reset the id from the privacy settings (effectively appearing
// as a new install in the dashboard) or wipe their server-side data via the
// DELETE /telemetry/installs/:id endpoint.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const INSTALL_ID_FILE = 'install-id.txt';

export class InstallIdStore {
  private filePath: string;
  private cached: string | null = null;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, INSTALL_ID_FILE);
  }

  /** Returns the existing install id, or generates+persists a new one. */
  get(): string {
    if (this.cached) return this.cached;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
        if (raw.length >= 8 && raw.length <= 64) {
          this.cached = raw;
          return raw;
        }
      }
    } catch (err) {
      console.warn('[InstallIdStore] read failed, regenerating:', err);
    }
    return this.regenerate();
  }

  /** Mints a new id, replacing any existing one on disk. */
  regenerate(): string {
    const next = randomUUID();
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, next, 'utf-8');
    } catch (err) {
      console.error('[InstallIdStore] write failed:', err);
    }
    this.cached = next;
    return next;
  }
}
