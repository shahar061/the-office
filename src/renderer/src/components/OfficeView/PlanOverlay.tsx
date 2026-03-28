// src/renderer/src/components/OfficeView/PlanOverlay.tsx
import React, { useEffect, useState } from 'react';
import { useWarTableStore } from '../../stores/war-table.store';
import { MarkdownContent } from './MarkdownContent';
import { AGENT_COLORS } from '@shared/types';

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
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
  width: '520px',
  maxHeight: '75vh',
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
  const reviewOpen = useWarTableStore((s) => s.reviewOpen);
  const reviewContent = useWarTableStore((s) => s.reviewContent);
  const reviewArtifact = useWarTableStore((s) => s.reviewArtifact);
  const closeReview = useWarTableStore((s) => s.closeReview);

  const [feedback, setFeedback] = useState('');

  // Close on Escape
  useEffect(() => {
    if (!reviewOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeReview();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reviewOpen, closeReview]);

  // Reset feedback when opening
  useEffect(() => {
    if (reviewOpen) setFeedback('');
  }, [reviewOpen]);

  if (!reviewOpen || !reviewContent) return null;

  const isPlanReview = reviewArtifact === 'plan';
  const title = isPlanReview ? 'Implementation Plan' : 'Task Breakdown';
  const agentColor = isPlanReview ? AGENT_COLORS['project-manager'] : AGENT_COLORS['team-lead'];

  function handleApprove() {
    const trimmed = feedback.trim();
    window.office.respondWarTableReview({
      approved: true,
      feedback: trimmed || undefined,
    });
    closeReview();
  }

  return (
    <div style={backdropStyle} onClick={closeReview}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          <button style={closeButtonStyle} onClick={closeReview}>✕</button>
        </div>
        <div style={contentStyle}>
          <MarkdownContent text={reviewContent} />
        </div>
        {isPlanReview && (
          <div style={feedbackBarStyle}>
            <input
              style={inputStyle}
              placeholder="Optional: redirect the plan (e.g. 'prioritize the API')..."
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
              Looks good
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
