import React, { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/project.store';
import type { ProjectState, ProjectInfo } from '@shared/types';

// ── Styles ──

const S = {
  root: {
    width: '100vw',
    height: '100vh',
    background: '#0f0f1a',
    color: '#e5e5e5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute' as const,
    top: '-20%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 600,
    height: 400,
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(59,130,246,0.06) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
  },
  center: {
    width: 520,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 24,
    zIndex: 1,
  },
  logo: {
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  logoTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#e5e5e5',
    letterSpacing: '-0.5px',
  },
  logoSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid #333',
    borderRadius: 10,
    padding: '18px 20px',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 12,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #444',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#e5e5e5',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputFocused: {
    borderColor: '#3b82f6',
  },
  btn: (accent = false, disabled = false): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: accent ? 'none' : '1px solid #444',
    background: accent ? '#3b82f6' : 'rgba(255,255,255,0.06)',
    color: disabled ? '#4b5563' : accent ? '#fff' : '#e5e5e5',
    fontSize: 13,
    fontWeight: accent ? 600 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.15s, opacity 0.15s',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }),
  btnWide: (accent = false, disabled = false): React.CSSProperties => ({
    padding: '9px 16px',
    borderRadius: 6,
    border: accent ? 'none' : '1px solid #444',
    background: accent ? '#3b82f6' : 'rgba(255,255,255,0.06)',
    color: disabled ? '#4b5563' : accent ? '#fff' : '#e5e5e5',
    fontSize: 13,
    fontWeight: accent ? 600 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.15s, opacity 0.15s',
    width: '100%',
    textAlign: 'center' as const,
  }),
  pathChip: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  apiKeySection: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 4,
  },
  recentList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxHeight: 200,
    overflowY: 'auto' as const,
  },
  recentItem: (disabled: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 7,
    border: '1px solid #2a2a3a',
    background: 'rgba(255,255,255,0.02)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'background 0.12s, border-color 0.12s',
  }),
  recentItemHover: {
    background: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  recentName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#e5e5e5',
  },
  recentPath: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 340,
  },
  recentTime: {
    fontSize: 11,
    color: '#4b5563',
    flexShrink: 0,
    marginLeft: 8,
  },
  statusBar: {
    position: 'absolute' as const,
    bottom: 20,
    left: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: (connected: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: connected ? '#22c55e' : '#ef4444',
    boxShadow: connected ? '0 0 6px rgba(34,197,94,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
    flexShrink: 0,
  }),
  statusLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  connectBtn: {
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 5,
    border: '1px solid #3b82f6',
    background: 'transparent',
    color: '#3b82f6',
    cursor: 'pointer',
  },
  emptyState: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center' as const,
    padding: '12px 0',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.1)',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
    flexShrink: 0,
  },
};

// ── Helpers ──

function formatAge(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~');
}

// ── Sub-components ──

function Spinner() {
  return <span style={S.spinner} />;
}

// ── API Key Panel ──

interface ApiKeyPanelProps {
  onConnected: () => void;
}

