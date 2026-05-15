-- Telemetry tables. Two distinct tables because events are high-volume
-- low-signal (queried in aggregate, indexed by type + time) and errors
-- are low-volume high-signal (queried by fingerprint for grouping).

CREATE TABLE telemetry_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  install_id    TEXT NOT NULL,           -- anonymous UUIDv4 per install
  event_type    TEXT NOT NULL,           -- 'app:launch', 'phase:completed', …
  payload       TEXT,                    -- JSON, may be empty for no-payload events
  app_version   TEXT NOT NULL,
  os_platform   TEXT NOT NULL,           -- 'darwin' | 'win32' | 'linux'
  language      TEXT NOT NULL,
  theme         TEXT,
  client_at     INTEGER NOT NULL,        -- ms since epoch (client clock)
  received_at   INTEGER NOT NULL         -- ms since epoch (server clock)
);

CREATE INDEX idx_evt_type_recv ON telemetry_events(event_type, received_at DESC);
CREATE INDEX idx_evt_install ON telemetry_events(install_id, received_at DESC);

CREATE TABLE telemetry_errors (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  install_id    TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,           -- hash of (message + stack frames) for grouping
  process       TEXT NOT NULL,           -- 'main' | 'renderer'
  message       TEXT NOT NULL,
  stack         TEXT,                    -- scrubbed stack trace
  breadcrumbs   TEXT,                    -- JSON-encoded array of recent events
  app_version   TEXT NOT NULL,
  os_platform   TEXT NOT NULL,
  client_at     INTEGER NOT NULL,
  received_at   INTEGER NOT NULL
);

CREATE INDEX idx_err_fp ON telemetry_errors(fingerprint, received_at DESC);
CREATE INDEX idx_err_recv ON telemetry_errors(received_at DESC);
