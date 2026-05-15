// IPC handlers for telemetry. Renderer-side code never talks to the
// network directly — all events and error reports funnel through the main
// process so we have a single place to enforce the consent gate, scrub
// strings, and manage the disk queue.

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type {
  TelemetryEventType,
  TelemetryEventPayload,
} from '../../shared/types/telemetry';
import type { TelemetryClient } from '../telemetry/client';
import { fingerprintError } from '../telemetry/client';
import { scrubString } from '../telemetry/scrubber';

export function initTelemetryHandlers(client: TelemetryClient): void {
  ipcMain.on(
    IPC_CHANNELS.TELEMETRY_EMIT,
    (_evt, payload: { type: TelemetryEventType; payload: TelemetryEventPayload[TelemetryEventType] }) => {
      try {
        client.emit(payload.type, payload.payload);
      } catch (err) {
        console.warn('[telemetry-handlers] emit failed:', err);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TELEMETRY_REPORT_RENDERER_ERROR,
    async (_evt, req: { message: string; stack?: string; breadcrumbs?: string }): Promise<void> => {
      try {
        const message = scrubString(req.message ?? '').slice(0, 4000);
        const stack = req.stack ? scrubString(req.stack).slice(0, 16000) : undefined;
        const breadcrumbs = req.breadcrumbs ? scrubString(req.breadcrumbs).slice(0, 8000) : undefined;
        const fingerprint = fingerprintError(message, stack);
        await client.reportError({
          process: 'renderer',
          message,
          stack,
          breadcrumbs,
          fingerprint,
          clientAt: Date.now(),
        });
      } catch (err) {
        console.warn('[telemetry-handlers] reportRendererError failed:', err);
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.TELEMETRY_GET_INSTALL_ID, async (): Promise<string> => {
    return client.getInstallId();
  });

  ipcMain.handle(IPC_CHANNELS.TELEMETRY_RESET_INSTALL_ID, async (): Promise<string> => {
    return client.resetInstallId();
  });

  ipcMain.handle(IPC_CHANNELS.TELEMETRY_DELETE_DATA, async (): Promise<{ ok: boolean }> => {
    client.clearLocal();
    const ok = await client.deleteRemoteData();
    return { ok };
  });
}