function ApiKeyPanel({ onConnected }: ApiKeyPanelProps) {
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);
  const [key, setKey] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.office.connectApiKey(trimmed);
      if (result.success) {
        const status = await window.office.getAuthStatus();
        setAuthStatus(status);
        onConnected();
      } else {
        setError(result.error ?? 'Connection failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [key, onConnected, setAuthStatus]);

  return (
    <div style={S.apiKeySection}>
      <div style={S.row}>
        <input
          style={{ ...S.input, ...(inputFocused ? S.inputFocused : {}) }}
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          disabled={loading}
          autoFocus
        />
        <button
          style={S.btn(true, loading || !key.trim())}
          onClick={handleConnect}
          disabled={loading || !key.trim()}
        >
          {loading ? <Spinner /> : 'Connect'}
        </button>
      </div>
      {error && <div style={S.errorText}>{error}</div>}
      <div style={{ fontSize: 11, color: '#4b5563' }}>
        Get your API key at{' '}
        <span style={{ color: '#3b82f6' }}>console.anthropic.com</span>
      </div>
    </div>
  );
}

// ── Recent Projects List ──

interface RecentProjectsProps {
  projects: ProjectInfo[];
  loading: boolean;
  disabled: boolean;
  onOpen: (path: string) => void;
  openingPath: string | null;
}

function RecentProjects({ projects, loading, disabled, onOpen, openingPath }: RecentProjectsProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ ...S.emptyState, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Spinner /> Loading recent projects...
      </div>
    );
  }

  if (projects.length === 0) {
    return <div style={S.emptyState}>No recent projects</div>;
  }

  return (
    <div style={S.recentList}>
      {projects.map((p) => {
        const isOpening = openingPath === p.path;
        const isDisabled = disabled || openingPath !== null;
        return (
          <div
            key={p.path}
            style={{
              ...S.recentItem(isDisabled),
              ...(hoveredPath === p.path && !isDisabled ? S.recentItemHover : {}),
            }}
            onClick={() => !isDisabled && onOpen(p.path)}
            onMouseEnter={() => setHoveredPath(p.path)}
            onMouseLeave={() => setHoveredPath(null)}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={S.recentName}>{p.name}</div>
                {p.lastPhase && (
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.15)',
                    color: '#3b82f6',
                    fontWeight: 500,
                  }}>
                    {p.lastPhase}
                  </span>
                )}
              </div>
              <div style={S.recentPath}>{shortPath(p.path)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {isOpening && <Spinner />}
              <div style={S.recentTime}>{formatAge(p.lastOpened)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──

interface ProjectPickerProps {
  onProjectOpened: (state: ProjectState) => void;
}

export default function ProjectPicker({ onProjectOpened }: ProjectPickerProps) {
  const authStatus = useProjectStore((s) => s.authStatus);
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);

  const [recentProjects, setRecentProjects] = useState<ProjectInfo[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // New project state
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState<string | null>(null);
  const [newNameFocused, setNewNameFocused] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Open project state
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // API key panel
  const [showApiKeyPanel, setShowApiKeyPanel] = useState(false);

  const connected = authStatus.connected;

  // Fetch initial auth status
  useEffect(() => {
    window.office.getAuthStatus().then(setAuthStatus);
  }, [setAuthStatus]);

  // Load recent projects
  const refreshRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const projects = await window.office.getRecentProjects();
      setRecentProjects(projects);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  // Open a project by path
  const doOpenProject = useCallback(async (path: string) => {
    setOpeningPath(path);
    setOpenError(null);
    try {
      const result = await window.office.openProject(path);
      if (result.success) {
        const state = await window.office.getProjectState();
        onProjectOpened(state);
      } else {
        setOpenError(result.error ?? 'Failed to open project');
      }
    } catch (e: unknown) {
      setOpenError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setOpeningPath(null);
    }
  }, [onProjectOpened]);

  // Browse for existing project folder
  const handlePickAndOpen = useCallback(async () => {
    setOpenError(null);
    const dir = await window.office.pickDirectory();
    if (dir) {
      await doOpenProject(dir);
    }
  }, [doOpenProject]);

  // Pick directory for new project
  const handlePickNewDir = useCallback(async () => {
    const dir = await window.office.pickDirectory();
    if (dir) setNewPath(dir);
  }, []);

  // Create new project
  const handleCreateProject = useCallback(async () => {
    const name = newName.trim();
    if (!name || !newPath) return;
    setCreating(true);
    setNewError(null);
    try {
      const result = await window.office.createProject(name, newPath);
      if (result.success) {
        const state = await window.office.getProjectState();
        onProjectOpened(state);
      } else {
        setNewError(result.error ?? 'Failed to create project');
      }
    } catch (e: unknown) {
      setNewError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setCreating(false);
    }
  }, [newName, newPath, onProjectOpened]);

  const busy = creating || openingPath !== null;
  const canCreate = connected && !busy && newName.trim().length > 0 && newPath !== null;

  return (
    <div style={S.root}>
      {/* Background accent glow */}
      <div style={S.glow} />

      <div style={S.center}>
        {/* Logo / title */}
        <div style={S.logo}>
          <div style={S.logoTitle}>The Office</div>
          <div style={S.logoSub}>AI-powered project studio</div>
        </div>

        {/* Auth hint when not connected */}
        {!connected && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: 13,
            color: '#93c5fd',
            textAlign: 'center' as const,
            lineHeight: 1.5,
          }}>
            Connect your account to get started — click <strong>Connect</strong> in the bottom-left corner
          </div>
        )}

        {/* ── New Project ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>New Project</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={S.row}>
              <input
                style={{ ...S.input, ...(newNameFocused ? S.inputFocused : {}) }}
                type="text"
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onFocus={() => setNewNameFocused(true)}
                onBlur={() => setNewNameFocused(false)}
                disabled={!connected || busy}
                onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreateProject()}
              />
              <button
                style={S.btn(false, !connected || busy)}
                onClick={handlePickNewDir}
                disabled={!connected || busy}
                title="Choose project folder"
              >
                {newPath ? 'Change Folder' : 'Choose Folder'}
              </button>
            </div>
            {newPath && <div style={S.pathChip}>{shortPath(newPath)}</div>}
            <button
              style={S.btnWide(true, !canCreate)}
              onClick={handleCreateProject}
              disabled={!canCreate}
            >
              {creating ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Spinner /> Creating...
                </span>
              ) : 'Create Project'}
            </button>
            {newError && <div style={S.errorText}>{newError}</div>}
          </div>
        </div>

        {/* ── Open Project ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>Open Project</div>
          <button
            style={S.btnWide(false, !connected || busy)}
            onClick={handlePickAndOpen}
            disabled={!connected || busy}
          >
            {openingPath !== null ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Spinner /> Opening...
              </span>
            ) : 'Browse for Project Folder\u2026'}
          </button>
          {openError && <div style={{ ...S.errorText, marginTop: 8 }}>{openError}</div>}
        </div>

        {/* ── Recent Projects ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>Recent Projects</div>
          <RecentProjects
            projects={recentProjects}
            loading={recentLoading}
            disabled={!connected}
            onOpen={doOpenProject}
            openingPath={openingPath}
          />
        </div>
      </div>

      {/* ── Status Bar (bottom-left) ── */}
      <div style={S.statusBar}>
        <div style={S.dot(connected)} />
        <span style={S.statusLabel}>
          {connected
            ? authStatus.method === 'cli-auth'
              ? 'Claude Code (CLI)'
              : (authStatus.account ?? 'Connected')
            : 'Not connected'}
        </span>
        {!connected && !showApiKeyPanel && (
          <button
            style={S.connectBtn}
            onClick={() => setShowApiKeyPanel(true)}
          >
            Connect
          </button>
        )}

        {/* Auth panel — CLI detected or API key fallback */}
        {showApiKeyPanel && !connected && (
          <div style={{
            position: 'absolute',
            bottom: 32,
            left: 0,
            background: '#16162a',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '14px 16px',
            width: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Authentication
              </span>
              <button
                onClick={() => setShowApiKeyPanel(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: '0 2px',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12, lineHeight: 1.5 }}>
              <strong style={{ color: '#e5e5e5' }}>Recommended:</strong> Install{' '}
              <a href="https://claude.ai/download" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>Claude Code</a>{' '}
              and run <code style={{ background: '#1a1a2e', padding: '2px 6px', borderRadius: 3, fontSize: 12 }}>claude login</code>{' '}
              in your terminal. Works with Max/Pro subscriptions.
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Or enter API key
            </div>
            <ApiKeyPanel onConnected={() => setShowApiKeyPanel(false)} />
          </div>
        )}
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
