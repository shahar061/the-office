import { useState, useEffect } from 'react';
import { colors } from '../../theme';
import type { Phase } from '@shared/types';

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];

const ARTIFACT_IMPACT: Record<string, string[]> = {
  imagine: [
    '01-vision-brief.md', '02-prd.md', '03-market-analysis.md',
    '04-system-design.md', 'plan.md', 'tasks.yaml',
  ],
  warroom: ['plan.md', 'tasks.yaml'],
  build: [],
};

interface PhaseRestartModalProps {
  targetPhase: Phase;
  originalIdea?: string;
  affectedPhases: { phase: Phase; status: string }[];
  onConfirm: (userIdea?: string) => void;
  onCancel: () => void;
}

export function PhaseRestartModal({
  targetPhase,
  originalIdea,
  affectedPhases,
  onConfirm,
  onCancel,
}: PhaseRestartModalProps) {
  const [idea, setIdea] = useState(originalIdea ?? '');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const artifactsToDelete: string[] = [];
  const idx = PHASE_ORDER.indexOf(targetPhase);
  for (const p of PHASE_ORDER.slice(idx)) {
    const arts = ARTIFACT_IMPACT[p];
    if (arts) artifactsToDelete.push(...arts);
  }

  const isImagine = targetPhase === 'imagine';

  return (
    <div style={backdropStyle} onClick={onCancel}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: colors.warning,
            }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
              Restart {PHASE_LABELS[targetPhase]}?
            </span>
          </div>
          <button style={closeButtonStyle} onClick={onCancel}>✕</button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {affectedPhases.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={sectionLabelStyle}>Phases that will be reset</div>
              <ul style={listStyle}>
                {affectedPhases.map(({ phase, status }) => (
                  <li key={phase} style={listItemStyle}>
                    <span style={{ color: colors.text }}>{PHASE_LABELS[phase]}</span>
                    <span style={{
                      fontSize: '10px',
                      color: status === 'completed' ? colors.success : colors.accent,
                      marginLeft: '6px',
                    }}>
                      ({status})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {artifactsToDelete.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={sectionLabelStyle}>Artifacts that will be deleted</div>
              <ul style={listStyle}>
                {artifactsToDelete.map((filename) => (
                  <li key={filename} style={listItemStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: colors.textMuted }}>
                      {filename}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <div style={sectionLabelStyle}>session.yaml</div>
            <div style={{ fontSize: '12px', color: colors.textMuted, paddingLeft: '12px' }}>
              {isImagine ? 'Will be deleted (recreated on restart)' : 'Phase fields will be reset'}
            </div>
          </div>

          {isImagine && (
            <div>
              <div style={sectionLabelStyle}>Your idea</div>
              <textarea
                style={textareaStyle}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Enter your idea..."
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button style={cancelButtonStyle} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={restartButtonStyle}
            onClick={() => onConfirm(isImagine ? idea : undefined)}
            disabled={isImagine && !idea.trim()}
          >
            Restart {PHASE_LABELS[targetPhase]}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(15,15,26,0.96)',
  backdropFilter: 'blur(12px)',
  border: '1px solid #333',
  borderRadius: '12px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  width: '90%',
  maxWidth: '440px',
  maxHeight: '90%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
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

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '12px 16px',
  borderTop: '1px solid #222',
  background: 'rgba(26,26,46,0.5)',
  flexShrink: 0,
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: colors.textDim,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  paddingLeft: '12px',
};

const listItemStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '2px 0',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '8px 12px',
  color: colors.text,
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '8px 16px',
  color: colors.textMuted,
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const restartButtonStyle: React.CSSProperties = {
  background: colors.warning,
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
