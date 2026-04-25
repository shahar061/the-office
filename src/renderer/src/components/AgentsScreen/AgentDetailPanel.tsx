import { useState, useEffect } from 'react';
import type { AgentInfo } from '../../stores/agents.store';
import { MarkdownContent } from '../OfficeView/MarkdownContent';

interface AgentDetailPanelProps {
  agent: AgentInfo;
  onClose: () => void;
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  panel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: '400px',
    height: '100%',
    background: '#0f0f1a',
    borderLeft: '1px solid #333',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: (_color: string) => ({
    padding: '20px 20px 16px',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexShrink: 0,
  }),
  spriteWrapper: {
    width: '48px',
    height: '96px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sprite: {
    width: '48px',
    height: '96px',
    objectFit: 'none' as const,
    objectPosition: '-288px -32px',
    imageRendering: 'pixelated' as const,
    transform: 'scale(3)',
    transformOrigin: 'top left',
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: 0,
  },
  displayName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  badge: (color: string) => ({
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: 600,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }),
  groupLabel: {
    fontSize: '11px',
    color: '#64748b',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '12px',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px 8px',
    fontFamily: 'inherit',
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  description: {
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  toolsList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  toolPill: {
    padding: '3px 8px',
    fontSize: '10px',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#94a3b8',
  },
  metaRow: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  promptToggle: (color: string) => ({
    background: 'none',
    border: 'none',
    color,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    padding: '8px 0',
    textAlign: 'start' as const,
    fontFamily: 'inherit',
  }),
  promptContent: {
    background: '#111122',
    borderRadius: '8px',
    padding: '16px',
    maxHeight: '400px',
    overflowY: 'auto' as const,
  },
};

export function AgentDetailPanel({ agent, onClose }: AgentDetailPanelProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    setPromptExpanded(false);
  }, [agent.role]);

  const groupLabel =
    agent.group === 'leadership' ? 'Leadership' :
    agent.group === 'coordination' ? 'Coordination' : 'Engineering';

  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={styles.panel}>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>

        <div style={styles.header(agent.color)}>
          <div style={styles.spriteWrapper}>
            <img
              src={agent.spriteSheetUrl}
              alt={agent.displayName}
              style={styles.sprite}
              draggable={false}
            />
          </div>
          <div style={styles.headerInfo}>
            <span style={styles.displayName}>{agent.displayName}</span>
            <span style={styles.badge(agent.color)}>{agent.role}</span>
            <span style={styles.groupLabel}>{groupLabel}</span>
          </div>
        </div>

        <div style={styles.body}>
          <div style={styles.section}>
            <span style={styles.sectionLabel}>Description</span>
            <span style={styles.description}>{agent.description}</span>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionLabel}>Tools</span>
            <div style={styles.toolsList}>
              {agent.tools.map((tool) => (
                <span key={tool} style={styles.toolPill}>{tool}</span>
              ))}
              {agent.tools.length === 0 && (
                <span style={{ fontSize: '12px', color: '#475569' }}>No tools defined</span>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionLabel}>Details</span>
            <span style={styles.metaRow}>
              Sprite: {agent.spriteVariant} &nbsp;·&nbsp; Zone: {agent.idleZone}
            </span>
          </div>

          <div style={styles.section}>
            <button
              style={styles.promptToggle(agent.color)}
              onClick={() => setPromptExpanded(!promptExpanded)}
            >
              {promptExpanded ? '▼ Hide full prompt' : '▶ View full prompt'}
            </button>
            {promptExpanded && (
              <div style={styles.promptContent}>
                <MarkdownContent text={agent.prompt} role="agent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
