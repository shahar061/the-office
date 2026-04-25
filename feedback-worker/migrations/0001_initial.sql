CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  app_version TEXT NOT NULL,
  os_platform TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'he')),
  submitted_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in-progress', 'done', 'wont-fix')),
  triage_note TEXT
);

CREATE INDEX idx_reports_status_received ON reports (status, received_at DESC);
CREATE INDEX idx_reports_type ON reports (type);
