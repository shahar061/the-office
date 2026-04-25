import React, { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/project.store';
import { colors } from '../../theme';
import type { ProjectState, ProjectInfo } from '@shared/types';
import { ApiKeyPanel } from './ApiKeyPanel';
import { RecentProjects } from './RecentProjects';
import { NewProjectForm } from './NewProjectForm';
import { ExistingCodebaseModal } from './ExistingCodebaseModal';
import { useT } from '../../i18n';

// ── Styles ──

const S = {
  root: {
    width: '100vw',
    height: '100vh',
    background: colors.bg,
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
    border: `1px solid ${colors.border}`,
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
  btnWide: (accent = false, disabled = false): React.CSSProperties => ({
    padding: '9px 16px',
    borderRadius: 6,
    border: accent ? 'none' : '1px solid #444',
    background: accent ? colors.accent : 'rgba(255,255,255,0.06)',
    color: disabled ? colors.textDark : accent ? '#fff' : '#e5e5e5',
    fontSize: 13,
    fontWeight: accent ? 600 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.15s, opacity 0.15s',
    width: '100%',
    textAlign: 'center' as const,
  }),
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 4,
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
    background: connected ? colors.success : colors.error,
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
    border: `1px solid ${colors.accent}`,
    background: 'transparent',
    color: colors.accent,
    cursor: 'pointer',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.1)',
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
    flexShrink: 0,
  },
};

function Spinner() {
  return <span style={S.spinner} />;
}

// ── Main Component ──

interface ProjectPickerProps {
  onProjectOpened: (state: ProjectState) => void;
}

export default function ProjectPicker({ onProjectOpened }: ProjectPickerProps) {
  const t = useT();
  const authStatus = useProjectStore((s) => s.authStatus);
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);

  const [recentProjects, setRecentProjects] = useState<ProjectInfo[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Open project state
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Existing-codebase modal state
  const [codebaseModalState, setCodebaseModalState] = useState<
    { path: string; fileCount: number } | null
  >(null);

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
    if (!dir) return;

    // Check if this is already an Office project
    const checkResult = await window.office.checkProjectExists(dir);
    if (checkResult.exists) {
      // Existing Office project — open normally
      await doOpenProject(dir);
    } else {
      // New directory — show the "start fresh vs workshop" modal
      setCodebaseModalState({ path: dir, fileCount: checkResult.fileCount });
    }
  }, [doOpenProject]);

  const handleWorkshopChoice = useCallback(async () => {
    if (!codebaseModalState) return;
    const path = codebaseModalState.path;
    setCodebaseModalState(null);
    setOpeningPath(path);
    setOpenError(null);
    try {
      const result = await window.office.openDirectoryAsWorkshop(path);
      if (result.success) {
        const state = await window.office.getProjectState();
        onProjectOpened(state);
      } else {
        setOpenError(result.error ?? 'Failed to open directory as workshop');
      }
    } catch (e: unknown) {
      setOpenError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setOpeningPath(null);
    }
  }, [codebaseModalState, onProjectOpened]);

  const handleStartFreshChoice = useCallback(async () => {
    if (!codebaseModalState) return;
    const path = codebaseModalState.path;
    setCodebaseModalState(null);
    setOpeningPath(path);
    setOpenError(null);
    try {
      const name = path.split('/').pop() || 'Untitled';
      const result = await window.office.createProject(name, path);
      if (result.success) {
        const state = await window.office.getProjectState();
        onProjectOpened(state);
      } else {
        setOpenError(result.error ?? 'Failed to create project');
      }
    } catch (e: unknown) {
      setOpenError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setOpeningPath(null);
    }
  }, [codebaseModalState, onProjectOpened]);

  const busy = openingPath !== null;

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
        <NewProjectForm
          connected={connected}
          busy={busy}
          onProjectOpened={onProjectOpened}
        />

        {/* ── Open Project ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>{t('project.picker.openProject')}</div>
          <button
            style={S.btnWide(false, !connected || busy)}
            onClick={handlePickAndOpen}
            disabled={!connected || busy}
          >
            {openingPath !== null ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Spinner /> {t('project.picker.opening')}
              </span>
            ) : t('project.picker.browseFolder')}
          </button>
          {openError && <div style={{ ...S.errorText, marginTop: 8 }}>{openError}</div>}
        </div>

        {/* ── Recent Projects ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>{t('project.picker.recentProjects')}</div>
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
              : (authStatus.account ?? t('project.picker.connected'))
            : t('project.picker.notConnected')}
        </span>
        {!connected && !showApiKeyPanel && (
          <button
            style={S.connectBtn}
            onClick={() => setShowApiKeyPanel(true)}
          >
            {t('project.picker.connect')}
          </button>
        )}

        {/* Auth panel -- CLI detected or API key fallback */}
        {showApiKeyPanel && !connected && (
          <div style={{
            position: 'fixed',
            bottom: 56,
            left: 24,
            background: colors.surface,
            border: '1px solid #444',
            borderRadius: 10,
            padding: '16px 18px',
            width: 400,
            zIndex: 9999,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Authentication
              </span>
              <button
                onClick={() => setShowApiKeyPanel(false)}
                style={{
                  background: '#2a2a3e',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#e5e5e5',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: '4px 8px',
                  minWidth: 28,
                  minHeight: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12, lineHeight: 1.5 }}>
              <strong style={{ color: '#e5e5e5' }}>Recommended:</strong> Install{' '}
              <a href="https://claude.ai/download" target="_blank" rel="noreferrer" style={{ color: colors.accent }}>Claude Code</a>{' '}
              and run <code style={{ background: colors.surface, padding: '2px 6px', borderRadius: 3, fontSize: 12 }}>claude login</code>{' '}
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

      {/* Existing codebase modal */}
      {codebaseModalState && (
        <ExistingCodebaseModal
          path={codebaseModalState.path}
          fileCount={codebaseModalState.fileCount}
          onWorkshop={handleWorkshopChoice}
          onStartFresh={handleStartFreshChoice}
          onCancel={() => setCodebaseModalState(null)}
        />
      )}
    </div>
  );
}
