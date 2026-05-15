// Disk-backed event queue. Events are appended to a single NDJSON file as
// soon as emit() is called, so a crash before the next flush doesn't lose
// data. On flush we read the file, send a batch, and on success truncate.
//
// We cap the file at 1 MB. If a user runs offline for weeks the file would
// grow unbounded otherwise; truncating when oversized drops the oldest
// events first (low-signal aggregate data, no big deal).

import fs from 'fs';
import path from 'path';
import type { TelemetryEvent } from '../../shared/types/telemetry';

const QUEUE_FILE = 'telemetry-queue.ndjson';
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
const MAX_BATCH_EVENTS = 100;       // worker accepts up to 200; stay well under

export class TelemetryQueue {
  private filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, QUEUE_FILE);
  }

  /** Append one event. Sync write — events are tiny and we want crash safety. */
  append(event: TelemetryEvent): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf-8');
      this.trimIfOversized();
    } catch (err) {
      console.error('[TelemetryQueue] append failed:', err);
    }
  }

  /** Read up to MAX_BATCH_EVENTS events from disk. Does NOT delete them — call
   *  acknowledge(count) after a successful upload. */
  read(): { events: TelemetryEvent[]; bytesRead: number } {
    if (!fs.existsSync(this.filePath)) return { events: [], bytesRead: 0 };
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      console.error('[TelemetryQueue] read failed:', err);
      return { events: [], bytesRead: 0 };
    }
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const events: TelemetryEvent[] = [];
    let bytesRead = 0;
    for (let i = 0; i < lines.length && events.length < MAX_BATCH_EVENTS; i++) {
      try {
        events.push(JSON.parse(lines[i]) as TelemetryEvent);
        bytesRead += lines[i].length + 1;
      } catch {
        // Skip corrupt line, but still count its bytes so acknowledge() can
        // discard it from the front of the file.
        bytesRead += lines[i].length + 1;
      }
    }
    return { events, bytesRead };
  }

  /** Drop the first `bytesRead` bytes from the queue file (matching what
   *  read() returned). If everything was consumed, delete the file. */
  acknowledge(bytesRead: number): void {
    if (bytesRead <= 0) return;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      if (bytesRead >= raw.length) {
        fs.unlinkSync(this.filePath);
        return;
      }
      const remainder = raw.slice(bytesRead);
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, remainder, 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[TelemetryQueue] acknowledge failed:', err);
    }
  }

  /** Wipe the queue (used by the privacy panel "delete data" action). */
  clear(): void {
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    } catch (err) {
      console.error('[TelemetryQueue] clear failed:', err);
    }
  }

  private trimIfOversized(): void {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size <= MAX_FILE_BYTES) return;
      // Drop the front half.
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const cut = Math.floor(raw.length / 2);
      // Snap to next newline so we don't split a JSON line.
      const nl = raw.indexOf('\n', cut);
      const remainder = nl === -1 ? '' : raw.slice(nl + 1);
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, remainder, 'utf-8');
      fs.renameSync(tmp, this.filePath);
      console.warn('[TelemetryQueue] file exceeded 1MB, dropped oldest half');
    } catch (err) {
      console.error('[TelemetryQueue] trim failed:', err);
    }
  }
}
