// src/renderer/src/components/OfficeView/PlanOverlay.tsx
import React, { useEffect, useState } from 'react';
import { useWarTableStore } from '../../stores/war-table.store';
import { MarkdownContent } from './MarkdownContent';
import { AGENT_COLORS } from '@shared/types';
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

const panelDefaultStyle: React.CSSProperties = {
  ...basePanelStyle,
  width: '90%',
  maxWidth: '520px',
  maxHeight: '90%',
};

const panelFullscreenStyle: React.CSSProperties = {
  ...basePanelStyle,
  width: '96%',
  height: '96%',
};

const headerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
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

const feedbackBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '12px 16px',
  borderTop: '1px solid #222',
  background: 'rgba(26,26,46,0.5)',
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#e2e8f0',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'none',
};

const approveButtonStyle: React.CSSProperties = {
  background: '#22c55e',
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

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  fontSize: '16px',
  cursor: 'pointer',
  padding: '0 4px',
  fontFamily: 'inherit',
};

export function PlanOverlay() {
  const t = useT();
  const reviewOpen = useWarTableStore((s) => s.reviewOpen);
  const reviewContent = useWarTableStore((s) => s.reviewContent);
  const reviewArtifact = useWarTableStore((s) => s.reviewArtifact);
  const closeReview = useWarTableStore((s) => s.closeReview);

  const [feedback, setFeedback] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close on Escape — during plan review, treat as implicit approval
  useEffect(() => {
    if (!reviewOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismiss();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reviewOpen, closeReview]);

  // Reset feedback + size when opening
  useEffect(() => {
    if (reviewOpen) {
      setFeedback('');
      setIsFullscreen(false);
    }
  }, [reviewOpen]);

  if (!reviewOpen || !reviewContent) return null;

  const isPlanReview = reviewArtifact === 'plan';
  const title = isPlanReview ? 'Implementation Plan' : 'Task Breakdown';
  const agentColor = isPlanReview ? AGENT_COLORS['project-manager'] : AGENT_COLORS['team-lead'];

  // During plan review, dismissing = implicit approval (prevents orchestrator hang)
  function handleDismiss() {
    if (isPlanReview) {
      handleApprove();
    } else {
      closeReview();
    }
  }

  function handleApprove() {
    const trimmed = feedback.trim();
    window.office.respondWarTableReview({
      approved: true,
      feedback: trimmed || undefined,
    });
    closeReview();
  }

  return (
    <div style={backdropStyle} onClick={handleDismiss}>
      <div dir="ltr" style={isFullscreen ? panelFullscreenStyle : panelDefaultStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ gridColumn: 2, display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: agentColor }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
              {title}
            </span>
            <span style={{
              fontSize: '10px',
              color: agentColor,
              background: `${agentColor}22`,
              padding: '2px 6px',
              borderRadius: '4px',
            }}>
              {isPlanReview ? 'Project Manager' : 'Team Lead'}
            </span>
          </div>
          <div style={{ gridColumn: 3, justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              style={closeButtonStyle}
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={t(isFullscreen ? 'overlay.collapse' : 'overlay.expand')}
              title={t(isFullscreen ? 'overlay.collapse' : 'overlay.expand')}
            >
              {isFullscreen ? '⤡' : '⤢'}
            </button>
            <button style={closeButtonStyle} onClick={handleDismiss}>✕</button>
          </div>
        </div>
        <div style={contentStyle}>
          <MarkdownContent text={reviewContent} />
        </div>
        {isPlanReview && (
          <div style={feedbackBarStyle}>
            <input
              style={inputStyle}
              placeholder={t('overlay.plan.feedback.placeholder')}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleApprove();
                }
              }}
            />
            <button style={approveButtonStyle} onClick={handleApprove}>
              {t('overlay.plan.approve')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
