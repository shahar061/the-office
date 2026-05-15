// Wire format shared between the Electron client (sender) and the
// Cloudflare Worker (receiver). Designed to be append-only — adding new
// event types is fine, removing or changing payload shape is a breaking
// change that requires a worker-side migration.

/** All event types the client may emit. Keep this list small and meaningful;
 *  every entry is a column in the dashboard. */
export type TelemetryEventType =
  | 'app:launch'
  | 'app:closed'
  | 'project:created'
  | 'project:opened'
  | 'phase:started'
  | 'phase:completed'
  | 'phase:failed'
  | 'phase:restarted'
  | 'request:submitted'
  | 'request:accepted'
  | 'request:rejected'
  | 'language:changed'
  | 'theme:changed'
  | 'feature:used';

export type TelemetryPhase = 'imagine' | 'warroom' | 'build';
export type TelemetryProjectMode = 'greenfield' | 'workshop';

/** Per-event-type payload shape. Defaults to `Record<string, never>` for
 *  events that carry no extra data. */
export type TelemetryEventPayload = {
  'app:launch': Record<string, never>;
  'app:closed': { sessionMinutes: number };
  'project:created': { mode: TelemetryProjectMode };
  'project:opened': { mode: TelemetryProjectMode };
  'phase:started': { phase: TelemetryPhase };
  'phase:completed': { phase: TelemetryPhase; durationSec: number };
  'phase:failed': { phase: TelemetryPhase; reason: string };
  'phase:restarted': { phase: TelemetryPhase };
  'request:submitted': Record<string, never>;
  'request:accepted': { durationSec: number };
  'request:rejected': Record<string, never>;
  'language:changed': { to: string };
  'theme:changed': { to: string };
  'feature:used': { feature: string };
};

/** A single event captured by the client, ready to ship. */
export interface TelemetryEvent<T extends TelemetryEventType = TelemetryEventType> {
  type: T;
  payload: TelemetryEventPayload[T];
  /** Client-side capture time (ms since epoch). */
  clientAt: number;
}

/** Wire envelope for batched event delivery. */
export interface TelemetryEventsRequest {
  /** UUIDv4 generated locally on first launch. Anonymous, never tied to PII. */
  installId: string;
  appVersion: string;
  /** `process.platform` value: 'darwin' | 'win32' | 'linux'. */
  osPlatform: string;
  language: string;
  theme: string;
  events: TelemetryEvent[];
}

export interface TelemetryEventsResponse {
  ok: boolean;
  accepted?: number;
  error?: string;
}

/** Wire envelope for a single error report. */
export interface TelemetryErrorRequest {
  installId: string;
  appVersion: string;
  osPlatform: string;
  /** 'main' (Electron main process) or 'renderer' (renderer process). */
  process: 'main' | 'renderer';
  message: string;
  stack?: string;
  /** JSON-encoded breadcrumbs (recent events leading up to the error). */
  breadcrumbs?: string;
  /** Stable hash of (message + stack frames) for grouping in the admin UI. */
  fingerprint: string;
  clientAt: number;
}

export interface TelemetryErrorResponse {
  ok: boolean;
  id?: number;
  error?: string;
}

/** Read-side type returned by the admin /telemetry/summary endpoint. */
export interface TelemetrySummary {
  totalInstalls: number;
  weeklyActiveInstalls: number;
  greenfieldProjects: number;
  workshopProjects: number;
  phaseFunnel: {
    imagineStarted: number;
    imagineCompleted: number;
    warroomCompleted: number;
    buildCompleted: number;
  };
  errorsLast7Days: number;
  byLanguage: Array<{ language: string; count: number }>;
  byTheme: Array<{ theme: string; count: number }>;
  generatedAt: number;
}
