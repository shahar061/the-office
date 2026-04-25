import React, { useState, useCallback } from 'react';
import { shortPath } from '../../utils';
import { colors } from '../../theme';
import { useT } from '../../i18n';
import type { ProjectState } from '@shared/types';

// ── Styles ──

const S = {
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
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#e5e5e5',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  btn: (accent = false, disabled = false): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: accent ? 'none' : '1px solid #444',
    background: accent ? colors.accent : 'rgba(255,255,255,0.06)',
    color: disabled ? colors.textDark : accent ? '#fff' : '#e5e5e5',
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
  pathChip: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 4,
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

// ── Component ──

interface NewProjectFormProps {
  connected: boolean;
  busy: boolean;
  onProjectOpened: (state: ProjectState) => void;
}

export function NewProjectForm({ connected, busy: parentBusy, onProjectOpened }: NewProjectFormProps) {
  const t = useT();
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState<string | null>(null);
  const [newNameFocused, setNewNameFocused] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const busy = parentBusy || creating;
  const canCreate = connected && !busy && newName.trim().length > 0 && newPath !== null;

  const handlePickNewDir = useCallback(async () => {
    const dir = await window.office.pickDirectory();
    if (dir) setNewPath(dir);
  }, []);

  const handleCreateProject = useCallback(async () => {
    const name = newName.trim();
    if (!name || !newPath) return;
    setCreating(true);
    setNewError(null);
    try {
      // Create a subfolder with the project name inside the selected directory
      const projectDir = newPath + '/' + name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').toLowerCase();
      const result = await window.office.createProject(name, projectDir);
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

  return (
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
              <Spinner /> {t('project.picker.creating')}
            </span>
          ) : t('project.picker.createProject')}
        </button>
        {newError && <div style={S.errorText}>{newError}</div>}
      </div>
    </div>
  );
}
