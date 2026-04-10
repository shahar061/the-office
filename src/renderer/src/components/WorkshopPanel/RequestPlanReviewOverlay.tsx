import React, { useEffect, useState } from 'react';
import { useRequestPlanReviewStore } from '../../stores/request-plan-review.store';
import { MarkdownContent } from '../OfficeView/MarkdownContent';
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
  width: '90%',
  maxWidth: '560px',
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
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 16px',
  borderTop: '1px solid #222',
  background: 'rgba(26,26,46,0.5)',
  flexShrink: 0,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '60px',
  background: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#e2e8f0',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

const baseButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const approveButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: '#22c55e',
  color: '#fff',
};

const reviseButtonStyle = (enabled: boolean): React.CSSProperties => ({
  ...baseButtonStyle,
  background: enabled ? '#f59e0b' : '#333',
  color: enabled ? '#fff' : '#666',
  cursor: enabled ? 'pointer' : 'not-allowed',
});

export function RequestPlanReviewOverlay() {
  const isOpen = useRequestPlanReviewStore((s) => s.isOpen);
  const title = useRequestPlanReviewStore((s) => s.title);
  const planMarkdown = useRequestPlanReviewStore((s) => s.planMarkdown);
  const closeReview = useRequestPlanReviewStore((s) => s.closeReview);

  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (isOpen) setFeedback('');
  }, [isOpen]);

  if (!isOpen) return null;

  const feedbackTrimmed = feedback.trim();
  const canRevise = feedbackTrimmed.length > 0;

  function handleApprove() {
    window.office.respondRequestPlan({ action: 'approve' });
    closeReview();
  }

  function handleRevise() {
    if (!canRevise) return;
    window.office.respondRequestPlan({ action: 'revise', feedback: feedbackTrimmed });
    closeReview();
  }

  const agentColor = AGENT_COLORS['team-lead'];

  return (
    <div style={backdropStyle}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: agentColor }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
              Review plan: {title}
            </span>
          </div>
        </div>
        <div style={contentStyle}>
          <MarkdownContent text={planMarkdown} />
        </div>
        <div style={footerStyle}>
          <textarea
            style={textareaStyle}
            placeholder="What needs to change? (required to request changes)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div style={buttonRowStyle}>
            <button
              style={reviseButtonStyle(canRevise)}
              onClick={handleRevise}
              disabled={!canRevise}
            >
              Request Changes
            </button>
            <button style={approveButtonStyle} onClick={handleApprove}>
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
