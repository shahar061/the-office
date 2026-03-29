import React from 'react';
import { useArtifactStore, type ArtifactInfo } from '../../stores/artifact.store';
import { useWarTableStore } from '../../stores/war-table.store';
import { useProjectStore } from '../../stores/project.store';
import { AGENT_COLORS } from '@shared/types';

// ── Shared styles ──

const wrapperStyle: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  zIndex: 10,
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(15,15,26,0.92)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
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

function rowStyle(available: boolean, borderColor: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    background: available ? '#1a1a2e' : 'transparent',
    border: available ? `1px solid ${borderColor}44` : '1px dashed #333',
    borderRadius: '4px',
    cursor: available ? 'pointer' : 'default',
    opacity: available ? 1 : 0.4,
    fontFamily: 'inherit',
  };
}

function agentInitials(role: string): string {
  return role.split('-').map((w) => w[0].toUpperCase()).join('');
}

// ── Imagine Artifacts ──

function ImagineToolbox() {
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
    <div style={panelStyle}>
      <div style={headerStyle}>Artifacts</div>
      {artifacts.map((a) => {
        const color = AGENT_COLORS[a.agentRole];
        return (
          <div key={a.key} style={rowStyle(a.available, color)} onClick={() => handleClick(a)}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
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

// ── War Room Documents ──

interface WarRoomDoc {
  key: string;
  label: string;
  icon: string;
  filename: string;
  artifact: 'plan' | 'tasks';
}

const WAR_ROOM_DOCS: WarRoomDoc[] = [
  { key: 'milestones', label: 'Milestones', icon: '🎯', filename: 'milestones.md', artifact: 'plan' },
  { key: 'plan', label: 'Plan', icon: '🗺️', filename: 'plan.md', artifact: 'plan' },
  { key: 'tasks', label: 'Tasks', icon: '✅', filename: 'tasks.yaml', artifact: 'tasks' },
];

function WarRoomToolbox() {
  const reviewOpen = useWarTableStore((s) => s.reviewOpen);
  const setReviewContent = useWarTableStore((s) => s.setReviewContent);
  const closeReview = useWarTableStore((s) => s.closeReview);
  const visualState = useWarTableStore((s) => s.visualState);

  const hasContent = visualState !== 'empty';
  if (!hasContent) return null;

  async function handleClick(doc: WarRoomDoc) {
    if (reviewOpen) {
      closeReview();
      return;
    }
    const result = await window.office.readArtifact(doc.filename);
    if ('content' in result) {
      setReviewContent(result.content, doc.artifact);
    }
  }

  const available = visualState === 'review' || visualState === 'complete' || visualState === 'persisted';
  const borderColor = '#0ea5e9';

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>War Room</div>
      {WAR_ROOM_DOCS.map((doc) => (
        <div
          key={doc.key}
          style={rowStyle(available, borderColor)}
          onClick={() => available && handleClick(doc)}
        >
          <span style={{ fontSize: '10px', width: '14px', textAlign: 'center' }}>{doc.icon}</span>
          <span style={{ fontSize: '10px', color: available ? '#cbd5e1' : '#475569', fontWeight: 500, flex: 1 }}>
            {doc.label}
          </span>
          <span style={{ fontSize: '8px', color: available ? '#0ea5e9' : '#475569' }}>
            {available ? 'PM' : '...'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Phase-Aware Wrapper ──

export function ArtifactToolbox() {
  const phase = useProjectStore((s) => s.projectState?.currentPhase ?? 'idle');

  if (phase === 'imagine') return <div style={wrapperStyle}><ImagineToolbox /></div>;
  if (phase === 'warroom') return (
    <div style={wrapperStyle}>
      <ImagineToolbox />
      <WarRoomToolbox />
    </div>
  );
  return null;
}
