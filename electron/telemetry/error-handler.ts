// Capture uncaught exceptions and unhandled promise rejections in the
// main process and forward them to the telemetry worker. Renderer-side
// errors arrive via IPC from the renderer's own ErrorBoundary / window
// listeners — see ipc/telemetry-handlers.ts.
//
// We do NOT install handlers if telemetry is disabled — there's nothing
// useful to do with the error and we don't want to silently swallow it.

import type { TelemetryClient } from './client';
import { fingerprintError } from './client';
import { scrubString } from './scrubber';

let installed = false;

export function installMainProcessErrorHandlers(client: TelemetryClient): void {
  if (installed) return;
  installed = true;

  const handle = (err: unknown): void => {
    try {
      const e = toError(err);
      const message = scrubString(e.message ?? String(err));
      const stack = e.stack ? scrubString(e.stack) : undefined;
      const fingerprint = fingerprintError(message, stack);
      void client.reportError({
        process: 'main',
        message: message.slice(0, 4000),
        stack: stack?.slice(0, 16000),
        fingerprint,
        clientAt: Date.now(),
      });
    } catch {
      // Never let the error handler itself blow up the process.
    }
  };

  process.on('uncaughtException', (err) => {
    console.error('[telemetry] uncaughtException:', err);
    handle(err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[telemetry] unhandledRejection:', reason);
    handle(reason);
  });
}

function toError(value: unknown): { message?: string; stack?: string } {
  if (value instanceof Error) return { message: value.message, stack: value.stack };
  if (typeof value === 'string') return { message: value };
  if (value && typeof value === 'object') {
    const v = value as { message?: unknown; stack?: unknown };
    return {
      message: typeof v.message === 'string' ? v.message : JSON.stringify(value),
      stack: typeof v.stack === 'string' ? v.stack : undefined,
    };
  }
  return { message: String(value) };
}
