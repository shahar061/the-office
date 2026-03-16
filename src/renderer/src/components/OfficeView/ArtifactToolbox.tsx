import React from 'react';
import { useArtifactStore, type ArtifactInfo } from '../../stores/artifact.store';
import { AGENT_COLORS } from '@shared/types';

const toolboxStyle: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  background: 'rgba(15,15,26,0.92)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  zIndex: 10,
  minWidth: '140px',
};

const headerStyle: React.CSSProperties = {
  fontSize: '9px',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '0 4px 4px',
  borderBottom: '1px solid #222',
  fontWeight: 600,
};

function artifactRowStyle(available: boolean, color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    background: available ? '#1a1a2e' : 'transparent',
    border: available ? `1px solid ${color}44` : '1px dashed #333',
    borderRadius: '4px',
    cursor: available ? 'pointer' : 'default',
    opacity: available ? 1 : 0.4,
    fontFamily: 'inherit',
  };
}

const dotStyle = (color: string): React.CSSProperties => ({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

function agentInitials(role: string): string {
  return role.split('-').map((w) => w[0].toUpperCase()).join('');
}

export function ArtifactToolbox() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const openArtifact = useArtifactStore((s) => s.openArtifact);
  const openDocument = useArtifactStore((s) => s.openDocument);
  const closeDocument = useArtifactStore((s) => s.closeDocument);

  const hasAny = artifacts.some((a) => a.available);
  if (!hasAny) return null;

  async function handleClick(artifact: ArtifactInfo) {
    if (!artifact.available) return;
    if (openArtifact?.key === artifact.key) {
      closeDocument();
      return;
    }
    const result = await window.office.readArtifact(artifact.filename);
    if ('content' in result) {
      openDocument(artifact.key, result.content);
    }
  }

  return (
    <div style={toolboxStyle}>
      <div style={headerStyle}>Artifacts</div>
      {artifacts.map((a) => {
        const color = AGENT_COLORS[a.agentRole];
        return (
          <div
            key={a.key}
            style={artifactRowStyle(a.available, color)}
            onClick={() => handleClick(a)}
          >
            <div style={dotStyle(color)} />
            <span style={{ fontSize: '10px', color: a.available ? '#cbd5e1' : '#475569', fontWeight: 500, flex: 1 }}>
              {a.label}
            </span>
            <span style={{ fontSize: '8px', color: a.available ? color : '#475569' }}>
              {a.available ? agentInitials(a.agentRole) : '...'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
