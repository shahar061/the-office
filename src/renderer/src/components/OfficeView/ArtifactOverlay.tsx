import React, { useEffect, useState } from 'react';
import { useArtifactStore } from '../../stores/artifact.store';
import { AGENT_COLORS } from '@shared/types';
import { MarkdownContent } from './MarkdownContent';
import { useT } from '../../i18n';

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const basePanelStyle: React.CSSProperties = {
  background: 'rgba(15,15,26,0.96)',
  backdropFilter: 'blur(12px)',
  border: '1px solid #333',
  borderRadius: '12px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const panelDefault: React.CSSProperties = {
  ...basePanelStyle,
  width: '90%',
  maxWidth: '480px',
  maxHeight: '90%',
};

const panelFullscreen: React.CSSProperties = {
  ...basePanelStyle,
  width: '96%',
  height: '96%',
  maxWidth: 'none',
  maxHeight: 'none',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #222',
  background: 'rgba(26,26,46,0.5)',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: '16px',
  overflowY: 'auto',
  flex: 1,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  fontSize: '16px',
  cursor: 'pointer',
  padding: '0 4px',
  fontFamily: 'inherit',
};

function agentDisplayName(role: string): string {
  return role.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function ArtifactOverlay() {
  const t = useT();
  const openArtifact = useArtifactStore((s) => s.openArtifact);
  const artifacts = useArtifactStore((s) => s.artifacts);
  const closeDocument = useArtifactStore((s) => s.closeDocument);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset to original size whenever a new artifact opens
  useEffect(() => {
    if (!openArtifact) setIsFullscreen(false);
  }, [openArtifact?.key]);

  // Close on Escape key
  useEffect(() => {
    if (!openArtifact) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDocument();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openArtifact, closeDocument]);

  if (!openArtifact) return null;

  const artifactInfo = artifacts.find((a) => a.key === openArtifact.key);
  if (!artifactInfo) return null;

  const color = AGENT_COLORS[artifactInfo.agentRole];

  return (
    <div style={backdropStyle} onClick={closeDocument}>
      <div
        dir="ltr"
        style={isFullscreen ? panelFullscreen : panelDefault}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
              {artifactInfo.label}
            </span>
            <span style={{
              fontSize: '10px',
              color,
              background: `${color}22`,
              padding: '2px 6px',
              borderRadius: '4px',
            }}>
              {agentDisplayName(artifactInfo.agentRole)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              style={closeButtonStyle}
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={t(isFullscreen ? 'overlay.artifact.collapse' : 'overlay.artifact.expand')}
              title={t(isFullscreen ? 'overlay.artifact.collapse' : 'overlay.artifact.expand')}
            >
              {isFullscreen ? '⤡' : '⤢'}
            </button>
            <button style={closeButtonStyle} onClick={closeDocument} aria-label={t('overlay.artifact.close')} title={t('overlay.artifact.close')}>✕</button>
          </div>
        </div>
        <div style={contentStyle}>
          {openArtifact.content
            ? <MarkdownContent text={openArtifact.content} />
            : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>This artifact is no longer available.</span>
          }
        </div>
      </div>
    </div>
  );
}
